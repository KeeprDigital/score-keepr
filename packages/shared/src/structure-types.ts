import type { EntrantId, Failure } from './types.ts'

export type StructureInput = {
  system: 'single-elimination'
  /** Every Entrant in the cut. Ranks must all differ; gaps are fine, only the order matters. */
  entrants: { id: EntrantId; rank: number }[]
}

/** One side of a Pairing: a named Entrant, or the winner of an earlier Pairing. */
export type Slot = { entrant: EntrantId } | { winnerOf: number }

export type StructurePairing = {
  /** Counts from 1 across the whole structure, round by round. */
  number: number
  slots: [Slot, Slot]
}

export type StructureRound = {
  pairings: StructurePairing[]
  /** Entrants with no opponent this round, best Rank first. Only round one can have any. */
  byes: EntrantId[]
}

export type StructureSuccess = {
  ok: true
  rounds: StructureRound[]
  engineVersion: string
}

export type StructureResult = Failure | StructureSuccess
