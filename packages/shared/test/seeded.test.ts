import { createHash } from 'node:crypto'

import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import { distinctPositions, seededUint32 } from '../src/index.ts'
import { assignDistinct } from '../src/seeded.ts'

// The documented encoding, rebuilt here with Node's own SHA-256 as an independent check.
function reference(parts: readonly string[]): number {
  const hash = createHash('sha256')
  for (const part of parts) {
    const bytes = Buffer.from(part, 'utf8')
    const length = Buffer.alloc(4)
    length.writeUInt32BE(bytes.length)
    hash.update(length)
    hash.update(bytes)
  }
  return hash.digest().readUInt32BE(0)
}

describe('seededUint32', () => {
  test('gives the published SHA-256 value for empty input', () => {
    expect(seededUint32([])).toBe(0xe3b0c442)
  })

  test.each([
    [['']],
    [['a', 'b', 'c']],
    [['seed', '4', 'ann']],
    [['naïve', '日本語', '🎲 dice']],
    [['x'.repeat(51)]],
    [['x'.repeat(52)]],
    [['x'.repeat(60)]],
    [['x'.repeat(200)]],
  ])('matches an independent SHA-256 for %j', (parts) => {
    expect(seededUint32(parts)).toBe(reference(parts))
  })

  test('matches an independent SHA-256 for any strings', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'grapheme' }), { maxLength: 6 }), (parts) => {
        expect(seededUint32(parts)).toBe(reference(parts))
      }),
    )
  })

  test('keeps the boundaries between parts', () => {
    expect(seededUint32(['ab', 'c'])).not.toBe(seededUint32(['a', 'bc']))
  })
})

describe('distinctPositions', () => {
  test('never depends on the order ids arrive in', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string(), { maxLength: 40 }),
        fc.string(),
        fc.infiniteStream(fc.nat()),
        (ids, seed, noise) => {
          const shuffled = ids
            .map((id) => ({ id, key: noise.next().value }))
            .sort((a, b) => a.key - b.key)
            .map((entry) => entry.id)
          expect(distinctPositions(['t', seed], shuffled, 20)).toEqual(
            distinctPositions(['t', seed], ids, 20),
          )
        },
      ),
    )
  })

  test('gives every id its own position', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string(), { maxLength: 60 }), (ids) => {
        const positions = distinctPositions(['t'], ids, 20)
        expect(positions.size).toBe(ids.length)
        expect(new Set(positions.values()).size).toBe(ids.length)
      }),
    )
  })

  test('keeps every position inside the width asked for', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string(), { maxLength: 30 }),
        fc.integer({ min: 7, max: 32 }),
        (ids, bits) => {
          const positions = [...distinctPositions(['t'], ids, bits).values()]
          expect(
            positions.every(
              (position) => Number.isInteger(position) && position >= 0 && position < 2 ** bits,
            ),
          ).toBe(true)
          expect(new Set(positions).size).toBe(ids.length)
        },
      ),
    )
  })

  test('stays distinct when the width is tight', () => {
    const ids = Array.from({ length: 64 }, (_, at) => `id-${at}`)
    expect(new Set(distinctPositions(['t'], ids, 8).values()).size).toBe(64)
  })

  test('refuses when there is not enough room', () => {
    const ids = Array.from({ length: 65 }, (_, at) => `id-${at}`)
    expect(() => distinctPositions(['t'], ids, 8)).toThrow(/too many/)
    expect(() => distinctPositions(['t'], [], 0)).toThrow(/bits/)
  })

  test('changes with the scope', () => {
    const ids = ['ann', 'ben', 'cal']
    expect(distinctPositions(['s', '1'], ids, 20)).not.toEqual(
      distinctPositions(['s', '2'], ids, 20),
    )
  })

  test('resolves clashes the same way whatever the order', () => {
    // A deliberately tiny range, so almost every id clashes.
    const crowded = (id: string, attempt: number): number => (id.length + attempt) % 7
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ maxLength: 3 }), { maxLength: 7 }),
        fc.infiniteStream(fc.nat()),
        (ids, noise) => {
          const shuffled = ids
            .map((id) => ({ id, key: noise.next().value }))
            .sort((a, b) => a.key - b.key)
            .map((entry) => entry.id)
          const positions = assignDistinct(ids, crowded)
          expect(new Set(positions.values()).size).toBe(ids.length)
          expect(assignDistinct(shuffled, crowded)).toEqual(positions)
        },
      ),
    )
  })
})
