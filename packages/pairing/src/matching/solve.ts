import type { Level } from '../cost.ts'
import type { Mates } from '../exhaustive.ts'
import type { Field } from '../field.ts'
import { solveMatching, type MatchingGraph, type MatchingSolution } from './blossom.ts'
import { findImprovers, findImproversSlowly } from './improvers.ts'
import { verifyMatching } from './verify.ts'

export type MatchOptions = {
  /** Give up, returning undefined, after this much work. Left out, the built-in ceiling applies. */
  maxSteps?: number
  /** Fields up to this size are solved with every possible Pairing in the graph. */
  completeUpTo?: number
  /** How many likely opponents each Entrant is offered at first. Fewer means more repair work. */
  neighbours?: number
  /** Check left-out Pairings the plain way, one pair at a time. For comparing with the fast way. */
  plainProof?: boolean
  /**
   * Filled in with how much work the call took: the matcher's steps, and the comparisons the
   * proof step made. For measuring, never for deciding anything.
   */
  usage?: { steps: number; proofChecks?: number }
}

/** Same-Score neighbours, by Shuffle Position, that each Entrant is offered. */
const NEIGHBOURS = 6
/** Nearest Entrants, by Shuffle Position, offered from each of the next Score Groups down. */
const NEIGHBOURS_BELOW = 3
const COMPLETE_UP_TO = 64
/** The largest field that falls back to every possible Pairing when the sparse graph fails. */
const COMPLETE_AT_MOST = 3000
const MOST_ROUNDS = 50

/**
 * The most work a field of this size is allowed when no limit is given: 50,000 steps, plus 2,000
 * for each Entrant times the number of binary digits in the count.
 *
 * It exists so that a fault inside the matcher can never hang a call: the worst that can
 * happen is a result marked not proven. It is set far above anything measured. Whole events
 * of up to 20,001 Entrants, including ones run long enough to force rematches, stay under a
 * twentieth of it. So does the heaviest single round found, pairing by Rank with an odd count
 * and no Bye rule, which stays under a hundredth.
 *
 * Whole-number arithmetic only, so it is the same on every machine.
 */
export function workCeiling(entrants: number): number {
  return 50_000 + 2_000 * entrants * (32 - Math.clz32(entrants))
}

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
  const maxSteps = options.maxSteps ?? workCeiling(n)
  let steps = 0
  const proofWork = { checks: 0 }

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
  else offerLikely(field, levels, offer, 1, options.neighbours ?? NEIGHBOURS)
  if (odd) for (let a = 0; a < n; a++) edges.add(a * N + BYE)

  for (let round = 0; round < MOST_ROUNDS; round++) {
    const graph = graphOf(N, K, edges, weightInto)
    const solution = solveMatching(graph, maxSteps - steps)
    if (solution === undefined) return undefined
    steps += solution.steps
    if (options.usage !== undefined) options.usage.steps = steps

    if (!solution.perfect) {
      // The sparse graph was too thin to pair everyone. Offer more, then everything.
      if (complete) return undefined
      widened++
      if (widened === 1) offerLikely(field, levels, offer, 2, options.neighbours ?? NEIGHBOURS)
      else if (n <= COMPLETE_AT_MOST) {
        offerEverything()
        complete = true
      } else return undefined
      continue
    }
    if (verifyMatching(graph, solution) !== undefined) return undefined
    if (complete) return matesOf(solution, n, BYE)

    const improvers =
      options.plainProof === true
        ? findImproversSlowly(field, levels, solution, N, 50 * N)
        : findImprovers(field, levels, solution, N, 50 * N, proofWork)
    steps += n
    if (options.usage !== undefined) {
      options.usage.steps = steps
      options.usage.proofChecks = proofWork.checks
    }
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
 * Offers each Entrant a handful of likely opponents, guided by what the levels reward:
 *
 *   - the next few by Shuffle Position on the same Score, and the nearest few on each of the
 *     next Scores down;
 *   - for a level that measures a distance, such as pairing by Rank, the nearest few along it;
 *   - for a level that rewards a shared Group Label, such as pods, a few who share it.
 *
 * Offers only affect speed. Whatever is left out is checked afterwards.
 */
function offerLikely(
  field: Field,
  levels: readonly Level[],
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

  // Every level but the last: Shuffle Positions are already covered above.
  for (const level of levels.slice(0, -1)) {
    const shape = level.shape
    if (shape?.type === 'line') {
      // The nearest few along the line, on both sides.
      const { from, to } = shape
      const byTo = Array.from({ length: n }, (_, a) => a).sort((a, b) => to[a]! - to[b]! || a - b)
      for (let a = 0; a < n; a++) {
        const here = from[a]!
        let low = 0
        let high = n
        while (low < high) {
          const middle = (low + high) >> 1
          if (to[byTo[middle]!]! < here) low = middle + 1
          else high = middle
        }
        let up = low
        let down = low - 1
        for (let count = 0; count < same && (down >= 0 || up < n); count++) {
          if (down < 0) offer(a, byTo[up++]!)
          else if (up >= n) offer(a, byTo[down--]!)
          else if (here - to[byTo[down]!]! <= to[byTo[up]!]! - here) offer(a, byTo[down--]!)
          else offer(a, byTo[up++]!)
        }
      }
    } else if (shape?.type === 'labels' && shape.scoring === 'different') {
      // Sharing a label is rewarded: offer the next few who share it, in Shuffle Position order.
      const sharing = new Map<string, number[]>()
      for (let a = 0; a < n; a++) {
        const label = shape.label[a]
        if (label === undefined) continue
        const members = sharing.get(label)
        if (members === undefined) sharing.set(label, [a])
        else members.push(a)
      }
      for (const members of sharing.values()) {
        for (let at = 0; at < members.length; at++) {
          for (let next = at + 1; next < members.length && next <= at + same; next++)
            offer(members[at]!, members[next]!)
        }
      }
    }
  }
}
