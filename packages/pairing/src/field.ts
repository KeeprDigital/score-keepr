import { distinctPositions, type RoundInput } from '@score-keepr/shared'

/**
 * The Entrants of one call, laid out by number. Entrants are numbered in order of Shuffle
 * Position, so nothing computed from a Field depends on the order they arrived in.
 */
export type Field = {
  size: number
  id: string[]
  score: number[]
  byes: number[]
  rank: (number | undefined)[]
  groups: (Record<string, string> | undefined)[]
  /** Shuffle Position: a distinct whole number below 2^32 for each Entrant. */
  position: number[]
  /** For each Entrant, the present Entrants they have already faced. */
  faced: Set<number>[]
  /** For each Entrant, the present Entrants they are listed as avoiding. */
  listed: Set<number>[]
  minScore: number
  maxScore: number
  everyoneRanked: boolean
}

export function buildField(input: RoundInput): Field {
  const positions = distinctPositions(
    ['shuffle', input.randomSeed, String(input.round)],
    input.entrants.map((entrant) => entrant.id),
  )
  const entrants = [...input.entrants].sort(
    (a, b) => (positions.get(a.id) as number) - (positions.get(b.id) as number),
  )
  const index = new Map(entrants.map((entrant, at) => [entrant.id, at]))
  const size = entrants.length

  const present = (ids: readonly string[]): Set<number> => {
    const found = new Set<number>()
    for (const id of ids) {
      const at = index.get(id)
      if (at !== undefined) found.add(at)
    }
    return found
  }

  const listed = entrants.map(() => new Set<number>())
  for (const [first, second] of input.avoidPairs ?? []) {
    const a = index.get(first)
    const b = index.get(second)
    if (a !== undefined && b !== undefined) {
      ;(listed[a] as Set<number>).add(b)
      ;(listed[b] as Set<number>).add(a)
    }
  }

  const score = entrants.map((entrant) => entrant.score)
  return {
    size,
    id: entrants.map((entrant) => entrant.id),
    score,
    byes: entrants.map((entrant) => entrant.byes),
    rank: entrants.map((entrant) => entrant.rank),
    groups: entrants.map((entrant) => entrant.groups),
    position: entrants.map((entrant) => positions.get(entrant.id) as number),
    faced: entrants.map((entrant) => present(entrant.opponents)),
    listed,
    minScore: size === 0 ? 0 : Math.min(...score),
    maxScore: size === 0 ? 0 : Math.max(...score),
    everyoneRanked: entrants.every((entrant) => entrant.rank !== undefined),
  }
}
