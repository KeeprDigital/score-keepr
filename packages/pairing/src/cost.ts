import type { Constraint, PairDownPick } from '@score-keepr/shared'

import type { Field } from './field.ts'

/**
 * One level of the priority order. Every level scores a Pairing or a Bye on its own, as a whole
 * number that is never negative, and lower is better. A set of Pairings scores the sum.
 */
export type Level = {
  pair(a: number, b: number): bigint
  bye(a: number): bigint
}

const NONE = (): bigint => 0n
const square = (value: bigint): bigint => value * value
const flag = (broken: boolean): bigint => (broken ? 1n : 0n)

/** True when Pairing `a` with `b`, or giving `a` the Bye, breaks a yes-or-no Constraint. */
export type Breaks = {
  pair(a: number, b: number): boolean
  bye(a: number): boolean
}

/** The yes-or-no reading of a Constraint, or undefined when it is a measured one. */
export function breaksOf(constraint: Constraint, field: Field): Breaks | undefined {
  const never = (): boolean => false
  switch (constraint.type) {
    case 'no-rematch':
      return { pair: (a, b) => (field.faced[a] as Set<number>).has(b), bye: never }
    case 'bye-cap':
      return { pair: never, bye: (a) => (field.byes[a] as number) >= constraint.max }
    case 'avoid-same-group-label':
      return {
        pair: (a, b) => {
          const mine = field.groups[a]?.[constraint.kind]
          return mine !== undefined && mine === field.groups[b]?.[constraint.kind]
        },
        bye: never,
      }
    case 'avoid-listed-pairs':
      return { pair: (a, b) => (field.listed[a] as Set<number>).has(b), bye: never }
    default:
      return undefined
  }
}

/** The levels of a Configuration in priority order, with Shuffle Positions deciding last. */
export function levelsOf(configuration: readonly Constraint[], field: Field): Level[] {
  const levels: Level[] = []
  for (const constraint of configuration) levels.push(...levelsOfConstraint(constraint, field))
  levels.push(shuffleLevel(field))
  return levels
}

function levelsOfConstraint(constraint: Constraint, field: Field): Level[] {
  const breaks = breaksOf(constraint, field)
  if (breaks !== undefined) {
    return [{ pair: (a, b) => flag(breaks.pair(a, b)), bye: (a) => flag(breaks.bye(a)) }]
  }

  const score = (a: number): bigint => BigInt(field.score[a] as number)
  const pairDown = (a: number, b: number): boolean => field.score[a] !== field.score[b]

  switch (constraint.type) {
    case 'prefer-same-group-label':
      return [
        {
          pair: (a, b) => {
            const mine = field.groups[a]?.[constraint.kind]
            const theirs = field.groups[b]?.[constraint.kind]
            return flag(mine !== undefined && theirs !== undefined && mine !== theirs)
          },
          bye: NONE,
        },
      ]
    case 'bye-to-lowest-score':
      return [{ pair: NONE, bye: (a) => score(a) - BigInt(field.minScore) }]
    case 'bye-to-lowest-rank': {
      const worse = countWorseRanked(field)
      return [{ pair: NONE, bye: (a) => BigInt(worse[a] as number) }]
    }
    case 'pair-close-in-score':
      return [{ pair: (a, b) => square(score(a) - score(b)), bye: NONE }]
    case 'keep-top-clean':
      return [
        {
          pair: (a, b) =>
            pairDown(a, b)
              ? (score(a) > score(b) ? score(a) : score(b)) - BigInt(field.minScore) + 1n
              : 0n,
          bye: NONE,
        },
      ]
    case 'keep-bottom-clean':
      return [
        {
          pair: (a, b) =>
            pairDown(a, b)
              ? BigInt(field.maxScore) - (score(a) < score(b) ? score(a) : score(b)) + 1n
              : 0n,
          bye: NONE,
        },
      ]
    case 'pair-adjacent-by-rank': {
      const place = countBetterRanked(field)
      return [
        {
          pair: (a, b) => square(BigInt((place[a] as number) - (place[b] as number))),
          bye: NONE,
        },
      ]
    }
    case 'pair-top-vs-bottom-by-rank': {
      const place = countBetterRanked(field)
      const mirror = field.size - 1
      return [
        {
          pair: (a, b) => square(BigInt((place[a] as number) + (place[b] as number) - mirror)),
          bye: NONE,
        },
      ]
    }
    case 'pair-down-choice': {
      const from = pickCost(constraint.from, field)
      const opponent = pickCost(constraint.opponent, field)
      const higher = (a: number, b: number): number =>
        (field.score[a] as number) > (field.score[b] as number) ? a : b
      const lower = (a: number, b: number): number =>
        (field.score[a] as number) > (field.score[b] as number) ? b : a
      return [
        { pair: (a, b) => (pairDown(a, b) ? from(higher(a, b)) : 0n), bye: NONE },
        { pair: (a, b) => (pairDown(a, b) ? opponent(lower(a, b)) : 0n), bye: NONE },
      ]
    }
    default:
      return []
  }
}

/** Shuffle Positions: prefer Pairings between near neighbours, and a Bye near position zero. */
function shuffleLevel(field: Field): Level {
  const position = (a: number): bigint => BigInt(field.position[a] as number)
  return {
    pair: (a, b) => square(position(a) - position(b)),
    bye: (a) => square(position(a)),
  }
}

/** For each Entrant, how many Entrants in the call have a strictly better Rank. */
function countBetterRanked(field: Field): number[] {
  return field.rank.map((mine) => field.rank.filter((other) => rankOf(other) < rankOf(mine)).length)
}

/** For each Entrant, how many Entrants in the call have a strictly worse Rank. */
function countWorseRanked(field: Field): number[] {
  return field.rank.map((mine) => field.rank.filter((other) => rankOf(other) > rankOf(mine)).length)
}

/** How far an Entrant is from being the one a Pair-down should pick from their Score Group. */
function pickCost(pick: PairDownPick, field: Field): (a: number) => bigint {
  if (pick === 'random') return NONE
  const cost = field.rank.map((mine, a) => {
    let ahead = 0
    for (let other = 0; other < field.size; other++) {
      if (field.score[other] !== field.score[a]) continue
      const theirs = rankOf(field.rank[other])
      if (pick === 'highest' ? theirs < rankOf(mine) : theirs > rankOf(mine)) ahead++
    }
    return BigInt(ahead)
  })
  return (a) => cost[a] as bigint
}

// Validation guarantees a Rank wherever a chosen Constraint reads one.
const rankOf = (rank: number | undefined): number => rank ?? 0
