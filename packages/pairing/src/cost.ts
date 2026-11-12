import type { Constraint, PairDownPick } from '@score-keepr/shared'

import type { Field } from './field.ts'

/**
 * One level of the priority order. Every level scores a Pairing or a Bye on its own, as a whole
 * number that is never negative, and lower is better. A set of Pairings scores the sum.
 *
 * Every score is small enough to be an exact number: Scores are capped and Shuffle Positions
 * are 20 bits wide. Sums over a whole field can be larger, so they are added as bigints.
 */
export type Level = {
  pair(a: number, b: number): number
  bye(a: number): number
}

const NONE = (): number => 0
const square = (value: number): number => value * value
const flag = (broken: boolean): number => (broken ? 1 : 0)

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

/** A level together with the Constraint it came from. */
export type ConstraintLevel = {
  constraint: Constraint
  /** Set for the two levels of `pair-down-choice`. */
  part?: 'from' | 'opponent'
  level: Level
}

/** The levels a Configuration asks for, in priority order, without Shuffle Positions. */
export function constraintLevels(
  configuration: readonly Constraint[],
  field: Field,
): ConstraintLevel[] {
  const labelled: ConstraintLevel[] = []
  for (const constraint of configuration) {
    const levels = levelsOfConstraint(constraint, field)
    for (const [at, level] of levels.entries()) {
      if (constraint.type === 'pair-down-choice') {
        labelled.push({ constraint, part: at === 0 ? 'from' : 'opponent', level })
      } else {
        labelled.push({ constraint, level })
      }
    }
  }
  return labelled
}

/** Every level in priority order: the Configuration, then Shuffle Positions deciding last. */
export function levelsOf(configuration: readonly Constraint[], field: Field): Level[] {
  return [...constraintLevels(configuration, field).map((each) => each.level), shuffleLevel(field)]
}

function levelsOfConstraint(constraint: Constraint, field: Field): Level[] {
  const breaks = breaksOf(constraint, field)
  if (breaks !== undefined) {
    return [{ pair: (a, b) => flag(breaks.pair(a, b)), bye: (a) => flag(breaks.bye(a)) }]
  }

  const score = (a: number): number => field.score[a] as number
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
      return [{ pair: NONE, bye: (a) => score(a) - field.minScore }]
    case 'bye-to-lowest-rank': {
      const worse = countWorseRanked(field)
      return [{ pair: NONE, bye: (a) => worse[a] as number }]
    }
    case 'pair-close-in-score':
      return [{ pair: (a, b) => square(score(a) - score(b)), bye: NONE }]
    case 'keep-top-clean':
      return [
        {
          pair: (a, b) => (pairDown(a, b) ? Math.max(score(a), score(b)) - field.minScore + 1 : 0),
          bye: NONE,
        },
      ]
    case 'keep-bottom-clean':
      return [
        {
          pair: (a, b) => (pairDown(a, b) ? field.maxScore - Math.min(score(a), score(b)) + 1 : 0),
          bye: NONE,
        },
      ]
    case 'pair-adjacent-by-rank': {
      const place = countBetterRanked(field)
      return [
        {
          pair: (a, b) => square((place[a] as number) - (place[b] as number)),
          bye: NONE,
        },
      ]
    }
    case 'pair-top-vs-bottom-by-rank': {
      const place = countBetterRanked(field)
      const mirror = field.size - 1
      return [
        {
          pair: (a, b) => square((place[a] as number) + (place[b] as number) - mirror),
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
        { pair: (a, b) => (pairDown(a, b) ? from(higher(a, b)) : 0), bye: NONE },
        { pair: (a, b) => (pairDown(a, b) ? opponent(lower(a, b)) : 0), bye: NONE },
      ]
    }
    default:
      return []
  }
}

/** Shuffle Positions: prefer Pairings between near neighbours, and a Bye near position zero. */
function shuffleLevel(field: Field): Level {
  const position = (a: number): number => field.position[a] as number
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
function pickCost(pick: PairDownPick, field: Field): (a: number) => number {
  if (pick === 'random') return NONE
  const cost = field.rank.map((mine, a) => {
    let ahead = 0
    for (let other = 0; other < field.size; other++) {
      if (field.score[other] !== field.score[a]) continue
      const theirs = rankOf(field.rank[other])
      if (pick === 'highest' ? theirs < rankOf(mine) : theirs > rankOf(mine)) ahead++
    }
    return ahead
  })
  return (a) => cost[a] as number
}

// Validation guarantees a Rank wherever a chosen Constraint reads one.
const rankOf = (rank: number | undefined): number => rank ?? 0
