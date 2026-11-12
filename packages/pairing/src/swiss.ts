import type { Constraint, RoundInput, RoundResult } from '@score-keepr/shared'

import { levelsOf, type Level } from './cost.ts'
import { solveExhaustive, type Mates } from './exhaustive.ts'
import { pairInScoreOrder } from './fallback.ts'
import { buildField, type Field } from './field.ts'
import { solveByMatching } from './matching/solve.ts'
import { describeResult } from './result.ts'
import { parseRoundInput } from './validate.ts'

/**
 * Fields up to this size are solved by trying every possible set of Pairings. Larger fields go
 * to the fast matcher, which is tested to agree with that search.
 */
const EXHAUSTIVE_SIZE = 8

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
  const levels = levelsOf(configuration, field)
  const best =
    field.size <= EXHAUSTIVE_SIZE
      ? solveExhaustive(field.size, levels, workLimit ?? Number.POSITIVE_INFINITY)
      : matchOrUndefined(field, levels, workLimit)
  return { mates: best ?? pairInScoreOrder(field), proven: best !== undefined }
}

/** The fast matcher, with any failure inside it turned into "not proven" rather than an error. */
function matchOrUndefined(
  field: Field,
  levels: readonly Level[],
  workLimit: number | undefined,
): Mates | undefined {
  try {
    return solveByMatching(field, levels, workLimit === undefined ? {} : { maxSteps: workLimit })
  } catch {
    return undefined
  }
}
