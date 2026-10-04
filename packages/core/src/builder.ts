import { applyCutFeatures } from './cut-features.ts'
import { boundsOfPoints, flattenPath, pathLength, polygonArea, round, signedFoldAngle, unionRect } from './geometry.ts'
import { segment } from './path.ts'
import type {
  Dieline,
  DielineMeta,
  DielinePath,
  DielineStats,
  DielineWarning,
  Fold,
  LineType,
  Panel,
  PathCommand,
  Point,
  Rect,
  Unit,
} from './types.ts'
import { PRODUCTION_LAYERS } from './types.ts'

export interface PanelInput {
  id: string
  name: string
  label: { tr: string; en: string }
  outline: Point[]
  holes?: Point[][]
  role: Panel['role']
  printable?: boolean
}

export interface FoldInput {
  parent: string
  child: string
  axis: [Point, Point]
  angle: number
  kind?: Fold['kind']
  /** Ters (mountain) kırım. */
  reverse?: boolean
  /** Kırım çizgisini de otomatik çiz (varsayılan: evet). */
  draw?: boolean
}

/**
 * Template'lerin dieline üretirken kullandığı toplayıcı.
 * Katman disiplinini (kesim/kırım/perfore ayrı) burada zorluyoruz.
 */
export class DielineBuilder {
  private readonly paths: DielinePath[] = []
  private readonly panels: Panel[] = []
  private readonly folds: Fold[] = []
  private readonly warnings: DielineWarning[] = []
  private rootPanelId: string | null = null
  private counter = 0

  private readonly templateId: string
  private readonly meta: DielineMeta
  private readonly params: Record<string, number | string | boolean>
  private readonly unit: Unit

  constructor(templateId: string, meta: DielineMeta, params: Record<string, number | string | boolean>, unit: Unit = 'mm') {
    this.templateId = templateId
    this.meta = meta
    this.params = params
    this.unit = unit
  }

  private nextId(prefix: string): string {
    this.counter += 1
    return `${prefix}-${this.counter}`
  }

  addPath(layer: LineType, commands: PathCommand[], note?: string): this {
    if (commands.length > 0) {
      this.paths.push({ id: this.nextId(layer), layer, commands, ...(note ? { note } : {}) })
    }
    return this
  }

  cut(commands: PathCommand[], note?: string): this {
    return this.addPath('cut', commands, note)
  }

  crease(commands: PathCommand[], note?: string): this {
    return this.addPath('crease', commands, note)
  }

  creaseLine(a: Point, b: Point, note?: string): this {
    return this.addPath('crease', segment(a, b), note)
  }

  perf(commands: PathCommand[], note?: string): this {
    return this.addPath('perf', commands, note)
  }

  perfLine(a: Point, b: Point, note?: string): this {
    return this.addPath('perf', segment(a, b), note)
  }

  cutLine(a: Point, b: Point, note?: string): this {
    return this.addPath('cut', segment(a, b), note)
  }

  guide(layer: Extract<LineType, 'bleed' | 'safe' | 'glue' | 'dimension' | 'annotation'>, commands: PathCommand[], note?: string): this {
    return this.addPath(layer, commands, note)
  }

  panel(input: PanelInput): this {
    this.panels.push({
      id: input.id,
      name: input.name,
      label: input.label,
      outline: input.outline,
      ...(input.holes && input.holes.length > 0 ? { holes: input.holes } : {}),
      role: input.role,
      printable: input.printable ?? true,
    })
    if (this.rootPanelId === null) this.rootPanelId = input.id
    return this
  }

  fold(input: FoldInput): this {
    const child = this.panels.find((p) => p.id === input.child)
    const angle = child ? signedFoldAngle(input.axis, child.outline, input.angle) : input.angle
    this.folds.push({
      id: this.nextId('fold'),
      parent: input.parent,
      child: input.child,
      axis: input.axis,
      angle,
      kind: input.kind ?? 'crease',
      ...(input.reverse ? { reverse: true } : {}),
    })
    if (input.draw !== false) {
      const layer: LineType = input.kind === 'perf' ? 'perf' : 'crease'
      this.addPath(layer, segment(input.axis[0], input.axis[1]), `${input.parent} → ${input.child}`)
    }
    return this
  }

  root(panelId: string): this {
    this.rootPanelId = panelId
    return this
  }

  warn(code: string, severity: DielineWarning['severity'], tr: string, en: string): this {
    this.warnings.push({ code, severity, message: { tr, en } })
    return this
  }

  build(): Dieline {
    const rootPanel = this.rootPanelId ?? this.panels[0]?.id ?? 'root'
    const panels = applyCutFeatures(this.panels, this.paths)
    const bounds = this.computeBounds()
    return {
      templateId: this.templateId,
      unit: this.unit,
      params: this.params,
      meta: this.meta,
      paths: this.paths,
      panels,
      folds: this.folds,
      rootPanel,
      bounds,
      stats: this.computeStats(bounds, panels),
      warnings: this.warnings,
    }
  }

  private computeBounds(): Rect {
    let bounds: Rect | null = null
    for (const path of this.paths) {
      if (!PRODUCTION_LAYERS.includes(path.layer)) continue
      for (const chain of flattenPath(path.commands)) {
        const b = boundsOfPoints(chain)
        bounds = bounds ? unionRect(bounds, b) : b
      }
    }
    if (!bounds) return { x: 0, y: 0, width: 0, height: 0 }
    return {
      x: round(bounds.x, 3),
      y: round(bounds.y, 3),
      width: round(bounds.width, 3),
      height: round(bounds.height, 3),
    }
  }

  private computeStats(bounds: Rect, panels = this.panels): DielineStats {
    let cutLength = 0
    let creaseLength = 0
    let perfLength = 0
    for (const path of this.paths) {
      const len = PRODUCTION_LAYERS.includes(path.layer) ? pathLength(path.commands) : 0
      if (path.layer === 'cut' || path.layer === 'cutcrease') cutLength += len
      else if (path.layer === 'crease') creaseLength += len
      else if (path.layer === 'perf') perfLength += len
    }

    const area = panels.reduce((sum, panel) => {
      const hole = (panel.holes ?? []).reduce((h, poly) => h + polygonArea(poly), 0)
      return sum + Math.max(0, polygonArea(panel.outline) - hole)
    }, 0)
    const boundingArea = bounds.width * bounds.height
    return {
      cutLength: round(cutLength, 2),
      creaseLength: round(creaseLength, 2),
      perfLength: round(perfLength, 2),
      flatWidth: bounds.width,
      flatHeight: bounds.height,
      area: round(area, 2),
      boundingArea: round(boundingArea, 2),
      utilisation: boundingArea > 0 ? round(area / boundingArea, 4) : 0,
    }
  }
}
