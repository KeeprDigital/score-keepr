export type {
  EntrantId,
  Failure,
  FinalPlacing,
  FinalPlacingsInput,
  FinalPlacingsResult,
  FinalPlacingsSuccess,
  InputError,
  MatchResult,
  Outcome,
  PointsMethod,
  RateSettings,
  Ratio,
  Result,
  SoloResult,
  SoloScoring,
  StandingsConfiguration,
  StandingsEntrant,
  StandingsInput,
  StandingsResult,
  StandingsRow,
  StandingsSuccess,
  Tiebreaker,
  TiebreakerValue,
} from '@score-keepr/shared'
export { finalPlacings } from './final-placings.ts'
export { presets, type Preset } from './presets.ts'
export { computeStandings } from './standings.ts'
export { startingConfiguration } from './starting.ts'
export { ENGINE_VERSION } from './version.ts'
