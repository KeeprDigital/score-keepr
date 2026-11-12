import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import { levelsOf, type Level } from '../src/cost.ts'
import { solveExhaustive, type Mates } from '../src/exhaustive.ts'
import { buildField } from '../src/field.ts'
import { solveByMatching, workCeiling } from '../src/matching/solve.ts'
import type { RoundInput } from '../src/index.ts'
import { round } from './support/arbitraries.ts'

/** What a set of Pairings scores on every level, added exactly. */
function costOf(levels: readonly Level[], mates: Mates): bigint[] {
  return levels.map((level) => {
    let total = 0n
    for (const [a, b] of mates.entries()) {
      if (b === -1) total += BigInt(level.bye(a))
      else if (a < b) total += BigInt(level.pair(a, b))
    }
    return total
  })
}

function prepare(input: RoundInput): { size: number; levels: Level[] } {
  const field = buildField(input)
  return { size: field.size, levels: levelsOf(input.configuration, field) }
}

describe('the fast matcher against the slow exact solver', () => {
  test('with every Pairing in the graph, it finds the same best cost', () => {
    fc.assert(
      fc.property(round({ maxEntrants: 10 }), (input) => {
        const field = buildField(input)
        const levels = levelsOf(input.configuration, field)
        const slow = solveExhaustive(field.size, levels, Number.POSITIVE_INFINITY) as Mates
        const fast = solveByMatching(field, levels) as Mates
        expect(fast).toBeDefined()
        expect(costOf(levels, fast)).toEqual(costOf(levels, slow))
      }),
      { numRuns: 1500 },
    )
  })

  test('with a sparse graph and the proof step, it still finds the same best cost', () => {
    fc.assert(
      fc.property(round({ maxEntrants: 11 }), (input) => {
        const field = buildField(input)
        const levels = levelsOf(input.configuration, field)
        const slow = solveExhaustive(field.size, levels, Number.POSITIVE_INFINITY) as Mates
        const fast = solveByMatching(field, levels, { completeUpTo: 0 }) as Mates
        expect(fast).toBeDefined()
        expect(costOf(levels, fast)).toEqual(costOf(levels, slow))
      }),
      { numRuns: 1500 },
    )
  })

  test('on medium fields, the sparse graph gives the same cost as the graph with everything in it', () => {
    fc.assert(
      fc.property(round({ minEntrants: 20, maxEntrants: 70 }), (input) => {
        const field = buildField(input)
        const levels = levelsOf(input.configuration, field)
        const everything = solveByMatching(field, levels, { completeUpTo: 1000 }) as Mates
        const sparse = solveByMatching(field, levels, { completeUpTo: 0 }) as Mates
        expect(everything).toBeDefined()
        expect(sparse).toBeDefined()
        expect(costOf(levels, sparse)).toEqual(costOf(levels, everything))
      }),
      { numRuns: 200 },
    )
  })

  test('starting from far too few Pairings, the proof step repairs the graph to the same best cost', () => {
    fc.assert(
      fc.property(round({ minEntrants: 6, maxEntrants: 12 }), (input) => {
        const field = buildField(input)
        const levels = levelsOf(input.configuration, field)
        const slow = solveExhaustive(field.size, levels, Number.POSITIVE_INFINITY) as Mates
        const fast = solveByMatching(field, levels, { completeUpTo: 0, neighbours: 1 }) as Mates
        expect(fast).toBeDefined()
        expect(costOf(levels, fast)).toEqual(costOf(levels, slow))
      }),
      { numRuns: 1500 },
    )
  })

  test('the same holds on medium fields', () => {
    fc.assert(
      fc.property(round({ minEntrants: 20, maxEntrants: 60 }), (input) => {
        const field = buildField(input)
        const levels = levelsOf(input.configuration, field)
        const everything = solveByMatching(field, levels, { completeUpTo: 1000 }) as Mates
        const thin = solveByMatching(field, levels, { completeUpTo: 0, neighbours: 1 }) as Mates
        expect(thin).toBeDefined()
        expect(costOf(levels, thin)).toEqual(costOf(levels, everything))
      }),
      { numRuns: 200 },
    )
  })

  test('the fast proof step and the plain one, which looks at every pair, agree', () => {
    fc.assert(
      fc.property(
        round({ minEntrants: 9, maxEntrants: 60 }),
        fc.constantFrom(1, 2, 6),
        (input, neighbours) => {
          const field = buildField(input)
          const levels = levelsOf(input.configuration, field)
          const fast = solveByMatching(field, levels, { completeUpTo: 0, neighbours }) as Mates
          const plain = solveByMatching(field, levels, {
            completeUpTo: 0,
            neighbours,
            plainProof: true,
          }) as Mates
          expect(fast).toBeDefined()
          expect(plain).toBeDefined()
          expect(costOf(levels, fast)).toEqual(costOf(levels, plain))
        },
      ),
      { numRuns: 400 },
    )
  })

  test('the built-in ceiling on work is fixed by the size of the field alone', () => {
    // 50,000 plus 2,000 for each Entrant times the number of binary digits in the count.
    expect(workCeiling(1)).toBe(50_000 + 2_000 * 1 * 1)
    expect(workCeiling(9)).toBe(50_000 + 2_000 * 9 * 4)
    expect(workCeiling(64)).toBe(50_000 + 2_000 * 64 * 7)
    expect(workCeiling(20_001)).toBe(50_000 + 2_000 * 20_001 * 15)
    expect(workCeiling(20_001)).toBe(600_080_000)
  })

  test('ordinary fields use a small fraction of the built-in ceiling', () => {
    fc.assert(
      fc.property(round({ minEntrants: 9, maxEntrants: 80 }), (input) => {
        const field = buildField(input)
        const usage = { steps: 0 }
        expect(
          solveByMatching(field, levelsOf(input.configuration, field), { usage }),
        ).toBeDefined()
        expect(usage.steps).toBeLessThan(workCeiling(field.size) / 10)
      }),
      { numRuns: 300 },
    )
  })

  test('pairing by Rank with an odd count and no Bye rule stays a small fraction of the ceiling', () => {
    // Every second Entrant is an equally good Bye as far as Rank goes, so Shuffle Positions pick
    // between thousands of candidates. The proof nests blossoms thousands deep, and the work
    // must not grow with the square of that depth.
    const size = 4001
    const input: RoundInput = {
      system: 'swiss',
      entrants: Array.from({ length: size }, (_, at) => ({
        id: `e${at}`,
        score: 0,
        opponents: [],
        byes: 0,
        rank: at + 1,
      })),
      configuration: [{ type: 'pair-adjacent-by-rank' }],
      randomSeed: 'deep',
      round: 1,
    }
    const field = buildField(input)
    const usage = { steps: 0 }
    expect(solveByMatching(field, levelsOf(input.configuration, field), { usage })).toBeDefined()
    expect(usage.steps).toBeLessThan(workCeiling(size) / 100)
  })

  test('with no limit given, the built-in ceiling applies', () => {
    fc.assert(
      fc.property(round({ minEntrants: 9, maxEntrants: 40 }), (input) => {
        const field = buildField(input)
        const levels = levelsOf(input.configuration, field)
        const usage = { steps: 0 }
        const byDefault = solveByMatching(field, levels, { usage })
        // Asking for exactly the ceiling is the same as asking for nothing.
        expect(solveByMatching(field, levels, { maxSteps: workCeiling(field.size) })).toEqual(
          byDefault,
        )
        // And one step fewer than was used is not enough.
        expect(solveByMatching(field, levels, { maxSteps: usage.steps - 1 })).toBeUndefined()
      }),
      { numRuns: 100 },
    )
  })

  test('stops and says so when the work allowed runs out', () => {
    fc.assert(
      fc.property(round({ minEntrants: 4, maxEntrants: 12 }), (input) => {
        const { size, levels } = prepare(input)
        fc.pre(size > 0)
        expect(solveByMatching(buildField(input), levels, { maxSteps: 0 })).toBeUndefined()
      }),
      { numRuns: 50 },
    )
  })
})
