import { expect, test } from 'vite-plus/test'
import { packageName, uses } from './index.ts'

test('pairing package loads and reaches the shared package', () => {
  expect(packageName).toBe('@score-keepr/pairing')
  expect(uses).toEqual(['@score-keepr/shared'])
})
