import type { RoundInput, RoundResult } from '@score-keepr/shared'

import { levelsOf } from './cost.ts'
import { solveExhaustive } from './exhaustive.ts'
import { pairInScoreOrder } from './fallback.ts'
import { buildField } from './field.ts'
import { describeResult } from './result.ts'
import { parseRoundInput } from './validate.ts'

/** Fields up to this size are solved by trying every possible set of Pairings. */
const EXHAUSTIVE_SIZE = 14

/**
 * Pairs one round of a Round-by-Round System.
 *
 * Never throws. Invalid input comes back as `ok: false` with every problem found.
 */
export function pairRound(input: RoundInput): RoundResult {
  try {
    const parsed = parseRoundInput(input)
    if (!parsed.ok) return parsed

    const { configuration, round, workLimit } = parsed.input
    const field = buildField(parsed.input)
    const levels = levelsOf(configuration, field)
    const best =
      field.size <= EXHAUSTIVE_SIZE
        ? solveExhaustive(field.size, levels, workLimit ?? Number.POSITIVE_INFINITY)
        : undefined

    return describeResult(
      field,
      configuration,
      best ?? pairInScoreOrder(field),
      round,
      best !== undefined,
    )
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          code: 'internal-error',
          message: `The engine failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
          entrants: [],
        },
      ],
    }
  }
}
