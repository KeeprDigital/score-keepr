import { expect, test } from 'vite-plus/test'
import { packageName } from './index.ts'

test('shared package loads', () => {
  expect(packageName).toBe('@score-keepr/shared')
})
