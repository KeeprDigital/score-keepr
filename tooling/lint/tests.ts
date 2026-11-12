import type { OxlintOverride } from 'vite-plus/lint'

// Test files. A starting set: stops a focused or skipped test being committed.
export const testLint = {
  plugins: ['vitest'],
  rules: {
    'vitest/no-focused-tests': 'error',
    'vitest/no-disabled-tests': 'error',
  },
} satisfies Omit<OxlintOverride, 'files'>
