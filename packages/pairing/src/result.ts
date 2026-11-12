import type { Constraint, Pairing, RoundSuccess, Violation } from '@score-keepr/shared'

import { breaksOf } from './cost.ts'
import type { Mates } from './exhaustive.ts'
import type { Field } from './field.ts'
import { ENGINE_VERSION } from './version.ts'

/** Turns a solved Field into the result the Consumer sees. */
export function describeResult(
  field: Field,
  configuration: readonly Constraint[],
  mates: Mates,
  round: number,
  provenBest: boolean,
): RoundSuccess {
  const rank = (a: number): number => field.rank[a] ?? 0

  // Within a Pairing: higher Score first, then better Rank, then earlier Shuffle Position.
  const before = (a: number, b: number): boolean => {
    if (field.score[a] !== field.score[b])
      return (field.score[a] as number) > (field.score[b] as number)
    if (field.everyoneRanked && rank(a) !== rank(b)) return rank(a) < rank(b)
    return a < b
  }

  const pairs: [number, number][] = []
  let bye: number | undefined
  for (let a = 0; a < field.size; a++) {
    const b = mates[a] as number
    if (b === -1) bye = a
    else if (a < b) pairs.push(before(a, b) ? [a, b] : [b, a])
  }

  // Between Pairings: higher Scores first, then the best Rank present, then Shuffle Position.
  pairs.sort(([a1, b1], [a2, b2]) => {
    const byTop = (field.score[a2] as number) - (field.score[a1] as number)
    if (byTop !== 0) return byTop
    const byBottom = (field.score[b2] as number) - (field.score[b1] as number)
    if (byBottom !== 0) return byBottom
    if (field.everyoneRanked) {
      const byRank = Math.min(rank(a1), rank(b1)) - Math.min(rank(a2), rank(b2))
      if (byRank !== 0) return byRank
    }
    return Math.min(a1, b1) - Math.min(a2, b2)
  })

  const violations: Violation[] = []
  for (const constraint of configuration) {
    const breaks = breaksOf(constraint, field)
    if (breaks === undefined) continue
    for (const [a, b] of pairs) {
      if (breaks.pair(a, b)) {
        violations.push({ constraint, entrants: [field.id[a] as string, field.id[b] as string] })
      }
    }
    if (bye !== undefined && breaks.bye(bye)) {
      violations.push({ constraint, entrants: [field.id[bye] as string] })
    }
  }

  const pairings: Pairing[] = pairs.map(([a, b]) => ({
    entrants: [field.id[a] as string, field.id[b] as string],
    scoreGap: (field.score[a] as number) - (field.score[b] as number),
  }))

  return {
    ok: true,
    pairings,
    bye: bye === undefined ? null : (field.id[bye] as string),
    violations,
    provenBest,
    round,
    engineVersion: ENGINE_VERSION,
  }
}
