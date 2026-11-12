import fc from 'fast-check'

import type { Constraint, PairingEntrant, RoundInput } from '../../src/index.ts'

const NAMES = ['ann', 'ben', 'cal', 'dee', 'eve', 'fay', 'gus', 'hal', 'ida']
const CLUBS = ['red', 'blue', 'green']
const PICKS = ['highest', 'lowest', 'random'] as const

const YES_OR_NO: fc.Arbitrary<Constraint>[] = [
  fc.constant({ type: 'no-rematch' }),
  fc.record({ type: fc.constant('bye-cap' as const), max: fc.integer({ min: 1, max: 2 }) }),
  fc.constant({ type: 'avoid-same-group-label', kind: 'club' }),
  fc.constant({ type: 'avoid-listed-pairs' }),
]
const MEASURED: fc.Arbitrary<Constraint>[] = [
  fc.constant({ type: 'prefer-same-group-label', kind: 'club' }),
  fc.constant({ type: 'bye-to-lowest-score' }),
  fc.constant({ type: 'pair-close-in-score' }),
  fc.constant({ type: 'keep-top-clean' }),
  fc.constant({ type: 'keep-bottom-clean' }),
]
const RANKED: fc.Arbitrary<Constraint>[] = [
  fc.constant({ type: 'bye-to-lowest-rank' }),
  fc.constant({ type: 'pair-adjacent-by-rank' }),
  fc.constant({ type: 'pair-top-vs-bottom-by-rank' }),
  fc.record({
    type: fc.constant('pair-down-choice' as const),
    from: fc.constantFrom(...PICKS),
    opponent: fc.constantFrom(...PICKS),
  }),
]

const key = (constraint: Constraint): string => constraint.type

/** A Configuration: any Constraints, at most one of each, in any order. */
export function configuration(ranked: boolean): fc.Arbitrary<Constraint[]> {
  const pool = ranked ? [...YES_OR_NO, ...MEASURED, ...RANKED] : [...YES_OR_NO, ...MEASURED]
  return fc.uniqueArray(fc.oneof(...pool), { selector: key, maxLength: 6 })
}

export type RoundOptions = {
  minEntrants?: number
  maxEntrants?: number
  /** Give this Configuration instead of a random one. */
  configuration?: Constraint[]
  /** `true` for a Rank on every Entrant, `false` for none, left out for either. */
  ranked?: boolean
  /** Make every Rank different. */
  distinctRanks?: boolean
}

/**
 * A valid Swiss round: a handful of Entrants with random Scores, Byes, clubs, a random but
 * consistent history, and random pairs to avoid.
 */
export function round(options: RoundOptions = {}): fc.Arbitrary<RoundInput> {
  const { minEntrants = 0, maxEntrants = 8 } = options
  return fc
    .record({
      size: fc.integer({ min: minEntrants, max: maxEntrants }),
      ranked: options.ranked === undefined ? fc.boolean() : fc.constant(options.ranked),
      seed: fc.string({ maxLength: 4 }),
      round: fc.integer({ min: 1, max: 9 }),
    })
    .chain(({ size, ranked, seed, round: roundNumber }) => {
      const ids =
        size <= NAMES.length
          ? NAMES.slice(0, size)
          : Array.from({ length: size }, (_, at) => `e${String(at).padStart(3, '0')}`)
      const pairs = ids.flatMap((a, at) => ids.slice(at + 1).map((b): [string, string] => [a, b]))
      return fc.record({
        system: fc.constant('swiss' as const),
        entrants: fc
          .record({
            facts: fc.array(
              fc.record({
                score: fc.constantFrom(0, 1, 3, 4, 6, 9),
                byes: fc.integer({ min: 0, max: 2 }),
                club: fc.option(fc.constantFrom(...CLUBS), { nil: undefined }),
                rank: fc.integer({ min: 1, max: options.distinctRanks ? 1000 : 5 }),
                absentOpponent: fc.boolean(),
              }),
              { minLength: size, maxLength: size },
            ),
            met: fc.subarray(pairs),
          })
          .map(({ facts, met }) => {
            const ranks = options.distinctRanks
              ? distinct(facts.map((fact) => fact.rank))
              : facts.map((fact) => fact.rank)
            return ids.map((id, at): PairingEntrant => {
              const fact = facts[at] as (typeof facts)[number]
              const entrant: PairingEntrant = {
                id,
                score: fact.score,
                byes: fact.byes,
                opponents: [
                  ...met.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : [])),
                  ...(fact.absentOpponent ? ['zed'] : []),
                ],
              }
              if (ranked) entrant.rank = ranks[at] as number
              if (fact.club !== undefined) entrant.groups = { club: fact.club }
              return entrant
            })
          }),
        configuration: options.configuration
          ? fc.constant(options.configuration)
          : configuration(ranked),
        randomSeed: fc.constant(seed),
        round: fc.constant(roundNumber),
        avoidPairs: fc.subarray(pairs, { maxLength: Math.min(4, pairs.length) }),
      })
    })
}

/** Nudges repeated numbers upward until all differ, keeping their order. */
function distinct(values: number[]): number[] {
  const seen = new Set<number>()
  return values.map((value) => {
    let next = value
    while (seen.has(next)) next++
    seen.add(next)
    return next
  })
}

/** The same round with every list in a different order and every pair turned round. */
export function reordered(input: RoundInput): fc.Arbitrary<RoundInput> {
  const shuffle = <T>(items: readonly T[]): fc.Arbitrary<T[]> =>
    fc.shuffledSubarray([...items], { minLength: items.length })
  return fc
    .record({
      entrants: shuffle(input.entrants),
      opponents: fc.tuple(...input.entrants.map((entrant) => shuffle(entrant.opponents))),
      avoidPairs: shuffle(input.avoidPairs ?? []),
      turned: fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
    })
    .map(({ entrants, opponents, avoidPairs, turned }) => {
      const order = new Map(input.entrants.map((entrant, at) => [entrant.id, at]))
      return {
        ...input,
        entrants: entrants.map((entrant) => ({
          ...entrant,
          opponents: opponents[order.get(entrant.id) as number] as string[],
        })),
        avoidPairs: avoidPairs.map(([a, b], at): [string, string] =>
          turned[at] ? [b, a] : [a, b],
        ),
      }
    })
}
