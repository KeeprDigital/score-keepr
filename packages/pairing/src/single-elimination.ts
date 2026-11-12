import {
  compareCodeUnits,
  type InputError,
  type Slot,
  type StructureInput,
  type StructureResult,
  type StructureRound,
} from '@score-keepr/shared'

import { ENGINE_VERSION } from './version.ts'

type Seeded = { id: string; rank: number }

/**
 * Lays out a whole Fixed-Structure System in one call.
 *
 * Single Elimination places Entrants by Rank so the two best can only meet in the final. When
 * the count is not a power of two, the best Ranks skip round one. The structure uses no
 * Configuration, no randomness and no history.
 *
 * Never throws. Invalid input comes back as `ok: false` with every problem found.
 */
export function buildStructure(input: StructureInput): StructureResult {
  try {
    const errors: InputError[] = []
    const entrants = parse(input, errors)
    if (errors.length > 0) return { ok: false, errors }

    const seeded = [...entrants].sort((a, b) => a.rank - b.rank).map((entrant) => entrant.id)
    return { ok: true, rounds: layOut(seeded), engineVersion: ENGINE_VERSION }
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

/** `seeded` holds ids from the best Rank down. */
function layOut(seeded: readonly string[]): StructureRound[] {
  let size = 1
  while (size < seeded.length) size *= 2

  const rounds: StructureRound[] = []
  const order = seedOrder(size)
  let number = 0
  let feeders: Slot[] = []
  const first: StructureRound = { pairings: [], byes: [] }
  const byes: number[] = []

  for (let at = 0; at < size; at += 2) {
    const better = order[at] as number
    const worse = order[at + 1] as number
    const entrant: Slot = { entrant: seeded[better - 1] as string }
    if (worse > seeded.length) {
      byes.push(better)
      feeders.push(entrant)
    } else {
      number++
      first.pairings.push({ number, slots: [entrant, { entrant: seeded[worse - 1] as string }] })
      feeders.push({ winnerOf: number })
    }
  }
  first.byes = byes.sort((a, b) => a - b).map((seed) => seeded[seed - 1] as string)
  rounds.push(first)

  while (feeders.length > 1) {
    const round: StructureRound = { pairings: [], byes: [] }
    const next: Slot[] = []
    for (let at = 0; at < feeders.length; at += 2) {
      number++
      round.pairings.push({ number, slots: [feeders[at] as Slot, feeders[at + 1] as Slot] })
      next.push({ winnerOf: number })
    }
    rounds.push(round)
    feeders = next
  }
  return rounds
}

/**
 * Seeds in bracket order for a power-of-two size: 1 8 4 5 2 7 3 6 for eight. Each neighbouring
 * pair meets in round one, and the halves keep the best seeds apart until as late as possible.
 */
function seedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const total = order.length * 2 + 1
    order = order.flatMap((seed) => [seed, total - seed])
  }
  return order
}

function parse(raw: unknown, errors: InputError[]): Seeded[] {
  const problem = (code: string, message: string, entrants: string[] = []): void => {
    errors.push({ code, message, entrants })
  }
  const isFields = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  const unknownFields = (
    value: Record<string, unknown>,
    known: readonly string[],
    where: string,
  ): void => {
    for (const key of Object.keys(value)) {
      if (!known.includes(key)) problem('unknown-field', `${where} has an unknown field "${key}".`)
    }
  }

  if (!isFields(raw)) {
    problem('invalid-input', 'The input must be an object.')
    return []
  }
  unknownFields(raw, ['system', 'entrants'], 'The input')
  if (raw['system'] !== 'single-elimination')
    problem('invalid-input', '`system` must be "single-elimination".')
  if (!Array.isArray(raw['entrants'])) {
    problem('invalid-input', '`entrants` must be a list.')
    return []
  }

  const entrants: Seeded[] = []
  const ids = new Set<string>()
  const repeated = new Set<string>()
  for (const [at, value] of raw['entrants'].entries()) {
    if (!isFields(value)) {
      problem('invalid-input', `Entrant ${at + 1} must be an object.`)
      continue
    }
    const { id, rank } = value
    if (typeof id !== 'string' || id === '') {
      problem('invalid-input', `Entrant ${at + 1} must have an id that is a non-empty string.`)
      continue
    }
    unknownFields(value, ['id', 'rank'], `Entrant "${id}"`)
    if (ids.has(id)) repeated.add(id)
    ids.add(id)
    if (typeof rank !== 'number' || !Number.isSafeInteger(rank) || rank < 1) {
      problem('invalid-input', `Entrant "${id}": \`rank\` must be a whole number, 1 or more.`, [id])
      continue
    }
    entrants.push({ id, rank })
  }
  for (const id of repeated)
    problem('duplicate-id', `More than one Entrant has the id "${id}".`, [id])

  const byRank = new Map<number, string[]>()
  for (const entrant of entrants)
    byRank.set(entrant.rank, [...(byRank.get(entrant.rank) ?? []), entrant.id])
  for (const [rank, sharing] of [...byRank].sort(([a], [b]) => a - b)) {
    const distinct = [...new Set(sharing)].sort(compareCodeUnits)
    if (distinct.length > 1) {
      problem(
        'shared-rank',
        `Rank ${rank} is shared. A cut needs every Rank to be different.`,
        distinct,
      )
    }
  }

  if (errors.length === 0 && entrants.length < 2) {
    problem('too-few-entrants', 'Single Elimination needs at least two Entrants.')
  }
  return entrants
}
