import fc from 'fast-check'

import type {
  MatchResult,
  Outcome,
  Result,
  StandingsEntrant,
  StandingsInput,
} from '../../src/index.ts'
import { configurations } from './configurations.ts'

const NAMES = ['ann', 'ben', 'cal', 'dee', 'eve', 'fay', 'gus', 'hal']
/** Game scores the two-game points table lists, as [won by first, won by second, drawn]. */
const LISTED_GAMES: [number, number, number][] = [
  [2, 0, 0],
  [0, 2, 0],
  [1, 1, 0],
  [1, 0, 1],
  [0, 1, 1],
]

export type EventOptions = { config?: string; maxEntrants?: number; maxRounds?: number }

/**
 * A valid event: a few Entrants, a few rounds, each round a random set of matches and solo
 * rounds, with game scores and victory points on every match so any Configuration can read it.
 */
export function event(options: EventOptions = {}): fc.Arbitrary<StandingsInput> {
  const { maxEntrants = 8, maxRounds = 4 } = options
  return fc
    .record({
      size: fc.integer({ min: 0, max: maxEntrants }),
      rounds: fc.integer({ min: 0, max: maxRounds }),
      config:
        options.config === undefined
          ? fc.constantFrom(...Object.keys(configurations))
          : fc.constant(options.config),
    })
    .chain(({ size, rounds, config }) => {
      const ids = NAMES.slice(0, size)
      const configuration = configurations[config] as StandingsInput['configuration']
      const drawsAllowed = configuration.allow.draws
      const twoGame = configuration.points.type === 'by-game-score'

      const match = (round: number, first: string, second: string): fc.Arbitrary<Result> =>
        fc
          .record({
            how: fc.constantFrom<'first' | 'second' | 'draw' | 'both-lose'>(
              'first',
              'first',
              'second',
              'second',
              'draw',
              'both-lose',
            ),
            games: twoGame
              ? fc.constantFrom(...LISTED_GAMES)
              : fc.tuple(
                  fc.integer({ min: 0, max: 2 }),
                  fc.integer({ min: 0, max: 2 }),
                  fc.integer({ min: 0, max: 1 }),
                ),
            vp: fc.tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 })),
          })
          .map(({ how, games, vp }): MatchResult => {
            const outcomes: [Outcome, Outcome] =
              how === 'first' || (how === 'draw' && !drawsAllowed)
                ? ['win', 'loss']
                : how === 'second'
                  ? ['loss', 'win']
                  : how === 'draw'
                    ? ['draw', 'draw']
                    : ['loss', 'loss']
            return { round, entrants: [first, second], outcomes, games, scores: { vp } }
          })

      const round = (number: number): fc.Arbitrary<Result[]> =>
        fc.shuffledSubarray(ids).chain((present) => {
          const results: fc.Arbitrary<Result>[] = []
          for (let at = 0; at + 1 < present.length; at += 2)
            results.push(match(number, present[at] as string, present[at + 1] as string))
          if (present.length % 2 === 1) {
            const alone = present.at(-1) as string
            results.push(
              fc
                .constantFrom<'bye' | 'awarded-bye' | 'loss'>('bye', 'awarded-bye', 'loss')
                .map((kind) => ({ round: number, entrant: alone, kind })),
            )
          }
          return fc.tuple(...results)
        })

      return fc.record({
        entrants: fc.tuple(
          ...ids.map((id) =>
            fc
              .constantFrom<'active' | 'dropped' | 'removed'>(
                'active',
                'active',
                'active',
                'dropped',
                'removed',
              )
              .map((state): StandingsEntrant =>
                state === 'active'
                  ? { id }
                  : state === 'removed'
                    ? { id, status: { type: 'removed' } }
                    : { id, status: { type: 'dropped', afterRound: rounds } },
              ),
          ),
        ),
        results: fc
          .tuple(...Array.from({ length: rounds }, (_, at) => round(at + 1)))
          .map((all) => all.flat()),
        configuration: fc.constant(configuration),
        plannedRounds: fc.constant(Math.max(rounds, 1)),
        randomSeed: fc.string({ maxLength: 4 }),
      })
    })
}

/** The same event with Entrants and Results in a different order, and some matches written the other way round. */
export function reordered(input: StandingsInput): fc.Arbitrary<StandingsInput> {
  const shuffle = <T>(items: readonly T[]): fc.Arbitrary<T[]> =>
    fc.shuffledSubarray([...items], { minLength: items.length })
  return fc
    .record({
      entrants: shuffle(input.entrants),
      results: shuffle(input.results),
      turned: fc.array(fc.boolean(), {
        minLength: input.results.length,
        maxLength: input.results.length,
      }),
    })
    .map(({ entrants, results, turned }) => ({
      ...input,
      entrants,
      results: results.map((result, at): Result => {
        if ('entrant' in result || turned[at] !== true) return result
        const flipped: MatchResult = {
          round: result.round,
          entrants: [result.entrants[1], result.entrants[0]],
          outcomes: [result.outcomes[1], result.outcomes[0]],
        }
        if (result.games !== undefined)
          flipped.games = [result.games[1], result.games[0], result.games[2]]
        if (result.scores !== undefined) {
          flipped.scores = Object.fromEntries(
            Object.entries(result.scores).map(([name, [mine, theirs]]) => [name, [theirs, mine]]),
          )
        }
        return flipped
      }),
    }))
}
