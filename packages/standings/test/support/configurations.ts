import {
  presets,
  startingConfiguration,
  type RateSettings,
  type StandingsConfiguration,
} from '../../src/index.ts'

const third = { numerator: 1, denominator: 3 }
const playedRate: RateSettings = {
  counts: { type: 'wins' },
  rounds: 'played',
  floor: null,
  capIfDropped: null,
}
const base: StandingsConfiguration = {
  points: { type: 'by-outcome', win: 3, draw: 1, loss: 0 },
  bye: { points: 3, games: [2, 0, 0], countsAsPlayed: true },
  unplayedLoss: { points: 0, games: [0, 2, 0], countsAsPlayed: true },
  allow: { draws: true, doubleLosses: true },
  tiebreakers: [],
  byesReceived: 'assigned',
}

/** Configurations that scenario files can name. */
export const configurations: Record<string, StandingsConfiguration> = {
  starting: startingConfiguration,
  magic: presets['magic-2026-02-27'].configuration,
  pokemon: presets['pokemon-2026-09-01'].configuration,
  /** Score only: everyone level on Score shares a Rank. */
  'score-only': base,
  /** A wargame: Score is wins, then margin of victory, then total victory points. */
  wargame: {
    ...base,
    points: { type: 'by-outcome', win: 1, draw: 0, loss: 0 },
    bye: { points: 1, games: [0, 0, 0], countsAsPlayed: true },
    tiebreakers: [
      { type: 'score-total', score: 'vp', of: 'difference' },
      { type: 'score-total', score: 'vp', of: 'for' },
      { type: 'score-total', score: 'vp', of: 'against' },
    ],
  },
  /** Twenty points shared by how far apart the two sides are on victory points. */
  'twenty-nil': {
    ...base,
    points: {
      type: 'by-score-difference',
      score: 'vp',
      bands: [
        { upTo: 5, higher: 10, lower: 10 },
        { upTo: 10, higher: 11, lower: 9 },
        { upTo: 20, higher: 13, lower: 7 },
        { upTo: null, higher: 20, lower: 0 },
      ],
    },
    bye: { points: 10, games: [0, 0, 0], countsAsPlayed: true },
  },
  /** Score is total victory points. */
  'points-are-vp': {
    ...base,
    points: { type: 'by-score', score: 'vp' },
    bye: { points: 50, games: [0, 0, 0], countsAsPlayed: true },
  },
  /** Two-game matches: 2-0 earns 7, a 1-1 split earns 3 each, a 1-0 with a draw earns 4 and 1. */
  'two-game': {
    ...base,
    points: {
      type: 'by-game-score',
      table: [
        { won: 2, lost: 0, drawn: 0, points: 7 },
        { won: 0, lost: 2, drawn: 0, points: 0 },
        { won: 1, lost: 1, drawn: 0, points: 3 },
        { won: 1, lost: 0, drawn: 1, points: 4 },
        { won: 0, lost: 1, drawn: 1, points: 1 },
      ],
    },
    bye: { points: 7, games: [2, 0, 0], countsAsPlayed: true },
    tiebreakers: [{ type: 'game-wins', includeByes: true }],
  },
  /** No draws allowed, double losses allowed, later losses rank higher. */
  'later-losses': {
    ...base,
    points: { type: 'by-outcome', win: 3, draw: 0, loss: 0 },
    allow: { draws: false, doubleLosses: true },
    tiebreakers: [{ type: 'later-losses' }],
  },
  /** Loss rates, own then opponents'. Lower is better. */
  'loss-rates': {
    ...base,
    points: { type: 'by-outcome', win: 1, draw: 0, loss: 0 },
    bye: { points: 1, games: [0, 0, 0], countsAsPlayed: false },
    tiebreakers: [
      { type: 'loss-rate' },
      { type: 'opponents-loss-rate', withNoOpponents: { numerator: 0, denominator: 1 } },
    ],
  },
  /** Wins, then head-to-head, then a seeded random order. */
  'head-to-head': {
    ...base,
    tiebreakers: [
      { type: 'wins', includeByes: false },
      { type: 'head-to-head' },
      { type: 'random' },
    ],
  },
  /** Own win rate by wins, no floor. */
  'own-win-rate': { ...base, tiebreakers: [{ type: 'match-win-rate', rate: playedRate }] },
  /** Awarded Byes count towards Byes received. */
  'awarded-count': {
    ...base,
    byesReceived: 'assigned-and-awarded',
    tiebreakers: [{ type: 'opponents-match-win-rate', rate: playedRate, withNoOpponents: third }],
  },
}
