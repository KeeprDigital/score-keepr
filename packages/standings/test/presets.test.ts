import { describe, expect, test } from 'vite-plus/test'

import {
  presets,
  type RateSettings,
  type StandingsConfiguration,
  type Tiebreaker,
} from '../src/index.ts'
import { Event } from './support/build.ts'
import { mustRank, rowOf } from './support/run.ts'

/** The value of one extra Tiebreaker for one Entrant, worked out under a Preset's other settings. */
function measure(
  configuration: StandingsConfiguration,
  tiebreaker: Tiebreaker,
  event: Event,
  id: string,
  plannedRounds?: number,
): string {
  const result = mustRank({
    entrants: event.entrants,
    results: event.results,
    configuration: { ...configuration, tiebreakers: [tiebreaker] },
    ...(plannedRounds === undefined ? {} : { plannedRounds }),
  })
  const exact = rowOf(result, id).tiebreakers[0]?.exact
  return `${exact?.numerator}/${exact?.denominator}`
}

describe('Magic, February 27 2026: the worked examples in Appendix C', () => {
  const magic = presets['magic-2026-02-27'].configuration
  const rate = (magic.tiebreakers[0] as { rate: RateSettings }).rate
  const matchWin: Tiebreaker = { type: 'match-win-rate', rate }
  const gameWin: Tiebreaker = {
    type: 'game-win-rate',
    win: 3,
    draw: 1,
    floor: { numerator: 33, denominator: 100 },
  }

  test('match points: 6-2-0 is 18, and 4-2-2 is 14', () => {
    const event = new Event().record('first', 6, 2, 0).record('second', 4, 2, 2)
    // Match points need no game scores, so the game-based tiebreakers are left out here.
    const result = mustRank({
      entrants: event.entrants,
      results: event.results,
      configuration: { ...magic, tiebreakers: [] },
    })
    expect(rowOf(result, 'first').score).toBe(18)
    expect(rowOf(result, 'second').score).toBe(14)
  })

  test('match-win percentage: 5-2-1 over eight rounds is 16/24', () => {
    expect(measure(magic, matchWin, new Event().record('x', 5, 2, 1), 'x')).toBe('2/3')
  })

  test('match-win percentage: 1-3-0 then withdrawing is 3/12, so 0.33 is used', () => {
    expect(measure(magic, matchWin, new Event().record('x', 1, 3, 0).drop('x'), 'x')).toBe('33/100')
  })

  test('match-win percentage: 3-2-0 including a first-round bye, then withdrawing, is 9/15', () => {
    expect(measure(magic, matchWin, new Event().bye('x').record('x', 2, 2, 0).drop('x'), 'x')).toBe(
      '3/5',
    )
  })

  test('game-win percentage: 2-0, 2-1, 1-2, 2-0 is 21/30', () => {
    const event = new Event().games('x', 2, 0).games('x', 2, 1).games('x', 1, 2).games('x', 2, 0)
    expect(measure(magic, gameWin, event, 'x')).toBe('7/10')
  })

  test('game-win percentage: 1-2, 1-2, 0-2, 1-2 is 9/33, so 0.33 is used', () => {
    const event = new Event().games('x', 1, 2).games('x', 1, 2).games('x', 0, 2).games('x', 1, 2)
    expect(measure(magic, gameWin, event, 'x')).toBe('33/100')
  })

  test('game points: a 2-0-1 win is 7 of a possible 9 for the winner', () => {
    const event = new Event().match('x', 'y', 'beat', [2, 0, 1])
    expect(measure(magic, gameWin, event, 'x')).toBe('7/9')
    // The loser has 1 of 9, which is below the minimum.
    expect(measure(magic, gameWin, event, 'y')).toBe('33/100')
  })

  test('a bye counts as a 2-0 win: 3 match points and 6 of 6 game points', () => {
    const event = new Event().bye('x')
    expect(
      mustRank({ entrants: event.entrants, results: event.results, configuration: magic }).rows[0]
        ?.score,
    ).toBe(3)
    expect(measure(magic, gameWin, event, 'x')).toBe('1/1')
  })

  // The document's two examples of opponents' match-win percentage give the opponents' records.
  // Each opponent's own percentage, by the document's formula:
  //   4-4-0 1/2,  7-1-0 7/8,  1-3-1 4/15 so 33/100,  3-3-1 10/21,
  //   6-2-0 3/4,  5-2-1 2/3,  4-3-1 13/24,  6-1-1 19/24
  const opponents: [string, number, number, number, 'beat' | 'lost-to'][] = [
    ['a', 4, 4, 0, 'beat'],
    ['b', 7, 1, 0, 'lost-to'],
    ['c', 1, 3, 1, 'beat'],
    ['d', 3, 3, 1, 'beat'],
    ['e', 6, 2, 0, 'beat'],
    ['f', 5, 2, 1, 'beat'],
    ['g', 4, 3, 1, 'beat'],
    ['h', 6, 1, 1, 'lost-to'],
  ]
  /** A 6-2-0 player who meets the listed opponents, each of whom ends on the listed record. */
  function sixAndTwo(list: typeof opponents): Event {
    const event = new Event()
    for (const [id, wins, losses, draws, how] of list) {
      event.match('x', id, how, how === 'beat' ? [2, 0, 0] : [0, 2, 0])
      // The opponent's other matches, so their whole record is the one the document gives.
      event.record(id, wins - (how === 'lost-to' ? 1 : 0), losses - (how === 'beat' ? 1 : 0), draws)
    }
    return event
  }
  const opponentsMatchWin = magic.tiebreakers[0] as Tiebreaker

  test('opponents’ match-win percentage: the first example averages eight opponents', () => {
    // (1/2 + 7/8 + 33/100 + 10/21 + 3/4 + 2/3 + 13/24 + 19/24) / 8, which the document rounds to 0.62.
    const value = measure(magic, opponentsMatchWin, sixAndTwo(opponents), 'x')
    expect(value).toBe('20711/33600')
    expect(20711 / 33600).toBeCloseTo(0.62, 2)
  })

  test('opponents’ match-win percentage: the second example ignores the round with a bye', () => {
    // The same without the first opponent, with a bye in that round instead: seven opponents.
    const event = new Event().bye('x')
    const rest = sixAndTwo(opponents.slice(1))
    event.results.push(...rest.results.map((result) => ({ ...result, round: result.round + 1 })))
    const value = measure(
      magic,
      opponentsMatchWin,
      { entrants: rest.entrants, results: event.results } as Event,
      'x',
    )
    expect(value).toBe('18611/29400')
    expect(18611 / 29400).toBeCloseTo(0.63, 2)
  })
})

describe('Pokémon, September 1 2026: the tables in section 5.3.3.1', () => {
  const pokemon = presets['pokemon-2026-09-01'].configuration
  const rate = (pokemon.tiebreakers[0] as { rate: RateSettings }).rate
  const winRate: Tiebreaker = { type: 'match-win-rate', rate }

  test.each([
    [1, '1/4'],
    [3, '3/5'],
    [5, '1/1'],
  ])('completed the tournament: %i wins of 5 rounds', (wins, expected) => {
    expect(measure(pokemon, winRate, new Event().record('x', wins, 5 - wins, 0), 'x', 5)).toBe(
      expected,
    )
  })

  test.each([
    [1, '1/4'],
    [3, '3/5'],
    [5, '3/4'],
  ])('dropped before the end: %i wins of the 5 rounds they took part in', (wins, expected) => {
    expect(
      measure(pokemon, winRate, new Event().record('x', wins, 5 - wins, 0).drop('x'), 'x', 9),
    ).toBe(expected)
  })

  test('a draw earns nothing towards the win percentage', () => {
    expect(measure(pokemon, winRate, new Event().record('x', 2, 1, 2), 'x', 5)).toBe('2/5')
  })

  test('a bye counts as a win for the record, but is neither a win nor a round in the percentage', () => {
    const event = new Event().bye('x').record('x', 2, 2, 0)
    const result = mustRank({
      entrants: event.entrants,
      results: event.results,
      configuration: { ...pokemon, tiebreakers: [winRate] },
      plannedRounds: 5,
    })
    expect(rowOf(result, 'x')).toMatchObject({ score: 9, record: { wins: 3, losses: 2, draws: 0 } })
    // Two wins from the four rounds that count.
    expect(measure(pokemon, winRate, event, 'x', 5)).toBe('1/2')
  })

  test('someone who misses rounds without dropping is still measured over the whole tournament', () => {
    expect(measure(pokemon, winRate, new Event().record('x', 3, 0, 0), 'x', 5)).toBe('3/5')
  })
})
