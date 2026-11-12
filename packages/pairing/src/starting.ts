import type { Constraint } from '@score-keepr/shared'

/**
 * A generic Configuration to pass in or adapt. The engine never applies it on its own.
 * It needs no Rank, so it works without Standings.
 */
export const startingConfiguration: Constraint[] = [
  { type: 'no-rematch' },
  { type: 'bye-cap', max: 1 },
  { type: 'bye-to-lowest-score' },
  { type: 'pair-close-in-score' },
  { type: 'keep-top-clean' },
]
