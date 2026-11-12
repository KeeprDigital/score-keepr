import {
  compareCodeUnits,
  type Failure,
  type InputError,
  type MatchResult,
  type Outcome,
  type PointsMethod,
  type RateSettings,
  type Ratio,
  type Result,
  type SoloResult,
  type SoloScoring,
  type StandingsConfiguration,
  type StandingsEntrant,
  type StandingsInput,
  type Tiebreaker,
} from '@score-keepr/shared'

type Parsed = { ok: true; input: StandingsInput } | Failure
type Fields = Record<string, unknown>

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isWhole = (value: unknown, least: number = Number.MIN_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= least
const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''
const OUTCOMES: readonly unknown[] = ['win', 'loss', 'draw']
const SOLO_KINDS: readonly unknown[] = ['bye', 'awarded-bye', 'unplayed-loss']

/** Which Tiebreakers read game scores, and which settings each Tiebreaker takes. */
const TIEBREAKER_SETTINGS: Record<Tiebreaker['type'], readonly string[]> = {
  'match-win-rate': ['rate'],
  'opponents-match-win-rate': ['rate', 'withNoOpponents'],
  'opponents-opponents-match-win-rate': ['rate', 'withNoOpponents'],
  'game-win-rate': ['win', 'draw', 'floor'],
  'opponents-game-win-rate': ['win', 'draw', 'floor', 'withNoOpponents'],
  'loss-rate': [],
  'opponents-loss-rate': ['withNoOpponents'],
  wins: ['includeByes'],
  'game-wins': ['includeByes'],
  'score-total': ['score', 'of'],
  'later-losses': [],
  'head-to-head': [],
  random: [],
}
const USES_GAMES: readonly string[] = ['game-win-rate', 'opponents-game-win-rate', 'game-wins']

/**
 * Checks an input of unknown shape and returns a clean copy, or every problem found.
 * Nothing is assumed: a field that is not known, or a setting that is not stated, is a problem.
 */
export function parseStandingsInput(raw: unknown): Parsed {
  const errors: InputError[] = []
  const problem = (code: string, message: string, entrants: string[] = []): void => {
    errors.push({ code, message, entrants })
  }
  /** Checks that `value` is an object with exactly the right fields, and returns it if it is one. */
  const fields = (
    value: unknown,
    where: string,
    required: readonly string[],
    optional: readonly string[] = [],
  ): Fields | undefined => {
    if (!isFields(value)) {
      problem(
        value === undefined ? 'missing-setting' : 'invalid-input',
        `${where} must be an object.`,
      )
      return undefined
    }
    for (const key of Object.keys(value)) {
      if (!required.includes(key) && !optional.includes(key))
        problem('unknown-field', `${where} has an unknown field "${key}".`)
    }
    const missing = required.filter((key) => value[key] === undefined)
    if (missing.length > 0)
      problem(
        'missing-setting',
        `${where} needs ${missing.map((key) => `\`${key}\``).join(' and ')}.`,
      )
    return value
  }
  const wrong = (message: string, entrants: string[] = []): void =>
    problem('invalid-input', message, entrants)

  if (!isFields(raw)) {
    return {
      ok: false,
      errors: [{ code: 'invalid-input', message: 'The input must be an object.', entrants: [] }],
    }
  }
  for (const key of Object.keys(raw)) {
    if (!['entrants', 'results', 'configuration', 'plannedRounds', 'randomSeed'].includes(key)) {
      problem('unknown-field', `The input has an unknown field "${key}".`)
    }
  }
  if (raw['plannedRounds'] !== undefined && !isWhole(raw['plannedRounds'], 1)) {
    wrong('`plannedRounds` must be a whole number, 1 or more.')
  }
  if (raw['randomSeed'] !== undefined && typeof raw['randomSeed'] !== 'string')
    wrong('`randomSeed` must be a string.')

  // ----- Entrants -----
  const entrants: StandingsEntrant[] = []
  const known = new Set<string>()
  if (!Array.isArray(raw['entrants'])) wrong('`entrants` must be a list.')
  else {
    const repeated = new Set<string>()
    for (const [at, value] of raw['entrants'].entries()) {
      const entrant = fields(value, `Entrant ${at + 1}`, ['id'], ['status'])
      if (entrant === undefined) continue
      const id = entrant['id']
      if (!isText(id)) {
        if (id !== undefined) wrong(`Entrant ${at + 1} must have an id that is a non-empty string.`)
        continue
      }
      if (known.has(id)) repeated.add(id)
      known.add(id)
      const clean: StandingsEntrant = { id }
      const status = entrant['status']
      if (status !== undefined) {
        if (isFields(status) && status['type'] === 'removed' && Object.keys(status).length === 1)
          clean.status = { type: 'removed' }
        else if (
          isFields(status) &&
          status['type'] === 'dropped' &&
          isWhole(status['afterRound'], 0) &&
          Object.keys(status).length === 2
        ) {
          clean.status = { type: 'dropped', afterRound: status['afterRound'] }
        } else
          wrong(
            `Entrant "${id}": \`status\` must be { type: "removed" } or { type: "dropped", afterRound }.`,
            [id],
          )
      }
      entrants.push(clean)
    }
    for (const id of repeated)
      problem('duplicate-id', `More than one Entrant has the id "${id}".`, [id])
  }

  // ----- Configuration -----
  const configuration = parseConfiguration(
    raw['configuration'],
    problem,
    fields,
    wrong,
    () => errors.length,
  )

  // ----- Results -----
  const results: Result[] = []
  if (!Array.isArray(raw['results'])) wrong('`results` must be a list.')
  else {
    for (const [at, value] of raw['results'].entries()) {
      const where = `Result ${at + 1}`
      if (!isFields(value)) {
        wrong(`${where} must be an object.`)
        continue
      }
      const result =
        'entrant' in value
          ? parseSolo(value, where, fields, wrong)
          : parseMatch(value, where, fields, wrong)
      if (result !== undefined) results.push(result)
    }
  }

  // ----- Results against Entrants and against each other -----
  const seenInRound = new Set<string>()
  const clashes = new Set<string>()
  for (const result of results) {
    const ids = 'entrant' in result ? [result.entrant] : result.entrants
    for (const id of ids) {
      if (!known.has(id))
        problem(
          'unknown-entrant',
          `A Result in round ${result.round} names "${id}", who is not an Entrant.`,
          [id],
        )
      const key = `${result.round}\u0000${id}`
      if (seenInRound.has(key) && !clashes.has(key)) {
        clashes.add(key)
        problem(
          'two-results-in-round',
          `"${id}" has more than one Result in round ${result.round}.`,
          [id],
        )
      }
      seenInRound.add(key)
    }
  }

  if (configuration !== undefined) checkAgainstConfiguration(results, configuration, raw, problem)

  if (errors.length > 0 || configuration === undefined) {
    return { ok: false, errors: errors.sort(compareErrors) }
  }
  const input: StandingsInput = { entrants, results, configuration }
  if (raw['plannedRounds'] !== undefined) input.plannedRounds = raw['plannedRounds'] as number
  if (raw['randomSeed'] !== undefined) input.randomSeed = raw['randomSeed'] as string
  return { ok: true, input }
}

type Problem = (code: string, message: string, entrants?: string[]) => void
type FieldsOf = (
  value: unknown,
  where: string,
  required: readonly string[],
  optional?: readonly string[],
) => Fields | undefined
type Wrong = (message: string, entrants?: string[]) => void

function parseMatch(
  value: Fields,
  where: string,
  fields: FieldsOf,
  wrong: Wrong,
): MatchResult | undefined {
  fields(value, where, ['round', 'entrants', 'outcomes'], ['games', 'extraScores'])
  const { round, entrants, outcomes, games, extraScores: scores } = value
  let sound = true
  const bad = (message: string): void => {
    wrong(`${where}: ${message}`)
    sound = false
  }
  if (!isWhole(round, 1)) bad('`round` must be a whole number, 1 or more.')
  if (
    !Array.isArray(entrants) ||
    entrants.length !== 2 ||
    !entrants.every(isText) ||
    entrants[0] === entrants[1]
  ) {
    bad('`entrants` must be two different ids.')
  }
  if (
    !Array.isArray(outcomes) ||
    outcomes.length !== 2 ||
    !outcomes.every((outcome) => OUTCOMES.includes(outcome))
  ) {
    bad('`outcomes` must be two of "win", "loss" and "draw".')
  }
  if (
    games !== undefined &&
    !(Array.isArray(games) && games.length === 3 && games.every((count) => isWhole(count, 0)))
  ) {
    bad('`games` must be three whole numbers: won by the first Entrant, won by the second, drawn.')
  }
  if (
    scores !== undefined &&
    !(
      isFields(scores) &&
      Object.values(scores).every(
        (pair) => Array.isArray(pair) && pair.length === 2 && pair.every((score) => isWhole(score)),
      )
    )
  ) {
    bad('`extraScores` must give two whole numbers for each Extra Score.')
  }
  if (!sound) return undefined
  const result: MatchResult = {
    round: round as number,
    entrants: [...(entrants as [string, string])],
    outcomes: [...(outcomes as [Outcome, Outcome])],
  }
  if (games !== undefined) result.games = [...(games as [number, number, number])]
  if (scores !== undefined) {
    result.extraScores = Object.fromEntries(
      Object.entries(scores as Record<string, [number, number]>).map(([name, pair]) => [
        name,
        [pair[0], pair[1]],
      ]),
    )
  }
  return result
}

function parseSolo(
  value: Fields,
  where: string,
  fields: FieldsOf,
  wrong: Wrong,
): SoloResult | undefined {
  fields(value, where, ['round', 'entrant', 'kind'])
  const { round, entrant, kind } = value
  if (!isWhole(round, 1) || !isText(entrant) || !SOLO_KINDS.includes(kind)) {
    wrong(
      `${where} must have a round, one Entrant, and a kind of "bye", "awarded-bye" or "unplayed-loss".`,
    )
    return undefined
  }
  return { round, entrant, kind: kind as SoloResult['kind'] }
}

function parseConfiguration(
  raw: unknown,
  problem: Problem,
  fields: FieldsOf,
  wrong: Wrong,
  problemCount: () => number,
): StandingsConfiguration | undefined {
  if (raw === undefined) {
    problem(
      'missing-configuration',
      '`configuration` is required. Pass a Preset, the starting Configuration, or your own.',
    )
    return undefined
  }
  const before = problemCount()
  const value = fields(raw, 'The Configuration', [
    'points',
    'bye',
    'unplayedLoss',
    'allow',
    'tiebreakers',
    'byesReceived',
  ])
  if (value === undefined) return undefined

  const points = parsePoints(value['points'], fields, wrong)
  const bye = parseSoloScoring(value['bye'], '`bye`', fields, wrong)
  const unplayedLoss = parseSoloScoring(value['unplayedLoss'], '`unplayedLoss`', fields, wrong)
  const allow = fields(value['allow'], '`allow`', ['draws', 'doubleLosses'])
  if (
    allow !== undefined &&
    (typeof allow['draws'] !== 'boolean' || typeof allow['doubleLosses'] !== 'boolean')
  ) {
    if (allow['draws'] !== undefined && allow['doubleLosses'] !== undefined)
      wrong('`allow.draws` and `allow.doubleLosses` must each be true or false.')
  }
  const byesReceived = value['byesReceived']
  if (
    byesReceived !== undefined &&
    byesReceived !== 'assigned' &&
    byesReceived !== 'assigned-and-awarded'
  ) {
    wrong('`byesReceived` must be "assigned" or "assigned-and-awarded".')
  }

  const tiebreakers: Tiebreaker[] = []
  if (value['tiebreakers'] !== undefined && !Array.isArray(value['tiebreakers']))
    wrong('`tiebreakers` must be a list.')
  for (const [at, entry] of (Array.isArray(value['tiebreakers'])
    ? value['tiebreakers']
    : []
  ).entries()) {
    const tiebreaker = parseTiebreaker(entry, at, problem, fields, wrong)
    if (tiebreaker !== undefined) tiebreakers.push(tiebreaker)
  }

  if (problemCount() !== before) return undefined
  return {
    points: points as PointsMethod,
    bye: bye as SoloScoring,
    unplayedLoss: unplayedLoss as SoloScoring,
    allow: { draws: allow?.['draws'] as boolean, doubleLosses: allow?.['doubleLosses'] as boolean },
    tiebreakers,
    byesReceived: byesReceived as StandingsConfiguration['byesReceived'],
  }
}

function parsePoints(raw: unknown, fields: FieldsOf, wrong: Wrong): PointsMethod | undefined {
  if (!isFields(raw)) {
    fields(raw, '`points`', ['type'])
    return undefined
  }
  switch (raw['type']) {
    case 'by-outcome': {
      fields(raw, '`points`', ['type', 'win', 'draw', 'loss'])
      if (
        ![raw['win'], raw['draw'], raw['loss']].every(
          (value) => value === undefined || isWhole(value),
        )
      ) {
        wrong('`points`: `win`, `draw` and `loss` must be whole numbers.')
        return undefined
      }
      return {
        type: 'by-outcome',
        win: raw['win'] as number,
        draw: raw['draw'] as number,
        loss: raw['loss'] as number,
      }
    }
    case 'by-game-score': {
      fields(raw, '`points`', ['type', 'table'])
      const table = raw['table']
      if (table === undefined) return undefined
      const sound =
        Array.isArray(table) &&
        table.length > 0 &&
        table.every(
          (row) =>
            isFields(row) &&
            Object.keys(row).length === 4 &&
            isWhole(row['won'], 0) &&
            isWhole(row['lost'], 0) &&
            isWhole(row['drawn'], 0) &&
            isWhole(row['points']),
        )
      if (!sound) {
        wrong('`points.table` must list game scores as { won, lost, drawn, points }.')
        return undefined
      }
      return {
        type: 'by-game-score',
        table: (table as { won: number; lost: number; drawn: number; points: number }[]).map(
          (row) => ({ ...row }),
        ),
      }
    }
    case 'by-score-difference': {
      fields(raw, '`points`', ['type', 'score', 'bands'])
      const bands = raw['bands']
      if (raw['score'] === undefined || bands === undefined) return undefined
      const shaped =
        isText(raw['score']) &&
        Array.isArray(bands) &&
        bands.length > 0 &&
        bands.every(
          (band) =>
            isFields(band) &&
            Object.keys(band).length === 3 &&
            (band['upTo'] === null || isWhole(band['upTo'], 0)) &&
            isWhole(band['higher']) &&
            isWhole(band['lower']),
        )
      if (!shaped) {
        wrong(
          '`points` by score difference needs a `score` name and `bands` of { upTo, higher, lower }.',
        )
        return undefined
      }
      const list = bands as { upTo: number | null; higher: number; lower: number }[]
      const rising = list.every((band, at) =>
        at === list.length - 1
          ? band.upTo === null
          : band.upTo !== null && (at === 0 || band.upTo > (list[at - 1]?.upTo ?? -1)),
      )
      if (!rising) {
        wrong('`points.bands` must rise, and only the last band may have `upTo: null`.')
        return undefined
      }
      if (list[0]?.higher !== list[0]?.lower) {
        wrong(
          '`points.bands`: the first band covers level scores, so its `higher` and `lower` must be equal.',
        )
        return undefined
      }
      return {
        type: 'by-score-difference',
        score: raw['score'] as string,
        bands: list.map((band) => ({ ...band })),
      }
    }
    case 'by-score': {
      fields(raw, '`points`', ['type', 'score'])
      if (raw['score'] === undefined) return undefined
      if (!isText(raw['score'])) {
        wrong('`points.score` must name an extra score.')
        return undefined
      }
      return { type: 'by-score', score: raw['score'] }
    }
    default:
      wrong(
        '`points.type` must be "by-outcome", "by-game-score", "by-score-difference" or "by-score".',
      )
      return undefined
  }
}

function parseSoloScoring(
  raw: unknown,
  where: string,
  fields: FieldsOf,
  wrong: Wrong,
): SoloScoring | undefined {
  const value = fields(raw, where, ['points', 'games', 'countsAsPlayed'])
  if (value === undefined) return undefined
  const { points, games, countsAsPlayed } = value
  if (points === undefined || games === undefined || countsAsPlayed === undefined) return undefined
  if (
    !isWhole(points) ||
    !(Array.isArray(games) && games.length === 3 && games.every((count) => isWhole(count, 0))) ||
    typeof countsAsPlayed !== 'boolean'
  ) {
    wrong(
      `${where} needs whole-number \`points\`, three whole numbers for \`games\`, and \`countsAsPlayed\` true or false.`,
    )
    return undefined
  }
  return { points, games: [...(games as [number, number, number])], countsAsPlayed }
}

function parseRatio(raw: unknown, where: string, wrong: Wrong): Ratio | undefined {
  if (
    isFields(raw) &&
    Object.keys(raw).length === 2 &&
    isWhole(raw['numerator'], 0) &&
    isWhole(raw['denominator'], 1)
  ) {
    return { numerator: raw['numerator'], denominator: raw['denominator'] }
  }
  wrong(`${where} must be a fraction written as { numerator, denominator }.`)
  return undefined
}

function parseRate(
  raw: unknown,
  where: string,
  fields: FieldsOf,
  wrong: Wrong,
): RateSettings | undefined {
  const value = fields(raw, where, ['counts', 'rounds', 'floor', 'capIfDropped'])
  if (value === undefined) return undefined
  const { counts, rounds, floor, capIfDropped } = value
  if (
    counts === undefined ||
    rounds === undefined ||
    floor === undefined ||
    capIfDropped === undefined
  )
    return undefined
  let cleanCounts: RateSettings['counts'] | undefined
  if (isFields(counts) && counts['type'] === 'wins' && Object.keys(counts).length === 1)
    cleanCounts = { type: 'wins' }
  else if (
    isFields(counts) &&
    counts['type'] === 'points' &&
    isWhole(counts['perRound'], 1) &&
    Object.keys(counts).length === 2
  ) {
    cleanCounts = { type: 'points', perRound: counts['perRound'] }
  } else wrong(`${where}.counts must be { type: "wins" } or { type: "points", perRound }.`)
  if (rounds !== 'played' && rounds !== 'planned')
    wrong(`${where}.rounds must be "played" or "planned".`)
  const cleanFloor = floor === null ? null : parseRatio(floor, `${where}.floor`, wrong)
  const cleanCap =
    capIfDropped === null ? null : parseRatio(capIfDropped, `${where}.capIfDropped`, wrong)
  if (
    cleanCounts === undefined ||
    (rounds !== 'played' && rounds !== 'planned') ||
    cleanFloor === undefined ||
    cleanCap === undefined
  )
    return undefined
  return { counts: cleanCounts, rounds, floor: cleanFloor, capIfDropped: cleanCap }
}

function parseTiebreaker(
  raw: unknown,
  at: number,
  problem: Problem,
  fields: FieldsOf,
  wrong: Wrong,
): Tiebreaker | undefined {
  const type = isFields(raw) ? raw['type'] : undefined
  if (!isFields(raw) || typeof type !== 'string' || !Object.hasOwn(TIEBREAKER_SETTINGS, type)) {
    problem(
      'unknown-tiebreaker',
      `Tiebreaker ${at + 1} is not one the engine knows${typeof type === 'string' ? `: "${type}"` : ''}.`,
    )
    return undefined
  }
  const known = type as Tiebreaker['type']
  const where = `Tiebreaker "${known}"`
  const settings = TIEBREAKER_SETTINGS[known]
  fields(raw, where, ['type', ...settings])
  if (settings.some((setting) => raw[setting] === undefined)) return undefined

  const ratioOf = (name: string): Ratio | undefined =>
    parseRatio(raw[name], `${where}.${name}`, wrong)
  const ratioOrNull = (name: string): Ratio | null | undefined =>
    raw[name] === null ? null : ratioOf(name)
  const flag = (name: string): boolean | undefined => {
    if (typeof raw[name] === 'boolean') return raw[name]
    wrong(`${where}.${name} must be true or false.`)
    return undefined
  }
  const amount = (name: string): number | undefined => {
    if (isWhole(raw[name], 0)) return raw[name]
    wrong(`${where}.${name} must be a whole number, 0 or more.`)
    return undefined
  }

  switch (known) {
    case 'match-win-rate': {
      const rate = parseRate(raw['rate'], `${where}.rate`, fields, wrong)
      return rate === undefined ? undefined : { type: known, rate }
    }
    case 'opponents-match-win-rate':
    case 'opponents-opponents-match-win-rate': {
      const rate = parseRate(raw['rate'], `${where}.rate`, fields, wrong)
      const withNoOpponents = ratioOf('withNoOpponents')
      return rate === undefined || withNoOpponents === undefined
        ? undefined
        : { type: known, rate, withNoOpponents }
    }
    case 'game-win-rate': {
      const win = amount('win')
      const draw = amount('draw')
      const floor = ratioOrNull('floor')
      return win === undefined || draw === undefined || floor === undefined
        ? undefined
        : { type: known, win, draw, floor }
    }
    case 'opponents-game-win-rate': {
      const win = amount('win')
      const draw = amount('draw')
      const floor = ratioOrNull('floor')
      const withNoOpponents = ratioOf('withNoOpponents')
      return win === undefined ||
        draw === undefined ||
        floor === undefined ||
        withNoOpponents === undefined
        ? undefined
        : { type: known, win, draw, floor, withNoOpponents }
    }
    case 'opponents-loss-rate': {
      const withNoOpponents = ratioOf('withNoOpponents')
      return withNoOpponents === undefined ? undefined : { type: known, withNoOpponents }
    }
    case 'wins':
    case 'game-wins': {
      const includeByes = flag('includeByes')
      return includeByes === undefined ? undefined : { type: known, includeByes }
    }
    case 'score-total': {
      const { score, of } = raw
      if (!isText(score) || (of !== 'for' && of !== 'against' && of !== 'difference')) {
        wrong(`${where} needs a \`score\` name and \`of\` set to "for", "against" or "difference".`)
        return undefined
      }
      return { type: known, score, of }
    }
    default:
      return { type: known }
  }
}

/** Checks each Result against what the Configuration allows and needs. */
function checkAgainstConfiguration(
  results: readonly Result[],
  configuration: StandingsConfiguration,
  raw: Fields,
  problem: Problem,
): void {
  const { points, tiebreakers, allow } = configuration
  const needsGames =
    points.type === 'by-game-score' ||
    tiebreakers.some((tiebreaker) => USES_GAMES.includes(tiebreaker.type))
  const scoreNames = new Set<string>()
  if (points.type === 'by-score-difference' || points.type === 'by-score')
    scoreNames.add(points.score)
  for (const tiebreaker of tiebreakers)
    if (tiebreaker.type === 'score-total') scoreNames.add(tiebreaker.score)

  for (const result of results) {
    if ('entrant' in result) continue
    const [first, second] = result.outcomes
    const where = `Round ${result.round}, "${result.entrants[0]}" and "${result.entrants[1]}"`
    const both = [...result.entrants]
    const pair = `${first}/${second}`
    if (pair === 'draw/draw') {
      if (!allow.draws)
        problem('disallowed-outcome', `${where}: the Configuration does not allow draws.`, both)
    } else if (pair === 'loss/loss') {
      if (!allow.doubleLosses)
        problem(
          'disallowed-outcome',
          `${where}: the Configuration does not allow both sides to lose.`,
          both,
        )
    } else if (pair !== 'win/loss' && pair !== 'loss/win') {
      problem(
        'impossible-outcomes',
        `${where}: the two sides cannot be "${first}" and "${second}".`,
        both,
      )
    }

    if (needsGames && result.games === undefined) {
      problem(
        'missing-games',
        `${where}: the Configuration uses game scores, and this Result has none.`,
        both,
      )
    }
    for (const name of scoreNames) {
      if (result.extraScores?.[name] === undefined) {
        problem(
          'missing-score',
          `${where}: the Configuration uses the Extra Score "${name}", and this Result does not have it.`,
          both,
        )
      }
    }
    if (points.type === 'by-game-score' && result.games !== undefined) {
      const [won, lost, drawn] = result.games
      for (const [mine, theirs] of [
        [won, lost],
        [lost, won],
      ] as const) {
        if (
          !points.table.some(
            (row) => row.won === mine && row.lost === theirs && row.drawn === drawn,
          )
        ) {
          problem(
            'unlisted-game-score',
            `${where}: the points table has no entry for a game score of ${mine}-${theirs}-${drawn}.`,
            both,
          )
        }
      }
    }
  }

  const usesPlanned = tiebreakers.some(
    (tiebreaker) => 'rate' in tiebreaker && tiebreaker.rate.rounds === 'planned',
  )
  if (usesPlanned && raw['plannedRounds'] === undefined) {
    problem(
      'missing-planned-rounds',
      'A Tiebreaker counts planned rounds, so `plannedRounds` is needed.',
    )
  }
  if (
    tiebreakers.some((tiebreaker) => tiebreaker.type === 'random') &&
    raw['randomSeed'] === undefined
  ) {
    problem('missing-random-seed', 'The random Tiebreaker needs a `randomSeed`.')
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
