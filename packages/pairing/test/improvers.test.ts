import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import { levelsOf } from '../src/cost.ts'
import { buildField } from '../src/field.ts'
import { solveMatching, type MatchingGraph } from '../src/matching/blossom.ts'
import { findImprovers, findImproversSlowly } from '../src/matching/improvers.ts'
import { round } from './support/arbitraries.ts'

describe('finding the Pairings that could improve a result', () => {
  test('the fast way names exactly the same Pairings as looking at every pair', () => {
    let compared = 0
    let withImprovers = 0
    fc.assert(
      fc.property(
        round({ minEntrants: 6, maxEntrants: 60 }),
        fc.integer({ min: 1, max: 3 }),
        (input, reach) => {
          const field = buildField(input)
          const levels = levelsOf(input.configuration, field)
          const n = field.size
          const N = n % 2 === 1 ? n + 1 : n
          const K = levels.length

          // A deliberately poor graph: each Entrant joined to the next few by number, plus every Bye.
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
              ends.flatMap(([a, b]) =>
                levels.map((level) => -(b === n ? level.bye(a) : level.pair(a, b))),
              ),
            ),
          }
          const solution = solveMatching(graph)
          fc.pre(solution?.perfect === true)
          const proof = solution as NonNullable<typeof solution>

          const fast = new Set(findImprovers(field, levels, proof, N, Number.POSITIVE_INFINITY))
          const plain = new Set(
            findImproversSlowly(field, levels, proof, N, Number.POSITIVE_INFINITY),
          )
          expect(fast).toEqual(plain)
          compared++
          if (plain.size > 0) withImprovers++
        },
      ),
      { numRuns: 1500 },
    )
    // The comparison only means something if there was often something to find.
    expect(withImprovers).toBeGreaterThan(compared / 4)
  })
})
