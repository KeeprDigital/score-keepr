import type { Mates } from './exhaustive.ts'
import type { Field } from './field.ts'

/**
 * A quick, valid set of Pairings with no claim to be best: Entrants in Score order, each paired
 * with the next, the last one taking the Bye when the count is odd.
 */
export function pairInScoreOrder(field: Field): Mates {
  const order = Array.from({ length: field.size }, (_, a) => a).sort(
    (a, b) => (field.score[b] as number) - (field.score[a] as number) || a - b,
  )
  const mates: Mates = Array.from({ length: field.size }, () => -1)
  for (let at = 0; at + 1 < order.length; at += 2) {
    const a = order[at] as number
    const b = order[at + 1] as number
    mates[a] = b
    mates[b] = a
  }
  return mates
}
