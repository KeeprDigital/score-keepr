import type { PackUserConfig } from 'vite-plus/pack'

// How every publishable package in this repository is built.
export const libraryPack = {
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
} satisfies PackUserConfig
