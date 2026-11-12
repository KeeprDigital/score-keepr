import type { Level } from '../cost.ts'
import type { Field } from '../field.ts'
import type { MatchingSolution } from './blossom.ts'
import { layOutBlossoms } from './forest.ts'
import { addSharedBlossoms } from './verify.ts'

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
  /** Dual on every level above the window level, the same for every Entrant in the bucket. */
  upper: number[]
  /** For each level above the window level that goes by Group Label, the label they share. */
  labels: (string | undefined)[]
  /** The least dual on the window level among the Entrants. */
  least: number
  /** Entrants in rising order of the window level's `to` value. */
  members: number[]
}

/**
 * The same answer as `findImproversSlowly`, found without looking at every pair.
 *
 * A Pairing can only improve the result if its slack is negative. Slack is checked level by
 * level, and every level's cost is zero or more, so assuming a cost of zero can only make a
 * Pairing look better than it is. That gives a safe first test that needs no costs at all,
 * except three kinds that are cheap to know exactly:
 *
 *   - levels that depend on the two Scores alone, which are the same for a whole pair of Score Groups;
 *   - levels that go by Group Label, which are the same for everyone who shares a label;
 *   - the window level: the first level that measures a distance along a line, such as Rank or
 *     Shuffle Position, where the cost grows with how far apart two Entrants are.
 *
 * Entrants are put in buckets that share a Score, their labels, and the same duals on every level
 * above the window level. Against a whole bucket, the first test either clears everyone, or
 * leaves only Entrants within a window along the line. Whatever survives gets the exact check.
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
  const { dual, inblossom } = solution
  const total = 2 * N

  // The window level, and the line it measures along. Shuffle Positions, always last, are one.
  let window = K - 1
  for (let c = 0; c < K; c++) {
    if (levels[c]!.shape?.type === 'line') {
      window = c
      break
    }
  }
  const line = levels[window]!.shape as { from: readonly number[]; to: readonly number[] }
  const from = line.from
  const to = line.to
  // On the last level a slack of exactly zero is not an improvement. Above it, lower levels decide.
  const zeroIsSafe = window === K - 1

  // Which levels above the window reward a shared label, and where each keeps its label in a
  // bucket. Their cost is 1 for most Pairings, so it has to be known exactly. A level that only
  // penalises a shared label costs 0 for most Pairings, so assuming 0 is nearly always right,
  // and splitting buckets by its labels would cost far more than it saves.
  const labelLevels: number[] = []
  for (let c = 0; c < window; c++) {
    const shape = levels[c]!.shape
    if (shape?.type === 'labels' && shape.scoring === 'different') labelLevels.push(c)
  }
  const labelOf = labelLevels.map(
    (c) => (levels[c]!.shape as { label: readonly (string | undefined)[] }).label,
  )

  // The blossoms, laid out so the lowest shared blossom of two nodes is a lookup.
  const { anchor, topOf, sumFromTop, lowestShared } = layOutBlossoms(solution, N, K, window)

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

  // ----- Score Groups, highest first. -----
  const order = Array.from({ length: n }, (_, a) => a).sort(
    (a, b) => field.score[b]! - field.score[a]! || a - b,
  )
  const groups: number[][] = []
  for (const a of order) {
    const current = groups.at(-1)
    if (current !== undefined && field.score[current[0]!] === field.score[a]) current.push(a)
    else groups.push([a])
  }

  // ----- Buckets within each Score Group, each in rising order along the line. -----
  const buckets: Bucket[][] = groups.map((group) => {
    const byKey = new Map<string, Bucket>()
    for (const a of group) {
      const o = a * K
      let key = String(anchor[a])
      for (let c = 0; c < window; c++) key += `,${dual[o + c]}`
      for (const labels of labelOf) key += `\u0000${labels[a] ?? '\u0001'}`
      let bucket = byKey.get(key)
      if (bucket === undefined) {
        bucket = {
          anchor: anchor[a]!,
          upper: Array.from(dual.subarray(o, o + window)),
          labels: labelOf.map((labels) => labels[a]),
          least: Number.POSITIVE_INFINITY,
          members: [],
        }
        byKey.set(key, bucket)
      }
      bucket.members.push(a)
      if (dual[o + window]! < bucket.least) bucket.least = dual[o + window]!
    }
    const found = [...byKey.values()]
    for (const bucket of found) bucket.members.sort((x, y) => to[x]! - to[y]! || x - y)
    return found
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
  // Twice the cost on each level above the window that is known exactly; zero stands in elsewhere.
  const knownCost = new Float64Array(window)
  const slotOf = new Int32Array(window).fill(-1)
  for (const [slot, c] of labelLevels.entries()) slotOf[c] = slot

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]!
    for (let h = g; h < groups.length; h++) {
      const one = group[0]!
      const other = groups[h]![0]!
      for (let c = 0; c < window; c++)
        knownCost[c] = levels[c]!.shape?.type === 'scores' ? 2 * levels[c]!.pair(one, other) : 0
      const against = buckets[h]!

      for (const a of group) {
        const oa = a * K
        const anchorA = anchor[a]!
        const here = from[a]!
        const windowA = dual[oa + window]!

        for (const bucket of against) {
          const shared = sharedUnder(anchorA, bucket.anchor)
          const os = shared * K
          let sign = 0
          for (let c = 0; c < window && sign === 0; c++) {
            let x =
              dual[oa + c]! +
              bucket.upper[c]! +
              knownCost[c]! +
              (shared === -1 ? 0 : 2 * sumFromTop[os + c]!)
            const slot = slotOf[c]!
            if (slot !== -1) {
              const mine = labelOf[slot]![a]
              const theirs = bucket.labels[slot]
              if (mine !== undefined && theirs !== undefined && mine !== theirs) x += 2
            }
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

          // Level on everything above the window: only near neighbours along the line can have negative slack.
          const sharedWindow = shared === -1 ? 0 : 2 * sumFromTop[os + window]!
          const room = -(windowA + bucket.least + sharedWindow)
          if (zeroIsSafe ? room <= 0 : room < 0) continue
          let low = 0
          let high = members.length
          while (low < high) {
            const middle = (low + high) >> 1
            if (to[members[middle]!]! < here) low = middle + 1
            else high = middle
          }
          for (let i = low; i < members.length; i++) {
            const b = members[i]!
            const distance = to[b]! - here
            const cost = 2 * distance * distance
            if (zeroIsSafe ? cost >= room : cost > room) break
            if (h === g && b <= a) continue
            const least = cost + windowA + dual[b * K + window]! + sharedWindow
            if ((zeroIsSafe ? least < 0 : least <= 0) && improves(a, b) && found(a, b))
              return improvers
          }
          for (let i = low - 1; i >= 0; i--) {
            const b = members[i]!
            const distance = here - to[b]!
            const cost = 2 * distance * distance
            if (zeroIsSafe ? cost >= room : cost > room) break
            if (h === g && b <= a) continue
            const least = cost + windowA + dual[b * K + window]! + sharedWindow
            if ((zeroIsSafe ? least < 0 : least <= 0) && improves(a, b) && found(a, b))
              return improvers
          }
        }
      }
    }
  }
  return improvers
}
