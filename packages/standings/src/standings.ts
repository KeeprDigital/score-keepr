import {
  compareCodeUnits,
  distinctPositions,
  type StandingsInput,
  type StandingsResult,
  type StandingsRow,
  type TiebreakerValue,
} from '@score-keepr/shared'

import { compare, fraction, toExact, toNumber, type Fraction } from './fraction.ts'
import { tallyResults, type Tally } from './tally.ts'
import { measuresFor } from './tiebreakers.ts'
import { parseStandingsInput } from './validate.ts'
import { ENGINE_VERSION } from './version.ts'

/**
 * Works out Standings from every Result given. Nothing is remembered between calls: Standings
 * as of round four is the same call with rounds one to four.
 *
 * Never throws. Invalid input comes back as `ok: false` with every problem found.
 */
export function computeStandings(input: StandingsInput): StandingsResult {
  try {
    const parsed = parseStandingsInput(input)
    if (!parsed.ok) return parsed
    return { ok: true, rows: rank(parsed.input), engineVersion: ENGINE_VERSION }
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          code: 'internal-error',
          message: `The engine failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
          entrants: [],
        },
      ],
    }
  }
}

function rank(input: StandingsInput): StandingsRow[] {
  const { configuration } = input
  const tallies = tallyResults(input)
  const measures = measuresFor(configuration, tallies, input.plannedRounds)
  const ranked = [...tallies.values()].filter((tally) => !tally.removed)

  const values = new Map<string, (Fraction | undefined)[]>()
  for (const tally of ranked)
    values.set(
      tally.id,
      measures.map((each) => each?.measure(tally)),
    )
  const valueOf = (tally: Tally, at: number): Fraction | undefined =>
    (values.get(tally.id) as (Fraction | undefined)[])[at]

  // Groups of Entrants who are level so far, best group first. Each Tiebreaker splits them further.
  let groups = splitBy(
    [ranked.sort((a, b) => compareCodeUnits(a.id, b.id))],
    (a, b) => b.score - a.score,
  )
  for (const [at, tiebreaker] of configuration.tiebreakers.entries()) {
    const measured = measures[at]
    if (measured !== undefined) {
      const direction = measured.lowerIsBetter ? 1 : -1
      groups = splitBy(
        groups,
        (a, b) => direction * compare(valueOf(a, at) as Fraction, valueOf(b, at) as Fraction),
      )
    } else if (tiebreaker.type === 'head-to-head') {
      groups = groups.flatMap((group) => {
        const [first, second] = group
        if (group.length !== 2 || first === undefined || second === undefined) return [group]
        const difference = (first.beat.get(second.id) ?? 0) - (second.beat.get(first.id) ?? 0)
        if (difference === 0) return [group]
        const [winner, loser] = difference > 0 ? [first, second] : [second, first]
        ;(values.get(winner.id) as (Fraction | undefined)[])[at] = fraction(1, 1)
        ;(values.get(loser.id) as (Fraction | undefined)[])[at] = fraction(0, 1)
        return [[winner], [loser]]
      })
    } else {
      // Random: a seeded position per Entrant, the same on every recalculation.
      const positions = distinctPositions(
        ['tiebreaker', input.randomSeed as string],
        ranked.map((tally) => tally.id),
        32,
      )
      for (const tally of ranked)
        (values.get(tally.id) as (Fraction | undefined)[])[at] = fraction(
          positions.get(tally.id) as number,
          1,
        )
      groups = splitBy(
        groups,
        (a, b) => (positions.get(a.id) as number) - (positions.get(b.id) as number),
      )
    }
  }

  const rows: StandingsRow[] = []
  let placed = 0
  for (const group of groups) {
    const rankOfGroup = placed + 1
    for (const tally of group) {
      rows.push({
        id: tally.id,
        rank: rankOfGroup,
        score: tally.score,
        record: { wins: tally.wins, losses: tally.losses, draws: tally.draws },
        tiebreakers: (values.get(tally.id) as (Fraction | undefined)[]).map(describe),
        opponents: [...tally.opponents],
        byes:
          tally.assignedByes + (configuration.byesReceived === 'assigned' ? 0 : tally.awardedByes),
        assignedByes: tally.assignedByes,
        awardedByes: tally.awardedByes,
        dropped: tally.dropped,
      })
    }
    placed += group.length
  }
  return rows
}

const describe = (value: Fraction | undefined): TiebreakerValue =>
  value === undefined
    ? { exact: null, value: null }
    : { exact: toExact(value), value: toNumber(value) }

/** Sorts each group and cuts it wherever two neighbours differ. Groups keep their order. */
function splitBy<T>(groups: readonly T[][], order: (a: T, b: T) => number): T[][] {
  const split: T[][] = []
  for (const group of groups) {
    const sorted = [...group].sort(order)
    let current: T[] = []
    for (const item of sorted) {
      const previous = current.at(-1)
      if (previous !== undefined && order(previous, item) !== 0) {
        split.push(current)
        current = []
      }
      current.push(item)
    }
    if (current.length > 0) split.push(current)
  }
  return split
}
