export type {
  CheckInput,
  CheckResult,
  CheckSuccess,
  Comparison,
  Constraint,
  Coverage,
  LevelComparison,
  EntrantId,
  Failure,
  InputError,
  PairDownPick,
  Pairing,
  PairingEntrant,
  RoundInput,
  RoundResult,
  RoundSuccess,
  Slot,
  StructureInput,
  StructurePairing,
  StructureResult,
  StructureRound,
  StructureSuccess,
  Violation,
} from '@score-keepr/shared'
export { checkPairings } from './check.ts'
export { buildStructure } from './single-elimination.ts'
export { startingConfiguration } from './starting.ts'
export { pairRound } from './swiss.ts'
export { ENGINE_VERSION } from './version.ts'
