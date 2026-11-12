import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import type { Constraint, RoundInput, RoundSuccess } from '../src/index.ts'
import { reordered, round } from './support/arbitraries.ts'
import { broken, compareInOrder, everyArrangement, type Arrangement } from './support/reference.ts'
import { mustPair } from './support/run.ts'

const RUNS = { numRuns: 300 }

const arrangementOf = (result: RoundSuccess): Arrangement => ({
  pairs: result.pairings.map((pairing) => pairing.entrants),
  bye: result.bye,
})
const scoreOf = (input: RoundInput, id: string): number =>
  input.entrants.find((entrant) => entrant.id === id)?.score ?? Number.NaN
const rankOf = (input: RoundInput, id: string): number =>
  input.entrants.find((entrant) => entrant.id === id)?.rank ?? Number.NaN
/** One name for a Pairing whichever way round it is written. */
const pairName = (a: string | undefined, b: string | undefined): string =>
  (a ?? '') < (b ?? '') ? `${a} v ${b}` : `${b} v ${a}`
const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

describe('rules that hold for every Swiss round', () => {
  test('every Entrant appears exactly once', () => {
    fc.assert(
      fc.property(round(), (input) => {
        const result = mustPair(input)
        const seen = [
          ...result.pairings.flatMap((pairing) => pairing.entrants),
          ...(result.bye === null ? [] : [result.bye]),
        ]
        expect([...seen].sort((a, b) => a.localeCompare(b))).toEqual(
          input.entrants.map((entrant) => entrant.id),
        )
      }),
      RUNS,
    )
  })

  test('there is a Bye exactly when the count is odd', () => {
    fc.assert(
      fc.property(round(), (input) => {
        expect(mustPair(input).bye !== null).toBe(input.entrants.length % 2 === 1)
      }),
      RUNS,
    )
  })

  test('each Pairing lists the higher Score first, with the true gap', () => {
    fc.assert(
      fc.property(round(), (input) => {
        for (const { entrants, scoreGap } of mustPair(input).pairings) {
          expect(scoreGap).toBe(scoreOf(input, entrants[0]) - scoreOf(input, entrants[1]))
          expect(scoreGap).toBeGreaterThanOrEqual(0)
        }
      }),
      RUNS,
    )
  })

  test('Pairings come highest Score first', () => {
    fc.assert(
      fc.property(round(), (input) => {
        const tops = mustPair(input).pairings.map((pairing) => scoreOf(input, pairing.entrants[0]))
        expect(tops).toEqual([...tops].sort((a, b) => b - a))
      }),
      RUNS,
    )
  })

  test('the round number is echoed and small fields are proven best', () => {
    fc.assert(
      fc.property(round(), (input) => {
        expect(mustPair(input)).toMatchObject({ round: input.round, provenBest: true })
      }),
      RUNS,
    )
  })

  test('the same input always gives the same output', () => {
    fc.assert(
      fc.property(round(), (input) => {
        expect(mustPair(structuredClone(input))).toEqual(mustPair(input))
      }),
      RUNS,
    )
  })

  test('the order anything arrives in never matters', () => {
    fc.assert(
      fc.property(
        round().chain((input) => fc.tuple(fc.constant(input), reordered(input))),
        ([input, shuffled]) => {
          expect(mustPair(shuffled)).toEqual(mustPair(input))
        },
      ),
      RUNS,
    )
  })

  test('the input is left untouched', () => {
    fc.assert(
      fc.property(round(), (input) => {
        const before = structuredClone(input)
        mustPair(input)
        expect(input).toEqual(before)
      }),
      RUNS,
    )
  })

  test('the Violations reported are exactly the ones that happened', () => {
    fc.assert(
      fc.property(round(), (input) => {
        const result = mustPair(input)
        const expected = input.configuration.flatMap((constraint) =>
          (broken(constraint, input, arrangementOf(result)) ?? []).map((entrants) => ({
            constraint,
            entrants,
          })),
        )
        expect(result.violations).toEqual(expected)
      }),
      RUNS,
    )
  })

  test('yes-or-no Constraints are broken as little as possible, in strict priority order', () => {
    fc.assert(
      fc.property(round({ maxEntrants: 7 }), (input) => {
        // Only the yes-or-no Constraints ahead of the first measured one can be checked this way.
        const leading: Constraint[] = []
        for (const constraint of input.configuration) {
          if (broken(constraint, input, { pairs: [], bye: null }) === undefined) break
          leading.push(constraint)
        }
        const counts = (arrangement: Arrangement): number[] =>
          leading.map((constraint) => (broken(constraint, input, arrangement) ?? []).length)

        const ids = input.entrants.map((entrant) => entrant.id)
        const least = everyArrangement(ids)
          .map(counts)
          .reduce((best, each) => (compareInOrder(each, best) < 0 ? each : best))
        expect(counts(arrangementOf(mustPair(input)))).toEqual(least)
      }),
      RUNS,
    )
  })

  test('changing the Random Seed never changes how many Violations there are', () => {
    fc.assert(
      fc.property(round(), fc.string({ maxLength: 4 }), (input, otherSeed) => {
        const tally = (result: RoundSuccess): string[] =>
          result.violations.map((violation) => violation.constraint.type)
        const first = input.configuration[0]
        fc.pre(first !== undefined && broken(first, input, { pairs: [], bye: null }) !== undefined)
        const count = (result: RoundSuccess): number =>
          tally(result).filter((type) => type === first?.type).length
        expect(count(mustPair({ ...input, randomSeed: otherSeed }))).toBe(count(mustPair(input)))
      }),
      RUNS,
    )
  })
})

describe('what each measured Constraint achieves when it comes first', () => {
  const alone = (constraint: Constraint, options = {}): fc.Arbitrary<RoundInput> =>
    round({ configuration: [constraint], ...options })

  test('pair close in Score: the squared gaps add up to the least possible', () => {
    fc.assert(
      fc.property(alone({ type: 'pair-close-in-score' }, { maxEntrants: 7 }), (input) => {
        const squares = (arrangement: Arrangement): number =>
          sum(arrangement.pairs.map(([a, b]) => (scoreOf(input, a) - scoreOf(input, b)) ** 2))
        const least = Math.min(
          ...everyArrangement(input.entrants.map((entrant) => entrant.id)).map(squares),
        )
        expect(squares(arrangementOf(mustPair(input)))).toBe(least)
      }),
      RUNS,
    )
  })

  test('bye to lowest Score: nobody has a lower Score than the Bye', () => {
    fc.assert(
      fc.property(alone({ type: 'bye-to-lowest-score' }), (input) => {
        const { bye } = mustPair(input)
        fc.pre(bye !== null)
        expect(scoreOf(input, bye as string)).toBe(
          Math.min(...input.entrants.map((entrant) => entrant.score)),
        )
      }),
      RUNS,
    )
  })

  test('bye to lowest Rank: nobody has a worse Rank than the Bye', () => {
    fc.assert(
      fc.property(alone({ type: 'bye-to-lowest-rank' }, { ranked: true }), (input) => {
        const { bye } = mustPair(input)
        fc.pre(bye !== null)
        expect(rankOf(input, bye as string)).toBe(
          Math.max(...input.entrants.map((entrant) => entrant.rank as number)),
        )
      }),
      RUNS,
    )
  })

  test('a Bye cap ahead of bye to lowest Score: the Bye goes to the lowest Score still under the cap', () => {
    const configuration: Constraint[] = [
      { type: 'bye-cap', max: 1 },
      { type: 'bye-to-lowest-score' },
    ]
    fc.assert(
      fc.property(round({ configuration }), (input) => {
        const { bye } = mustPair(input)
        const eligible = input.entrants.filter((entrant) => entrant.byes < 1)
        fc.pre(bye !== null && eligible.length > 0)
        expect(scoreOf(input, bye as string)).toBe(
          Math.min(...eligible.map((entrant) => entrant.score)),
        )
      }),
      RUNS,
    )
  })

  test('pair adjacent by Rank: with an even count and no ties, it is 1 v 2, 3 v 4 and so on', () => {
    fc.assert(
      fc.property(
        alone({ type: 'pair-adjacent-by-rank' }, { ranked: true, distinctRanks: true }),
        (input) => {
          fc.pre(input.entrants.length % 2 === 0)
          const inRankOrder = [...input.entrants]
            .sort((a, b) => (a.rank as number) - (b.rank as number))
            .map((entrant) => entrant.id)
          const expected = new Set<string>()
          for (let at = 0; at < inRankOrder.length; at += 2)
            expected.add(pairName(inRankOrder[at], inRankOrder[at + 1]))
          const actual = new Set(
            mustPair(input).pairings.map((pairing) =>
              pairName(pairing.entrants[0], pairing.entrants[1]),
            ),
          )
          expect(actual).toEqual(expected)
        },
      ),
      RUNS,
    )
  })

  test('pair top vs bottom by Rank: with an even count and no ties, it folds', () => {
    fc.assert(
      fc.property(
        alone({ type: 'pair-top-vs-bottom-by-rank' }, { ranked: true, distinctRanks: true }),
        (input) => {
          fc.pre(input.entrants.length % 2 === 0)
          const inRankOrder = [...input.entrants]
            .sort((a, b) => (a.rank as number) - (b.rank as number))
            .map((entrant) => entrant.id)
          const expected = new Set<string>()
          for (let at = 0; at < inRankOrder.length / 2; at++) {
            expected.add(pairName(inRankOrder[at], inRankOrder[inRankOrder.length - 1 - at]))
          }
          const actual = new Set(
            mustPair(input).pairings.map((pairing) =>
              pairName(pairing.entrants[0], pairing.entrants[1]),
            ),
          )
          expect(actual).toEqual(expected)
        },
      ),
      RUNS,
    )
  })

  test('prefer same Group Label: as few Pairings as possible cross between clubs', () => {
    fc.assert(
      fc.property(
        alone({ type: 'prefer-same-group-label', kind: 'club' }, { maxEntrants: 7 }),
        (input) => {
          const club = (id: string): string | undefined =>
            input.entrants.find((entrant) => entrant.id === id)?.groups?.['club']
          const crossings = (arrangement: Arrangement): number =>
            arrangement.pairs.filter(
              ([a, b]) => club(a) !== undefined && club(b) !== undefined && club(a) !== club(b),
            ).length
          const least = Math.min(
            ...everyArrangement(input.entrants.map((entrant) => entrant.id)).map(crossings),
          )
          expect(crossings(arrangementOf(mustPair(input)))).toBe(least)
        },
      ),
      RUNS,
    )
  })
})

describe('Shuffle Positions', () => {
  const field = (size: number, seed: string): RoundInput => ({
    system: 'swiss',
    entrants: ['ann', 'ben', 'cal', 'dee', 'eve']
      .slice(0, size)
      .map((id) => ({ id, score: 0, opponents: [], byes: 0 })),
    configuration: [],
    randomSeed: seed,
    round: 1,
  })

  test('with nothing else in play, each way of pairing four Entrants comes up about a third of the time', () => {
    const tally = new Map<string, number>()
    for (let seed = 0; seed < 3000; seed++) {
      const partner = mustPair(field(4, `seed-${seed}`)).pairings.find((pairing) =>
        pairing.entrants.includes('ann'),
      )
      const other = partner?.entrants.find((id) => id !== 'ann') as string
      tally.set(other, (tally.get(other) ?? 0) + 1)
    }
    expect(new Set(tally.keys())).toEqual(new Set(['ben', 'cal', 'dee']))
    for (const count of tally.values()) {
      expect(count).toBeGreaterThan(900)
      expect(count).toBeLessThan(1100)
    }
  })

  test('with nothing else in play, each of three Entrants gets the Bye about a third of the time', () => {
    const tally = new Map<string, number>()
    for (let seed = 0; seed < 3000; seed++) {
      const bye = mustPair(field(3, `seed-${seed}`)).bye as string
      tally.set(bye, (tally.get(bye) ?? 0) + 1)
    }
    for (const count of tally.values()) {
      expect(count).toBeGreaterThan(900)
      expect(count).toBeLessThan(1100)
    }
  })

  test('a different round number gives different Pairings for the same seed', () => {
    const partners = new Set<string>()
    for (let roundNumber = 1; roundNumber <= 12; roundNumber++) {
      const result = mustPair({ ...field(4, 'fixed'), round: roundNumber })
      partners.add(result.pairings.map((pairing) => pairing.entrants.join('-')).join(' '))
    }
    expect(partners.size).toBeGreaterThan(1)
  })
})
