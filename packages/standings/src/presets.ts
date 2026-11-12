import type { RateSettings, StandingsConfiguration } from '@score-keepr/shared'

/**
 * A Standings Configuration that reproduces one dated rules document. A Preset never changes:
 * when the rules change, a new Preset is added beside it.
 */
export type Preset = {
  /** The document this Preset follows. */
  source: string
  /** Every choice the document does not settle, and what was chosen. */
  assumptions: string[]
  configuration: StandingsConfiguration
}

const magicFloor = { numerator: 33, denominator: 100 }
const magicRate: RateSettings = {
  counts: { type: 'points', perRound: 3 },
  rounds: 'played',
  floor: magicFloor,
  capIfDropped: null,
}

const pokemonFloor = { numerator: 25, denominator: 100 }
const pokemonRate: RateSettings = {
  counts: { type: 'wins' },
  rounds: 'planned',
  floor: pokemonFloor,
  capIfDropped: { numerator: 75, denominator: 100 },
}

export const presets: { 'magic-2026-02-27': Preset; 'pokemon-2026-09-01': Preset } = {
  'magic-2026-02-27': {
    source:
      'Magic: The Gathering Tournament Rules, effective February 27, 2026: section 3.1 and Appendix C',
    assumptions: [
      'Values are compared exactly. The document does not say how far to round.',
      'An Entrant with no opponents, having had only Byes, has an opponents’ match-win and game-win percentage of 0.33, the minimum.',
      'A loss with no opponent counts as a round played and as two games lost. The document does not cover it.',
      'Both sides losing a match is allowed. The document leaves that to the penalty guide.',
      'Entrants still level after every tiebreaker share a Rank. The document does not say how they are separated.',
    ],
    configuration: {
      points: { type: 'by-outcome', win: 3, draw: 1, loss: 0 },
      bye: { points: 3, games: [2, 0, 0], countsAsPlayed: true },
      unplayedLoss: { points: 0, games: [0, 2, 0], countsAsPlayed: true },
      allow: { draws: true, doubleLosses: true },
      tiebreakers: [
        { type: 'opponents-match-win-rate', rate: magicRate, withNoOpponents: magicFloor },
        { type: 'game-win-rate', win: 3, draw: 1, floor: magicFloor },
        {
          type: 'opponents-game-win-rate',
          win: 3,
          draw: 1,
          floor: magicFloor,
          withNoOpponents: magicFloor,
        },
      ],
      byesReceived: 'assigned',
    },
  },
  'pokemon-2026-09-01': {
    source:
      'Play! Pokémon Tournament Rules Handbook, September 1, 2026: sections 5.3.3.1, 5.5.2.1 and 5.6.1',
    assumptions: [
      'A round with a Bye is left out of both the wins and the rounds when working out a win percentage. Section 5.6.1 says it is not a round played; section 5.3.3.1 divides by the rounds in the tournament.',
      'The document defines final Standings only. During an event, pass the number of rounds completed so far as the planned rounds.',
      'An Entrant with no opponents has an opponents’ win percentage of 25%, the minimum.',
      'A loss with no opponent counts as a round played.',
      'Head-to-head, when the two met more than once: the one who won more of those meetings ranks higher.',
      'Both sides losing a match is allowed.',
    ],
    configuration: {
      points: { type: 'by-outcome', win: 3, draw: 1, loss: 0 },
      bye: { points: 3, games: [0, 0, 0], countsAsPlayed: false },
      unplayedLoss: { points: 0, games: [0, 0, 0], countsAsPlayed: true },
      allow: { draws: true, doubleLosses: true },
      tiebreakers: [
        { type: 'opponents-match-win-rate', rate: pokemonRate, withNoOpponents: pokemonFloor },
        {
          type: 'opponents-opponents-match-win-rate',
          rate: pokemonRate,
          withNoOpponents: pokemonFloor,
        },
        { type: 'head-to-head' },
        { type: 'random' },
      ],
      byesReceived: 'assigned',
    },
  },
}
