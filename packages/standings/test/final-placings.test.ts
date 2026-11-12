import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import { finalPlacings, type FinalPlacingsInput, type FinalPlacingsSuccess } from '../src/index.ts'

type Rounds = FinalPlacingsInput['rounds']
const entrant = (id: string): { entrant: string } => ({ entrant: id })
const winnerOf = (number: number): { winnerOf: number } => ({ winnerOf: number })

/** A cut of eight: a to h are Ranks 1 to 8. 1 v 8 and 4 v 5 feed one semi-final, 2 v 7 and 3 v 6 the other. */
const cutOfEight: Rounds = [
  {
    byes: [],
    pairings: [
      { number: 1, slots: [entrant('a'), entrant('h')] },
      { number: 2, slots: [entrant('d'), entrant('e')] },
      { number: 3, slots: [entrant('b'), entrant('g')] },
      { number: 4, slots: [entrant('c'), entrant('f')] },
    ],
  },
  {
    byes: [],
    pairings: [
      { number: 5, slots: [winnerOf(1), winnerOf(2)] },
      { number: 6, slots: [winnerOf(3), winnerOf(4)] },
    ],
  },
  { byes: [], pairings: [{ number: 7, slots: [winnerOf(5), winnerOf(6)] }] },
]

/** A cut of six: a and b have a Bye in round one. */
const cutOfSix: Rounds = [
  {
    byes: ['a', 'b'],
    pairings: [
      { number: 1, slots: [entrant('d'), entrant('e')] },
      { number: 2, slots: [entrant('c'), entrant('f')] },
    ],
  },
  {
    byes: [],
    pairings: [
      { number: 3, slots: [entrant('a'), winnerOf(1)] },
      { number: 4, slots: [entrant('b'), winnerOf(2)] },
    ],
  },
  { byes: [], pairings: [{ number: 5, slots: [winnerOf(3), winnerOf(4)] }] },
]

/** Entrants a, b, c... ranked 1, 2, 3... */
const ranked = (count: number): FinalPlacingsInput['entrants'] =>
  Array.from({ length: count }, (_, at) => ({ id: String.fromCharCode(97 + at), rank: at + 1 }))
const won = (...pairs: [number, string][]): FinalPlacingsInput['winners'] =>
  pairs.map(([pairing, winner]) => ({ pairing, winner }))

function mustPlace(input: FinalPlacingsInput): FinalPlacingsSuccess {
  const result = finalPlacings(input)
  if (!result.ok) throw new Error(`Expected placings, got errors: ${JSON.stringify(result.errors)}`)
  return result
}
const summary = (result: FinalPlacingsSuccess): string[] =>
  result.placings.map((each) => `${each.placing ?? (each.stillIn ? 'in' : '?')} ${each.id}`)
const codes = (input: unknown): string[] => {
  const result = finalPlacings(input as FinalPlacingsInput)
  return result.ok ? [] : result.errors.map((error) => error.code)
}

describe('finalPlacings', () => {
  test('a finished cut of eight: by round reached, then by Rank, then everyone outside the cut', () => {
    // Favourites win except that h (Rank 8) beats a in round one and e (5) beats d (4).
    const result = mustPlace({
      entrants: ranked(11),
      rounds: cutOfEight,
      winners: won([1, 'h'], [2, 'e'], [3, 'b'], [4, 'c'], [5, 'e'], [6, 'b'], [7, 'b']),
    })
    expect(summary(result)).toEqual([
      '1 b', // won the final
      '2 e', // lost the final
      '3 c', // lost a semi-final, Rank 3
      '4 h', // lost a semi-final, Rank 8
      '5 a', // lost in round one: Ranks 1, 4, 6, 7
      '6 d',
      '7 f',
      '8 g',
      '9 i', // never in the cut: in Rank order
      '10 j',
      '11 k',
    ])
    expect(result.placings.every((each) => !each.stillIn)).toBe(true)
    expect(result.placings.map((each) => each.inCut)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ])
  })

  test('a cut of six: the Entrants with a Bye can only go out from round two', () => {
    const result = mustPlace({
      entrants: ranked(6),
      rounds: cutOfSix,
      winners: won([1, 'd'], [2, 'f'], [3, 'd'], [4, 'b'], [5, 'd']),
    })
    // Round two losers are a (1) and f (6); round one losers are c (3) and e (5).
    expect(summary(result)).toEqual(['1 d', '2 b', '3 a', '4 f', '5 c', '6 e'])
  })

  test('before anything is played, everyone in the cut is still in and nobody is placed', () => {
    const result = mustPlace({ entrants: ranked(10), rounds: cutOfEight, winners: [] })
    expect(summary(result)).toEqual([
      'in a',
      'in b',
      'in c',
      'in d',
      'in e',
      'in f',
      'in g',
      'in h',
      '9 i',
      '10 j',
    ])
  })

  test('after a whole round, its losers are placed and its winners are still in', () => {
    const result = mustPlace({
      entrants: ranked(8),
      rounds: cutOfEight,
      winners: won([1, 'a'], [2, 'd'], [3, 'b'], [4, 'c']),
    })
    expect(summary(result)).toEqual(['in a', 'in b', 'in c', 'in d', '5 e', '6 f', '7 g', '8 h'])
  })

  test('part-way through a round, its losers are out but cannot be placed yet', () => {
    const result = mustPlace({
      entrants: ranked(8),
      rounds: cutOfEight,
      winners: won([1, 'a'], [3, 'g']),
    })
    // b and h are out. Where they finish among the four round-one losers is not known yet.
    expect(summary(result)).toEqual(['in a', 'in c', 'in d', 'in e', 'in f', 'in g', '? b', '? h'])
    expect(result.placings.find((each) => each.id === 'b')).toEqual({
      id: 'b',
      placing: null,
      stillIn: false,
      inCut: true,
    })
  })

  test('Entrants outside the cut who share a Rank share a placing', () => {
    const entrants = [
      ...ranked(4),
      { id: 'x', rank: 5 },
      { id: 'y', rank: 5 },
      { id: 'z', rank: 7 },
    ]
    const rounds: Rounds = [
      {
        byes: [],
        pairings: [
          { number: 1, slots: [entrant('a'), entrant('d')] },
          { number: 2, slots: [entrant('b'), entrant('c')] },
        ],
      },
      { byes: [], pairings: [{ number: 3, slots: [winnerOf(1), winnerOf(2)] }] },
    ]
    const result = mustPlace({ entrants, rounds, winners: won([1, 'a'], [2, 'b'], [3, 'a']) })
    expect(summary(result)).toEqual(['1 a', '2 b', '3 c', '4 d', '5 x', '5 y', '7 z'])
  })

  test('only the order of Ranks matters', () => {
    const gapped = ranked(8).map((each) => ({ id: each.id, rank: each.rank * 10 }))
    const winners = won([1, 'a'], [2, 'd'], [3, 'b'], [4, 'c'], [5, 'a'], [6, 'b'], [7, 'a'])
    expect(summary(mustPlace({ entrants: gapped, rounds: cutOfEight, winners }))).toEqual(
      summary(mustPlace({ entrants: ranked(8), rounds: cutOfEight, winners })),
    )
  })

  test.each<[string, unknown, string]>([
    ['something that is not an object', 'cut', 'invalid-input'],
    [
      'an unknown field',
      { entrants: ranked(8), rounds: cutOfEight, winners: [], seed: 1 },
      'unknown-field',
    ],
    ['a missing Rank', { entrants: [{ id: 'a' }], rounds: [], winners: [] }, 'invalid-input'],
    [
      'a duplicate id',
      { entrants: [...ranked(8), { id: 'a', rank: 9 }], rounds: cutOfEight, winners: [] },
      'duplicate-id',
    ],
    [
      'someone in the cut who is not an Entrant',
      { entrants: ranked(7), rounds: cutOfEight, winners: [] },
      'unknown-entrant',
    ],
    [
      'two in the cut sharing a Rank',
      {
        entrants: ranked(8).map((each) => ({ ...each, rank: Math.min(each.rank, 7) })),
        rounds: cutOfEight,
        winners: [],
      },
      'shared-rank',
    ],
    [
      'a winner for a Pairing that does not exist',
      { entrants: ranked(8), rounds: cutOfEight, winners: won([9, 'a']) },
      'unknown-pairing',
    ],
    [
      'two winners for one Pairing',
      { entrants: ranked(8), rounds: cutOfEight, winners: won([1, 'a'], [1, 'h']) },
      'duplicate-winner',
    ],
    [
      'a winner who was not in that Pairing',
      { entrants: ranked(8), rounds: cutOfEight, winners: won([1, 'b']) },
      'invalid-winner',
    ],
    [
      'a winner of a Pairing whose Entrants are not known yet',
      { entrants: ranked(8), rounds: cutOfEight, winners: won([5, 'a']) },
      'invalid-winner',
    ],
    [
      'a structure that is not a list of rounds',
      { entrants: ranked(8), rounds: { pairings: [] }, winners: [] },
      'invalid-input',
    ],
    [
      'a Slot that is neither an Entrant nor a winner',
      {
        entrants: ranked(2),
        rounds: [{ byes: [], pairings: [{ number: 1, slots: [entrant('a'), {}] }] }],
        winners: [],
      },
      'invalid-input',
    ],
  ])('rejects %s', (_, input, code) => {
    expect(codes(input)).toContain(code)
  })

  test('the order anything arrives in never matters', () => {
    const input: FinalPlacingsInput = {
      entrants: ranked(11),
      rounds: cutOfEight,
      winners: won([1, 'h'], [2, 'e'], [3, 'b'], [4, 'c'], [5, 'e'], [6, 'b'], [7, 'b']),
    }
    fc.assert(
      fc.property(
        fc.shuffledSubarray(input.entrants, { minLength: input.entrants.length }),
        fc.shuffledSubarray(input.winners, { minLength: input.winners.length }),
        (entrants, winners) => {
          expect(finalPlacings({ ...input, entrants, winners })).toEqual(finalPlacings(input))
        },
      ),
    )
  })

  test('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(typeof finalPlacings(input as FinalPlacingsInput).ok).toBe('boolean')
      }),
      { numRuns: 1000 },
    )
  })
})
