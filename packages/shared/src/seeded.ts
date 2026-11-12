import { sha256First32 } from './sha256.ts'
import { appendUtf8 } from './utf8.ts'

/**
 * A whole number from 0 to 2^32 - 1 that depends only on `parts`. The same parts give the same
 * number on every machine, and nothing about it can be predicted without knowing them all.
 *
 * Each part is written as its length in bytes (four bytes, big-endian) then its UTF-8 bytes, so
 * ['ab', 'c'] and ['a', 'bc'] differ. The number is the first 32 bits of the SHA-256 of that.
 */
export function seededUint32(parts: readonly string[]): number {
  const bytes: number[] = []
  for (const part of parts) {
    const at = bytes.length
    bytes.push(0, 0, 0, 0)
    appendUtf8(bytes, part)
    const length = bytes.length - at - 4
    bytes[at] = (length >>> 24) & 0xff
    bytes[at + 1] = (length >>> 16) & 0xff
    bytes[at + 2] = (length >>> 8) & 0xff
    bytes[at + 3] = length & 0xff
  }
  return sha256First32(bytes)
}

/**
 * Gives every id its own number. Ids are taken in sorted order; each takes its first pick that
 * no earlier id holds. The result therefore never depends on the order ids arrive in.
 */
export function assignDistinct(
  ids: readonly string[],
  pick: (id: string, attempt: number) => number,
): Map<string, number> {
  const taken = new Set<number>()
  const positions = new Map<string, number>()
  for (const id of [...ids].sort(compareCodeUnits)) {
    let attempt = 0
    let position = pick(id, attempt)
    while (taken.has(position)) {
      attempt++
      position = pick(id, attempt)
    }
    taken.add(position)
    positions.set(id, position)
  }
  return positions
}

/**
 * A distinct whole number from 0 to 2^32 - 1 for each id, fixed by `scope` and the id alone
 * unless two ids clash, in which case the later id in sorted order moves on.
 */
export function distinctPositions(
  scope: readonly string[],
  ids: readonly string[],
): Map<string, number> {
  return assignDistinct(ids, (id, attempt) => seededUint32([...scope, id, String(attempt)]))
}

/** Orders strings by UTF-16 code unit, the same on every machine and in every locale. */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
