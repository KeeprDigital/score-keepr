import type { PairingEntrant } from './pairing-types.ts'
import { compareCodeUnits } from './seeded.ts'
import type { StandingsRow } from './standings-types.ts'
import type { EntrantId, Failure, InputError } from './types.ts'

export type PairingEntrantsOptions = {
  /** Who is to be paired this round. Nobody is assumed to be present. */
  present: readonly EntrantId[]
  /** Group Labels by Entrant, for example `{ ann: { club: 'Leeds' } }`. */
  groups?: Record<EntrantId, Record<string, string>>
}

const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const fail = (errors: InputError[]): Failure => ({ ok: false, errors })
const oneError = (code: string, message: string, entrants: string[] = []): Failure =>
  fail([{ code, message, entrants }])
const unexpected = (error: unknown): Failure =>
  oneError(
    'internal-error',
    `The mapper failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
  )

/**
 * Turns Standings rows into the Entrants of a Swiss round: Score, opponents faced, Byes
 * received and Rank come from the rows; who is present and any Group Labels come from the
 * Consumer. Entrants come back in the order of `present`.
 *
 * Never throws.
 */
export function pairingEntrantsFrom(
  rows: readonly StandingsRow[],
  options: PairingEntrantsOptions,
): { ok: true; entrants: PairingEntrant[] } | Failure {
  try {
    if (!Array.isArray(rows) || !rows.every(isRow))
      return oneError('invalid-input', '`rows` must be the rows of a Standings result.')
    if (!isFields(options) || !Array.isArray(options.present) || !options.present.every(isText)) {
      return oneError('invalid-input', '`present` must list the ids of the Entrants to pair.')
    }
    const groups = options.groups
    if (
      groups !== undefined &&
      !(
        isFields(groups) &&
        Object.values(groups).every(
          (labels) => isFields(labels) && Object.values(labels).every(isText),
        )
      )
    ) {
      return oneError('invalid-input', '`groups` must map ids to Group Labels, each a string.')
    }

    const byId = new Map(rows.map((row) => [row.id, row]))
    const errors: InputError[] = []
    const seen = new Set<string>()
    const entrants: PairingEntrant[] = []
    for (const id of options.present) {
      if (seen.has(id)) {
        errors.push({
          code: 'duplicate-id',
          message: `"${id}" is listed as present more than once.`,
          entrants: [id],
        })
        continue
      }
      seen.add(id)
      const row = byId.get(id)
      if (row === undefined) {
        errors.push({
          code: 'unknown-entrant',
          message: `"${id}" is listed as present but has no row in the Standings.`,
          entrants: [id],
        })
        continue
      }
      const entrant: PairingEntrant = {
        id,
        score: row.score,
        opponents: [...row.opponents],
        byes: row.byes,
        rank: row.rank,
      }
      const labels = groups?.[id]
      if (labels !== undefined) entrant.groups = { ...labels }
      entrants.push(entrant)
    }
    return errors.length > 0 ? fail(errors) : { ok: true, entrants }
  } catch (error) {
    return unexpected(error)
  }
}

/**
 * Picks the Entrants for a Single Elimination cut: the `size` best Ranks among the rows given.
 * Pass only the rows that are eligible, for example one division, or without those who dropped.
 * Ranks are kept as they are; only their order matters.
 *
 * It never chooses between Entrants who share a Rank. If the cut line falls between them, or
 * two inside the cut share one, that is an error: add a Tiebreaker that separates them.
 *
 * Never throws.
 */
export function topCutFrom(
  rows: readonly StandingsRow[],
  size: number,
): { ok: true; entrants: { id: EntrantId; rank: number }[] } | Failure {
  try {
    if (!Array.isArray(rows) || !rows.every(isRow))
      return oneError('invalid-input', '`rows` must be the rows of a Standings result.')
    if (!Number.isSafeInteger(size) || size < 2)
      return oneError('invalid-input', 'A cut must be a whole number of Entrants, 2 or more.')
    if (size > rows.length)
      return oneError(
        'too-few-entrants',
        `A cut of ${size} needs at least ${size} rows; there are ${rows.length}.`,
      )

    const ordered = [...rows].sort((a, b) => a.rank - b.rank || compareCodeUnits(a.id, b.id))
    const cut = ordered.slice(0, size)
    const errors: InputError[] = []
    for (const rank of new Set(cut.map((row) => row.rank))) {
      const sharing = ordered.filter((row) => row.rank === rank).map((row) => row.id)
      if (sharing.length > 1) {
        errors.push({
          code: 'shared-rank',
          message: `Rank ${rank} is shared, so the cut cannot be decided. Add a Tiebreaker that separates them.`,
          entrants: sharing,
        })
      }
    }
    return errors.length > 0
      ? fail(errors)
      : { ok: true, entrants: cut.map((row) => ({ id: row.id, rank: row.rank })) }
  } catch (error) {
    return unexpected(error)
  }
}

function isRow(value: unknown): value is StandingsRow {
  return (
    isFields(value) &&
    isText(value['id']) &&
    typeof value['score'] === 'number' &&
    typeof value['rank'] === 'number' &&
    typeof value['byes'] === 'number' &&
    Array.isArray(value['opponents']) &&
    value['opponents'].every(isText)
  )
}
