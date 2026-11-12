import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import { levelsOf } from '../src/cost.ts'
import { buildField } from '../src/field.ts'
import type { Constraint, RoundInput } from '../src/index.ts'
import { solveMatching, type MatchingGraph } from '../src/matching/blossom.ts'
import { findImprovers, findImproversSlowly } from '../src/matching/improvers.ts'
import { round } from './support/arbitraries.ts'

/**
 * Solves a round on a deliberately poor graph, then asks both ways which left-out Pairings
 * could improve the result. Undefined when that graph cannot pair everyone.
 */
function improversBothWays(
  input: RoundInput,
  reach: number,
): { fast: Set<number>; plain: Set<number> } | undefined {
  const field = buildField(input)
  const levels = levelsOf(input.configuration, field)
  const n = field.size
  const N = n % 2 === 1 ? n + 1 : n
  const K = levels.length

  // Each Entrant joined to the next few by number, plus every Bye.
  const ends: [number, number][] = []
  for (let a = 0; a < n; a++)
    for (let step = 1; step <= reach; step++) if (a + step < n) ends.push([a, a + step])
  for (let a = 0; a < n && N > n; a++) ends.push([a, n])
  const graph: MatchingGraph = {
    size: N,
    levels: K,
    from: Int32Array.from(ends.map(([a]) => a)),
    to: Int32Array.from(ends.map(([, b]) => b)),
    weight: Float64Array.from(
      ends.flatMap(([a, b]) => levels.map((level) => -(b === n ? level.bye(a) : level.pair(a, b)))),
    ),
  }
  // A limit, so a fault that loops for ever fails here instead of hanging.
  const solution = solveMatching(graph, 1_000_000)
  if (solution?.perfect !== true) return undefined
  return {
    fast: new Set(findImprovers(field, levels, solution, N, Number.POSITIVE_INFINITY)),
    plain: new Set(findImproversSlowly(field, levels, solution, N, Number.POSITIVE_INFINITY)),
  }
}

describe('finding the Pairings that could improve a result', () => {
  test('the fast way names exactly the same Pairings as looking at every pair', () => {
    let compared = 0
    let withImprovers = 0
    fc.assert(
      fc.property(
        round({ minEntrants: 6, maxEntrants: 60 }),
        fc.integer({ min: 1, max: 3 }),
        (input, reach) => {
          const both = improversBothWays(input, reach)
          fc.pre(both !== undefined)
          expect(both?.fast).toEqual(both?.plain)
          compared++
          if ((both?.plain.size ?? 0) > 0) withImprovers++
        },
      ),
      { numRuns: 1500 },
    )
    // The comparison only means something if there was often something to find.
    expect(withImprovers).toBeGreaterThan(compared / 4)
  })

  test('a label made of an unusual character is still a label, not the lack of one', () => {
    // Half the labelled Entrants carry a label that is a single control character, half an
    // ordinary one, and some carry none.
    const prefer: Constraint = { type: 'prefer-same-group-label', kind: 'club' }
    let compared = 0
    fc.assert(
      fc.property(
        round({ minEntrants: 8, maxEntrants: 40 }),
        fc.integer({ min: 1, max: 3 }),
        (base, reach) => {
          const input: RoundInput = {
            ...base,
            entrants: base.entrants.map(({ groups, ...entrant }, at) =>
              groups === undefined
                ? entrant
                : { ...entrant, groups: { club: at % 2 === 0 ? '\u0001' : 'plain' } },
            ),
            configuration: [
              prefer,
              ...base.configuration.filter((each) => each.type !== prefer.type),
            ],
          }
          const both = improversBothWays(input, reach)
          fc.pre(both !== undefined)
          expect(both?.fast).toEqual(both?.plain)
          compared++
        },
      ),
      { numRuns: 1500 },
    )
    expect(compared).toBeGreaterThan(500)
  })

  test('the same with many small pods, where sharing one is preferred', () => {
    // Pods of two to five: far more of them than the fast way gives a bucket each. Some
    // Entrants are in no pod. Sharing a pod comes first, so it decides most Pairings.
    const preferPod: Constraint = { type: 'prefer-same-group-label', kind: 'club' }
    let compared = 0
    let withImprovers = 0
    fc.assert(
      fc.property(
        round({ minEntrants: 12, maxEntrants: 60 }),
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 1, max: 3 }),
        (base, podSize, reach) => {
          const input: RoundInput = {
            ...base,
            entrants: base.entrants.map(({ groups, ...entrant }, at) =>
              groups === undefined
                ? entrant
                : { ...entrant, groups: { club: `pod${Math.floor(at / podSize)}` } },
            ),
            configuration: [
              preferPod,
              ...base.configuration.filter((each) => each.type !== preferPod.type),
            ],
          }
          const both = improversBothWays(input, reach)
          fc.pre(both !== undefined)
          expect(both?.fast).toEqual(both?.plain)
          compared++
          if ((both?.plain.size ?? 0) > 0) withImprovers++
        },
      ),
      { numRuns: 1500 },
    )
    expect(withImprovers).toBeGreaterThan(compared / 4)
  })
})
