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
  /** Set when a Pairing's score has a form the matcher can use to rule Pairings out quickly. */
  shape?: LevelShape
}

/** How a level scores a Pairing, for the forms the matcher knows how to exploit. */
export type LevelShape =
  /** It depends on the two Scores and nothing else. */
  | { type: 'scores' }
  /** It is the square of `from[a] - to[b]`, and comes out the same whichever is called `a`. */
  | { type: 'line'; from: readonly number[]; to: readonly number[] }
  /** It is 1 when both have a label and the labels are the `same`, or are `different`; else 0. */
  | { type: 'labels'; label: readonly (string | undefined)[]; scoring: 'same' | 'different' }

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
    const level: Level = {
      pair: (a, b) => flag(breaks.pair(a, b)),
      bye: (a) => flag(breaks.bye(a)),
    }
    if (constraint.type === 'avoid-same-group-label') {
      level.shape = {
        type: 'labels',
        label: field.groups.map((groups) => groups?.[constraint.kind]),
        scoring: 'same',
      }
    }
    return [level]
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
          shape: {
            type: 'labels',
            label: field.groups.map((groups) => groups?.[constraint.kind]),
            scoring: 'different',
          },
        },
      ]
    case 'bye-to-lowest-score':
      return [{ pair: NONE, bye: (a) => score(a) - field.minScore }]
    case 'bye-to-lowest-rank': {
      const worse = countWorseRanked(field)
      return [{ pair: NONE, bye: (a) => worse[a] as number }]
    }
    case 'pair-close-in-score':
      return [{ pair: (a, b) => square(score(a) - score(b)), bye: NONE, shape: { type: 'scores' } }]
    case 'keep-top-clean':
      return [
        {
          pair: (a, b) => (pairDown(a, b) ? Math.max(score(a), score(b)) - field.minScore + 1 : 0),
          bye: NONE,
          shape: { type: 'scores' },
        },
      ]
    case 'keep-bottom-clean':
      return [
        {
          pair: (a, b) => (pairDown(a, b) ? field.maxScore - Math.min(score(a), score(b)) + 1 : 0),
          bye: NONE,
          shape: { type: 'scores' },
        },
      ]
    case 'pair-adjacent-by-rank': {
      const place = countBetterRanked(field)
      return [
        {
          pair: (a, b) => square((place[a] as number) - (place[b] as number)),
          bye: NONE,
          shape: { type: 'line', from: place, to: place },
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
          // The same thing seen as a distance: from an Entrant's place to the other's mirror image.
          shape: { type: 'line', from: place, to: place.map((each) => mirror - each) },
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
    shape: { type: 'line', from: field.position, to: field.position },
  }
}

/** How many of the sorted values are strictly below `value`. */
function countBelow(sorted: readonly number[], value: number): number {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((sorted[middle] as number) < value) low = middle + 1
    else high = middle
  }
  return low
}

/** How many of the sorted values are strictly above `value`. */
function countAbove(sorted: readonly number[], value: number): number {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((sorted[middle] as number) <= value) low = middle + 1
    else high = middle
  }
  return sorted.length - low
}

/** For each Entrant, how many Entrants in the call have a strictly better Rank. */
function countBetterRanked(field: Field): number[] {
  const sorted = field.rank.map(rankOf).sort((a, b) => a - b)
  return field.rank.map((mine) => countBelow(sorted, rankOf(mine)))
}

/** For each Entrant, how many Entrants in the call have a strictly worse Rank. */
function countWorseRanked(field: Field): number[] {
  const sorted = field.rank.map(rankOf).sort((a, b) => a - b)
  return field.rank.map((mine) => countAbove(sorted, rankOf(mine)))
}

/** How far an Entrant is from being the one a Pair-down should pick from their Score Group. */
function pickCost(pick: PairDownPick, field: Field): (a: number) => number {
  if (pick === 'random') return NONE
  const ranksByScore = new Map<number, number[]>()
  for (let a = 0; a < field.size; a++) {
    const score = field.score[a] as number
    const ranks = ranksByScore.get(score)
    if (ranks === undefined) ranksByScore.set(score, [rankOf(field.rank[a])])
    else ranks.push(rankOf(field.rank[a]))
  }
  for (const ranks of ranksByScore.values()) ranks.sort((a, b) => a - b)
  const cost = field.rank.map((mine, a) => {
    const group = ranksByScore.get(field.score[a] as number) as number[]
    return pick === 'highest' ? countBelow(group, rankOf(mine)) : countAbove(group, rankOf(mine))
  })
  return (a) => cost[a] as number
}

// Validation guarantees a Rank wherever a chosen Constraint reads one.
const rankOf = (rank: number | undefined): number => rank ?? 0
