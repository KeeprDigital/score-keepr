import {
  compareCodeUnits,
  type MatchResult,
  type PointsMethod,
  type StandingsConfiguration,
  type StandingsInput,
} from '@score-keepr/shared'

/** Everything the Results say about one Entrant, added up. */
export type Tally = {
  id: string
  removed: boolean
  dropped: boolean
  score: number
  /** The record as a person would say it: Byes are wins, a loss with no opponent is a loss. */
  wins: number
  losses: number
  draws: number
  /** Wins in Results with two Entrants only. */
  matchWins: number
  /** Rounds that count as played, and what happened in them. */
  played: number
  pointsWhenPlayed: number
  winsWhenPlayed: number
  lossesWhenPlayed: number
  /** Rounds the Entrant has a Result for that do not count as played. */
  notCounted: number
  /** Games won, lost and drawn in rounds that count as played. */
  games: [number, number, number]
  /** Games won in Results with two Entrants only. */
  matchGamesWon: number
  scoredFor: Map<string, number>
  scoredAgainst: Map<string, number>
  /** One entry per Result with two Entrants, in round order. */
  opponents: string[]
  lostRounds: number[]
  assignedByes: number
  awardedByes: number
  /** How many times this Entrant beat each opponent. */
  beat: Map<string, number>
}

/** The points one side of a Result earns. Validation has already checked the data is there. */
export function pointsFor(points: PointsMethod, result: MatchResult, side: 0 | 1): number {
  const other = side === 0 ? 1 : 0
  switch (points.type) {
    case 'by-outcome':
      return points[result.outcomes[side]]
    case 'by-game-score': {
      const games = result.games as [number, number, number]
      const row = points.table.find(
        (each) => each.won === games[side] && each.lost === games[other] && each.drawn === games[2],
      )
      return (row as { points: number }).points
    }
    case 'by-extra-score-difference': {
      const scores = result.extraScores?.[points.extraScore] as [number, number]
      const difference = Math.abs(scores[0] - scores[1])
      const band = points.bands.find((each) => each.upTo === null || difference <= each.upTo) as {
        higher: number
        lower: number
      }
      return scores[side] >= scores[other] ? band.higher : band.lower
    }
    case 'by-extra-score': {
      const scores = result.extraScores?.[points.extraScore] as [number, number]
      return scores[side]
    }
  }
}

/** Reads every Result once and adds up what each Entrant did. */
export function tallyResults(input: StandingsInput): Map<string, Tally> {
  const configuration: StandingsConfiguration = input.configuration
  const tallies = new Map<string, Tally>()
  for (const entrant of input.entrants) {
    tallies.set(entrant.id, {
      id: entrant.id,
      removed: entrant.status?.type === 'removed',
      dropped: entrant.status?.type === 'dropped',
      score: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      matchWins: 0,
      played: 0,
      pointsWhenPlayed: 0,
      winsWhenPlayed: 0,
      lossesWhenPlayed: 0,
      notCounted: 0,
      games: [0, 0, 0],
      matchGamesWon: 0,
      scoredFor: new Map(),
      scoredAgainst: new Map(),
      opponents: [],
      lostRounds: [],
      assignedByes: 0,
      awardedByes: 0,
      beat: new Map(),
    })
  }

  // Round order, then a fixed order within a round, so nothing depends on the order Results arrive in.
  const firstId = (result: StandingsInput['results'][number]): string =>
    'entrant' in result ? result.entrant : result.entrants[0]
  const results = [...input.results].sort(
    (a, b) => a.round - b.round || compareCodeUnits(firstId(a), firstId(b)),
  )

  for (const result of results) {
    if ('entrant' in result) {
      const tally = tallies.get(result.entrant) as Tally
      const isBye = result.kind !== 'unplayed-loss'
      const scoring = isBye ? configuration.bye : configuration.unplayedLoss
      tally.score += scoring.points
      if (isBye) {
        tally.wins++
        if (result.kind === 'bye') tally.assignedByes++
        else tally.awardedByes++
      } else {
        tally.losses++
        tally.lostRounds.push(result.round)
      }
      if (scoring.countsAsPlayed) {
        tally.played++
        tally.pointsWhenPlayed += scoring.points
        if (isBye) tally.winsWhenPlayed++
        else tally.lossesWhenPlayed++
        for (let at = 0; at < 3; at++)
          tally.games[at as 0 | 1 | 2] += scoring.games[at as 0 | 1 | 2]
      } else tally.notCounted++
      continue
    }

    for (const side of [0, 1] as const) {
      const other = side === 0 ? 1 : 0
      const tally = tallies.get(result.entrants[side]) as Tally
      const opponent = result.entrants[other]
      const outcome = result.outcomes[side]
      const points = pointsFor(configuration.points, result, side)
      tally.score += points
      tally.played++
      tally.pointsWhenPlayed += points
      tally.opponents.push(opponent)
      if (outcome === 'win') {
        tally.wins++
        tally.matchWins++
        tally.winsWhenPlayed++
        tally.beat.set(opponent, (tally.beat.get(opponent) ?? 0) + 1)
      } else if (outcome === 'loss') {
        tally.losses++
        tally.lossesWhenPlayed++
        tally.lostRounds.push(result.round)
      } else tally.draws++
      if (result.games !== undefined) {
        tally.games[0] += result.games[side]
        tally.games[1] += result.games[other]
        tally.games[2] += result.games[2]
        tally.matchGamesWon += result.games[side]
      }
      for (const [name, pair] of Object.entries(result.extraScores ?? {})) {
        tally.scoredFor.set(name, (tally.scoredFor.get(name) ?? 0) + pair[side])
        tally.scoredAgainst.set(name, (tally.scoredAgainst.get(name) ?? 0) + pair[other])
      }
    }
  }
  return tallies
}
