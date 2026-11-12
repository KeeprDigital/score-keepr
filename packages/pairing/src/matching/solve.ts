import type { Level } from '../cost.ts'
import type { Mates } from '../exhaustive.ts'
import type { Field } from '../field.ts'
import {
  addSharedBlossoms,
  solveMatching,
  verifyMatching,
  type MatchingGraph,
  type MatchingSolution,
} from './blossom.ts'

export type MatchOptions = {
  /** Give up, returning undefined, after this much work. */
  maxSteps?: number
  /** Fields up to this size are solved with every possible Pairing in the graph. */
  completeUpTo?: number
  /** How many likely opponents each Entrant is offered at first. Fewer means more repair work. */
  neighbours?: number
}

/** Same-Score neighbours, by Shuffle Position, that each Entrant is offered. */
const NEIGHBOURS = 6
/** Nearest Entrants, by Shuffle Position, offered from each of the next Score Groups down. */
const NEIGHBOURS_BELOW = 3
/** Neighbours in Rank order offered when every Entrant has a Rank. */
const NEIGHBOURS_BY_RANK = 2
const COMPLETE_UP_TO = 64
/** The largest field that falls back to every possible Pairing when the sparse graph fails. */
const COMPLETE_AT_MOST = 3000
const MOST_ROUNDS = 50

/**
 * The best set of Pairings for a Field, proven best, or undefined when it could not be proven
 * within the work allowed.
 *
 * The matcher is given a sparse set of likely Pairings. Every Pairing left out is then checked
 * against the matcher's proof; any that could improve the result is added and the field solved
 * again. When none remains, the result is best over every possible Pairing.
 */
export function solveByMatching(
  field: Field,
  levels: readonly Level[],
  options: MatchOptions = {},
): Mates | undefined {
  const n = field.size
  if (n === 0) return []
  const odd = n % 2 === 1
  const BYE = n
  const N = odd ? n + 1 : n
  const K = levels.length
  const maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY
  let steps = 0

  const weightInto = (out: Float64Array, at: number, a: number, b: number): void => {
    if (b === BYE) for (let c = 0; c < K; c++) out[at + c] = -levels[c]!.bye(a)
    else for (let c = 0; c < K; c++) out[at + c] = -levels[c]!.pair(a, b)
  }

  // Candidate Pairings as keys a * N + b with a < b, in a fixed order.
  const edges = new Set<number>()
  const offer = (a: number, b: number): void => {
    if (a !== b) edges.add(a < b ? a * N + b : b * N + a)
  }
  const offerEverything = (): void => {
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) edges.add(a * N + b)
  }

  let complete = n <= (options.completeUpTo ?? COMPLETE_UP_TO)
  let widened = 0
  if (complete) offerEverything()
  else offerLikely(field, offer, 1, options.neighbours ?? NEIGHBOURS)
  if (odd) for (let a = 0; a < n; a++) edges.add(a * N + BYE)

  for (let round = 0; round < MOST_ROUNDS; round++) {
    const graph = graphOf(N, K, edges, weightInto)
    const solution = solveMatching(graph, maxSteps - steps)
    if (solution === undefined) return undefined
    steps += solution.steps

    if (!solution.perfect) {
      // The sparse graph was too thin to pair everyone. Offer more, then everything.
      if (complete) return undefined
      widened++
      if (widened === 1) offerLikely(field, offer, 2, options.neighbours ?? NEIGHBOURS)
      else if (n <= COMPLETE_AT_MOST) {
        offerEverything()
        complete = true
      } else return undefined
      continue
    }
    if (verifyMatching(graph, solution) !== undefined) return undefined
    if (complete) return matesOf(solution, n, BYE)

    const improvers = findImprovers(field, levels, solution, N, 50 * N)
    steps += n
    if (steps > maxSteps) return undefined
    if (improvers.length === 0) return matesOf(solution, n, BYE)
    for (const key of improvers) edges.add(key)
  }
  return undefined
}

function matesOf(solution: MatchingSolution, n: number, BYE: number): Mates {
  const mates: Mates = []
  for (let a = 0; a < n; a++) {
    const partner = solution.partner[a]!
    mates.push(partner === BYE ? -1 : partner)
  }
  return mates
}

function graphOf(
  N: number,
  K: number,
  edges: ReadonlySet<number>,
  weightInto: (out: Float64Array, at: number, a: number, b: number) => void,
): MatchingGraph {
  const from = new Int32Array(edges.size)
  const to = new Int32Array(edges.size)
  const weight = new Float64Array(edges.size * K)
  let k = 0
  for (const key of edges) {
    const b = key % N
    const a = (key - b) / N
    from[k] = a
    to[k] = b
    weightInto(weight, k * K, a, b)
    k++
  }
  return { size: N, levels: K, from, to, weight }
}

/**
 * Offers each Entrant a handful of likely opponents: the next few by Shuffle Position on the
 * same Score, the nearest few on each of the next Scores down, and neighbours in Rank order.
 */
function offerLikely(
  field: Field,
  offer: (a: number, b: number) => void,
  generosity: number,
  neighbours: number,
): void {
  const n = field.size
  // Entrants are numbered in Shuffle Position order, so sorting by Score keeps that order within a Score.
  const order = Array.from({ length: n }, (_, a) => a).sort(
    (a, b) => field.score[b]! - field.score[a]! || a - b,
  )
  const starts = [0]
  for (let at = 1; at < n; at++)
    if (field.score[order[at]!] !== field.score[order[at - 1]!]) starts.push(at)
  starts.push(n)
  const groups = starts.length - 1
  const same = neighbours * generosity
  const below = Math.min(neighbours, NEIGHBOURS_BELOW) * generosity

  for (let g = 0; g < groups; g++) {
    const start = starts[g]!
    const end = starts[g + 1]!
    for (let at = start; at < end; at++) {
      const a = order[at]!
      for (let next = at + 1; next < end && next <= at + same; next++) offer(a, order[next]!)
      for (let h = g + 1; h < groups && h <= g + generosity; h++) {
        const from = starts[h]!
        const to = starts[h + 1]!
        // Entrant numbers rise with Shuffle Position, so the nearest positions are the nearest numbers.
        let low = from
        let high = to
        while (low < high) {
          const middle = (low + high) >> 1
          if (order[middle]! < a) low = middle + 1
          else high = middle
        }
        let up = low
        let down = low - 1
        for (let count = 0; count < below && (down >= from || up < to); count++) {
          if (down < from) offer(a, order[up++]!)
          else if (up >= to) offer(a, order[down--]!)
          else if (
            field.position[a]! - field.position[order[down]!]! <=
            field.position[order[up]!]! - field.position[a]!
          ) {
            offer(a, order[down--]!)
          } else offer(a, order[up++]!)
        }
      }
    }
  }

  if (field.everyoneRanked) {
    const byRank = Array.from({ length: n }, (_, a) => a).sort(
      (a, b) => field.rank[a]! - field.rank[b]! || a - b,
    )
    for (let at = 0; at < n; at++) {
      for (let next = at + 1; next < n && next <= at + NEIGHBOURS_BY_RANK * generosity; next++)
        offer(byRank[at]!, byRank[next]!)
    }
  }
}

/**
 * Checks every possible Pairing against the proof and returns those that could improve the
 * result, as edge keys. An empty list means the result is best over all Pairings.
 */
function findImprovers(
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
        let stillNegative = false
        for (let c = 0; c < K; c++) {
          if (slack[c]! > 0) break
          if (slack[c]! < 0) {
            stillNegative = true
            break
          }
        }
        if (!stillNegative) continue
      }
      improvers.push(a * N + b)
      if (improvers.length >= atMost) return improvers
    }
  }
  return improvers
}
