import type { MatchingGraph, MatchingSolution } from './blossom.ts'
import { layOutBlossoms } from './forest.ts'

/** Duals finer than a quarter, or this large, could make a sum inexact. Neither should occur. */
const FINEST = 4
const LARGEST: number = 2 ** 47

/**
 * Checks the proof that comes with a perfect matching, on the graph it was solved on. Returns
 * undefined when the proof holds, otherwise a sentence saying what is wrong.
 *
 * The proof holds when: every number is exact; no edge could be improved on; every matched edge
 * is exactly tight; and every blossom that carries weight is as full as it can be.
 */
export function verifyMatching(
  graph: MatchingGraph,
  solution: MatchingSolution,
): string | undefined {
  const N = graph.size
  const K = graph.levels
  const { dual, mate, endpoint, inblossom, blossombase, blossomendps } = solution
  const signOf = (row: ArrayLike<number>, from: number): number => {
    for (let c = 0; c < K; c++) {
      const value = row[from + c]!
      if (value < 0) return -1
      if (value > 0) return 1
    }
    return 0
  }

  for (let i = 0; i < dual.length; i++) {
    const value = dual[i]!
    if (!Number.isInteger(value * FINEST) || Math.abs(value) >= LARGEST)
      return `dual ${i} is not exact: ${value}`
  }
  for (let i = 0; i < graph.weight.length; i++) {
    const value = graph.weight[i]!
    if (!Number.isInteger(value) || Math.abs(value) >= LARGEST)
      return `weight ${i} is not exact: ${value}`
  }
  for (let v = 0; v < N; v++) if (mate[v] === -1) return `vertex ${v} is unmatched`
  for (let b = N; b < 2 * N; b++) {
    if (blossombase[b]! >= 0 && signOf(dual, b * K) < 0) return `blossom ${b} has a negative dual`
  }

  const forest = layOutBlossoms(solution, N, K, 0)
  const slack = new Float64Array(K)
  for (let k = 0; k < graph.from.length; k++) {
    const i = graph.from[k]!
    const j = graph.to[k]!
    for (let c = 0; c < K; c++)
      slack[c] = dual[i * K + c]! + dual[j * K + c]! - 2 * graph.weight[k * K + c]!
    if (inblossom[i] === inblossom[j]) {
      // Both ends sit in the same outermost blossom: every blossom holding both counts too.
      const shared = forest.lowestShared(i, j)
      for (let c = 0; c < K; c++) slack[c]! += 2 * forest.sumFromTop[shared * K + c]!
    }
    const sign = signOf(slack, 0)
    if (sign < 0) return `edge ${k} (${i}, ${j}) could be improved on`
    if (mate[i]! >> 1 === k && mate[j]! >> 1 === k && sign !== 0)
      return `matched edge ${k} is not tight`
  }

  for (let b = N; b < 2 * N; b++) {
    if (blossombase[b]! >= 0 && signOf(dual, b * K) > 0) {
      const endps = blossomendps[b]!
      if (endps.length % 2 !== 1) return `blossom ${b} is an even cycle`
      for (let q = 1; q < endps.length; q += 2) {
        const p = endps[q]!
        if (mate[endpoint[p]!] !== (p ^ 1) || mate[endpoint[p ^ 1]!] !== p)
          return `blossom ${b} is not full`
      }
    }
  }
  return undefined
}

/**
 * Adds, to a slack row, twice the dual of every blossom that holds both vertices, by walking up
 * from each. Plain and slow: the definition that the laid-out forest must agree with.
 */
export function addSharedBlossoms(
  slack: Float64Array,
  i: number,
  j: number,
  solution: MatchingSolution,
  levels: number,
): void {
  const { blossomparent, dual } = solution
  const above: number[] = []
  const alsoAbove: number[] = []
  for (let t = blossomparent[i]!; t !== -1; t = blossomparent[t]!) above.push(t)
  for (let t = blossomparent[j]!; t !== -1; t = blossomparent[t]!) alsoAbove.push(t)
  while (above.length > 0 && alsoAbove.length > 0 && above.at(-1) === alsoAbove.at(-1)) {
    const b = above.pop()!
    alsoAbove.pop()
    for (let c = 0; c < levels; c++) slack[c]! += 2 * dual[b * levels + c]!
  }
}
