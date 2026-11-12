import { expect, test } from 'vite-plus/test'
import { packageName, uses } from './index.ts'

test('standings package loads and reaches the shared package', () => {
  expect(packageName).toBe('@score-keepr/standings')
  expect(uses).toEqual(['@score-keepr/shared'])
})
