import type { Level } from './cost.ts'

/** For each Entrant, the Entrant they are paired with, or -1 for the Bye. */
export type Mates = number[]

/**
 * Tries every possible set of Pairings and returns the best under the levels, compared in
 * order. This is the definition of "best" that every faster method must agree with.
 *
 * Entrants are tried in number order and the first of several equally good answers is kept,
 * so the answer depends only on the Field. Returns undefined if it would take more than
 * `maxSteps` steps.
 */
export function solveExhaustive(
  size: number,
  levels: readonly Level[],
  maxSteps: number,
): Mates | undefined {
  const width = levels.length
  const pairCost: bigint[][][] = []
  const byeCost: bigint[][] = []
  for (let a = 0; a < size; a++) {
    byeCost.push(levels.map((level) => BigInt(level.bye(a))))
    const row: bigint[][] = []
    for (let b = 0; b < size; b++) {
      row.push(b > a ? levels.map((level) => BigInt(level.pair(a, b))) : [])
    }
    pairCost.push(row)
  }

  const mates: Mates = Array.from({ length: size }, () => -2)
  const running: bigint[] = Array.from({ length: width }, () => 0n)
  let best: bigint[] | undefined
  let bestMates: Mates | undefined
  let steps = 0
  let exhausted = false

  const worseThanBest = (): boolean => {
    if (best === undefined) return false
    for (let level = 0; level < width; level++) {
      const mine = running[level] as bigint
      const theirs = best[level] as bigint
      if (mine !== theirs) return mine > theirs
    }
    return true
  }

  const apply = (cost: readonly bigint[], sign: 1n | -1n): void => {
    for (let level = 0; level < width; level++) {
      running[level] = (running[level] as bigint) + sign * (cost[level] as bigint)
    }
  }

  const search = (from: number, byeFree: boolean): void => {
    if (exhausted) return
    if (++steps > maxSteps) {
      exhausted = true
      return
    }
    if (worseThanBest()) return

    let a = from
    while (a < size && mates[a] !== -2) a++
    if (a === size) {
      best = [...running]
      bestMates = [...mates]
      return
    }

    for (let b = a + 1; b < size; b++) {
      if (mates[b] !== -2) continue
      const cost = (pairCost[a] as bigint[][])[b] as bigint[]
      mates[a] = b
      mates[b] = a
      apply(cost, 1n)
      search(a + 1, byeFree)
      apply(cost, -1n)
      mates[a] = -2
      mates[b] = -2
    }

    if (byeFree) {
      const cost = byeCost[a] as bigint[]
      mates[a] = -1
      apply(cost, 1n)
      search(a + 1, false)
      apply(cost, -1n)
      mates[a] = -2
    }
  }

  search(0, size % 2 === 1)
  return exhausted ? undefined : bestMates
}
