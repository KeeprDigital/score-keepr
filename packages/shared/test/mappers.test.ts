import { describe, expect, test } from 'vite-plus/test'

import { pairingEntrantsFrom, topCutFrom, type StandingsRow } from '../src/index.ts'

const row = (
  id: string,
  rank: number,
  score: number,
  more: Partial<StandingsRow> = {},
): StandingsRow => ({
  id,
  rank,
  score,
  record: { wins: 0, losses: 0, draws: 0 },
  tiebreakers: [],
  opponents: [],
  byes: 0,
  assignedByes: 0,
  awardedByes: 0,
  dropped: false,
  ...more,
})

const rows: StandingsRow[] = [
  row('ann', 1, 9, { opponents: ['ben', 'cal', 'dee'] }),
  row('ben', 2, 6, { opponents: ['ann', 'dee', 'cal'] }),
  row('cal', 2, 6, { opponents: ['dee', 'ann', 'ben'] }),
  row('dee', 4, 3, { opponents: ['cal', 'ben', 'ann'], byes: 1, assignedByes: 1 }),
  row('eve', 5, 0, { dropped: true }),
]

describe('pairingEntrantsFrom', () => {
  test('carries Score, opponents faced, Byes received and Rank across for those present', () => {
    expect(pairingEntrantsFrom(rows, { present: ['dee', 'ann', 'ben'] })).toEqual({
      ok: true,
      entrants: [
        { id: 'dee', score: 3, opponents: ['cal', 'ben', 'ann'], byes: 1, rank: 4 },
        { id: 'ann', score: 9, opponents: ['ben', 'cal', 'dee'], byes: 0, rank: 1 },
        { id: 'ben', score: 6, opponents: ['ann', 'dee', 'cal'], byes: 0, rank: 2 },
      ],
    })
  })

  test('adds Group Labels where the Consumer supplies them', () => {
    const result = pairingEntrantsFrom(rows, {
      present: ['ann', 'ben'],
      groups: { ann: { club: 'red' }, zed: { club: 'blue' } },
    })
    expect(result.ok && result.entrants).toEqual([
      {
        id: 'ann',
        score: 9,
        opponents: ['ben', 'cal', 'dee'],
        byes: 0,
        rank: 1,
        groups: { club: 'red' },
      },
      { id: 'ben', score: 6, opponents: ['ann', 'dee', 'cal'], byes: 0, rank: 2 },
    ])
  })

  test('nobody present gives nobody to pair', () => {
    expect(pairingEntrantsFrom(rows, { present: [] })).toEqual({ ok: true, entrants: [] })
  })

  test('does not hand back the lists it was given', () => {
    const result = pairingEntrantsFrom(rows, { present: ['ann'] })
    expect(result.ok && result.entrants[0]?.opponents).not.toBe(rows[0]?.opponents)
  })

  test.each<[string, unknown, unknown, string]>([
    ['someone present who has no row', rows, { present: ['ann', 'zed'] }, 'unknown-entrant'],
    ['someone listed as present twice', rows, { present: ['ann', 'ann'] }, 'duplicate-id'],
    ['no list of who is present', rows, {}, 'invalid-input'],
    ['rows that are not a list', 'rows', { present: [] }, 'invalid-input'],
    [
      'Group Labels that are not text',
      rows,
      { present: ['ann'], groups: { ann: { club: 3 } } },
      'invalid-input',
    ],
  ])('rejects %s', (_, given, options, code) => {
    const result = pairingEntrantsFrom(given as StandingsRow[], options as { present: string[] })
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual([code])
  })
})

describe('topCutFrom', () => {
  const clean = [
    row('ann', 1, 9),
    row('ben', 2, 7),
    row('cal', 3, 6),
    row('dee', 4, 3),
    row('eve', 5, 0),
  ]

  test('takes the best Ranks, however the rows are ordered', () => {
    expect(topCutFrom([...clean].reverse(), 4)).toEqual({
      ok: true,
      entrants: [
        { id: 'ann', rank: 1 },
        { id: 'ben', rank: 2 },
        { id: 'cal', rank: 3 },
        { id: 'dee', rank: 4 },
      ],
    })
  })

  test('keeps gaps in Ranks, so rows filtered by division can be passed as they are', () => {
    const division = [row('ben', 2, 7), row('dee', 4, 3), row('eve', 5, 0)]
    expect(topCutFrom(division, 2)).toEqual({
      ok: true,
      entrants: [
        { id: 'ben', rank: 2 },
        { id: 'dee', rank: 4 },
      ],
    })
  })

  test('refuses to choose when the cut line falls between Entrants who share a Rank', () => {
    const result = topCutFrom(rows, 2)
    expect(result.ok ? [] : result.errors).toEqual([
      expect.objectContaining({ code: 'shared-rank', entrants: ['ben', 'cal'] }),
    ])
  })

  test('refuses when two inside the cut share a Rank, since placement needs an order', () => {
    const result = topCutFrom(rows, 3)
    expect(result.ok ? [] : result.errors).toEqual([
      expect.objectContaining({ code: 'shared-rank', entrants: ['ben', 'cal'] }),
    ])
  })

  test.each<[string, unknown, unknown, string]>([
    ['a cut of one', clean, 1, 'invalid-input'],
    ['a cut that is not a whole number', clean, 2.5, 'invalid-input'],
    ['a cut larger than the field', clean, 8, 'too-few-entrants'],
    ['rows that are not a list', null, 4, 'invalid-input'],
  ])('rejects %s', (_, given, size, code) => {
    const result = topCutFrom(given as StandingsRow[], size as number)
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual([code])
  })
})
