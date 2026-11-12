import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import { solveMatching, type MatchingGraph } from '../src/matching/blossom.ts'
import { layOutBlossoms } from '../src/matching/forest.ts'
import { addSharedBlossoms, verifyMatching } from '../src/matching/verify.ts'

type Edge = { a: number; b: number; weight: number[] }

function graphOf(size: number, levels: number, edges: Edge[]): MatchingGraph {
  return {
    size,
    levels,
    from: Int32Array.from(edges.map((edge) => edge.a)),
    to: Int32Array.from(edges.map((edge) => edge.b)),
    weight: Float64Array.from(edges.flatMap((edge) => edge.weight)),
  }
}

const compare = (a: readonly number[], b: readonly number[]): number => {
  for (let at = 0; at < a.length; at++) {
    if (a[at] !== b[at]) return (a[at] as number) - (b[at] as number)
  }
  return 0
}

/** The best total weight of any perfect matching, found by trying them all. */
function bestByBruteForce(size: number, levels: number, edges: Edge[]): number[] | undefined {
  const weightOf = new Map(
    edges.map((edge) => [`${Math.min(edge.a, edge.b)}-${Math.max(edge.a, edge.b)}`, edge.weight]),
  )
  let best: number[] | undefined
  const search = (free: number[], total: number[]): void => {
    if (free.length === 0) {
      if (best === undefined || compare(total, best) > 0) best = total
      return
    }
    const [first, ...rest] = free as [number, ...number[]]
    for (const partner of rest) {
      const weight = weightOf.get(`${first}-${partner}`)
      if (weight === undefined) continue
      search(
        rest.filter((v) => v !== partner),
        total.map((value, at) => value + (weight[at] as number)),
      )
    }
  }
  search(
    Array.from({ length: size }, (_, v) => v),
    Array.from({ length: levels }, () => 0),
  )
  return best
}

/** A random graph on an even number of vertices, with small whole-number weights so ties are common. */
const anyGraph = fc
  .record({
    half: fc.integer({ min: 1, max: 6 }),
    levels: fc.integer({ min: 1, max: 3 }),
    density: fc.double({ min: 0.3, max: 1, noNaN: true }),
  })
  .chain(({ half, levels, density }) => {
    const size = half * 2
    const pairs = Array.from({ length: size }, (_, a) =>
      Array.from({ length: size - a - 1 }, (_, k) => [a, a + 1 + k] as const),
    ).flat()
    return fc
      .tuple(
        ...pairs.map(([a, b]) =>
          fc
            .record({
              keep: fc.double({ min: 0, max: 1, noNaN: true }).map((roll) => roll < density),
              weight: fc.array(fc.integer({ min: -4, max: 0 }), {
                minLength: levels,
                maxLength: levels,
              }),
            })
            .map(({ keep, weight }) => (keep ? [{ a, b, weight }] : [])),
        ),
      )
      .map((chosen) => ({ size, levels, edges: chosen.flat() }))
  })

describe('solveMatching', () => {
  test('pairs two vertices joined by one edge', () => {
    const solution = solveMatching(graphOf(2, 1, [{ a: 0, b: 1, weight: [-5] }]))
    expect(solution?.perfect).toBe(true)
    expect([...(solution?.partner ?? [])]).toEqual([1, 0])
  })

  test('prefers the heavier matching, comparing levels in order', () => {
    // A square. Opposite sides are the two perfect matchings. The first level ties, the second decides.
    const edges = [
      { a: 0, b: 1, weight: [-1, -9] },
      { a: 2, b: 3, weight: [-1, -9] },
      { a: 1, b: 2, weight: [-1, -1] },
      { a: 3, b: 0, weight: [-1, -1] },
    ]
    const solution = solveMatching(graphOf(4, 2, edges))
    expect([...(solution?.partner ?? [])]).toEqual([3, 2, 1, 0])
  })

  test('needs a blossom: a triangle with a tail on each corner', () => {
    const edges = [
      { a: 0, b: 1, weight: [0] },
      { a: 1, b: 2, weight: [0] },
      { a: 2, b: 0, weight: [0] },
      { a: 0, b: 3, weight: [-1] },
      { a: 1, b: 4, weight: [-2] },
      { a: 2, b: 5, weight: [-3] },
    ]
    const solution = solveMatching(graphOf(6, 1, edges))
    expect(solution?.perfect).toBe(true)
    expect([...(solution?.partner ?? [])]).toEqual([3, 4, 5, 0, 1, 2])
  })

  test('says so when no perfect matching exists', () => {
    // A star: the centre can only be matched once.
    const edges = [1, 2, 3].map((leaf) => ({ a: 0, b: leaf, weight: [0] }))
    expect(solveMatching(graphOf(4, 1, edges))?.perfect).toBe(false)
    expect(solveMatching(graphOf(2, 1, []))?.perfect).toBe(false)
  })

  test('gives up when it would take more steps than allowed', () => {
    const edges = [
      { a: 0, b: 1, weight: [0] },
      { a: 2, b: 3, weight: [0] },
      { a: 1, b: 2, weight: [-1] },
    ]
    expect(solveMatching(graphOf(4, 1, edges), 0)).toBeUndefined()
  })

  test('given less work than it needs, it stops and says so; given enough, the answer is the same', () => {
    fc.assert(
      fc.property(
        anyGraph,
        fc.integer({ min: 0, max: 400 }),
        ({ size, levels, edges }, allowed) => {
          const graph = graphOf(size, levels, edges)
          const unlimited = solveMatching(graph)
          const limited = solveMatching(graph, allowed)
          // Either it ran out, or it finished and agrees exactly with the unlimited run.
          expect(limited === undefined || limited.steps <= allowed).toBe(true)
          expect(limited === undefined ? [] : [...limited.partner]).toEqual(
            limited === undefined ? [] : [...(unlimited?.partner ?? [])],
          )
          expect((unlimited?.steps ?? 0) > allowed).toBe(limited === undefined)
        },
      ),
      { numRuns: 2000 },
    )
  })

  test('finds a perfect matching exactly when one exists, and it is the heaviest', () => {
    fc.assert(
      fc.property(anyGraph, ({ size, levels, edges }) => {
        const solution = solveMatching(graphOf(size, levels, edges))
        const best = bestByBruteForce(size, levels, edges)
        expect(solution?.perfect).toBe(best !== undefined)
        fc.pre(best !== undefined && solution !== undefined)
        const weightOf = new Map(edges.map((edge) => [`${edge.a}-${edge.b}`, edge.weight]))
        const total = Array.from({ length: levels }, () => 0)
        for (let v = 0; v < size; v++) {
          const partner = solution?.partner[v] as number
          expect(solution?.partner[partner]).toBe(v)
          if (v < partner)
            for (const [at, value] of (weightOf.get(`${v}-${partner}`) as number[]).entries())
              total[at] = (total[at] as number) + value
        }
        expect(total).toEqual(best)
      }),
      { numRuns: 3000 },
    )
  })

  test('every answer comes with a proof that checks out', () => {
    fc.assert(
      fc.property(anyGraph, ({ size, levels, edges }) => {
        const graph = graphOf(size, levels, edges)
        const solution = solveMatching(graph)
        fc.pre(solution?.perfect === true)
        expect(verifyMatching(graph, solution as NonNullable<typeof solution>)).toBeUndefined()
      }),
      { numRuns: 2000 },
    )
  })

  test('the laid-out blossoms give the same shared duals as walking up from each vertex', () => {
    let withBlossoms = 0
    fc.assert(
      fc.property(anyGraph, ({ size, levels, edges }) => {
        const solution = solveMatching(graphOf(size, levels, edges))
        fc.pre(solution?.perfect === true)
        const proof = solution as NonNullable<typeof solution>
        const forest = layOutBlossoms(proof, size, levels, 0)
        for (let a = 0; a < size; a++) {
          for (let b = a + 1; b < size; b++) {
            const walked = new Float64Array(levels)
            addSharedBlossoms(walked, a, b, proof, levels)
            const looked = new Float64Array(levels)
            if (proof.inblossom[a] === proof.inblossom[b]) {
              withBlossoms++
              const shared = forest.lowestShared(a, b)
              for (let c = 0; c < levels; c++)
                looked[c] = 2 * (forest.sumFromTop[shared * levels + c] as number)
            }
            expect([...looked]).toEqual([...walked])
          }
        }
      }),
      { numRuns: 2000 },
    )
    // The comparison only means something if blossoms actually formed.
    expect(withBlossoms).toBeGreaterThan(100)
  })

  test('a proof that has been tampered with does not check out', () => {
    const edges = [
      { a: 0, b: 1, weight: [-1] },
      { a: 2, b: 3, weight: [-1] },
      { a: 1, b: 2, weight: [0] },
      { a: 3, b: 0, weight: [-5] },
    ]
    const graph = graphOf(4, 1, edges)
    const solution = solveMatching(graph) as NonNullable<ReturnType<typeof solveMatching>>
    expect(verifyMatching(graph, solution)).toBeUndefined()
    solution.dual[0] = (solution.dual[0] as number) - 1
    expect(verifyMatching(graph, solution)).toMatch(/could be improved/)
  })

  type Solution = NonNullable<ReturnType<typeof solveMatching>>

  test.each<[string, (solution: Solution) => void, RegExp]>([
    [
      'a matched edge left slack',
      (solution) => (solution.dual[0] = (solution.dual[0] as number) + 2),
      /not tight/,
    ],
    [
      'a number that is not exact',
      (solution) => (solution.dual[0] = (solution.dual[0] as number) + 0.1),
      /not exact/,
    ],
    ['a number too large to add exactly', (solution) => (solution.dual[0] = 2 ** 50), /not exact/],
    ['a vertex left unmatched', (solution) => (solution.mate[0] = -1), /unmatched/],
  ])('a proof with %s does not check out', (_, tamper, reason) => {
    const graph = graphOf(4, 1, [
      { a: 0, b: 1, weight: [-1] },
      { a: 2, b: 3, weight: [-1] },
      { a: 1, b: 2, weight: [0] },
      { a: 3, b: 0, weight: [-5] },
    ])
    const solution = solveMatching(graph) as Solution
    tamper(solution)
    expect(verifyMatching(graph, solution)).toMatch(reason)
  })
})
