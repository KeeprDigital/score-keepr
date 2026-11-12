import { formatTable, type Scenario } from '@score-keepr/testkit'

import {
  startingConfiguration,
  type Constraint,
  type PairDownPick,
  type PairingEntrant,
  type RoundInput,
  type RoundResult,
} from '../../src/index.ts'

const FACT_COLUMNS = new Set(['entrant', 'score', 'byes', 'rank', 'faced'])

/**
 * Builds a Swiss round from a scenario file.
 *
 * Settings: `seed`, `round`, `config` (required); `avoid` (pairs like `ann-ben, cal-dee`);
 * `limit` (work limit); `faced: as-written` to stop history being mirrored.
 *
 * Columns: `entrant`, `score`, and optionally `byes` (0 if left out), `rank`, `faced`.
 * Any other column is a kind of Group Label. History is mirrored unless told otherwise, so
 * `ann` facing `ben` need only be written on one row.
 */
export function roundFromScenario(scenario: Scenario): RoundInput {
  const { seed, round, config, avoid, limit, faced, ...rest } = scenario.settings
  const unknown = Object.keys(rest)
  if (unknown.length > 0) throw new Error(`Unknown setting: ${unknown.join(', ')}`)
  if (seed === undefined || round === undefined || config === undefined) {
    throw new Error('A scenario needs `seed`, `round` and `config`.')
  }

  const kinds = scenario.columns.filter((column) => !FACT_COLUMNS.has(column))
  const entrants: PairingEntrant[] = scenario.rows.map((row) => {
    const entrant: PairingEntrant = {
      id: row['entrant'] ?? '',
      score: Number(row['score']),
      opponents: words(row['faced']),
      byes: Number(row['byes'] || 0),
    }
    if (row['rank']) entrant.rank = Number(row['rank'])
    const groups = Object.fromEntries(
      kinds.flatMap((kind) => (row[kind] ? [[kind, row[kind]]] : [])),
    )
    if (Object.keys(groups).length > 0) entrant.groups = groups
    return entrant
  })

  if (faced !== 'as-written') {
    const byId = new Map(entrants.map((entrant) => [entrant.id, entrant]))
    for (const entrant of entrants) {
      for (const opponent of entrant.opponents) {
        const other = byId.get(opponent)
        if (other !== undefined && !other.opponents.includes(entrant.id))
          other.opponents.push(entrant.id)
      }
    }
  }

  const input: RoundInput = {
    system: 'swiss',
    entrants,
    configuration: configurationFrom(config),
    randomSeed: seed,
    round: Number(round),
  }
  if (avoid !== undefined) {
    input.avoidPairs = avoid.split(',').map((pair) => pair.trim().split('-') as [string, string])
  }
  if (limit !== undefined) input.workLimit = Number(limit)
  return input
}

/** Reads `no-rematch, bye-cap 1, pair-down-choice lowest highest`, or `starting`, or `none`. */
function configurationFrom(text: string): Constraint[] {
  if (text === 'none') return []
  if (text === 'starting') return startingConfiguration
  return text.split(',').map((entry) => {
    const [type, ...settings] = words(entry)
    switch (type) {
      case 'bye-cap':
        return { type, max: Number(settings[0]) }
      case 'avoid-same-group-label':
      case 'prefer-same-group-label':
        return { type, kind: settings[0] ?? '' }
      case 'pair-down-choice':
        return { type, from: settings[0] as PairDownPick, opponent: settings[1] as PairDownPick }
      default:
        return { type } as Constraint
    }
  })
}

/** Writes a result the way a person would want to read it in a diff. */
export function describeRound(result: RoundResult): string {
  if (!result.ok) {
    return formatTable(
      result.errors.map((error) => ['error', error.code, error.entrants.join(', ')]),
    )
  }
  const lines = [
    formatTable(
      result.pairings.map(({ entrants: [first, second], scoreGap }) => [
        first,
        'v',
        second,
        scoreGap > 0 ? `pair-down, gap ${scoreGap}` : '',
      ]),
    ),
    `bye: ${result.bye ?? 'none'}`,
    ...result.violations.map(
      ({ constraint, entrants }) =>
        `violation: ${constraint.type}${'kind' in constraint ? ` ${constraint.kind}` : ''}  ${entrants.join(', ')}`,
    ),
    ...(result.violations.length === 0 ? ['violations: none'] : []),
    `proven best: ${result.provenBest ? 'yes' : 'no'}`,
  ]
  return lines.filter((line) => line !== '').join('\n')
}

const words = (text: string | undefined): string[] =>
  (text ?? '').split(' ').filter((word) => word !== '')
