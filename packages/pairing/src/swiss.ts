import type { Constraint, RoundInput, RoundResult } from '@score-keepr/shared'

import { levelsOf } from './cost.ts'
import { solveExhaustive, type Mates } from './exhaustive.ts'
import { pairInScoreOrder } from './fallback.ts'
import { buildField, type Field } from './field.ts'
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
    const { mates, proven } = solveField(field, configuration, workLimit)
    return describeResult(field, configuration, mates, round, proven)
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

/**
 * The best set of Pairings for a Field, and whether it is proven best. When it cannot be
 * proven, a quick valid set comes back instead.
 */
export function solveField(
  field: Field,
  configuration: readonly Constraint[],
  workLimit: number | undefined,
): { mates: Mates; proven: boolean } {
  const best =
    field.size <= EXHAUSTIVE_SIZE
      ? solveExhaustive(
          field.size,
          levelsOf(configuration, field),
          workLimit ?? Number.POSITIVE_INFINITY,
        )
      : undefined
  return { mates: best ?? pairInScoreOrder(field), proven: best !== undefined }
}
