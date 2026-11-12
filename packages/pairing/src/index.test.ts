import { expect, test } from 'vite-plus/test'
import { packageName, wired } from './index.ts'

test('pairing package loads and reaches the shared package', () => {
  expect(packageName).toBe('@score-keepr/pairing')
  expect(wired).toBe(true)
})
