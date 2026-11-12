import type { EntrantId, Failure } from './types.ts'

/** The facts the Pairing Engine needs about one Entrant. */
export type PairingEntrant = {
  id: EntrantId
  /** Whole number. May be negative. */
  score: number
  /** Ids already faced. May name Entrants who are not in this call. */
  opponents: EntrantId[]
  /** Byes received so far, counted however the Consumer chooses. */
  byes: number
  /** 1 is best. Needed only when a chosen Constraint uses Rank. */
  rank?: number
  /** Group Labels by kind, for example `{ club: 'Leeds' }`. */
  groups?: Record<string, string>
}

/** How a Pair-down picks an Entrant from a Score Group. */
export type PairDownPick = 'highest' | 'lowest' | 'random'

/** One entry in a Configuration. Earlier entries always win over later ones. */
export type Constraint =
  | { type: 'no-rematch' }
  | { type: 'bye-cap'; max: number }
  | { type: 'avoid-same-group-label'; kind: string }
  | { type: 'avoid-listed-pairs' }
  | { type: 'prefer-same-group-label'; kind: string }
  | { type: 'bye-to-lowest-score' }
  | { type: 'bye-to-lowest-rank' }
  | { type: 'pair-close-in-score' }
  | { type: 'keep-top-clean' }
  | { type: 'keep-bottom-clean' }
  | { type: 'pair-adjacent-by-rank' }
  | { type: 'pair-top-vs-bottom-by-rank' }
  | { type: 'pair-down-choice'; from: PairDownPick; opponent: PairDownPick }

export type RoundInput = {
  system: 'swiss'
  /** Only the Entrants to be paired this round. */
  entrants: PairingEntrant[]
  /** Constraints in priority order. Always required. */
  configuration: Constraint[]
  randomSeed: string
  /** Feeds Shuffle Positions and is echoed back. Nothing else depends on it. */
  round: number
  /** Used by the `avoid-listed-pairs` Constraint. */
  avoidPairs?: [EntrantId, EntrantId][]
  /** Upper bound on the engine's work, counted in steps, never in time. */
  workLimit?: number
}

export type Pairing = {
  /** Higher Score first. */
  entrants: [EntrantId, EntrantId]
  /** Above zero marks a Pair-down. */
  scoreGap: number
}

/** A yes-or-no Constraint broken by the returned Pairings. */
export type Violation = {
  constraint: Constraint
  entrants: EntrantId[]
}

export type RoundSuccess = {
  ok: true
  /** Highest Score first. */
  pairings: Pairing[]
  bye: EntrantId | null
  violations: Violation[]
  /** True when no other set of Pairings does better under the Configuration. */
  provenBest: boolean
  round: number
  engineVersion: string
}

export type RoundResult = Failure | RoundSuccess
