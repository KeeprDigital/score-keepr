import type { MatchingSolution } from './blossom.ts'

/**
 * The blossoms of a solution, laid out so that questions about two vertices are lookups
 * instead of walks. Blossoms can nest thousands deep, and a walk per question is too slow.
 */
export type BlossomForest = {
  /** For each node, the outermost blossom above it, or -1 when it is in none. */
  topOf: Int32Array
  /**
   * For each node, the lowest blossom above it whose dual is not zero on some level above
   * `window`, or failing that the outermost blossom, or -1. Blossoms below an anchor only carry
   * duals from the window level down, and the first of those that is not zero is above zero.
   */
  anchor: Int32Array
  /** For each blossom, its own dual plus that of every blossom above it, level by level. */
  sumFromTop: Float64Array
  /** The lowest blossom that holds both nodes. Both must be under the same outermost blossom. */
  lowestShared: (x: number, y: number) => number
}

/**
 * Lays the forest out with one walk over it (an Euler tour), then a table that answers "which
 * is the shallowest node between these two points of the walk" in constant time.
 */
export function layOutBlossoms(
  solution: MatchingSolution,
  N: number,
  K: number,
  window: number,
): BlossomForest {
  const { dual, blossomparent, blossomchilds, blossombase } = solution
  const total = 2 * N
  const first = new Int32Array(total).fill(-1)
  const sumFromTop = new Float64Array(total * K)
  const anchor = new Int32Array(total).fill(-1)
  const topOf = new Int32Array(total).fill(-1)
  const tour: number[] = []
  const depth: number[] = []
  const carriesUpper = (b: number): boolean => {
    for (let c = 0; c < window; c++) if (dual[b * K + c] !== 0) return true
    return false
  }

  for (let top = N; top < total; top++) {
    if (blossombase[top]! < 0 || blossomparent[top] !== -1) continue
    for (let c = 0; c < K; c++) sumFromTop[top * K + c] = dual[top * K + c]!
    anchor[top] = top
    topOf[top] = top
    const nodes = [top]
    const next = [0]
    first[top] = tour.length
    tour.push(top)
    depth.push(0)
    while (nodes.length > 0) {
      const at = nodes.length - 1
      const x = nodes[at]!
      const childs = blossomchilds[x]!
      const i = next[at]!
      if (i === childs.length) {
        nodes.pop()
        next.pop()
        if (nodes.length > 0) {
          tour.push(nodes.at(-1)!)
          depth.push(nodes.length - 1)
        }
        continue
      }
      next[at] = i + 1
      const y = childs[i]!
      first[y] = tour.length
      tour.push(y)
      depth.push(nodes.length)
      topOf[y] = top
      if (y >= N) {
        for (let c = 0; c < K; c++)
          sumFromTop[y * K + c] = sumFromTop[x * K + c]! + dual[y * K + c]!
        anchor[y] = carriesUpper(y) ? y : anchor[x]!
        nodes.push(y)
        next.push(0)
      } else {
        anchor[y] = anchor[x]!
        tour.push(x)
        depth.push(nodes.length - 1)
      }
    }
  }

  const tourLength = tour.length
  const shallowest: Int32Array[] = [new Int32Array(tourLength)]
  for (let i = 0; i < tourLength; i++) shallowest[0]![i] = i
  for (let j = 1; 1 << j <= tourLength; j++) {
    const previous = shallowest[j - 1]!
    const half = 1 << (j - 1)
    const current = new Int32Array(tourLength - (1 << j) + 1)
    for (let i = 0; i < current.length; i++) {
      const x = previous[i]!
      const y = previous[i + half]!
      current[i] = depth[x]! <= depth[y]! ? x : y
    }
    shallowest.push(current)
  }

  const lowestShared = (x: number, y: number): number => {
    let left = first[x]!
    let right = first[y]!
    if (left > right) {
      const swap = left
      left = right
      right = swap
    }
    const j = 31 - Math.clz32(right - left + 1)
    const p = shallowest[j]![left]!
    const q = shallowest[j]![right - (1 << j) + 1]!
    return tour[depth[p]! <= depth[q]! ? p : q]!
  }

  return { topOf, anchor, sumFromTop, lowestShared }
}
