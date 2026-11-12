import { defineConfig } from 'vite-plus'

import { libraryLint } from './tooling/lint/library.ts'
import { testLint } from './tooling/lint/tests.ts'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
  lint: {
    ignorePatterns: ['**/dist/**', 'prototype-matcher/**'],
    // Oxlint's own defaults, written out so each override has a known base to add to.
    plugins: ['typescript', 'unicorn', 'oxc'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      { files: ['packages/*/src/**/*.ts'], ...libraryLint },
      { files: ['**/*.test.ts'], ...testLint },
    ],
  },
  fmt: {
    singleQuote: true,
    semi: false,
    printWidth: 100,
    ignorePatterns: ['**/dist/**', 'prototype-matcher/**', '**/*.md', 'pnpm-lock.yaml'],
  },
})
