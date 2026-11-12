import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import {
  buildStructure,
  type Slot,
  type StructureInput,
  type StructureSuccess,
} from '../src/index.ts'

const NAMES = 'abcdefghijklmnopqrstuvwxyz'.split('')

/** Entrants named a, b, c... with Ranks 1, 2, 3... */
const cut = (size: number): StructureInput => ({
  system: 'single-elimination',
  entrants: Array.from({ length: size }, (_, at) => ({ id: NAMES[at] ?? `e${at}`, rank: at + 1 })),
})

function mustBuild(input: StructureInput): StructureSuccess {
  const result = buildStructure(input)
  if (!result.ok)
    throw new Error(`Expected a structure, got errors: ${JSON.stringify(result.errors)}`)
  return result
}

function codes(input: unknown): string[] {
  const result = buildStructure(input as StructureInput)
  return result.ok ? [] : result.errors.map((error) => error.code)
}

const entrant = (id: string): Slot => ({ entrant: id })
const winnerOf = (number: number): Slot => ({ winnerOf: number })

describe('buildStructure', () => {
  test('eight Entrants: 1 v 8 and 4 v 5 feed one semi-final, 2 v 7 and 3 v 6 the other', () => {
    expect(mustBuild(cut(8)).rounds).toEqual([
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
    ])
  })

  test('six Entrants: Ranks 1 and 2 have a Bye and appear directly in round two', () => {
    expect(mustBuild(cut(6)).rounds).toEqual([
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
    ])
  })

  test('five Entrants: two with a Bye can meet each other in round two', () => {
    expect(mustBuild(cut(5)).rounds).toEqual([
      { byes: ['a', 'b', 'c'], pairings: [{ number: 1, slots: [entrant('d'), entrant('e')] }] },
      {
        byes: [],
        pairings: [
          { number: 2, slots: [entrant('a'), winnerOf(1)] },
          { number: 3, slots: [entrant('b'), entrant('c')] },
        ],
      },
      { byes: [], pairings: [{ number: 4, slots: [winnerOf(2), winnerOf(3)] }] },
    ])
  })

  test('two Entrants: just the final', () => {
    expect(mustBuild(cut(2)).rounds).toEqual([
      { byes: [], pairings: [{ number: 1, slots: [entrant('a'), entrant('b')] }] },
    ])
  })

  test('three Entrants: the best Rank waits in the final', () => {
    expect(mustBuild(cut(3)).rounds).toEqual([
      { byes: ['a'], pairings: [{ number: 1, slots: [entrant('b'), entrant('c')] }] },
      { byes: [], pairings: [{ number: 2, slots: [entrant('a'), winnerOf(1)] }] },
    ])
  })

  test('only the order of Ranks matters, so gaps change nothing', () => {
    const gapped: StructureInput = {
      system: 'single-elimination',
      entrants: [
        { id: 'a', rank: 2 },
        { id: 'b', rank: 3 },
        { id: 'c', rank: 9 },
        { id: 'd', rank: 40 },
      ],
    }
    expect(mustBuild(gapped).rounds).toEqual(mustBuild(cut(4)).rounds)
  })

  test('reports the engine version', async () => {
    const { default: manifest } = await import('../package.json', { with: { type: 'json' } })
    expect(mustBuild(cut(2)).engineVersion).toBe(manifest.version)
  })

  test.each<[string, unknown, string]>([
    ['one Entrant', cut(1), 'too-few-entrants'],
    ['no Entrants', cut(0), 'too-few-entrants'],
    [
      'a shared Rank',
      { ...cut(4), entrants: [...cut(3).entrants, { id: 'z', rank: 2 }] },
      'shared-rank',
    ],
    [
      'a missing Rank',
      { ...cut(2), entrants: [{ id: 'a', rank: 1 }, { id: 'b' }] },
      'invalid-input',
    ],
    [
      'a Rank of zero',
      {
        ...cut(2),
        entrants: [
          { id: 'a', rank: 0 },
          { id: 'b', rank: 1 },
        ],
      },
      'invalid-input',
    ],
    [
      'a duplicate id',
      {
        ...cut(2),
        entrants: [
          { id: 'a', rank: 1 },
          { id: 'a', rank: 2 },
        ],
      },
      'duplicate-id',
    ],
    ['the wrong system', { ...cut(2), system: 'swiss' }, 'invalid-input'],
    ['an unknown field', { ...cut(2), randomSeed: 's' }, 'unknown-field'],
    [
      'an unknown field on an Entrant',
      {
        ...cut(2),
        entrants: [
          { id: 'a', rank: 1, score: 3 },
          { id: 'b', rank: 2 },
        ],
      },
      'unknown-field',
    ],
    ['something that is not an object', 'cut', 'invalid-input'],
  ])('rejects %s', (_, input, code) => {
    expect(codes(input)).toContain(code)
  })

  test('names the Entrants who share a Rank', () => {
    const result = buildStructure({
      ...cut(4),
      entrants: [...cut(3).entrants, { id: 'z', rank: 2 }],
    })
    expect(result.ok ? [] : result.errors).toEqual([
      expect.objectContaining({ code: 'shared-rank', entrants: ['b', 'z'] }),
    ])
  })
})

describe('rules that hold for every Single Elimination structure', () => {
  const anyCut = fc.integer({ min: 2, max: 70 }).map(cut)

  /** Plays the structure with the better Rank always winning. Returns who met in each round. */
  function favouritesWin(input: StructureInput, structure: StructureSuccess): number[][][] {
    const rank = new Map(input.entrants.map((each) => [each.id, each.rank]))
    const winner = new Map<number, number>()
    const read = (slot: Slot): number =>
      'entrant' in slot ? (rank.get(slot.entrant) as number) : (winner.get(slot.winnerOf) as number)
    return structure.rounds.map((round) =>
      round.pairings.map((pairing) => {
        const met = pairing.slots.map(read)
        winner.set(pairing.number, Math.min(...met))
        return met
      }),
    )
  }

  test('every Entrant is placed exactly once', () => {
    fc.assert(
      fc.property(anyCut, (input) => {
        const placed = mustBuild(input).rounds.flatMap((round) =>
          round.pairings.flatMap((pairing) =>
            pairing.slots.flatMap((slot) => ('entrant' in slot ? [slot.entrant] : [])),
          ),
        )
        expect([...placed].sort((a, b) => a.localeCompare(b))).toEqual(
          input.entrants.map((each) => each.id).sort((a, b) => a.localeCompare(b)),
        )
      }),
    )
  })

  test('there is one Pairing fewer than there are Entrants, numbered from 1 in order', () => {
    fc.assert(
      fc.property(anyCut, (input) => {
        const numbers = mustBuild(input).rounds.flatMap((round) =>
          round.pairings.map((pairing) => pairing.number),
        )
        expect(numbers).toEqual(
          Array.from({ length: input.entrants.length - 1 }, (_, at) => at + 1),
        )
      }),
    )
  })

  test('every earlier Pairing feeds exactly one later Slot', () => {
    fc.assert(
      fc.property(anyCut, (input) => {
        const fed = mustBuild(input).rounds.flatMap((round) =>
          round.pairings.flatMap((pairing) =>
            pairing.slots.flatMap((slot) => ('winnerOf' in slot ? [slot.winnerOf] : [])),
          ),
        )
        expect([...fed].sort((a, b) => a - b)).toEqual(
          Array.from({ length: input.entrants.length - 2 }, (_, at) => at + 1),
        )
      }),
    )
  })

  test('Byes happen only in round one and go to the best Ranks', () => {
    fc.assert(
      fc.property(anyCut, (input) => {
        const [first, ...later] = mustBuild(input).rounds
        const size = 2 ** Math.ceil(Math.log2(input.entrants.length))
        expect(first?.byes).toEqual(
          input.entrants.slice(0, size - input.entrants.length).map((each) => each.id),
        )
        expect(later.every((round) => round.byes.length === 0)).toBe(true)
      }),
    )
  })

  const cutOfAtLeast = (least: number): fc.Arbitrary<StructureInput> =>
    fc.integer({ min: least, max: 70 }).map(cut)

  test('if the better Rank always wins, the final is 1 v 2', () => {
    fc.assert(
      fc.property(anyCut, (input) => {
        expect(favouritesWin(input, mustBuild(input)).at(-1)).toEqual([[1, 2]])
      }),
    )
  })

  test('if the better Rank always wins, the semi-finals are 1 v 4 and 2 v 3', () => {
    fc.assert(
      fc.property(cutOfAtLeast(4), (input) => {
        expect(favouritesWin(input, mustBuild(input)).at(-2)).toEqual([
          [1, 4],
          [2, 3],
        ])
      }),
    )
  })

  test('if the better Rank always wins, the quarter-finals are 1 v 8, 4 v 5, 2 v 7 and 3 v 6', () => {
    fc.assert(
      fc.property(cutOfAtLeast(8), (input) => {
        expect(favouritesWin(input, mustBuild(input)).at(-3)).toEqual([
          [1, 8],
          [4, 5],
          [2, 7],
          [3, 6],
        ])
      }),
    )
  })

  test('the order Entrants arrive in never matters', () => {
    fc.assert(
      fc.property(
        anyCut.chain((input) =>
          fc.tuple(
            fc.constant(input),
            fc.shuffledSubarray(input.entrants, { minLength: input.entrants.length }),
          ),
        ),
        ([input, shuffled]) => {
          expect(buildStructure({ ...input, entrants: shuffled })).toEqual(buildStructure(input))
        },
      ),
    )
  })

  test('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(typeof buildStructure(input as StructureInput).ok).toBe('boolean')
      }),
      { numRuns: 1000 },
    )
  })
})
