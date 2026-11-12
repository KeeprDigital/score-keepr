import type {
  CheckInput,
  CheckResult,
  Comparison,
  InputError,
  Pairing,
  Violation,
} from '@score-keepr/shared'
import { compareCodeUnits } from '@score-keepr/shared'

import { breaksOf, constraintLevels } from './cost.ts'
import { buildField } from './field.ts'
import { solveField } from './swiss.ts'
import { compareErrors, parseRoundInput } from './validate.ts'
import { ENGINE_VERSION } from './version.ts'

/**
 * Looks at Pairings made by hand and says what is wrong with them. It never refuses and never
 * changes anything: a half-finished set is described, not rejected.
 *
 * Never throws. Only an invalid round, or Pairings that are not lists of ids, are errors.
 */
export function checkPairings(input: CheckInput): CheckResult {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return failure([
        { code: 'invalid-input', message: 'The input must be an object.', entrants: [] },
      ])
    }
    const { pairings, byes, compare, ...round } = input as Record<string, unknown>
    const errors: InputError[] = []
    const wrong = (message: string): void => {
      errors.push({ code: 'invalid-input', message, entrants: [] })
    }
    const isText = (value: unknown): value is string => typeof value === 'string'

    if (
      !Array.isArray(pairings) ||
      !pairings.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every(isText))
    ) {
      wrong('`pairings` must be a list of pairs of ids.')
    }
    if (!Array.isArray(byes) || !byes.every(isText)) wrong('`byes` must be a list of ids.')
    if (compare !== undefined && typeof compare !== 'boolean')
      wrong('`compare` must be true or false.')

    const parsed = parseRoundInput(round)
    if (!parsed.ok) errors.push(...parsed.errors)
    if (!parsed.ok || errors.length > 0) return failure(errors)

    const { configuration, workLimit } = parsed.input
    const field = buildField(parsed.input)
    const numberOf = new Map(field.id.map((id, at) => [id, at]))
    const givenPairs = pairings as [string, string][]
    const givenByes = byes as string[]

    // Who appears, and how often.
    const appearances = new Map<string, number>()
    for (const id of [...givenPairs.flat(), ...givenByes])
      appearances.set(id, (appearances.get(id) ?? 0) + 1)
    const sorted = (ids: string[]): string[] => ids.sort(compareCodeUnits)
    const coverage = {
      missing: sorted(field.id.filter((id) => !appearances.has(id))),
      repeated: sorted(field.id.filter((id) => (appearances.get(id) ?? 0) > 1)),
      unknown: sorted([...appearances.keys()].filter((id) => !numberOf.has(id))),
      byesExpected: field.size % 2,
    }

    // The Pairings and Byes that name Entrants who are present, higher Score first.
    const pairs: [number, number][] = []
    for (const [first, second] of givenPairs) {
      const a = numberOf.get(first)
      const b = numberOf.get(second)
      if (a === undefined || b === undefined) continue
      pairs.push((field.score[a] as number) >= (field.score[b] as number) ? [a, b] : [b, a])
    }
    const byeNumbers = givenByes.flatMap((id) => numberOf.get(id) ?? [])

    const described: Pairing[] = pairs.map(([a, b]) => ({
      entrants: [field.id[a] as string, field.id[b] as string],
      scoreGap: (field.score[a] as number) - (field.score[b] as number),
    }))

    const violations: Violation[] = []
    for (const constraint of configuration) {
      const breaks = breaksOf(constraint, field)
      if (breaks === undefined) continue
      for (const [a, b] of pairs) {
        if (breaks.pair(a, b))
          violations.push({ constraint, entrants: [field.id[a] as string, field.id[b] as string] })
      }
      for (const a of byeNumbers) {
        if (breaks.bye(a)) violations.push({ constraint, entrants: [field.id[a] as string] })
      }
    }

    const complete =
      coverage.missing.length === 0 &&
      coverage.repeated.length === 0 &&
      coverage.unknown.length === 0 &&
      givenByes.length === coverage.byesExpected

    let comparison: Comparison | undefined
    if (compare === true && complete) {
      const { mates, proven } = solveField(field, configuration, workLimit)
      const bestPairs: [number, number][] = []
      const bestByes: number[] = []
      for (const [a, b] of mates.entries()) {
        if (b === -1) bestByes.push(a)
        else if (a < b) bestPairs.push([a, b])
      }
      let asGoodAsBest = true
      const levels = constraintLevels(configuration, field).map(({ constraint, part, level }) => {
        const total = (somePairs: [number, number][], someByes: number[]): bigint =>
          somePairs.reduce((sum, [a, b]) => sum + BigInt(level.pair(a, b)), 0n) +
          someByes.reduce((sum, a) => sum + BigInt(level.bye(a)), 0n)
        const given = total(pairs, byeNumbers)
        const best = total(bestPairs, bestByes)
        if (given !== best) asGoodAsBest = false
        return {
          constraint,
          ...(part === undefined ? {} : { part }),
          given: Number(given),
          best: Number(best),
        }
      })
      comparison = { asGoodAsBest, provenBest: proven, levels }
    }

    return {
      ok: true,
      coverage,
      pairings: described,
      violations,
      ...(comparison === undefined ? {} : { comparison }),
      engineVersion: ENGINE_VERSION,
    }
  } catch (error) {
    return failure([
      {
        code: 'internal-error',
        message: `The engine failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
        entrants: [],
      },
    ])
  }
}

const failure = (errors: InputError[]): CheckResult => ({
  ok: false,
  errors: errors.sort(compareErrors),
})
