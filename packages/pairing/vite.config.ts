import { defineConfig } from 'vite-plus'

import { libraryPack } from '../../tooling/pack/library.ts'

export default defineConfig({
  pack: libraryPack,
})
