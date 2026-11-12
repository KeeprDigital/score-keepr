import { expect, test } from 'vite-plus/test'
import { packageName, wired } from './index.ts'

test('standings package loads and reaches the shared package', () => {
  expect(packageName).toBe('@score-keepr/standings')
  expect(wired).toBe(true)
})
