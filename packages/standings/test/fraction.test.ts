import fc from 'fast-check'
import { describe, expect, test } from 'vite-plus/test'

import {
  add,
  average,
  compare,
  fraction,
  greater,
  lesser,
  toExact,
  toNumber,
} from '../src/fraction.ts'

const whole = fc.integer({ min: -1000, max: 1000 })
const positive = fc.integer({ min: 1, max: 1000 })

describe('exact fractions', () => {
  test('two thirds is two thirds however it is written', () => {
    expect(compare(fraction(2, 3), fraction(4, 6))).toBe(0)
    expect(toExact(fraction(4, 6))).toEqual({ numerator: '2', denominator: '3' })
    expect(toExact(fraction(-4, 6))).toEqual({ numerator: '-2', denominator: '3' })
    expect(toExact(fraction(0, 7))).toEqual({ numerator: '0', denominator: '1' })
  })

  test('a third and a third and a third is exactly one', () => {
    const third = fraction(1, 3)
    expect(compare(add(add(third, third), third), fraction(1, 1))).toBe(0)
  })

  test('orders fractions the way the numbers they stand for are ordered', () => {
    fc.assert(
      fc.property(whole, positive, whole, positive, (a, b, c, d) => {
        expect(Math.sign(compare(fraction(a, b), fraction(c, d)))).toBe(Math.sign(a * d - c * b))
      }),
    )
  })

  test('adds exactly', () => {
    fc.assert(
      fc.property(whole, positive, whole, positive, (a, b, c, d) => {
        expect(compare(add(fraction(a, b), fraction(c, d)), fraction(a * d + c * b, b * d))).toBe(0)
      }),
    )
  })

  test('averages exactly, and the average of nothing is undefined', () => {
    expect(
      compare(
        average([fraction(1, 2), fraction(1, 3), fraction(1, 6)]) ?? fraction(0, 1),
        fraction(1, 3),
      ),
    ).toBe(0)
    expect(average([])).toBeUndefined()
  })

  test('picks the greater and the lesser', () => {
    expect(toExact(greater(fraction(1, 4), fraction(33, 100)))).toEqual({
      numerator: '33',
      denominator: '100',
    })
    expect(toExact(lesser(fraction(1, 1), fraction(3, 4)))).toEqual({
      numerator: '3',
      denominator: '4',
    })
  })

  test('gives a plain number for display', () => {
    expect(toNumber(fraction(16, 24))).toBeCloseTo(0.6667, 4)
    expect(toNumber(fraction(-1, 4))).toBe(-0.25)
  })

  test('refuses a zero denominator', () => {
    expect(() => fraction(1, 0)).toThrow(/zero denominator/)
  })
})
