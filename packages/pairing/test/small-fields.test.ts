import { describe, expect, test } from 'vite-plus/test'

import { pairRound, type PairingEntrant, type RoundInput } from '../src/index.ts'
import { mustPair } from './support/run.ts'

const entrant = (id: string, score = 0): PairingEntrant => ({ id, score, opponents: [], byes: 0 })

const round = (entrants: PairingEntrant[]): RoundInput => ({
  system: 'swiss',
  entrants,
  configuration: [],
  randomSeed: 'seed',
  round: 1,
})

describe('pairRound on the smallest fields', () => {
  test('no Entrants gives an empty result, not an error', () => {
    expect(pairRound(round([]))).toMatchObject({
      ok: true,
      pairings: [],
      bye: null,
      violations: [],
      provenBest: true,
      round: 1,
    })
  })

  test('one Entrant gets the Bye', () => {
    expect(pairRound(round([entrant('ann')]))).toMatchObject({
      ok: true,
      pairings: [],
      bye: 'ann',
    })
  })

  test('two Entrants are paired, higher Score first', () => {
    expect(pairRound(round([entrant('ann', 3), entrant('ben', 6)]))).toMatchObject({
      ok: true,
      pairings: [{ entrants: ['ben', 'ann'], scoreGap: 3 }],
      bye: null,
      provenBest: true,
    })
  })

  test('three Entrants give one Pairing and one Bye', () => {
    const result = mustPair(round([entrant('ann'), entrant('ben'), entrant('cal')]))
    expect(result.pairings).toHaveLength(1)
    const seen = [...result.pairings.flatMap((pairing) => pairing.entrants), result.bye]
    expect(new Set(seen)).toEqual(new Set(['ann', 'ben', 'cal']))
  })

  test('reports the engine version from package.json', async () => {
    const { default: manifest } = await import('../package.json', { with: { type: 'json' } })
    expect(mustPair(round([])).engineVersion).toBe(manifest.version)
  })
})
