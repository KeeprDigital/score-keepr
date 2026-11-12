import {
  compareCodeUnits,
  type Constraint,
  type Failure,
  type InputError,
  type PairDownPick,
  type PairingEntrant,
  type RoundInput,
} from '@score-keepr/shared'

type Parsed = { ok: true; input: RoundInput } | Failure

type Fields = Record<string, unknown>

const INPUT_FIELDS = [
  'system',
  'entrants',
  'configuration',
  'randomSeed',
  'round',
  'avoidPairs',
  'workLimit',
]
const ENTRANT_FIELDS = ['id', 'score', 'opponents', 'byes', 'rank', 'groups']
const PICKS: readonly string[] = ['highest', 'lowest', 'random']

/** Scores beyond this, either way, are refused so that every sum inside the engine stays exact. */
export const SCORE_LIMIT = 1_000_000

/** The settings each Constraint takes, beyond `type`. */
const SETTINGS: Record<Constraint['type'], readonly string[]> = {
  'no-rematch': [],
  'bye-cap': ['max'],
  'avoid-same-group-label': ['kind'],
  'avoid-listed-pairs': [],
  'prefer-same-group-label': ['kind'],
  'bye-to-lowest-score': [],
  'bye-to-lowest-rank': [],
  'pair-close-in-score': [],
  'keep-top-clean': [],
  'keep-bottom-clean': [],
  'pair-adjacent-by-rank': [],
  'pair-top-vs-bottom-by-rank': [],
  'pair-down-choice': ['from', 'opponent'],
}

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isWhole = (value: unknown, least: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= least
const isText = (value: unknown): value is string => typeof value === 'string'

/**
 * Checks an input of unknown shape and returns a clean copy, or every problem found.
 * Nothing is assumed: a field that is not known, or a setting that is not stated, is a problem.
 */
export function parseRoundInput(raw: unknown): Parsed {
  const errors: InputError[] = []
  const problem = (code: string, message: string, entrants: string[] = []): void => {
    errors.push({ code, message, entrants })
  }
  const unknownFields = (value: Fields, known: readonly string[], where: string): void => {
    for (const key of Object.keys(value)) {
      if (!known.includes(key)) problem('unknown-field', `${where} has an unknown field "${key}".`)
    }
  }

  if (!isFields(raw)) {
    return {
      ok: false,
      errors: [{ code: 'invalid-input', message: 'The input must be an object.', entrants: [] }],
    }
  }
  unknownFields(raw, INPUT_FIELDS, 'The input')

  if (raw['system'] !== 'swiss') problem('invalid-input', '`system` must be "swiss".')
  if (!isText(raw['randomSeed'])) problem('invalid-input', '`randomSeed` must be a string.')
  if (!isWhole(raw['round'], 1))
    problem('invalid-input', '`round` must be a whole number, 1 or more.')
  if (raw['workLimit'] !== undefined && !isWhole(raw['workLimit'], 1)) {
    problem('invalid-input', '`workLimit` must be a whole number, 1 or more.')
  }

  const entrants = parseEntrants(raw['entrants'], problem, unknownFields)
  const configuration = parseConfiguration(raw['configuration'], problem, unknownFields)
  const avoidPairs = parseAvoidPairs(raw['avoidPairs'], problem)

  checkHistory(entrants, problem)
  checkRanks(entrants, configuration, problem)

  if (errors.length > 0) return { ok: false, errors: errors.sort(compareErrors) }

  const input: RoundInput = {
    system: 'swiss',
    entrants,
    configuration,
    randomSeed: raw['randomSeed'] as string,
    round: raw['round'] as number,
  }
  if (avoidPairs !== undefined) input.avoidPairs = avoidPairs
  if (raw['workLimit'] !== undefined) input.workLimit = raw['workLimit'] as number
  return { ok: true, input }
}

type Problem = (code: string, message: string, entrants?: string[]) => void
type UnknownFields = (value: Fields, known: readonly string[], where: string) => void

function parseEntrants(
  raw: unknown,
  problem: Problem,
  unknownFields: UnknownFields,
): PairingEntrant[] {
  if (!Array.isArray(raw)) {
    problem('invalid-input', '`entrants` must be a list.')
    return []
  }
  const entrants: PairingEntrant[] = []
  const seen = new Set<string>()
  const repeated = new Set<string>()

  for (const [at, value] of raw.entries()) {
    if (!isFields(value)) {
      problem('invalid-input', `Entrant ${at + 1} must be an object.`)
      continue
    }
    const id = value['id']
    if (!isText(id) || id === '') {
      problem('invalid-input', `Entrant ${at + 1} must have an id that is a non-empty string.`)
      continue
    }
    const who = `Entrant "${id}"`
    unknownFields(value, ENTRANT_FIELDS, who)
    let sound = true
    const wrong = (message: string): void => {
      problem('invalid-input', `${who}: ${message}`, [id])
      sound = false
    }

    if (!isWhole(value['score'], -SCORE_LIMIT) || value['score'] > SCORE_LIMIT) {
      wrong(`\`score\` must be a whole number from -${SCORE_LIMIT} to ${SCORE_LIMIT}.`)
    }
    if (!isWhole(value['byes'], 0)) wrong('`byes` must be a whole number, 0 or more.')
    if (value['rank'] !== undefined && !isWhole(value['rank'], 1)) {
      wrong('`rank` must be a whole number, 1 or more.')
    }
    const opponents = value['opponents']
    if (!Array.isArray(opponents) || !opponents.every(isText)) {
      wrong('`opponents` must be a list of ids.')
    }
    const groups = value['groups']
    if (groups !== undefined && !(isFields(groups) && Object.values(groups).every(isText))) {
      wrong('`groups` must map each kind of Group Label to a string.')
    }

    if (seen.has(id)) repeated.add(id)
    seen.add(id)
    if (!sound) continue

    const entrant: PairingEntrant = {
      id,
      score: value['score'] as number,
      opponents: [...(opponents as string[])],
      byes: value['byes'] as number,
    }
    if (value['rank'] !== undefined) entrant.rank = value['rank'] as number
    if (groups !== undefined) entrant.groups = { ...(groups as Record<string, string>) }
    entrants.push(entrant)
  }

  for (const id of repeated)
    problem('duplicate-id', `More than one Entrant has the id "${id}".`, [id])
  return entrants
}

function parseConfiguration(
  raw: unknown,
  problem: Problem,
  unknownFields: UnknownFields,
): Constraint[] {
  if (raw === undefined) {
    problem(
      'missing-configuration',
      '`configuration` is required. Pass the Constraints to apply, in priority order.',
    )
    return []
  }
  if (!Array.isArray(raw)) {
    problem('invalid-input', '`configuration` must be a list of Constraints.')
    return []
  }
  const configuration: Constraint[] = []
  const seen = new Set<string>()

  for (const [at, value] of raw.entries()) {
    const type = isFields(value) ? value['type'] : undefined
    if (!isFields(value) || !isText(type) || !Object.hasOwn(SETTINGS, type)) {
      problem(
        'unknown-constraint',
        `Constraint ${at + 1} is not one the engine knows${isText(type) ? `: "${type}"` : ''}.`,
      )
      continue
    }
    const known = type as Constraint['type']
    const what = `Constraint "${known}"`
    const settings = SETTINGS[known]
    unknownFields(value, ['type', ...settings], what)

    const missing = settings.filter((setting) => value[setting] === undefined)
    if (missing.length > 0) {
      problem(
        'missing-setting',
        `${what} needs ${missing.map((name) => `\`${name}\``).join(' and ')}.`,
      )
      continue
    }
    const constraint = buildConstraint(known, value, (message) => {
      problem('invalid-input', `${what}: ${message}`)
      return undefined
    })
    if (constraint === undefined) continue

    const key = 'kind' in constraint ? `${known} ${constraint.kind}` : known
    if (seen.has(key)) {
      problem(
        'duplicate-constraint',
        `${what} appears more than once${'kind' in constraint ? ` for "${constraint.kind}"` : ''}.`,
      )
      continue
    }
    seen.add(key)
    configuration.push(constraint)
  }
  return configuration
}

function buildConstraint(
  type: Constraint['type'],
  value: Fields,
  wrong: (message: string) => undefined,
): Constraint | undefined {
  switch (type) {
    case 'bye-cap':
      if (!isWhole(value['max'], 1)) return wrong('`max` must be a whole number, 1 or more.')
      return { type, max: value['max'] }
    case 'avoid-same-group-label':
    case 'prefer-same-group-label':
      if (!isText(value['kind']) || value['kind'] === '')
        return wrong('`kind` must be a non-empty string.')
      return { type, kind: value['kind'] }
    case 'pair-down-choice': {
      const { from, opponent } = value
      if (
        !isText(from) ||
        !PICKS.includes(from) ||
        !isText(opponent) ||
        !PICKS.includes(opponent)
      ) {
        return wrong('`from` and `opponent` must each be "highest", "lowest" or "random".')
      }
      return { type, from: from as PairDownPick, opponent: opponent as PairDownPick }
    }
    default:
      return { type }
  }
}

function parseAvoidPairs(raw: unknown, problem: Problem): [string, string][] | undefined {
  if (raw === undefined) return undefined
  const sound =
    Array.isArray(raw) &&
    raw.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        isText(pair[0]) &&
        isText(pair[1]) &&
        pair[0] !== pair[1],
    )
  if (!sound) {
    problem('invalid-input', '`avoidPairs` must be a list of pairs of two different ids.')
    return undefined
  }
  return (raw as [string, string][]).map(([first, second]) => [first, second])
}

/** History between two Entrants who are both present must be recorded on both sides. */
function checkHistory(entrants: readonly PairingEntrant[], problem: Problem): void {
  const faced = new Map(entrants.map((entrant) => [entrant.id, new Set(entrant.opponents)]))
  const reported = new Set<string>()
  for (const entrant of entrants) {
    if (entrant.opponents.includes(entrant.id)) {
      problem('self-opponent', `Entrant "${entrant.id}" lists itself as an opponent.`, [entrant.id])
    }
    for (const opponent of new Set(entrant.opponents)) {
      const theirs = faced.get(opponent)
      if (opponent === entrant.id || theirs === undefined || theirs.has(entrant.id)) continue
      const pair = [entrant.id, opponent].sort(compareCodeUnits)
      const key = JSON.stringify(pair)
      if (reported.has(key)) continue
      reported.add(key)
      problem(
        'one-sided-history',
        `"${entrant.id}" lists "${opponent}" as an opponent, but "${opponent}" does not list "${entrant.id}".`,
        pair,
      )
    }
  }
}

function checkRanks(
  entrants: readonly PairingEntrant[],
  configuration: readonly Constraint[],
  problem: Problem,
): void {
  const unranked = entrants
    .filter((entrant) => entrant.rank === undefined)
    .map((entrant) => entrant.id)
  if (unranked.length === 0) return
  for (const constraint of configuration) {
    const usesRank =
      constraint.type === 'bye-to-lowest-rank' ||
      constraint.type === 'pair-adjacent-by-rank' ||
      constraint.type === 'pair-top-vs-bottom-by-rank' ||
      (constraint.type === 'pair-down-choice' &&
        (constraint.from !== 'random' || constraint.opponent !== 'random'))
    if (usesRank) {
      problem(
        'missing-rank',
        `Constraint "${constraint.type}" needs a Rank for every Entrant.`,
        [...unranked].sort(compareCodeUnits),
      )
    }
  }
}

/** Puts errors in an order that does not depend on the order of the input. */
export function compareErrors(a: InputError, b: InputError): number {
  return (
    compareCodeUnits(a.code, b.code) ||
    compareCodeUnits(a.entrants.join('\u0000'), b.entrants.join('\u0000')) ||
    compareCodeUnits(a.message, b.message)
  )
}
