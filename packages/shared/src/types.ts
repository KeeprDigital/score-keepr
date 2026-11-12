/** Identifies an Entrant. Chosen by the Consumer and stable for the whole tournament. */
export type EntrantId = string

/** One thing wrong with an input. */
export type InputError = {
  /** Stable, machine-readable name for the kind of problem. */
  code: string
  /** A sentence for a person. */
  message: string
  /** The Entrants involved, when the problem is about particular Entrants. */
  entrants: EntrantId[]
}

/** What every engine function returns when its input is invalid. */
export type Failure = {
  ok: false
  errors: InputError[]
}
