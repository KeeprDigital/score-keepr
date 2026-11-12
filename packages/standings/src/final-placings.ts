import {
  compareCodeUnits,
  type FinalPlacing,
  type FinalPlacingsInput,
  type FinalPlacingsResult,
  type InputError,
  type Slot,
} from '@score-keepr/shared'

import { compareErrors } from './validate.ts'
import { ENGINE_VERSION } from './version.ts'

type Fields = Record<string, unknown>
type Pairing = { number: number; round: number; slots: [Slot, Slot] }

/**
 * Works out finishing positions once a Top Cut is under way or over.
 *
 * Entrants in the cut are placed by how far they got, then by Rank. Everyone outside the cut
 * follows in Rank order. While the cut is unfinished, Entrants who are still in it are marked
 * as such and not placed, and those knocked out in a round that is not over yet wait for it.
 *
 * Never throws. Invalid input comes back as `ok: false` with every problem found.
 */
export function finalPlacings(input: FinalPlacingsInput): FinalPlacingsResult {
  try {
    const errors: InputError[] = []
    const parsed = parse(input, errors)
    if (parsed === undefined || errors.length > 0)
      return { ok: false, errors: errors.sort(compareErrors) }
    const placings = place(parsed, errors)
    if (errors.length > 0) return { ok: false, errors: errors.sort(compareErrors) }
    return { ok: true, placings, engineVersion: ENGINE_VERSION }
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

type Parsed = {
  rank: Map<string, number>
  pairings: Pairing[]
  /** How many Pairings each round has. */
  roundSizes: number[]
  winners: { pairing: number; winner: string }[]
}

function place(parsed: Parsed, errors: InputError[]): FinalPlacing[] {
  const { rank, pairings, roundSizes, winners } = parsed
  const problem = (code: string, message: string, entrants: string[] = []): void => {
    errors.push({ code, message, entrants })
  }
  const rankOf = (id: string): number => rank.get(id) as number
  const byRank = (a: string, b: string): number => rankOf(a) - rankOf(b) || compareCodeUnits(a, b)

  const inCut = new Set<string>()
  for (const pairing of pairings)
    for (const slot of pairing.slots) if ('entrant' in slot) inCut.add(slot.entrant)
  for (const id of inCut) {
    if (!rank.has(id))
      problem('unknown-entrant', `"${id}" is in the cut but is not an Entrant.`, [id])
  }
  const sharing = new Map<number, string[]>()
  for (const id of inCut)
    if (rank.has(id)) sharing.set(rankOf(id), [...(sharing.get(rankOf(id)) ?? []), id])
  for (const [shared, ids] of sharing) {
    if (ids.length > 1)
      problem('shared-rank', `Rank ${shared} is shared inside the cut.`, ids.sort(compareCodeUnits))
  }

  // Which Pairing each winner entry is for.
  const byNumber = new Map(pairings.map((pairing) => [pairing.number, pairing]))
  const claimed = new Map<number, string>()
  for (const { pairing, winner } of winners) {
    if (!byNumber.has(pairing))
      problem('unknown-pairing', `There is no Pairing ${pairing} in the structure.`)
    else if (claimed.has(pairing))
      problem('duplicate-winner', `Pairing ${pairing} has more than one winner.`)
    else claimed.set(pairing, winner)
  }
  if (errors.length > 0) return []

  // Play the structure forward. Pairing numbers rise round by round, so each feeder is settled first.
  const winnerOf = new Map<number, string>()
  const knockedOutIn = new Map<string, number>()
  const decidedInRound = roundSizes.map(() => 0)
  for (const pairing of [...pairings].sort((a, b) => a.number - b.number)) {
    const winner = claimed.get(pairing.number)
    if (winner === undefined) continue
    const sides = pairing.slots.map((slot) =>
      'entrant' in slot ? slot.entrant : winnerOf.get(slot.winnerOf),
    )
    const [first, second] = sides
    if (first === undefined || second === undefined || (winner !== first && winner !== second)) {
      problem(
        'invalid-winner',
        `"${winner}" cannot have won Pairing ${pairing.number}: they are not known to be in it.`,
        [winner],
      )
      continue
    }
    winnerOf.set(pairing.number, winner)
    knockedOutIn.set(winner === first ? second : first, pairing.round)
    decidedInRound[pairing.round] = (decidedInRound[pairing.round] as number) + 1
  }
  if (errors.length > 0) return []

  const lastRound = roundSizes.length - 1
  const final = pairings.find((pairing) => pairing.round === lastRound)
  const champion = final === undefined ? undefined : winnerOf.get(final.number)

  const placing = new Map<string, number>()
  if (champion !== undefined) placing.set(champion, 1)
  for (const [round, size] of roundSizes.entries()) {
    if (decidedInRound[round] !== size) continue
    // Everyone who got past this round finishes above its losers.
    const wentFurther = round === lastRound ? 1 : 2 * (roundSizes[round + 1] as number)
    const losers = [...knockedOutIn]
      .filter(([, out]) => out === round)
      .map(([id]) => id)
      .sort(byRank)
    for (const [at, id] of losers.entries()) placing.set(id, wentFurther + 1 + at)
  }

  const outside = [...rank.keys()].filter((id) => !inCut.has(id)).sort(byRank)
  for (const id of outside) {
    placing.set(id, inCut.size + 1 + outside.filter((other) => rankOf(other) < rankOf(id)).length)
  }

  // How far each Entrant in the cut got: the winner furthest, then those still in, then by round.
  const depth = (id: string): number =>
    id === champion
      ? lastRound + 2
      : knockedOutIn.has(id)
        ? (knockedOutIn.get(id) as number)
        : lastRound + 1
  const cut = [...inCut].sort((a, b) => depth(b) - depth(a) || byRank(a, b))

  return [...cut, ...outside].map((id) => ({
    id,
    placing: placing.get(id) ?? null,
    stillIn: inCut.has(id) && id !== champion && !knockedOutIn.has(id),
    inCut: inCut.has(id),
  }))
}

function parse(raw: unknown, errors: InputError[]): Parsed | undefined {
  const problem = (code: string, message: string, entrants: string[] = []): void => {
    errors.push({ code, message, entrants })
  }
  const wrong = (message: string): void => problem('invalid-input', message)
  const isFields = (value: unknown): value is Fields =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  const isWhole = (value: unknown, least: number): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= least
  const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''
  const onlyFields = (value: Fields, known: readonly string[], where: string): void => {
    for (const key of Object.keys(value))
      if (!known.includes(key)) problem('unknown-field', `${where} has an unknown field "${key}".`)
  }

  if (!isFields(raw)) {
    wrong('The input must be an object.')
    return undefined
  }
  onlyFields(raw, ['entrants', 'rounds', 'winners'], 'The input')

  const rank = new Map<string, number>()
  if (!Array.isArray(raw['entrants'])) wrong('`entrants` must be a list.')
  else {
    for (const [at, value] of raw['entrants'].entries()) {
      if (!isFields(value) || !isText(value['id']) || !isWhole(value['rank'], 1)) {
        wrong(`Entrant ${at + 1} must have an id and a Rank that is a whole number, 1 or more.`)
        continue
      }
      onlyFields(value, ['id', 'rank'], `Entrant "${value['id']}"`)
      if (rank.has(value['id']))
        problem('duplicate-id', `More than one Entrant has the id "${value['id']}".`, [value['id']])
      rank.set(value['id'], value['rank'])
    }
  }

  const pairings: Pairing[] = []
  const roundSizes: number[] = []
  const isSlot = (value: unknown): value is Slot =>
    isFields(value) &&
    Object.keys(value).length === 1 &&
    (isText(value['entrant']) || isWhole(value['winnerOf'], 1))
  if (!Array.isArray(raw['rounds']))
    wrong('`rounds` must be the list of rounds from the structure.')
  else {
    const numbers = new Set<number>()
    for (const [round, value] of raw['rounds'].entries()) {
      if (
        !isFields(value) ||
        !Array.isArray(value['pairings']) ||
        !Array.isArray(value['byes']) ||
        !value['byes'].every(isText)
      ) {
        wrong(`Round ${round + 1} of the structure must have \`pairings\` and \`byes\`.`)
        continue
      }
      onlyFields(value, ['pairings', 'byes'], `Round ${round + 1}`)
      roundSizes.push(value['pairings'].length)
      for (const pairing of value['pairings'] as unknown[]) {
        const sound =
          isFields(pairing) &&
          isWhole(pairing['number'], 1) &&
          Array.isArray(pairing['slots']) &&
          pairing['slots'].length === 2 &&
          pairing['slots'].every(isSlot) &&
          !numbers.has(pairing['number'])
        if (!sound) {
          wrong(
            `Round ${round + 1} has a Pairing that is not { number, slots } with two Slots and its own number.`,
          )
          continue
        }
        const { number, slots } = pairing as { number: number; slots: [Slot, Slot] }
        const feedersKnown = slots.every((slot) => 'entrant' in slot || numbers.has(slot.winnerOf))
        if (!feedersKnown)
          wrong(`Pairing ${number} waits on a Pairing that does not come before it.`)
        numbers.add(number)
        pairings.push({ number, round, slots })
      }
    }
  }

  const winners: { pairing: number; winner: string }[] = []
  if (!Array.isArray(raw['winners'])) wrong('`winners` must be a list.')
  else {
    for (const value of raw['winners'] as unknown[]) {
      if (
        !isFields(value) ||
        !isWhole(value['pairing'], 1) ||
        !isText(value['winner']) ||
        Object.keys(value).length !== 2
      ) {
        wrong('Each winner must be { pairing, winner }.')
        continue
      }
      winners.push({ pairing: value['pairing'], winner: value['winner'] })
    }
  }

  return errors.length > 0 ? undefined : { rank, pairings, roundSizes, winners }
}
