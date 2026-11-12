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

/** A Swiss round plus a set of Pairings made by hand, to be checked rather than replaced. */
export type CheckInput = RoundInput & {
  pairings: [EntrantId, EntrantId][]
  /** Entrants given a Bye. */
  byes: EntrantId[]
  /** Also work out the best possible and compare. Costs a full pairing run. */
  compare?: boolean
}

/** What is wrong with who appears in a hand-made set, before any Constraint is considered. */
export type Coverage = {
  /** Present Entrants who are in no Pairing and have no Bye. */
  missing: EntrantId[]
  /** Present Entrants who appear more than once. */
  repeated: EntrantId[]
  /** Ids used in the Pairings or Byes that are not Entrants in this call. */
  unknown: EntrantId[]
  /** How many Byes a complete set must have: 1 when the count is odd, otherwise 0. */
  byesExpected: number
}

/** One level of the Configuration, scored for the given Pairings and for the best possible. */
export type LevelComparison = {
  constraint: Constraint
  /** Set for the two levels of `pair-down-choice`. */
  part?: 'from' | 'opponent'
  /** Lower is better. For a yes-or-no Constraint this is how many times it is broken. */
  given: number
  best: number
}

export type Comparison = {
  /** True when the given Pairings are as good as the best on every Constraint. Always exact. */
  asGoodAsBest: boolean
  /** False when the best could not be proven, for example because the work limit was hit. */
  provenBest: boolean
  /** In Configuration order. Shuffle Positions are left out: a hand-made set never matches them. */
  levels: LevelComparison[]
}

export type CheckSuccess = {
  ok: true
  coverage: Coverage
  /** The given Pairings between known Entrants, in the order given, higher Score first. */
  pairings: Pairing[]
  violations: Violation[]
  /** Present only when asked for and the set is complete. */
  comparison?: Comparison
  engineVersion: string
}

export type CheckResult = Failure | CheckSuccess
