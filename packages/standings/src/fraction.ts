/**
 * An exact fraction. The denominator is always above zero. Two fractions that stand for the same
 * number compare as equal whatever their parts, so nothing here ever needs rounding.
 */
export type Fraction = { readonly numerator: bigint; readonly denominator: bigint }

export function fraction(numerator: number | bigint, denominator: number | bigint): Fraction {
  const top = BigInt(numerator)
  const bottom = BigInt(denominator)
  if (bottom === 0n) throw new Error('A fraction cannot have a zero denominator')
  return bottom < 0n
    ? { numerator: -top, denominator: -bottom }
    : { numerator: top, denominator: bottom }
}

export const ZERO: Fraction = fraction(0, 1)

/** Below zero when `a` is less than `b`, zero when they are equal, above zero when greater. */
export function compare(a: Fraction, b: Fraction): number {
  const left = a.numerator * b.denominator
  const right = b.numerator * a.denominator
  return left < right ? -1 : left > right ? 1 : 0
}

export function add(a: Fraction, b: Fraction): Fraction {
  if (a.denominator === b.denominator)
    return { numerator: a.numerator + b.numerator, denominator: a.denominator }
  return reduce({
    numerator: a.numerator * b.denominator + b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  })
}

/** The average, or undefined when there is nothing to average. */
export function average(values: readonly Fraction[]): Fraction | undefined {
  if (values.length === 0) return undefined
  const total = values.reduce(add, ZERO)
  return reduce({
    numerator: total.numerator,
    denominator: total.denominator * BigInt(values.length),
  })
}

export const greater = (a: Fraction, b: Fraction): Fraction => (compare(a, b) >= 0 ? a : b)
export const lesser = (a: Fraction, b: Fraction): Fraction => (compare(a, b) <= 0 ? a : b)

/** The same number in lowest terms. */
export function reduce(value: Fraction): Fraction {
  let a = value.numerator < 0n ? -value.numerator : value.numerator
  let b = value.denominator
  while (b !== 0n) {
    const rest = a % b
    a = b
    b = rest
  }
  return a <= 1n ? value : { numerator: value.numerator / a, denominator: value.denominator / a }
}

/** Lowest terms, as text so that no digit is lost in JSON. */
export function toExact(value: Fraction): { numerator: string; denominator: string } {
  const lowest = value.numerator === 0n ? ZERO : reduce(value)
  return { numerator: lowest.numerator.toString(), denominator: lowest.denominator.toString() }
}

/** A plain number for display. Close, not exact. */
export function toNumber(value: Fraction): number {
  const lowest = reduce(value)
  return Number(lowest.numerator) / Number(lowest.denominator)
}
