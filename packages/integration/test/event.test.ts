import { startingConfiguration as pairingStart, type Constraint } from '@score-keepr/pairing'
import {
  presets,
  startingConfiguration as standingsStart,
  type StandingsConfiguration,
} from '@score-keepr/standings'
import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import { playEvent, type EventPlan, type EventPlayed } from './play.ts'

/** The last round pairs by standing, as some rule sets do; earlier rounds use the starting Configuration. */
const lastRoundByRank = (_round: number, last: boolean): Constraint[] =>
  last
    ? [
        { type: 'no-rematch' },
        { type: 'bye-cap', max: 1 },
        { type: 'bye-to-lowest-rank' },
        { type: 'pair-adjacent-by-rank' },
      ]
    : pairingStart
const always = (): Constraint[] => pairingStart
const byRankThroughout = (): Constraint[] => [
  { type: 'no-rematch' },
  { type: 'bye-cap', max: 1 },
  { type: 'bye-to-lowest-rank' },
  { type: 'pair-close-in-score' },
  { type: 'pair-down-choice', from: 'lowest', opponent: 'highest' },
]

const setups: [string, StandingsConfiguration, EventPlan['pairing']][] = [
  ['starting Configurations', standingsStart, always],
  ['Magic Preset, last round by Rank', presets['magic-2026-02-27'].configuration, lastRoundByRank],
  [
    'Pokémon Preset, Rank used throughout',
    presets['pokemon-2026-09-01'].configuration,
    byRankThroughout,
  ],
]

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const sorted = (ids: readonly string[]): string[] => [...ids].sort((x, y) => x.localeCompare(y))

/** Everything that must hold for any event, whatever happened in it. Returns what does not. */
function problemsIn(event: EventPlayed, plan: EventPlan): string[] {
  const problems: string[] = []
  const check = (holds: boolean, what: string): void => {
    if (!holds) problems.push(what)
  }
  const facedBefore = new Map<string, Set<string>>()
  const byes = new Map<string, number>()

  for (const { round, present, standingsBefore, paired } of event.rounds) {
    // Every round is proven, and pairs exactly the Entrants who were present.
    check(paired.provenBest, `round ${round} was not proven best`)
    check(paired.round === round, `round ${round} came back as round ${paired.round}`)
    const seen = [
      ...paired.pairings.flatMap((pairing) => pairing.entrants),
      ...(paired.bye === null ? [] : [paired.bye]),
    ]
    check(same(sorted(seen), present), `round ${round} did not pair exactly those present`)

    // What pairing was told matches what has really happened so far.
    for (const row of standingsBefore.rows) {
      check(
        same(sorted([...new Set(row.opponents)]), sorted([...(facedBefore.get(row.id) ?? [])])),
        `round ${round}: ${row.id} has the wrong opponents faced`,
      )
      check(
        row.byes === (byes.get(row.id) ?? 0),
        `round ${round}: ${row.id} has the wrong Byes received`,
      )
    }

    // A reported rematch is a real one, and an unreported Pairing is a first meeting.
    const reported = new Set(
      paired.violations
        .filter((violation) => violation.constraint.type === 'no-rematch')
        .map((violation) => sorted(violation.entrants).join(' ')),
    )
    for (const { entrants } of paired.pairings) {
      const met = facedBefore.get(entrants[0])?.has(entrants[1]) ?? false
      check(
        reported.has(sorted(entrants).join(' ')) === met,
        `round ${round}: ${entrants.join(' v ')} rematch reporting is wrong`,
      )
      for (const [mine, theirs] of [entrants, [entrants[1], entrants[0]]] as [string, string][]) {
        facedBefore.set(mine, (facedBefore.get(mine) ?? new Set()).add(theirs))
      }
    }

    // Nobody is given a second Bye unless the engine says it had to.
    if (paired.bye !== null) {
      const had = byes.get(paired.bye) ?? 0
      const flagged = paired.violations.some((violation) => violation.constraint.type === 'bye-cap')
      check(flagged === had >= 1, `round ${round}: Bye cap reporting is wrong for ${paired.bye}`)
      byes.set(paired.bye, had + 1)
    }
  }

  // Final Standings: one row each, and Score never out of order.
  const scores = event.finalStandings.rows.map((row) => row.score)
  check(scores.length === plan.size, 'final Standings do not have one row per Entrant')
  check(
    same(
      scores,
      [...scores].sort((x, y) => y - x),
    ),
    'final Standings are not in Score order',
  )

  if (event.cut !== undefined) {
    const { placings, structure, winners } = event.cut
    const last = placings.at(-1)?.placings ?? []
    // When the cut is over everyone has a placing, nobody is still in, and the cut holds 1 to its size.
    check(
      last.every((each) => each.placing !== null && !each.stillIn),
      'someone is unplaced after the cut finished',
    )
    check(
      same(
        last.filter((each) => each.inCut).map((each) => each.placing),
        Array.from({ length: plan.cut }, (_, at) => at + 1),
      ),
      'the cut does not hold placings 1 to its size',
    )
    check(
      last[0]?.id === winners.at(-1)?.winner,
      'first place is not the winner of the last Pairing',
    )
    check(
      structure.rounds.flatMap((round) => round.pairings).length === plan.cut - 1,
      'the cut has the wrong number of Pairings',
    )
    // A placing, once given, never changes as the cut goes on.
    const fixed = new Map<string, number>()
    for (const step of placings) {
      for (const each of step.placings) {
        if (each.placing === null) continue
        check(
          (fixed.get(each.id) ?? each.placing) === each.placing,
          `${each.id}'s placing changed during the cut`,
        )
        fixed.set(each.id, each.placing)
      }
    }
  }
  return problems
}

describe.each(setups)('whole events through both engines: %s', (_, standings, pairing) => {
  test('any small event, with drops and a cut, holds together from first round to final placing', () => {
    fc.assert(
      fc.property(
        fc.record({
          size: fc.integer({ min: 2, max: 40 }),
          rounds: fc.integer({ min: 1, max: 7 }),
          cut: fc.constantFrom(0, 2, 4, 8),
          seed: fc.integer(),
          dropRate: fc.constantFrom(0, 0.1, 0.3),
        }),
        (shape) => {
          const plan: EventPlan = { ...shape, standings, pairing }
          expect(problemsIn(playEvent(plan), plan)).toEqual([])
        },
      ),
      { numRuns: 60 },
    )
  })

  test('an event run far past a sensible number of rounds still holds together', () => {
    const plan: EventPlan = {
      size: 9,
      rounds: 14,
      cut: 4,
      seed: 7,
      dropRate: 0,
      standings,
      pairing,
    }
    const event = playEvent(plan)
    expect(problemsIn(event, plan)).toEqual([])
    // Nine Entrants have eight possible opponents each, so by round fourteen rematches are certain.
    expect(event.rounds.some((round) => round.paired.violations.length > 0)).toBe(true)
  })

  test('a mid-sized event with a cut of eight', () => {
    const plan: EventPlan = {
      size: 257,
      rounds: 9,
      cut: 8,
      seed: 11,
      dropRate: 0.1,
      standings,
      pairing,
    }
    expect(problemsIn(playEvent(plan), plan)).toEqual([])
  })
})
