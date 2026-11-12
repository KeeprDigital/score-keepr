import type { RateSettings, StandingsConfiguration } from '@score-keepr/shared'

const third = { numerator: 1, denominator: 3 }

const rate: RateSettings = {
  counts: { type: 'points', perRound: 3 },
  rounds: 'played',
  floor: third,
  capIfDropped: null,
}

/**
 * A generic Configuration to pass in or adapt. The engine never applies it on its own.
 * It needs match Outcomes only, no game scores.
 */
export const startingConfiguration: StandingsConfiguration = {
  points: { type: 'by-outcome', win: 3, draw: 1, loss: 0 },
  bye: { points: 3, games: [2, 0, 0], countsAsPlayed: true },
  soloLoss: { points: 0, games: [0, 2, 0], countsAsPlayed: true },
  allow: { draws: true, doubleLosses: true },
  tiebreakers: [
    { type: 'opponents-match-win-rate', rate, withNoOpponents: third },
    { type: 'opponents-opponents-match-win-rate', rate, withNoOpponents: third },
  ],
  byesReceived: 'assigned',
}
