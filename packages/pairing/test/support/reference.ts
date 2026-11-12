import type { Constraint, PairingEntrant, RoundInput } from '../../src/index.ts'

/** One complete way to pair a field: who meets whom, and who has the Bye. */
export type Arrangement = { pairs: [string, string][]; bye: string | null }

/** Every complete way to pair these ids. Written plainly, as an independent check. */
export function everyArrangement(ids: readonly string[]): Arrangement[] {
  if (ids.length === 0) return [{ pairs: [], bye: null }]
  const [first, ...rest] = ids as [string, ...string[]]
  const found: Arrangement[] = []
  for (const partner of rest) {
    const others = rest.filter((id) => id !== partner)
    for (const arrangement of everyArrangement(others)) {
      found.push({ pairs: [[first, partner], ...arrangement.pairs], bye: arrangement.bye })
    }
  }
  if (ids.length % 2 === 1) {
    for (const arrangement of everyArrangement(rest)) {
      if (arrangement.bye === null) found.push({ pairs: arrangement.pairs, bye: first })
    }
  }
  return found
}

/**
 * The Entrants that break a yes-or-no Constraint in an arrangement, restated from the spec
 * without using any engine code. Undefined for a measured Constraint.
 */
export function broken(
  constraint: Constraint,
  input: RoundInput,
  arrangement: Arrangement,
): string[][] | undefined {
  const entrant = new Map(input.entrants.map((each) => [each.id, each]))
  const of = (id: string): PairingEntrant => entrant.get(id) as PairingEntrant
  const pairsWhere = (test: (a: PairingEntrant, b: PairingEntrant) => boolean): string[][] =>
    arrangement.pairs.filter(([a, b]) => test(of(a), of(b)))

  switch (constraint.type) {
    case 'no-rematch':
      return pairsWhere((a, b) => a.opponents.includes(b.id))
    case 'bye-cap':
      return arrangement.bye !== null && of(arrangement.bye).byes >= constraint.max
        ? [[arrangement.bye]]
        : []
    case 'avoid-same-group-label':
      return pairsWhere((a, b) => {
        const mine = a.groups?.[constraint.kind]
        return mine !== undefined && mine === b.groups?.[constraint.kind]
      })
    case 'avoid-listed-pairs':
      return pairsWhere((a, b) =>
        (input.avoidPairs ?? []).some(
          ([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id),
        ),
      )
    default:
      return undefined
  }
}

/** Compares two lists of numbers left to right. */
export function compareInOrder(a: readonly number[], b: readonly number[]): number {
  for (let at = 0; at < a.length; at++) {
    const difference = (a[at] as number) - (b[at] as number)
    if (difference !== 0) return difference
  }
  return 0
}
