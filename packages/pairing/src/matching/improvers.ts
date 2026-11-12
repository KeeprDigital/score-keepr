import type { Level } from '../cost.ts'
import type { Field } from '../field.ts'
import { addSharedBlossoms, type MatchingSolution } from './blossom.ts'

/**
 * Checks every possible Pairing against the matcher's proof and returns those that could improve
 * the result, as edge keys `a * N + b`. An empty list means the result is best over all Pairings.
 *
 * This is the plain version: it looks at every pair. It is the definition the fast version
 * below must agree with.
 */
export function findImproversSlowly(
  field: Field,
  levels: readonly Level[],
  solution: MatchingSolution,
  N: number,
  atMost: number,
): number[] {
  const n = field.size
  const K = levels.length
  const { dual, inblossom } = solution
  const improvers: number[] = []
  const slack = new Float64Array(K)

  for (let a = 0; a < n; a++) {
    const oa = a * K
    for (let b = a + 1; b < n; b++) {
      const ob = b * K
      let sign = 0
      for (let c = 0; c < K; c++) {
        const x = dual[oa + c]! + dual[ob + c]! + 2 * levels[c]!.pair(a, b)
        if (x > 0) {
          sign = 1
          break
        }
        if (x < 0) {
          sign = -1
          break
        }
      }
      if (sign >= 0) continue
      if (inblossom[a] === inblossom[b]) {
        // Inside a shared blossom the blossoms' own duals count too, and can only help.
        for (let c = 0; c < K; c++)
          slack[c] = dual[oa + c]! + dual[ob + c]! + 2 * levels[c]!.pair(a, b)
        addSharedBlossoms(slack, a, b, solution, K)
        if (signOf(slack, K) >= 0) continue
      }
      improvers.push(a * N + b)
      if (improvers.length >= atMost) return improvers
    }
  }
  return improvers
}

function signOf(row: Float64Array, width: number): number {
  for (let c = 0; c < width; c++) {
    if (row[c]! > 0) return 1
    if (row[c]! < 0) return -1
  }
  return 0
}

type Bucket = {
  /** The blossom this bucket's Entrants hang under, or -1. */
  anchor: number
  /** Dual on every level but the last, the same for every Entrant in the bucket. */
  upper: number[]
  /** The least dual on the last level among the Entrants. */
  leastLast: number
  /** Entrants in rising Shuffle Position. */
  members: number[]
}

/**
 * The same answer as `findImproversSlowly`, found without looking at every pair.
 *
 * A Pairing can only improve the result if its slack is negative. Slack is checked level by
 * level, and every level's cost is zero or more, so assuming a cost of zero can only make a
 * Pairing look better than it is. That gives a safe first test that needs no costs at all
 * except two kinds that are cheap to know exactly:
 *
 *   - levels that depend on the two Scores alone, which are the same for a whole pair of Score Groups;
 *   - the last level, Shuffle Positions, where the cost grows with the distance between positions.
 *
 * Entrants are put in buckets that share a Score and the same duals on every level but the
 * last. Against a whole bucket, the first test either clears everyone, or leaves only Entrants
 * within a window of Shuffle Positions. Whatever survives gets the exact check.
 */
export function findImprovers(
  field: Field,
  levels: readonly Level[],
  solution: MatchingSolution,
  N: number,
  atMost: number,
): number[] {
  const n = field.size
  const K = levels.length
  const last = K - 1
  const { dual, inblossom, blossomparent, blossomchilds, blossombase } = solution
  const total = 2 * N

  // ----- The blossom forest, laid out so the lowest shared blossom of two nodes is a lookup. -----
  // anchor[x]: the lowest blossom above x whose dual is non-zero on some level but the last, or
  // failing that the outermost blossom. Blossoms below an anchor only carry last-level duals,
  // which are zero or more.
  const first = new Int32Array(total).fill(-1)
  const sumFromTop = new Float64Array(total * K) // blossom duals added from the outermost down
  const anchor = new Int32Array(total).fill(-1)
  const topOf = new Int32Array(total).fill(-1)
  const tour: number[] = []
  const depth: number[] = []
  const carriesUpper = (b: number): boolean => {
    for (let c = 0; c < last; c++) if (dual[b * K + c] !== 0) return true
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
  /** The lowest blossom that holds both nodes. Both must be under the same outermost blossom. */
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

  const slack = new Float64Array(K)
  const improves = (a: number, b: number): boolean => {
    for (let c = 0; c < K; c++)
      slack[c] = dual[a * K + c]! + dual[b * K + c]! + 2 * levels[c]!.pair(a, b)
    if (inblossom[a] === inblossom[b]) {
      const shared = lowestShared(a, b)
      for (let c = 0; c < K; c++) slack[c]! += 2 * sumFromTop[shared * K + c]!
    }
    return signOf(slack, K) < 0
  }

  // ----- Score Groups, highest first, each in rising Shuffle Position. -----
  const order = Array.from({ length: n }, (_, a) => a).sort(
    (a, b) => field.score[b]! - field.score[a]! || a - b,
  )
  const groups: number[][] = []
  for (const a of order) {
    const current = groups.at(-1)
    if (current !== undefined && field.score[current[0]!] === field.score[a]) current.push(a)
    else groups.push([a])
  }

  // ----- Buckets within each Score Group. -----
  const buckets: Bucket[][] = groups.map((group) => {
    const byKey = new Map<string, Bucket>()
    for (const a of group) {
      const o = a * K
      let key = String(anchor[a])
      for (let c = 0; c < last; c++) key += `,${dual[o + c]}`
      let bucket = byKey.get(key)
      if (bucket === undefined) {
        bucket = {
          anchor: anchor[a]!,
          upper: Array.from(dual.subarray(o, o + last)),
          leastLast: Number.POSITIVE_INFINITY,
          members: [],
        }
        byKey.set(key, bucket)
      }
      bucket.members.push(a)
      if (dual[o + last]! < bucket.leastLast) bucket.leastLast = dual[o + last]!
    }
    return [...byKey.values()]
  })

  // The blossom duals that certainly apply to anything under two given anchors.
  const sharedCache = new Map<number, number>()
  const sharedUnder = (x: number, y: number): number => {
    if (x === -1 || y === -1 || topOf[x] !== topOf[y]) return -1
    const key = x < y ? x * total + y : y * total + x
    let shared = sharedCache.get(key)
    if (shared === undefined) {
      shared = lowestShared(x, y)
      sharedCache.set(key, shared)
    }
    return shared
  }

  const improvers: number[] = []
  const found = (a: number, b: number): boolean => {
    improvers.push(a < b ? a * N + b : b * N + a)
    return improvers.length >= atMost
  }
  const scoreCost = new Float64Array(last)
  const position = field.position

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]!
    for (let h = g; h < groups.length; h++) {
      // Twice the cost, on each level that depends on the two Scores alone. Zero stands in elsewhere.
      const one = group[0]!
      const other = groups[h]![0]!
      for (let c = 0; c < last; c++)
        scoreCost[c] = levels[c]!.scoreOnly === true ? 2 * levels[c]!.pair(one, other) : 0
      const against = buckets[h]!

      for (const a of group) {
        const oa = a * K
        const anchorA = anchor[a]!
        const here = position[a]!
        const lastA = dual[oa + last]!

        for (const bucket of against) {
          const shared = sharedUnder(anchorA, bucket.anchor)
          const os = shared * K
          let sign = 0
          for (let c = 0; c < last && sign === 0; c++) {
            const x =
              dual[oa + c]! +
              bucket.upper[c]! +
              scoreCost[c]! +
              (shared === -1 ? 0 : 2 * sumFromTop[os + c]!)
            if (x > 0) sign = 1
            else if (x < 0) sign = -1
          }
          if (sign > 0) continue
          const members = bucket.members

          if (sign < 0) {
            // Nothing can be ruled out cheaply: check the whole bucket.
            for (const b of members) {
              if (h === g && b <= a) continue
              if (improves(a, b) && found(a, b)) return improvers
            }
            continue
          }

          // Level on everything but Shuffle Positions: only near neighbours can have negative slack.
          const sharedLast = shared === -1 ? 0 : 2 * sumFromTop[os + last]!
          const room = -(lastA + bucket.leastLast + sharedLast)
          if (room <= 0) continue
          let low = 0
          let high = members.length
          while (low < high) {
            const middle = (low + high) >> 1
            if (position[members[middle]!]! < here) low = middle + 1
            else high = middle
          }
          for (let i = low; i < members.length; i++) {
            const b = members[i]!
            const distance = position[b]! - here
            const cost = 2 * distance * distance
            if (cost >= room) break
            if (h === g && b <= a) continue
            if (
              cost + lastA + dual[b * K + last]! + sharedLast < 0 &&
              improves(a, b) &&
              found(a, b)
            )
              return improvers
          }
          for (let i = low - 1; i >= 0; i--) {
            const b = members[i]!
            const distance = here - position[b]!
            const cost = 2 * distance * distance
            if (cost >= room) break
            if (h === g && b <= a) continue
            if (
              cost + lastA + dual[b * K + last]! + sharedLast < 0 &&
              improves(a, b) &&
              found(a, b)
            )
              return improvers
          }
        }
      }
    }
  }
  return improvers
}
