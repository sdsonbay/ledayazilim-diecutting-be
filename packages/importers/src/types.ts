import type { LineType, Point } from '@diecut/core'

export class ImportError extends Error {
  readonly code: string

  constructor(message: string, code = 'import') {
    super(message)
    this.name = 'ImportError'
    this.code = code
  }
}

export interface ImportedPath {
  layer: Extract<LineType, 'cut' | 'crease' | 'perf' | 'cutcrease'>
  points: Point[]
}
