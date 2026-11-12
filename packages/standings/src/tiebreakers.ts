import type { RateSettings, Ratio, StandingsConfiguration, Tiebreaker } from '@score-keepr/shared'

import { average, fraction, greater, lesser, ZERO, type Fraction } from './fraction.ts'
import type { Tally } from './tally.ts'

/** Works out one Tiebreaker for one Entrant. Undefined when the Tiebreaker has no number to give. */
export type Measure = (tally: Tally) => Fraction | undefined

export type Measured = {
  measure: Measure
  /** True when a lower value ranks higher. */
  lowerIsBetter: boolean
}

const ratio = (value: Ratio): Fraction => fraction(value.numerator, value.denominator)

/**
 * A measure for every Tiebreaker that is a number per Entrant. Head-to-head and random are not:
 * they depend on who else is level, and are handled where Ranks are decided.
 */
export function measuresFor(
  configuration: StandingsConfiguration,
  tallies: ReadonlyMap<string, Tally>,
  plannedRounds: number | undefined,
): (Measured | undefined)[] {
  const tallyOf = (id: string): Tally => tallies.get(id) as Tally
  const cached = (measure: Measure): Measure => {
    const known = new Map<string, Fraction | undefined>()
    return (tally) => {
      if (!known.has(tally.id)) known.set(tally.id, measure(tally))
      return known.get(tally.id)
    }
  }
  /** The average of a measure over everyone the Entrant faced, counting an opponent once per meeting. */
  const overOpponents = (measure: Measure, withNone: Ratio): Measure =>
    cached(
      (tally) =>
        average(tally.opponents.map((id) => measure(tallyOf(id)) ?? ZERO)) ?? ratio(withNone),
    )

  const matchWinRate = (settings: RateSettings): Measure =>
    cached((tally) => {
      const rounds =
        settings.rounds === 'played' || tally.dropped
          ? tally.played
          : (plannedRounds as number) - tally.notCounted
      let rate = ZERO
      if (rounds > 0) {
        rate =
          settings.counts.type === 'wins'
            ? fraction(tally.winsWhenPlayed, rounds)
            : fraction(tally.pointsWhenPlayed, settings.counts.perRound * rounds)
      }
      if (settings.floor !== null) rate = greater(rate, ratio(settings.floor))
      if (tally.dropped && settings.capIfDropped !== null)
        rate = lesser(rate, ratio(settings.capIfDropped))
      return rate
    })

  const gameWinRate = (win: number, draw: number, floor: Ratio | null): Measure =>
    cached((tally) => {
      const [won, lost, drawn] = tally.games
      const games = won + lost + drawn
      const rate = games > 0 && win > 0 ? fraction(win * won + draw * drawn, win * games) : ZERO
      return floor === null ? rate : greater(rate, ratio(floor))
    })

  const lossRate: Measure = cached((tally) =>
    tally.played > 0 ? fraction(tally.lossesWhenPlayed, tally.played) : ZERO,
  )
  const whole =
    (count: (tally: Tally) => number): Measure =>
    (tally) =>
      fraction(count(tally), 1)

  return configuration.tiebreakers.map((tiebreaker: Tiebreaker): Measured | undefined => {
    switch (tiebreaker.type) {
      case 'match-win-rate':
        return { measure: matchWinRate(tiebreaker.rate), lowerIsBetter: false }
      case 'opponents-match-win-rate':
        return {
          measure: overOpponents(matchWinRate(tiebreaker.rate), tiebreaker.withNoOpponents),
          lowerIsBetter: false,
        }
      case 'opponents-opponents-match-win-rate': {
        const opponents = overOpponents(matchWinRate(tiebreaker.rate), tiebreaker.withNoOpponents)
        return {
          measure: overOpponents(opponents, tiebreaker.withNoOpponents),
          lowerIsBetter: false,
        }
      }
      case 'game-win-rate':
        return {
          measure: gameWinRate(tiebreaker.win, tiebreaker.draw, tiebreaker.floor),
          lowerIsBetter: false,
        }
      case 'opponents-game-win-rate':
        return {
          measure: overOpponents(
            gameWinRate(tiebreaker.win, tiebreaker.draw, tiebreaker.floor),
            tiebreaker.withNoOpponents,
          ),
          lowerIsBetter: false,
        }
      case 'loss-rate':
        return { measure: lossRate, lowerIsBetter: true }
      case 'opponents-loss-rate':
        return { measure: overOpponents(lossRate, tiebreaker.withNoOpponents), lowerIsBetter: true }
      case 'wins':
        return {
          measure: whole(
            (tally) =>
              tally.matchWins +
              (tiebreaker.includeByes ? tally.assignedByes + tally.awardedByes : 0),
          ),
          lowerIsBetter: false,
        }
      case 'game-wins':
        return {
          measure: whole(
            (tally) =>
              tally.matchGamesWon +
              (tiebreaker.includeByes
                ? (tally.assignedByes + tally.awardedByes) * configuration.bye.games[0]
                : 0),
          ),
          lowerIsBetter: false,
        }
      case 'extra-score-total':
        return {
          measure: whole((tally) => {
            const scored = tally.scoredFor.get(tiebreaker.extraScore) ?? 0
            const conceded = tally.scoredAgainst.get(tiebreaker.extraScore) ?? 0
            return tiebreaker.of === 'for'
              ? scored
              : tiebreaker.of === 'against'
                ? conceded
                : scored - conceded
          }),
          // What was scored against an Entrant counts against them.
          lowerIsBetter: tiebreaker.of === 'against',
        }
      case 'later-losses':
        return {
          measure: whole((tally) =>
            tally.lostRounds.reduce((sum, round) => sum + round * round, 0),
          ),
          lowerIsBetter: false,
        }
      case 'head-to-head':
      case 'random':
        return undefined
    }
  })
}
