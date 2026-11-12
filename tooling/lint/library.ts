import type { OxlintOverride } from 'vite-plus/lint'

// Published code: every export states its types, so type files need no inference.
export const libraryLint = {
  rules: {
    'typescript/explicit-module-boundary-types': 'error',
  },
} satisfies Omit<OxlintOverride, 'files'>
