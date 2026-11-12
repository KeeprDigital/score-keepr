import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import { pairRound, type RoundInput } from '../src/index.ts'
import { mustFail } from './support/run.ts'

const valid = (): RoundInput => ({
  system: 'swiss',
  entrants: [
    { id: 'ann', score: 3, opponents: ['ben'], byes: 0 },
    { id: 'ben', score: 0, opponents: ['ann'], byes: 0 },
  ],
  configuration: [{ type: 'no-rematch' }],
  randomSeed: 'seed',
  round: 2,
})

/** Runs the engine on a valid input with one thing changed, and returns the error codes. */
function codes(change: (input: Record<string, unknown>) => void): string[] {
  const input = structuredClone(valid()) as unknown as Record<string, unknown>
  change(input)
  const result = pairRound(input as unknown as RoundInput)
  return result.ok ? [] : result.errors.map((error) => error.code)
}

const entrants = (input: Record<string, unknown>): Record<string, unknown>[] =>
  input['entrants'] as Record<string, unknown>[]

describe('pairRound input checks', () => {
  test('a valid input passes', () => {
    expect(pairRound(valid()).ok).toBe(true)
  })

  test.each<[string, unknown]>([
    ['null', null],
    ['a string', 'swiss'],
    ['an array', []],
    ['a number', 7],
    ['undefined', undefined],
  ])('rejects %s as the whole input', (_, input) => {
    const result = pairRound(input as RoundInput)
    expect(result.ok).toBe(false)
  })

  test.each<[string, (input: Record<string, unknown>) => void, string]>([
    ['wrong system', (i) => (i['system'] = 'round-robin'), 'invalid-input'],
    ['entrants not a list', (i) => (i['entrants'] = {}), 'invalid-input'],
    ['an Entrant that is not an object', (i) => entrants(i).push(7 as never), 'invalid-input'],
    ['an empty id', (i) => (entrants(i)[0]!['id'] = ''), 'invalid-input'],
    ['a numeric id', (i) => (entrants(i)[0]!['id'] = 5), 'invalid-input'],
    ['a fractional Score', (i) => (entrants(i)[0]!['score'] = 1.5), 'invalid-input'],
    ['a Score too large to be exact', (i) => (entrants(i)[0]!['score'] = 2 ** 60), 'invalid-input'],
    ['a text Score', (i) => (entrants(i)[0]!['score'] = '3'), 'invalid-input'],
    ['negative Byes', (i) => (entrants(i)[0]!['byes'] = -1), 'invalid-input'],
    ['missing Byes', (i) => delete entrants(i)[0]!['byes'], 'invalid-input'],
    ['opponents not a list', (i) => (entrants(i)[0]!['opponents'] = 'ben'), 'invalid-input'],
    ['Rank of zero', (i) => (entrants(i)[0]!['rank'] = 0), 'invalid-input'],
    ['Group Labels not text', (i) => (entrants(i)[0]!['groups'] = { club: 4 }), 'invalid-input'],
    ['a missing Random Seed', (i) => delete i['randomSeed'], 'invalid-input'],
    ['round zero', (i) => (i['round'] = 0), 'invalid-input'],
    ['a work limit of zero', (i) => (i['workLimit'] = 0), 'invalid-input'],
    ['a pair to avoid with one id', (i) => (i['avoidPairs'] = [['ann']]), 'invalid-input'],
    [
      'a pair to avoid naming one Entrant twice',
      (i) => (i['avoidPairs'] = [['ann', 'ann']]),
      'invalid-input',
    ],
    ['an unknown field on the input', (i) => (i['seed'] = 'x'), 'unknown-field'],
    ['an unknown field on an Entrant', (i) => (entrants(i)[0]!['name'] = 'Ann'), 'unknown-field'],
    ['a duplicate id', (i) => (entrants(i)[1]!['id'] = 'ann'), 'duplicate-id'],
    [
      'an Entrant facing itself',
      (i) => (entrants(i)[0]!['opponents'] = ['ann', 'ben']),
      'self-opponent',
    ],
    ['one-sided history', (i) => (entrants(i)[1]!['opponents'] = []), 'one-sided-history'],
    ['no Configuration', (i) => delete i['configuration'], 'missing-configuration'],
    ['Configuration not a list', (i) => (i['configuration'] = {}), 'invalid-input'],
    [
      'an unknown Constraint',
      (i) => (i['configuration'] = [{ type: 'be-nice' }]),
      'unknown-constraint',
    ],
    ['a Constraint with no type', (i) => (i['configuration'] = [{}]), 'unknown-constraint'],
    [
      'the same Constraint twice',
      (i) => (i['configuration'] = [{ type: 'no-rematch' }, { type: 'no-rematch' }]),
      'duplicate-constraint',
    ],
    [
      'a Group Label Constraint twice for one kind',
      (i) =>
        (i['configuration'] = [
          { type: 'avoid-same-group-label', kind: 'club' },
          { type: 'avoid-same-group-label', kind: 'club' },
        ]),
      'duplicate-constraint',
    ],
    [
      'a Bye cap with no number',
      (i) => (i['configuration'] = [{ type: 'bye-cap' }]),
      'missing-setting',
    ],
    [
      'a Bye cap of zero',
      (i) => (i['configuration'] = [{ type: 'bye-cap', max: 0 }]),
      'invalid-input',
    ],
    [
      'a Group Label Constraint with no kind',
      (i) => (i['configuration'] = [{ type: 'prefer-same-group-label' }]),
      'missing-setting',
    ],
    [
      'a Pair-down choice with one side missing',
      (i) => (i['configuration'] = [{ type: 'pair-down-choice', from: 'random' }]),
      'missing-setting',
    ],
    [
      'a Pair-down choice with an unknown pick',
      (i) =>
        (i['configuration'] = [{ type: 'pair-down-choice', from: 'best', opponent: 'random' }]),
      'invalid-input',
    ],
    [
      'a setting the Constraint does not have',
      (i) => (i['configuration'] = [{ type: 'no-rematch', strict: true }]),
      'unknown-field',
    ],
    [
      'Rank missing for bye to lowest Rank',
      (i) => (i['configuration'] = [{ type: 'bye-to-lowest-rank' }]),
      'missing-rank',
    ],
    [
      'Rank missing for pair adjacent',
      (i) => (i['configuration'] = [{ type: 'pair-adjacent-by-rank' }]),
      'missing-rank',
    ],
    [
      'Rank missing for top vs bottom',
      (i) => (i['configuration'] = [{ type: 'pair-top-vs-bottom-by-rank' }]),
      'missing-rank',
    ],
    [
      'Rank missing for a ranked Pair-down choice',
      (i) =>
        (i['configuration'] = [{ type: 'pair-down-choice', from: 'lowest', opponent: 'random' }]),
      'missing-rank',
    ],
  ])('rejects %s', (_, change, code) => {
    expect(codes(change)).toContain(code)
  })

  test.each<[string, (input: Record<string, unknown>) => void]>([
    ['an opponent who is not in this call', (i) => (entrants(i)[0]!['opponents'] = ['ben', 'zed'])],
    ['a pair to avoid naming an absent Entrant', (i) => (i['avoidPairs'] = [['ann', 'zed']])],
    [
      'the same opponent listed twice',
      (i) => {
        entrants(i)[0]!['opponents'] = ['ben', 'ben']
      },
    ],
    ['a negative Score', (i) => (entrants(i)[0]!['score'] = -3)],
    [
      'a Group Label Constraint for two kinds',
      (i) =>
        (i['configuration'] = [
          { type: 'avoid-same-group-label', kind: 'club' },
          { type: 'avoid-same-group-label', kind: 'family' },
        ]),
    ],
    [
      'a random Pair-down choice without Ranks',
      (i) =>
        (i['configuration'] = [{ type: 'pair-down-choice', from: 'random', opponent: 'random' }]),
    ],
    [
      'both keep-clean Constraints',
      (i) => (i['configuration'] = [{ type: 'keep-top-clean' }, { type: 'keep-bottom-clean' }]),
    ],
  ])('accepts %s', (_, change) => {
    expect(codes(change)).toEqual([])
  })

  test('reports every problem at once, each with the Entrants involved', () => {
    const input = valid()
    input.entrants.push({ id: 'ann', score: 0, opponents: [], byes: 0 })
    input.entrants.push({ id: 'cal', score: 0, opponents: ['cal'], byes: 0 })
    const errors = mustFail(input)
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-id', entrants: ['ann'] }),
        expect.objectContaining({ code: 'self-opponent', entrants: ['cal'] }),
      ]),
    )
    expect(errors.every((error) => error.message !== '')).toBe(true)
  })

  test('names both Entrants in a one-sided history', () => {
    const input = valid()
    input.entrants[1]!.opponents = []
    expect(mustFail(input)).toEqual([
      expect.objectContaining({ code: 'one-sided-history', entrants: ['ann', 'ben'] }),
    ])
  })

  test('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = pairRound(input as RoundInput)
        expect(typeof result.ok).toBe('boolean')
      }),
      { numRuns: 2000 },
    )
  })

  test('never throws on almost-valid input', () => {
    const almost = fc.record(
      {
        system: fc.constantFrom('swiss', 'other', 7),
        entrants: fc.array(
          fc.record(
            {
              id: fc.oneof(fc.string(), fc.nat()),
              score: fc.oneof(fc.integer(), fc.double(), fc.string()),
              opponents: fc.oneof(fc.array(fc.string()), fc.string()),
              byes: fc.oneof(fc.nat(), fc.integer(), fc.constant(null)),
              rank: fc.oneof(fc.nat(), fc.constant(undefined)),
              groups: fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(3)),
            },
            { requiredKeys: [] },
          ),
          { maxLength: 6 },
        ),
        configuration: fc.oneof(fc.constant([]), fc.array(fc.anything(), { maxLength: 3 })),
        randomSeed: fc.oneof(fc.string(), fc.nat()),
        round: fc.oneof(fc.nat(), fc.double()),
        avoidPairs: fc.anything(),
        workLimit: fc.anything(),
      },
      { requiredKeys: [] },
    )
    fc.assert(
      fc.property(almost, (input) => {
        const result = pairRound(input as unknown as RoundInput)
        expect(result.ok || result.errors.length > 0).toBe(true)
      }),
      { numRuns: 2000 },
    )
  })

  test('a hostile object cannot make it throw', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('boom')
        },
      },
    )
    expect(pairRound(hostile as RoundInput).ok).toBe(false)
  })
})
