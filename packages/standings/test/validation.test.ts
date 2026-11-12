import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import {
  computeStandings,
  presets,
  startingConfiguration,
  type StandingsInput,
} from '../src/index.ts'
import { configurations } from './support/configurations.ts'
import { mustFail } from './support/run.ts'

const valid = (): StandingsInput => ({
  entrants: [{ id: 'ann' }, { id: 'ben' }, { id: 'cal' }],
  results: [
    { round: 1, entrants: ['ann', 'ben'], outcomes: ['win', 'loss'] },
    { round: 1, entrant: 'cal', kind: 'bye' },
  ],
  configuration: structuredClone(startingConfiguration),
})

type Loose = Record<string, unknown>

/** Runs the engine on a valid input with one thing changed, and returns the error codes. */
function codes(change: (input: Loose) => void, from: StandingsInput = valid()): string[] {
  const input = structuredClone(from) as unknown as Loose
  change(input)
  const result = computeStandings(input as unknown as StandingsInput)
  return result.ok ? [] : result.errors.map((error) => error.code)
}
const results = (input: Loose): Loose[] => input['results'] as Loose[]
const entrants = (input: Loose): Loose[] => input['entrants'] as Loose[]
const config = (input: Loose): Loose => input['configuration'] as Loose
const tiebreaker = (input: Loose, at = 0): Loose =>
  (config(input)['tiebreakers'] as Loose[])[at] as Loose

describe('computeStandings input checks', () => {
  test('a valid input passes', () => {
    expect(computeStandings(valid()).ok).toBe(true)
  })

  test.each<[string, unknown]>([
    ['null', null],
    ['a string', 'standings'],
    ['an array', []],
    ['undefined', undefined],
  ])('rejects %s as the whole input', (_, input) => {
    expect(computeStandings(input as StandingsInput).ok).toBe(false)
  })

  test.each<[string, (input: Loose) => void, string]>([
    ['an unknown field on the input', (i) => (i['round'] = 3), 'unknown-field'],
    ['entrants not a list', (i) => (i['entrants'] = {}), 'invalid-input'],
    ['an Entrant with no id', (i) => entrants(i).push({}), 'missing-setting'],
    ['an Entrant with an empty id', (i) => (entrants(i)[0]!['id'] = ''), 'invalid-input'],
    ['an unknown field on an Entrant', (i) => (entrants(i)[0]!['score'] = 3), 'unknown-field'],
    ['a duplicate id', (i) => (entrants(i)[1]!['id'] = 'ann'), 'duplicate-id'],
    [
      'a status that is not one of the two kinds',
      (i) => (entrants(i)[0]!['status'] = { type: 'late' }),
      'invalid-input',
    ],
    [
      'a dropped status with no round',
      (i) => (entrants(i)[0]!['status'] = { type: 'dropped' }),
      'invalid-input',
    ],
    ['results not a list', (i) => (i['results'] = 'none'), 'invalid-input'],
    ['a Result that is not an object', (i) => results(i).push(7 as never), 'invalid-input'],
    ['a Result with no round', (i) => delete results(i)[0]!['round'], 'missing-setting'],
    ['round zero', (i) => (results(i)[0]!['round'] = 0), 'invalid-input'],
    [
      'a Result between one Entrant and itself',
      (i) => (results(i)[0]!['entrants'] = ['ann', 'ann']),
      'invalid-input',
    ],
    [
      'a Result with three Entrants',
      (i) => (results(i)[0]!['entrants'] = ['ann', 'ben', 'cal']),
      'invalid-input',
    ],
    [
      'an Outcome that is not a word the engine knows',
      (i) => (results(i)[0]!['outcomes'] = ['won', 'lost']),
      'invalid-input',
    ],
    [
      'game scores that are not three whole numbers',
      (i) => (results(i)[0]!['games'] = [2, 0]),
      'invalid-input',
    ],
    ['negative games', (i) => (results(i)[0]!['games'] = [2, -1, 0]), 'invalid-input'],
    [
      'a named score that is not a pair',
      (i) => (results(i)[0]!['scores'] = { vp: 50 }),
      'invalid-input',
    ],
    ['an unknown field on a Result', (i) => (results(i)[0]!['table'] = 4), 'unknown-field'],
    [
      'a solo Result of an unknown kind',
      (i) => (results(i)[1]!['kind'] = 'forfeit'),
      'invalid-input',
    ],
    [
      'a Result naming someone who is not an Entrant',
      (i) => (results(i)[0]!['entrants'] = ['ann', 'zed']),
      'unknown-entrant',
    ],
    [
      'a solo Result naming someone who is not an Entrant',
      (i) => (results(i)[1]!['entrant'] = 'zed'),
      'unknown-entrant',
    ],
    [
      'two Results for one Entrant in a round',
      (i) => results(i).push({ round: 1, entrant: 'ann', kind: 'bye' }),
      'two-results-in-round',
    ],
    [
      'both sides winning',
      (i) => (results(i)[0]!['outcomes'] = ['win', 'win']),
      'impossible-outcomes',
    ],
    [
      'a draw on one side only',
      (i) => (results(i)[0]!['outcomes'] = ['draw', 'loss']),
      'impossible-outcomes',
    ],
    ['no Configuration', (i) => delete i['configuration'], 'missing-configuration'],
    [
      'a Configuration that is not an object',
      (i) => (i['configuration'] = 'starting'),
      'invalid-input',
    ],
    ['a Configuration with no points method', (i) => delete config(i)['points'], 'missing-setting'],
    ['a Configuration with no Bye setting', (i) => delete config(i)['bye'], 'missing-setting'],
    [
      'a Configuration with no solo-loss setting',
      (i) => delete config(i)['soloLoss'],
      'missing-setting',
    ],
    [
      'a Configuration that does not say whether draws are allowed',
      (i) => delete (config(i)['allow'] as Loose)['draws'],
      'missing-setting',
    ],
    [
      'a Configuration with no Tiebreaker list',
      (i) => delete config(i)['tiebreakers'],
      'missing-setting',
    ],
    [
      'a Configuration that does not say which Byes count',
      (i) => delete config(i)['byesReceived'],
      'missing-setting',
    ],
    ['an unknown field on the Configuration', (i) => (config(i)['name'] = 'mine'), 'unknown-field'],
    [
      'an unknown points method',
      (i) => (config(i)['points'] = { type: 'by-vibes' }),
      'invalid-input',
    ],
    [
      'points by Outcome with no value for a draw',
      (i) => delete (config(i)['points'] as Loose)['draw'],
      'missing-setting',
    ],
    ['fractional points', (i) => ((config(i)['points'] as Loose)['win'] = 2.5), 'invalid-input'],
    [
      'a Bye that does not say whether it counts as played',
      (i) => delete (config(i)['bye'] as Loose)['countsAsPlayed'],
      'missing-setting',
    ],
    [
      'a Bye with a bad game score',
      (i) => ((config(i)['bye'] as Loose)['games'] = [2, 0]),
      'invalid-input',
    ],
    [
      'an unknown way of counting Byes',
      (i) => (config(i)['byesReceived'] = 'all'),
      'invalid-input',
    ],
    [
      'an unknown Tiebreaker',
      (i) => (config(i)['tiebreakers'] = [{ type: 'coin-toss' }]),
      'unknown-tiebreaker',
    ],
    ['a Tiebreaker with no type', (i) => (config(i)['tiebreakers'] = [{}]), 'unknown-tiebreaker'],
    [
      'a win rate with no floor stated',
      (i) => delete (tiebreaker(i)['rate'] as Loose)['floor'],
      'missing-setting',
    ],
    [
      'a win rate with a floor that is not a fraction',
      (i) => ((tiebreaker(i)['rate'] as Loose)['floor'] = 0.33),
      'invalid-input',
    ],
    [
      'a fraction with a zero denominator',
      (i) => ((tiebreaker(i)['rate'] as Loose)['floor'] = { numerator: 1, denominator: 0 }),
      'invalid-input',
    ],
    [
      'a win rate that does not say which rounds count',
      (i) => delete (tiebreaker(i)['rate'] as Loose)['rounds'],
      'missing-setting',
    ],
    [
      'a win rate counting points with no points per round',
      (i) => ((tiebreaker(i)['rate'] as Loose)['counts'] = { type: 'points' }),
      'invalid-input',
    ],
    [
      'an opponents’ rate that does not say what no opponents means',
      (i) => delete tiebreaker(i)['withNoOpponents'],
      'missing-setting',
    ],
    [
      'a setting the Tiebreaker does not have',
      (i) => (tiebreaker(i)['weight'] = 2),
      'unknown-field',
    ],
    [
      'a count that does not say whether Byes are included',
      (i) => (config(i)['tiebreakers'] = [{ type: 'wins' }]),
      'missing-setting',
    ],
    [
      'a score total that does not say which way',
      (i) => (config(i)['tiebreakers'] = [{ type: 'score-total', score: 'vp' }]),
      'missing-setting',
    ],
    [
      'a score total of something unknown',
      (i) => (config(i)['tiebreakers'] = [{ type: 'score-total', score: 'vp', of: 'average' }]),
      'invalid-input',
    ],
  ])('rejects %s', (_, change, code) => {
    expect(codes(change)).toContain(code)
  })

  test.each<[string, StandingsInput, (input: Loose) => void, string]>([
    [
      'a draw when draws are not allowed',
      { ...valid(), configuration: configurations['later-losses'] as never },
      (i) => (results(i)[0]!['outcomes'] = ['draw', 'draw']),
      'disallowed-outcome',
    ],
    [
      'both sides losing when that is not allowed',
      {
        ...valid(),
        configuration: { ...startingConfiguration, allow: { draws: true, doubleLosses: false } },
      },
      (i) => (results(i)[0]!['outcomes'] = ['loss', 'loss']),
      'disallowed-outcome',
    ],
    [
      'no game scores when a Tiebreaker reads them',
      { ...valid(), configuration: presets['magic-2026-02-27'].configuration },
      () => undefined,
      'missing-games',
    ],
    [
      'no game scores when points come from them',
      { ...valid(), configuration: configurations['two-game'] as never },
      () => undefined,
      'missing-games',
    ],
    [
      'a game score the points table does not list',
      { ...valid(), configuration: configurations['two-game'] as never },
      (i) => (results(i)[0]!['games'] = [3, 0, 0]),
      'unlisted-game-score',
    ],
    [
      'a named score missing when a Tiebreaker reads it',
      { ...valid(), configuration: configurations['wargame'] as never },
      () => undefined,
      'missing-score',
    ],
    [
      'a named score missing when points come from it',
      { ...valid(), configuration: configurations['points-are-vp'] as never },
      () => undefined,
      'missing-score',
    ],
    [
      'no planned rounds when a win rate counts them',
      { ...valid(), configuration: presets['pokemon-2026-09-01'].configuration, randomSeed: 's' },
      () => undefined,
      'missing-planned-rounds',
    ],
    [
      'no Random Seed when the random Tiebreaker is used',
      { ...valid(), configuration: presets['pokemon-2026-09-01'].configuration, plannedRounds: 3 },
      () => undefined,
      'missing-random-seed',
    ],
    [
      'bands that do not end open',
      { ...valid(), configuration: configurations['twenty-nil'] as never },
      (i) => ((config(i)['points'] as Loose)['bands'] = [{ upTo: 5, higher: 10, lower: 10 }]),
      'invalid-input',
    ],
    [
      'bands that do not rise',
      { ...valid(), configuration: configurations['twenty-nil'] as never },
      (i) =>
        ((config(i)['points'] as Loose)['bands'] = [
          { upTo: 9, higher: 10, lower: 10 },
          { upTo: 5, higher: 11, lower: 9 },
          { upTo: null, higher: 20, lower: 0 },
        ]),
      'invalid-input',
    ],
    [
      'a first band that splits level scores unevenly',
      { ...valid(), configuration: configurations['twenty-nil'] as never },
      (i) => ((config(i)['points'] as Loose)['bands'] = [{ upTo: null, higher: 11, lower: 9 }]),
      'invalid-input',
    ],
  ])('rejects %s', (_, from, change, code) => {
    expect(codes(change, from)).toContain(code)
  })

  test.each<[string, (input: Loose) => void]>([
    ['an Entrant with no Results', (i) => entrants(i).push({ id: 'dee' })],
    ['a dropped Entrant', (i) => (entrants(i)[1]!['status'] = { type: 'dropped', afterRound: 1 })],
    ['a removed Entrant', (i) => (entrants(i)[1]!['status'] = { type: 'removed' })],
    ['no Results at all', (i) => (i['results'] = [])],
    [
      'no Entrants at all',
      (i) => {
        i['entrants'] = []
        i['results'] = []
      },
    ],
    [
      'game scores and named scores nobody reads',
      (i) => {
        results(i)[0]!['games'] = [2, 1, 0]
        results(i)[0]!['scores'] = { vp: [70, 40] }
      },
    ],
    [
      'planned rounds and a Random Seed nobody reads',
      (i) => {
        i['plannedRounds'] = 5
        i['randomSeed'] = 'unused'
      },
    ],
    ['an empty Tiebreaker list', (i) => (config(i)['tiebreakers'] = [])],
    ['a negative points value', (i) => ((config(i)['points'] as Loose)['loss'] = -1)],
  ])('accepts %s', (_, change) => {
    expect(codes(change)).toEqual([])
  })

  test('reports every problem at once, each with the Entrants involved', () => {
    const input = valid()
    input.results.push({ round: 1, entrants: ['ann', 'zed'], outcomes: ['win', 'win'] })
    expect(mustFail(input)).toEqual([
      expect.objectContaining({ code: 'impossible-outcomes', entrants: ['ann', 'zed'] }),
      expect.objectContaining({ code: 'two-results-in-round', entrants: ['ann'] }),
      expect.objectContaining({ code: 'unknown-entrant', entrants: ['zed'] }),
    ])
  })

  test('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(typeof computeStandings(input as StandingsInput).ok).toBe('boolean')
      }),
      { numRuns: 2000 },
    )
  })

  test('never throws on almost-valid input', () => {
    const almost = fc.record(
      {
        entrants: fc.array(
          fc.record(
            { id: fc.oneof(fc.constantFrom('ann', 'ben', 'cal'), fc.nat()), status: fc.anything() },
            { requiredKeys: [] },
          ),
          { maxLength: 4 },
        ),
        results: fc.array(
          fc.oneof(
            fc.record(
              {
                round: fc.oneof(fc.nat({ max: 3 }), fc.double()),
                entrants: fc.array(fc.constantFrom('ann', 'ben', 'cal', 'zed'), { maxLength: 3 }),
                outcomes: fc.array(fc.constantFrom('win', 'loss', 'draw', 'x'), { maxLength: 3 }),
                games: fc.anything(),
                scores: fc.anything(),
              },
              { requiredKeys: [] },
            ),
            fc.record(
              {
                round: fc.nat({ max: 3 }),
                entrant: fc.constantFrom('ann', 'zed'),
                kind: fc.constantFrom('bye', 'loss', 'x'),
              },
              { requiredKeys: [] },
            ),
          ),
          { maxLength: 5 },
        ),
        configuration: fc.oneof(
          fc.constantFrom(...Object.values(configurations)),
          fc.record(
            {
              points: fc.anything(),
              bye: fc.anything(),
              soloLoss: fc.anything(),
              allow: fc.anything(),
              tiebreakers: fc.array(
                fc.record(
                  {
                    type: fc.constantFrom('wins', 'random', 'match-win-rate', 'x'),
                    rate: fc.anything(),
                  },
                  { requiredKeys: [] },
                ),
                { maxLength: 3 },
              ),
              byesReceived: fc.anything(),
            },
            { requiredKeys: [] },
          ),
        ),
        plannedRounds: fc.anything(),
        randomSeed: fc.anything(),
      },
      { requiredKeys: [] },
    )
    fc.assert(
      fc.property(almost, (input) => {
        const result = computeStandings(input as unknown as StandingsInput)
        expect(result.ok || result.errors.length > 0).toBe(true)
      }),
      { numRuns: 3000 },
    )
  })

  test('a hostile object cannot make it throw', () => {
    const hostile = new Proxy(
      {},
      {
        get: () => {
          throw new Error('boom')
        },
      },
    )
    expect(computeStandings(hostile as StandingsInput).ok).toBe(false)
  })
})
