import { seededUint32 } from '@score-keepr/shared'

// Placeholder: proves the workspace wiring. Replace with the first real export.
export const packageName = '@score-keepr/pairing'
export const wired: boolean = typeof seededUint32 === 'function'
