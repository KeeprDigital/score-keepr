import { pairRound, type InputError, type RoundInput, type RoundSuccess } from '../../src/index.ts'

/** Pairs a round that is expected to be valid, and fails loudly if it is not. */
export function mustPair(input: RoundInput): RoundSuccess {
  const result = pairRound(input)
  if (!result.ok) throw new Error(`Expected Pairings, got errors: ${JSON.stringify(result.errors)}`)
  return result
}

/** Runs a round that is expected to be invalid, and returns its errors. */
export function mustFail(input: RoundInput): InputError[] {
  const result = pairRound(input)
  if (result.ok) throw new Error('Expected errors, got Pairings')
  return result.errors
}
