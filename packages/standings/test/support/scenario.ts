import { formatTable, type Scenario } from '@score-keepr/testkit'

import type {
  MatchResult,
  Result,
  StandingsEntrant,
  StandingsInput,
  StandingsResult,
} from '../../src/index.ts'
import { configurations } from './configurations.ts'

/**
 * Builds a Standings call from a scenario file.
 *
 * Settings: `config` (a name from `configurations.ts`); optionally `planned` (planned rounds),
 * `seed` (Random Seed), `dropped` (`ben 2, cal 3`: id and last round played), `removed` (ids),
 * `entrants` (ids with no Results, who would otherwise not appear).
 *
 * The table has `round` and `result`. A result reads:
 *
 *     ann beat ben            ann beat ben 2-1         ann drew ben 1-1-1
 *     ann and ben both lost   ann beat ben vp 78-54    ann bye / awarded-bye / loss
 *
 * A game score is games won by the first Entrant, by the second, then drawn.
 */
export function standingsFromScenario(scenario: Scenario): StandingsInput {
  const { config, planned, seed, dropped, removed, entrants: extra, ...rest } = scenario.settings
  const unknown = Object.keys(rest)
  if (unknown.length > 0) throw new Error(`Unknown setting: ${unknown.join(', ')}`)
  const configuration = configurations[config ?? '']
  if (configuration === undefined)
    throw new Error(`Unknown config "${config}". Add it to configurations.ts.`)

  const results = scenario.rows.map((row) => readResult(Number(row['round']), row['result'] ?? ''))
  const ids = new Set<string>(words(extra?.replaceAll(',', ' ')))
  for (const result of results)
    for (const id of 'entrant' in result ? [result.entrant] : result.entrants) ids.add(id)

  const status = new Map<string, StandingsEntrant['status']>()
  for (const entry of (dropped ?? '').split(',').map(words)) {
    if (entry[0] !== undefined)
      status.set(entry[0], { type: 'dropped', afterRound: Number(entry[1]) })
  }
  for (const id of words(removed?.replaceAll(',', ' '))) status.set(id, { type: 'removed' })
  for (const id of status.keys()) ids.add(id)

  const input: StandingsInput = {
    entrants: [...ids].map((id) => {
      const its = status.get(id)
      return its === undefined ? { id } : { id, status: its }
    }),
    results,
    configuration,
  }
  if (planned !== undefined) input.plannedRounds = Number(planned)
  if (seed !== undefined) input.randomSeed = seed
  return input
}

function readResult(round: number, text: string): Result {
  const parts = words(text)
  const [first, verb, second] = parts
  if (first === undefined || verb === undefined) throw new Error(`Cannot read result "${text}"`)
  if (verb === 'bye' || verb === 'awarded-bye' || verb === 'loss')
    return { round, entrant: first, kind: verb }
  if (verb === 'and' && parts[3] === 'both' && parts[4] === 'lost' && second !== undefined) {
    return { round, entrants: [first, second], outcomes: ['loss', 'loss'] }
  }
  if (second === undefined || (verb !== 'beat' && verb !== 'drew'))
    throw new Error(`Cannot read result "${text}"`)
  const result: MatchResult = {
    round,
    entrants: [first, second],
    outcomes: verb === 'beat' ? ['win', 'loss'] : ['draw', 'draw'],
  }
  for (let at = 3; at < parts.length; at++) {
    const part = parts[at] as string
    if (/^\d+-\d+(-\d+)?$/.test(part)) {
      const [won = 0, lost = 0, drawn = 0] = part.split('-').map(Number)
      result.games = [won, lost, drawn]
    } else {
      const [mine = 0, theirs = 0] = (parts[++at] ?? '').split('-').map(Number)
      result.scores = { ...result.scores, [part]: [mine, theirs] }
    }
  }
  return result
}

/** Writes Standings the way a person would want to read them in a diff. */
export function describeStandings(result: StandingsResult): string {
  if (!result.ok) {
    return formatTable(
      result.errors.map((error) => ['error', error.code, error.entrants.join(', ')]),
    )
  }
  return formatTable([
    ['rank', 'entrant', 'score', 'w-l-d', 'tiebreakers', 'byes', 'faced'],
    ...result.rows.map((row) => [
      String(row.rank),
      row.id + (row.dropped ? ' (dropped)' : ''),
      String(row.score),
      `${row.record.wins}-${row.record.losses}-${row.record.draws}`,
      row.tiebreakers
        .map(({ exact }) =>
          exact === null
            ? '-'
            : exact.denominator === '1'
              ? exact.numerator
              : `${exact.numerator}/${exact.denominator}`,
        )
        .join('  ') || '-',
      row.assignedByes + row.awardedByes === 0
        ? '-'
        : `${row.byes} of ${row.assignedByes + row.awardedByes}`,
      row.opponents.join(' ') || '-',
    ]),
  ])
}

const words = (text: string | undefined): string[] =>
  (text ?? '').split(' ').filter((word) => word !== '')
