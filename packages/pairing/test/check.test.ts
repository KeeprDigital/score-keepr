import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import { checkPairings, type CheckInput, type CheckSuccess, type RoundInput } from '../src/index.ts'
import { round } from './support/arbitraries.ts'
import { mustPair } from './support/run.ts'

/** Four Entrants level on Score. ann has faced ben, cal has faced dee. */
const fourEntrants = (): RoundInput => ({
  system: 'swiss',
  entrants: [
    { id: 'ann', score: 3, opponents: ['ben'], byes: 0 },
    { id: 'ben', score: 3, opponents: ['ann'], byes: 0 },
    { id: 'cal', score: 0, opponents: ['dee'], byes: 0 },
    { id: 'dee', score: 0, opponents: ['cal'], byes: 0 },
  ],
  configuration: [{ type: 'no-rematch' }, { type: 'pair-close-in-score' }],
  randomSeed: 'seed',
  round: 2,
})

function mustCheck(input: CheckInput): CheckSuccess {
  const result = checkPairings(input)
  if (!result.ok) throw new Error(`Expected a check, got errors: ${JSON.stringify(result.errors)}`)
  return result
}

const clean = { missing: [], repeated: [], unknown: [], byesExpected: 0 }

describe('checkPairings', () => {
  test('flags a rematch the organiser has made, and never refuses', () => {
    const result = mustCheck({
      ...fourEntrants(),
      pairings: [
        ['ben', 'ann'],
        ['cal', 'dee'],
      ],
      byes: [],
    })
    expect(result.coverage).toEqual(clean)
    expect(result.violations).toEqual([
      { constraint: { type: 'no-rematch' }, entrants: ['ben', 'ann'] },
      { constraint: { type: 'no-rematch' }, entrants: ['cal', 'dee'] },
    ])
  })

  test('notes each Pair-down with its gap, higher Score first, in the order given', () => {
    const result = mustCheck({
      ...fourEntrants(),
      pairings: [
        ['dee', 'ben'],
        ['ann', 'cal'],
      ],
      byes: [],
    })
    expect(result.pairings).toEqual([
      { entrants: ['ben', 'dee'], scoreGap: 3 },
      { entrants: ['ann', 'cal'], scoreGap: 3 },
    ])
    expect(result.violations).toEqual([])
  })

  test('leaves the comparison out unless asked', () => {
    const result = mustCheck({
      ...fourEntrants(),
      pairings: [
        ['ann', 'cal'],
        ['ben', 'dee'],
      ],
      byes: [],
    })
    expect(result.comparison).toBeUndefined()
  })

  test('compares each Constraint with the best possible', () => {
    const result = mustCheck({
      ...fourEntrants(),
      pairings: [
        ['ann', 'ben'],
        ['cal', 'dee'],
      ],
      byes: [],
      compare: true,
    })
    // The best avoids both rematches by pairing across the Score gap: 3 squared, twice.
    expect(result.comparison).toEqual({
      asGoodAsBest: false,
      provenBest: true,
      levels: [
        { constraint: { type: 'no-rematch' }, given: 2, best: 0 },
        { constraint: { type: 'pair-close-in-score' }, given: 0, best: 18 },
      ],
    })
  })

  test('says a hand-made set is as good as the best when it is, whatever Shuffle Positions would pick', () => {
    for (const pairings of [
      [
        ['ann', 'cal'],
        ['ben', 'dee'],
      ],
      [
        ['ann', 'dee'],
        ['ben', 'cal'],
      ],
    ] as [string, string][][]) {
      const result = mustCheck({ ...fourEntrants(), pairings, byes: [], compare: true })
      expect(result.comparison?.asGoodAsBest).toBe(true)
    }
  })

  test('shows both levels of a Pair-down choice', () => {
    const input: RoundInput = {
      ...fourEntrants(),
      entrants: fourEntrants().entrants.map((entrant, at) => ({
        ...entrant,
        opponents: [],
        rank: at + 1,
      })),
      configuration: [{ type: 'pair-down-choice', from: 'highest', opponent: 'highest' }],
    }
    const result = mustCheck({
      ...input,
      pairings: [
        ['ben', 'dee'],
        ['ann', 'cal'],
      ],
      byes: [],
      compare: true,
    })
    expect(result.comparison?.levels).toEqual([
      { constraint: input.configuration[0], part: 'from', given: 1, best: 0 },
      { constraint: input.configuration[0], part: 'opponent', given: 1, best: 0 },
    ])
  })

  test('reports who is missing, repeated or unknown, and how many Byes are needed', () => {
    const result = mustCheck({
      ...fourEntrants(),
      entrants: [...fourEntrants().entrants, { id: 'eve', score: 0, opponents: [], byes: 1 }],
      configuration: [{ type: 'bye-cap', max: 1 }],
      pairings: [
        ['ann', 'ben'],
        ['ann', 'zed'],
      ],
      byes: ['eve', 'yan'],
      compare: true,
    })
    expect(result.coverage).toEqual({
      missing: ['cal', 'dee'],
      repeated: ['ann'],
      unknown: ['yan', 'zed'],
      byesExpected: 1,
    })
    // Still reports what it can: the one sound Pairing, and the Bye over the cap.
    expect(result.pairings).toEqual([{ entrants: ['ann', 'ben'], scoreGap: 0 }])
    expect(result.violations).toEqual([
      { constraint: { type: 'bye-cap', max: 1 }, entrants: ['eve'] },
    ])
    // A set with gaps cannot be compared with a complete one.
    expect(result.comparison).toBeUndefined()
  })

  test('accepts a half-finished set', () => {
    const result = mustCheck({
      ...fourEntrants(),
      pairings: [['ann', 'cal']],
      byes: [],
      compare: true,
    })
    expect(result.coverage).toEqual({ ...clean, missing: ['ben', 'dee'] })
    expect(result.comparison).toBeUndefined()
  })

  test('counts a Bye too many or too few as a coverage problem', () => {
    const three: RoundInput = {
      ...fourEntrants(),
      entrants: fourEntrants()
        .entrants.slice(0, 3)
        .map((e) => ({ ...e, opponents: [] })),
    }
    const noBye = mustCheck({ ...three, pairings: [['ann', 'ben']], byes: [], compare: true })
    expect(noBye.coverage).toEqual({ missing: ['cal'], repeated: [], unknown: [], byesExpected: 1 })
    const allByes = mustCheck({
      ...three,
      pairings: [],
      byes: ['ann', 'ben', 'cal'],
      compare: true,
    })
    expect(allByes.coverage.byesExpected).toBe(1)
    expect(allByes.comparison).toBeUndefined()
  })

  test.each<[string, (input: Record<string, unknown>) => void, string]>([
    ['an invalid round', (i) => (i['round'] = 0), 'invalid-input'],
    ['Pairings that are not a list', (i) => (i['pairings'] = 'ann-ben'), 'invalid-input'],
    ['a Pairing of three', (i) => (i['pairings'] = [['ann', 'ben', 'cal']]), 'invalid-input'],
    ['missing Byes', (i) => delete i['byes'], 'invalid-input'],
    ['a compare flag that is not true or false', (i) => (i['compare'] = 'yes'), 'invalid-input'],
    ['an unknown field', (i) => (i['tables'] = []), 'unknown-field'],
  ])('rejects %s', (_, change, code) => {
    const input = { ...fourEntrants(), pairings: [], byes: [] } as unknown as Record<
      string,
      unknown
    >
    change(input)
    const result = checkPairings(input as unknown as CheckInput)
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toContain(code)
  })

  test("checking the engine's own answer finds nothing wrong and nothing better", () => {
    fc.assert(
      fc.property(round(), (input) => {
        const paired = mustPair(input)
        const checked = mustCheck({
          ...input,
          pairings: paired.pairings.map((pairing) => pairing.entrants),
          byes: paired.bye === null ? [] : [paired.bye],
          compare: true,
        })
        expect(checked.coverage).toEqual({
          missing: [],
          repeated: [],
          unknown: [],
          byesExpected: input.entrants.length % 2,
        })
        expect(checked.pairings).toEqual(paired.pairings)
        expect(checked.violations).toEqual(paired.violations)
        expect(checked.comparison).toMatchObject({ asGoodAsBest: true, provenBest: true })
      }),
      { numRuns: 300 },
    )
  })

  test('no hand-made set ever beats the best on the first Constraint that differs', () => {
    fc.assert(
      fc.property(
        round({ maxEntrants: 6 }).chain((input) =>
          fc.tuple(
            fc.constant(input),
            fc.shuffledSubarray(
              input.entrants.map((e) => e.id),
              { minLength: input.entrants.length },
            ),
          ),
        ),
        ([input, order]) => {
          const pairings: [string, string][] = []
          for (let at = 0; at + 1 < order.length; at += 2)
            pairings.push([order[at] as string, order[at + 1] as string])
          const byes = order.length % 2 === 1 ? [order.at(-1) as string] : []
          const { comparison } = mustCheck({ ...input, pairings, byes, compare: true })
          const firstDifference = comparison?.levels.find((level) => level.given !== level.best)
          expect(
            firstDifference === undefined || firstDifference.given > firstDifference.best,
          ).toBe(true)
          expect(comparison?.asGoodAsBest).toBe(firstDifference === undefined)
        },
      ),
      { numRuns: 300 },
    )
  })

  test('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(typeof checkPairings(input as CheckInput).ok).toBe('boolean')
      }),
      { numRuns: 1000 },
    )
  })
})
