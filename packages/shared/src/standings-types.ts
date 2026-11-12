import type { StructureRound } from './structure-types.ts'
import type { EntrantId, Failure } from './types.ts'

/** How one side of a Result fared. Stated for each side, so both sides can lose. */
export type Outcome = 'win' | 'loss' | 'draw'

export type StandingsEntrant = {
  id: EntrantId
  /**
   * Left out for an Entrant still taking part. `dropped` gives the last round they took part in.
   * A `removed` Entrant gets no Rank, but Results against them still count for their opponents.
   */
  status?: { type: 'dropped'; afterRound: number } | { type: 'removed' }
}

/** What happened in one Pairing. */
export type MatchResult = {
  round: number
  entrants: [EntrantId, EntrantId]
  /** In the same order as `entrants`. Only win and loss, draw and draw, or loss and loss. */
  outcomes: [Outcome, Outcome]
  /** Games won by the first Entrant, games won by the second, games drawn. */
  games?: [number, number, number]
  /** Extra Scores, such as victory points, for the first and second Entrant. */
  extraScores?: Record<string, [number, number]>
}

/** A round in which an Entrant had no opponent. */
export type SoloResult = {
  round: number
  entrant: EntrantId
  /** A Bye assigned by pairing, an Awarded Bye, or an Unplayed Loss. */
  kind: 'bye' | 'awarded-bye' | 'unplayed-loss'
}

export type Result = MatchResult | SoloResult

/** A fraction written out, so a Configuration never holds a rounded decimal. */
export type Ratio = { numerator: number; denominator: number }

/** How a Result turns into points. Exactly one way per Configuration. */
export type PointsMethod =
  | { type: 'by-outcome'; win: number; draw: number; loss: number }
  /** Looked up from a side's own games won, lost and drawn. Every game score that occurs must be listed. */
  | { type: 'by-game-score'; table: { won: number; lost: number; drawn: number; points: number }[] }
  /**
   * From how far apart the two sides are on a named extra score. The first band whose `upTo` is
   * not below the difference applies; the last band has `upTo: null`. Level sides both get `higher`.
   */
  | {
      type: 'by-score-difference'
      score: string
      bands: { upTo: number | null; higher: number; lower: number }[]
    }
  /** The named extra score is itself the points. */
  | { type: 'by-score'; score: string }

/** How a round with no opponent counts. */
export type SoloScoring = {
  points: number
  /** Games won, lost and drawn that the round counts as, for game-based Tiebreakers. */
  games: [number, number, number]
  /** Whether the round counts as played, and so enters win rates and loss rates. */
  countsAsPlayed: boolean
}

/** How a win rate is worked out for one Entrant. */
export type RateSettings = {
  /**
   * `points`: points earned over `perRound` times the rounds counted.
   * `wins`: wins over the rounds counted, draws earning nothing.
   */
  counts: { type: 'points'; perRound: number } | { type: 'wins' }
  /**
   * `played`: the rounds the Entrant played.
   * `planned`: the planned rounds of the event, less any round that does not count as played;
   * but for a dropped Entrant, the rounds they played.
   */
  rounds: 'played' | 'planned'
  /** The rate is never taken as lower than this. `null` for no floor. */
  floor: Ratio | null
  /** A dropped Entrant's rate is never taken as higher than this. `null` for no cap. */
  capIfDropped: Ratio | null
}

/** One entry in the Tiebreaker order. Higher is better unless it says otherwise. */
export type Tiebreaker =
  | { type: 'match-win-rate'; rate: RateSettings }
  /** The average of each opponent's match win rate. This is strength of schedule. */
  | { type: 'opponents-match-win-rate'; rate: RateSettings; withNoOpponents: Ratio }
  /** The average of each opponent's opponents' match win rate. Extended strength of schedule. */
  | { type: 'opponents-opponents-match-win-rate'; rate: RateSettings; withNoOpponents: Ratio }
  | { type: 'game-win-rate'; win: number; draw: number; floor: Ratio | null }
  | {
      type: 'opponents-game-win-rate'
      win: number
      draw: number
      floor: Ratio | null
      withNoOpponents: Ratio
    }
  /** Losses over rounds played. Lower is better. */
  | { type: 'loss-rate' }
  /** The average of each opponent's loss rate. Lower is better. */
  | { type: 'opponents-loss-rate'; withNoOpponents: Ratio }
  | { type: 'wins'; includeByes: boolean }
  | { type: 'game-wins'; includeByes: boolean }
  /** A named extra score added up: what the Entrant scored, what was scored against them, or the difference. */
  | { type: 'score-total'; score: string; of: 'for' | 'against' | 'difference' }
  /** The squares of the round numbers lost, added up, so later losses rank higher. */
  | { type: 'later-losses' }
  /** Only when exactly two Entrants are level and one beat the other more often than they lost. */
  | { type: 'head-to-head' }
  /** A seeded order that makes every Rank different. Needs a Random Seed. */
  | { type: 'random' }

/** Every choice for one call. Nothing is assumed: every setting must be stated. */
export type StandingsConfiguration = {
  points: PointsMethod
  /** How a Bye counts, whether assigned or awarded. */
  bye: SoloScoring
  /** How an Unplayed Loss counts. */
  unplayedLoss: SoloScoring
  allow: { draws: boolean; doubleLosses: boolean }
  tiebreakers: Tiebreaker[]
  /** Whether "Byes received", used for the Bye cap in pairing, counts awarded Byes too. */
  byesReceived: 'assigned' | 'assigned-and-awarded'
}

export type StandingsInput = {
  /** Every Entrant, so that one with no Results still appears. */
  entrants: StandingsEntrant[]
  results: Result[]
  configuration: StandingsConfiguration
  /** Needed only by a win rate that counts `planned` rounds. */
  plannedRounds?: number
  /** Needed only by the `random` Tiebreaker. */
  randomSeed?: string
}

/** One Tiebreaker's value for one Entrant. `null` when the Tiebreaker has nothing to say. */
export type TiebreakerValue = {
  /** The value in lowest terms, as text so that no digit is lost. */
  exact: { numerator: string; denominator: string } | null
  /** The same value as a plain number, for display. */
  value: number | null
}

export type StandingsRow = {
  id: EntrantId
  /** 1 is best. Entrants level on everything share a Rank. */
  rank: number
  score: number
  record: { wins: number; losses: number; draws: number }
  /** In the order of the Configuration's Tiebreakers. */
  tiebreakers: TiebreakerValue[]
  /** Every opponent from a Result with two Entrants, in round order, however it ended. */
  opponents: EntrantId[]
  /** Byes received, counted as the Configuration says. This is the fact pairing uses. */
  byes: number
  assignedByes: number
  awardedByes: number
  dropped: boolean
}

export type StandingsSuccess = {
  ok: true
  /** Best Rank first. Removed Entrants are left out. */
  rows: StandingsRow[]
  engineVersion: string
}

export type StandingsResult = Failure | StandingsSuccess

export type FinalPlacingsInput = {
  /** Every Entrant in the event, with their Rank from the round-by-round stage. */
  entrants: { id: EntrantId; rank: number }[]
  /** The Single Elimination structure, exactly as it was built. */
  rounds: StructureRound[]
  /** The winner of each Pairing decided so far. */
  winners: { pairing: number; winner: EntrantId }[]
}

export type FinalPlacing = {
  id: EntrantId
  /** 1 is the winner. `null` while it cannot be known yet. */
  placing: number | null
  /** True for an Entrant who is in the cut and has not been knocked out. */
  stillIn: boolean
  /** Whether the Entrant was part of the cut at all. */
  inCut: boolean
}

export type FinalPlacingsSuccess = {
  ok: true
  /** Best first: those still in, then by how far they got, then by Rank. */
  placings: FinalPlacing[]
  engineVersion: string
}

export type FinalPlacingsResult = Failure | FinalPlacingsSuccess
