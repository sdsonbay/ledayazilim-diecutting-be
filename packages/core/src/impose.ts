import { multiply, rotation, round, transformCommands, translation, type Matrix } from './geometry.ts'
import { polyline, segment } from './path.ts'
import {
  PRODUCTION_LAYERS,
  type Dieline,
  type DielinePath,
  type PathCommand,
  type Point,
  type Rect,
} from './types.ts'

export interface SheetPreset {
  id: string
  width: number
  height: number
  label: { tr: string; en: string }
}

/** Matbaada sık kullanılan tabaka ölçüleri (mm). */
export const SHEET_PRESETS: SheetPreset[] = [
  { id: 'b0', width: 1000, height: 1414, label: { tr: 'B0 1000×1414 mm', en: 'B0 1000×1414 mm' } },
  { id: 'b1', width: 707, height: 1000, label: { tr: 'B1 707×1000 mm', en: 'B1 707×1000 mm' } },
  { id: 'b2', width: 500, height: 707, label: { tr: 'B2 500×707 mm', en: 'B2 500×707 mm' } },
  { id: 'a0', width: 841, height: 1189, label: { tr: 'A0 841×1189 mm', en: 'A0 841×1189 mm' } },
  { id: 'a1', width: 594, height: 841, label: { tr: 'A1 594×841 mm', en: 'A1 594×841 mm' } },
  { id: 'a2', width: 420, height: 594, label: { tr: 'A2 420×594 mm', en: 'A2 420×594 mm' } },
  { id: 'a3', width: 297, height: 420, label: { tr: 'A3 297×420 mm', en: 'A3 297×420 mm' } },
  { id: 's70x100', width: 700, height: 1000, label: { tr: '70×100 cm', en: '70×100 cm' } },
  { id: 's64x90', width: 640, height: 900, label: { tr: '64×90 cm', en: '64×90 cm' } },
  { id: 's50x70', width: 500, height: 700, label: { tr: '50×70 cm', en: '50×70 cm' } },
  { id: 's100x70', width: 1000, height: 700, label: { tr: '100×70 cm', en: '100×70 cm' } },
  { id: 's100x140', width: 1000, height: 1400, label: { tr: '100×140 cm', en: '100×140 cm' } },
  { id: 's120x160', width: 1200, height: 1600, label: { tr: '120×160 cm', en: '120×160 cm' } },
  { id: 's140x200', width: 1400, height: 2000, label: { tr: '140×200 cm', en: '140×200 cm' } },
  { id: 's160x120', width: 1600, height: 1200, label: { tr: '160×120 cm', en: '160×120 cm' } },
  { id: 'custom', width: 1000, height: 1414, label: { tr: 'Özel ölçü', en: 'Custom size' } },
]

export interface ImposeOptions {
  sheetWidth: number
  sheetHeight: number
  /** Makas — tabakanın basıldığı kenar (y = 0). */
  marginGripper: number
  /** Etek — makasın karşısı. */
  marginTail: number
  /** Sol ve sağ yan boşluk. */
  marginSide: number
  gapX: number
  gapY: number
  fullSheet: boolean
  copies?: number
  rotation: 'auto' | 0 | 90
  dimensionLines: boolean
  /** Sığmazsa bir üst tabakaya veya özel ölçüye geç. */
  autoFitSheet: boolean
}

export interface ImposeCallout {
  x: number
  y: number
  text: string
}

export interface ImposeCandidate {
  rotation: 0 | 90
  cols: number
  rows: number
  copies: number
  pieceWidth: number
  pieceHeight: number
}

export interface ImposePlacement {
  x: number
  y: number
  rotation: 0 | 90
  width: number
  height: number
}

export interface ImposeLayout {
  cols: number
  rows: number
  copies: number
  maxCopies: number
  rotation: 0 | 90
  pieceWidth: number
  pieceHeight: number
  nestedWidth: number
  nestedHeight: number
  usable: Rect
  sheet: { width: number; height: number }
  wasteRatio: number
  sheetFill: number
  cutLength: number
  creaseLength: number
  perfLength: number
  alternatives: ImposeCandidate[]
  sheetId: string
  sheetAdjusted: boolean
  placements: ImposePlacement[]
  mixedCopies: number
}

export interface ImposeResult {
  dieline: Dieline
  layout: ImposeLayout
  callouts: ImposeCallout[]
}

export class ImposeError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const clamp = (n: number, min: number, max: number, fallback: number): number => {
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

const num = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

export function parseImposeOptions(raw: Record<string, unknown> | undefined): ImposeOptions {
  const src = raw ?? {}
  const preset = SHEET_PRESETS.find((p) => p.id === src.sheetId) ?? SHEET_PRESETS[0]
  const sheetWidth = clamp(num(src.sheetWidth, preset?.width ?? 1000), 50, 12000, 1000)
  const sheetHeight = clamp(num(src.sheetHeight, preset?.height ?? 1414), 50, 12000, 1414)
  const rotationRaw = src.rotation
  const rotation: ImposeOptions['rotation'] =
    rotationRaw === 90 || rotationRaw === '90' ? 90 : rotationRaw === 0 || rotationRaw === '0' ? 0 : 'auto'
  const fullSheet = src.fullSheet !== false && src.fullSheet !== 'false'
  const copies = clamp(Math.round(num(src.copies, 1)), 1, 20_000, 1)
  return {
    sheetWidth,
    sheetHeight,
    marginGripper: clamp(num(src.marginGripper, 15), 0, 200, 15),
    marginTail: clamp(num(src.marginTail, 5), 0, 200, 5),
    marginSide: clamp(num(src.marginSide, 5), 0, 200, 5),
    gapX: clamp(num(src.gapX, 0), 0, 80, 0),
    gapY: clamp(num(src.gapY, 0), 0, 80, 0),
    fullSheet,
    copies: fullSheet ? undefined : copies,
    rotation,
    dimensionLines: src.dimensionLines !== false && src.dimensionLines !== 'false',
    autoFitSheet: src.autoFitSheet !== false && src.autoFitSheet !== 'false',
  }
}

const EPS = 1e-6

const packGrid = (usableW: number, usableH: number, pieceW: number, pieceH: number, gapX: number, gapY: number) => {
  if (pieceW <= 0 || pieceH <= 0 || usableW + EPS < pieceW || usableH + EPS < pieceH) {
    return { cols: 0, rows: 0, copies: 0 }
  }
  const cols = Math.floor((usableW + gapX + EPS) / (pieceW + gapX))
  const rows = Math.floor((usableH + gapY + EPS) / (pieceH + gapY))
  return { cols, rows, copies: Math.max(0, cols) * Math.max(0, rows) }
}

const pieceSize = (bounds: Rect, rot: 0 | 90) =>
  rot === 0 ? { w: bounds.width, h: bounds.height } : { w: bounds.height, h: bounds.width }

const candidateOf = (bounds: Rect, rot: 0 | 90, usable: Rect, gapX: number, gapY: number): ImposeCandidate => {
  const { w: pieceWidth, h: pieceHeight } = pieceSize(bounds, rot)
  const packed = packGrid(usable.width, usable.height, pieceWidth, pieceHeight, gapX, gapY)
  return { rotation: rot, pieceWidth, pieceHeight, ...packed }
}

const placeGrid = (
  ox: number,
  oy: number,
  cols: number,
  rows: number,
  pw: number,
  ph: number,
  gapX: number,
  gapY: number,
  rot: 0 | 90,
): ImposePlacement[] => {
  const out: ImposePlacement[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      out.push({
        x: ox + col * (pw + gapX),
        y: oy + row * (ph + gapY),
        rotation: rot,
        width: pw,
        height: ph,
      })
    }
  }
  return out
}

/** Yerleşim özeti: arama yalnız sayar, yerleşimler en iyi seçimden sonra bir kez üretilir. */
interface PackScore {
  /** Toplam adet. */
  n: number
  /** 0° yerleşen adet. */
  zero: number
  /** Kullanılan yönler: bit0 = 0°, bit1 = 90°. */
  mask: number
  choice: PackChoice | null
}

interface PackChoice {
  rot: 0 | 90
  cols: number
  rows: number
  right: boolean
  top: boolean
}

const EMPTY_SCORE: PackScore = { n: 0, zero: 0, mask: 0, choice: null }

/** Daha çok adet; eşitse tek yön; o da eşitse daha çok 0°. */
const betterScore = (a: PackScore, b: PackScore): boolean => {
  if (a.n !== b.n) return a.n > b.n
  const mixedA = a.mask === 3
  const mixedB = b.mask === 3
  if (mixedA !== mixedB) return !mixedA
  return a.zero > b.zero
}

/** Ana ızgaradan geri çekilebilecek en fazla sütun/sıra. */
const SPAN_LIMIT = 8

const keyOf = (w: number, h: number, depth: number) => `${round(w, 6)}x${round(h, 6)}@${depth}`

/**
 * Guillotine: ana ızgara + sağ/üst kalan şeritte diğer yön.
 * Alt problemler (aynı boyutta kalan şerit) önbellekten gelir; eskiden her aday için
 * yerleşim dizileri baştan üretildiği için küçük kutu + büyük tabaka dakikalar sürüyordu.
 */
const createPacker = (bounds: Rect, gapX: number, gapY: number, allowed: readonly (0 | 90)[]) => {
  const memo = new Map<string, PackScore>()
  const minSide = Math.min(bounds.width, bounds.height)

  const restOf = (w: number, h: number, pw: number, ph: number, cols: number, rows: number) => {
    const nestedW = cols * pw + (cols - 1) * gapX
    const nestedH = rows * ph + (rows - 1) * gapY
    const rightW = w - nestedW - (nestedW > 0 ? gapX : 0)
    const topH = h - nestedH - (nestedH > 0 ? gapY : 0)
    return { nestedW, nestedH, rightW, topH, right: rightW + EPS >= minSide, top: topH + EPS >= minSide && nestedW > EPS }
  }

  const score = (w: number, h: number, depth: number): PackScore => {
    if (depth > 4 || w <= EPS || h <= EPS) return EMPTY_SCORE
    const key = keyOf(w, h, depth)
    const hit = memo.get(key)
    if (hit) return hit
    let best: PackScore = EMPTY_SCORE
    let found = false
    for (const rot of allowed) {
      const { w: pw, h: ph } = pieceSize(bounds, rot)
      const { cols: maxC, rows: maxR } = packGrid(w, h, pw, ph, gapX, gapY)
      if (maxC === 0 || maxR === 0) continue
      // Tam ızgaradan en çok SPAN_LIMIT sütun/sıra geri çekilmeyi dene: kalan şeride diğer
      // yönü sığdırmak için daha fazlası pratikte kazanç getirmez, aramayı ise patlatır.
      const minC = Math.max(1, maxC - SPAN_LIMIT)
      const minR = Math.max(1, maxR - SPAN_LIMIT)
      for (let cols = maxC; cols >= minC; cols--) {
        for (let rows = maxR; rows >= minR; rows--) {
          if (cols !== maxC && rows !== maxR) continue
          const r = restOf(w, h, pw, ph, cols, rows)
          const right = r.right ? score(r.rightW, h, depth + 1) : EMPTY_SCORE
          const top = r.top ? score(r.nestedW, r.topH, depth + 1) : EMPTY_SCORE
          const placed = cols * rows
          const next: PackScore = {
            n: placed + right.n + top.n,
            zero: (rot === 0 ? placed : 0) + right.zero + top.zero,
            mask: (rot === 0 ? 1 : 2) | right.mask | top.mask,
            choice: { rot, cols, rows, right: r.right, top: r.top },
          }
          if (!found || betterScore(next, best)) {
            best = next
            found = true
          }
        }
      }
    }
    memo.set(key, best)
    return best
  }

  const build = (rect: Rect, depth: number): ImposePlacement[] => {
    if (depth > 4 || rect.width <= EPS || rect.height <= EPS) return []
    const choice = score(rect.width, rect.height, depth).choice
    if (!choice) return []
    const { w: pw, h: ph } = pieceSize(bounds, choice.rot)
    const r = restOf(rect.width, rect.height, pw, ph, choice.cols, choice.rows)
    const out = placeGrid(rect.x, rect.y, choice.cols, choice.rows, pw, ph, gapX, gapY, choice.rot)
    if (choice.right) {
      out.push(...build({ x: rect.x + r.nestedW + (r.nestedW > 0 ? gapX : 0), y: rect.y, width: r.rightW, height: rect.height }, depth + 1))
    }
    if (choice.top) {
      out.push(...build({ x: rect.x, y: rect.y + r.nestedH + (r.nestedH > 0 ? gapY : 0), width: r.nestedW, height: r.topH }, depth + 1))
    }
    return out
  }

  return { build }
}

const packRect = (rect: Rect, bounds: Rect, gapX: number, gapY: number, allowed: readonly (0 | 90)[]): ImposePlacement[] =>
  createPacker(bounds, gapX, gapY, allowed).build(rect, 0)

const planSheet = (
  bounds: Rect,
  usable: Rect,
  gapX: number,
  gapY: number,
  rotation: ImposeOptions['rotation'],
): { placements: ImposePlacement[]; primary: ImposeCandidate } => {
  const alt0 = candidateOf(bounds, 0, usable, gapX, gapY)
  const alt90 = candidateOf(bounds, 90, usable, gapX, gapY)
  const allowed: readonly (0 | 90)[] = rotation === 0 ? [0] : rotation === 90 ? [90] : [0, 90]
  const placements = packRect(usable, bounds, gapX, gapY, allowed)
  const primaryRot = placements[0]?.rotation ?? (rotation === 90 ? 90 : 0)
  const primaryPlaced = placements.filter((p) => p.rotation === primaryRot)
  const xs = [...new Set(primaryPlaced.map((p) => round(p.x, 3)))].sort((a, b) => a - b)
  const ys = [...new Set(primaryPlaced.map((p) => round(p.y, 3)))].sort((a, b) => a - b)
  const size = pieceSize(bounds, primaryRot)
  const primary: ImposeCandidate = {
    rotation: primaryRot,
    cols: xs.length,
    rows: ys.length,
    copies: primaryPlaced.length,
    pieceWidth: size.w,
    pieceHeight: size.h,
  }
  if (placements.length === 0) {
    const fallback = rotation === 90 ? alt90 : rotation === 0 ? alt0 : pickBest(alt0, alt90)
    return { placements, primary: fallback }
  }
  return { placements, primary }
}

const pickBest = (a: ImposeCandidate, b: ImposeCandidate): ImposeCandidate => {
  if (a.copies !== b.copies) return a.copies >= b.copies ? a : b
  const areaA = a.pieceWidth * a.pieceHeight * a.copies
  const areaB = b.pieceWidth * b.pieceHeight * b.copies
  if (areaA !== areaB) return areaA >= areaB ? a : b
  return a.rotation === 0 ? a : b
}

const pieceMatrix = (bounds: Rect, ox: number, oy: number, rot: 0 | 90): Matrix => {
  const toOrigin = translation(-bounds.x, -bounds.y)
  const oriented =
    rot === 0 ? toOrigin : multiply(translation(0, bounds.width), multiply(rotation(-Math.PI / 2), toOrigin))
  return multiply(translation(ox, oy), oriented)
}

const pathOf = (id: string, layer: DielinePath['layer'], commands: PathCommand[], note?: string): DielinePath => ({
  id,
  layer,
  commands,
  note,
})

const dimH = (x0: number, x1: number, y: number, tick: number): PathCommand[] => [
  ...segment({ x: x0, y: y - tick }, { x: x0, y: y + tick }),
  ...segment({ x: x1, y: y - tick }, { x: x1, y: y + tick }),
  ...segment({ x: x0, y }, { x: x1, y }),
]

const dimV = (y0: number, y1: number, x: number, tick: number): PathCommand[] => [
  ...segment({ x: x - tick, y: y0 }, { x: x + tick, y: y0 }),
  ...segment({ x: x - tick, y: y1 }, { x: x + tick, y: y1 }),
  ...segment({ x, y: y0 }, { x, y: y1 }),
]

const fmtMm = (n: number): string => `${round(n, 2).toFixed(2)} mm`

const usableRect = (options: ImposeOptions): Rect => ({
  x: options.marginSide,
  y: options.marginGripper,
  width: options.sheetWidth - options.marginSide * 2,
  height: options.sheetHeight - options.marginGripper - options.marginTail,
})

const copiesOnSheet = (bounds: Rect, options: ImposeOptions): number => {
  const usable = usableRect(options)
  if (usable.width <= 0 || usable.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return 0
  return planSheet(bounds, usable, options.gapX, options.gapY, options.rotation).placements.length
}

export const presetIdOf = (width: number, height: number): string =>
  SHEET_PRESETS.find((p) => p.id !== 'custom' && p.width === width && p.height === height)?.id ?? 'custom'

/** B0 gibi küçük tabakaya sığmayan kolileri bir üst ölçüye veya özel tabakaya taşır. */
export function fitSheetOptions(bounds: Rect, options: ImposeOptions): ImposeOptions {
  if (!options.autoFitSheet || copiesOnSheet(bounds, options) > 0) return options
  const ranked = SHEET_PRESETS.filter((p) => p.id !== 'custom').sort(
    (a, b) => a.width * a.height - b.width * b.height,
  )
  for (const preset of ranked) {
    const next = { ...options, sheetWidth: preset.width, sheetHeight: preset.height }
    if (copiesOnSheet(bounds, next) > 0) return next
  }
  const slack = 4
  const w0 = bounds.width + options.marginSide * 2 + slack
  const h0 = bounds.height + options.marginGripper + options.marginTail + slack
  const w90 = bounds.height + options.marginSide * 2 + slack
  const h90 = bounds.width + options.marginGripper + options.marginTail + slack
  const use90 = options.rotation === 90 || (options.rotation !== 0 && w90 * h90 < w0 * h0)
  return {
    ...options,
    sheetWidth: round(Math.min(12000, Math.max(50, use90 ? w90 : w0)), 1),
    sheetHeight: round(Math.min(12000, Math.max(50, use90 ? h90 : h0)), 1),
  }
}

export function dielineFromPayload(raw: unknown): Dieline {
  if (!raw || typeof raw !== 'object') throw new ImposeError('impose_invalid', 'Bıçak izi yok')
  const o = raw as Record<string, unknown>
  const bounds = o.bounds as Rect | undefined
  const paths = o.paths as DielinePath[] | undefined
  if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0) {
    throw new ImposeError('impose_invalid', 'Açık ölçü yok')
  }
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new ImposeError('impose_invalid', 'Kesim yolu yok')
  }
  const stats = o.stats as Dieline['stats'] | undefined
  const meta = o.meta as Dieline['meta'] | undefined
  return {
    templateId: String(o.templateId ?? 'custom'),
    unit: 'mm',
    params: (o.params as Dieline['params']) ?? {},
    meta: {
      name: meta?.name ?? { tr: 'Bıçak izi', en: 'Die-cut' },
      caliper: typeof meta?.caliper === 'number' ? meta.caliper : 0.4,
    },
    paths,
    panels: [],
    folds: [],
    rootPanel: '',
    bounds,
    stats: stats ?? {
      cutLength: 0,
      creaseLength: 0,
      perfLength: 0,
      flatWidth: bounds.width,
      flatHeight: bounds.height,
      area: 0,
      boundingArea: bounds.width * bounds.height,
      utilisation: 0,
    },
    warnings: [],
  }
}

/**
 * Tek bir bıçak izini tabakaya dizer.
 * Otomatikte 0°/90° ızgaranın yanı sıra kalan şeride diğer yönü de ekler.
 */
/** Tek tabakadaki en fazla adet (alan tahmini). */
export const MAX_SHEET_PIECES = 4000

export function imposeDieline(source: Dieline, requested: ImposeOptions): ImposeResult {
  const options = fitSheetOptions(source.bounds, requested)
  const sheetAdjusted =
    options.sheetWidth !== requested.sheetWidth || options.sheetHeight !== requested.sheetHeight
  const sheetW = options.sheetWidth
  const sheetH = options.sheetHeight
  const usable = usableRect(options)
  if (usable.width <= 0 || usable.height <= 0) {
    throw new ImposeError('impose_invalid', 'Kenar payları tabakadan büyük')
  }

  const bounds = source.bounds
  // Çok küçük bir kalıp dev tabakaya binlerce kez dizilirse çıktı (SVG/PDF) devleşir.
  if ((usable.width * usable.height) / Math.max(bounds.width * bounds.height, 1e-6) > MAX_SHEET_PIECES) {
    throw new ImposeError('impose_too_many', `Bir tabakaya en fazla ${MAX_SHEET_PIECES} adet dizilebilir`)
  }
  const alt0 = candidateOf(bounds, 0, usable, options.gapX, options.gapY)
  const alt90 = candidateOf(bounds, 90, usable, options.gapX, options.gapY)
  const planned = planSheet(bounds, usable, options.gapX, options.gapY, options.rotation)
  const chosen = planned.primary
  const allPlacements = planned.placements
  const maxCopies = allPlacements.length
  const wanted = options.fullSheet || options.copies === undefined ? maxCopies : Math.min(maxCopies, options.copies)
  const copies = Math.max(0, wanted)
  const placements = allPlacements.slice(0, copies)
  const cols = chosen.cols
  const rows = chosen.rows
  const mixedCopies = placements.filter((p) => p.rotation !== chosen.rotation).length

  const placedArea = placements.reduce((sum, p) => sum + p.width * p.height, 0)
  let nestedWidth = 0
  let nestedHeight = 0
  if (placements.length > 0) {
    const minX = Math.min(...placements.map((p) => p.x))
    const minY = Math.min(...placements.map((p) => p.y))
    const maxX = Math.max(...placements.map((p) => p.x + p.width))
    const maxY = Math.max(...placements.map((p) => p.y + p.height))
    nestedWidth = maxX - minX
    nestedHeight = maxY - minY
  }
  const usableArea = Math.max(usable.width * usable.height, 1)
  const sheetArea = Math.max(sheetW * sheetH, 1)

  const sourcePaths = source.paths.filter(
    (p) => PRODUCTION_LAYERS.includes(p.layer) || p.layer === 'bleed',
  )
  const paths: DielinePath[] = []
  placements.forEach((cell, index) => {
    const m = pieceMatrix(bounds, cell.x, cell.y, cell.rotation)
    for (const path of sourcePaths) {
      paths.push(
        pathOf(`${path.id}-${index}`, path.layer, transformCommands(path.commands, m), path.note),
      )
    }
  })

  paths.push(
    pathOf('sheet-outline', 'annotation', polyline(rectCorners(0, 0, sheetW, sheetH), true), 'tabaka'),
    pathOf(
      'sheet-usable',
      'bleed',
      polyline(rectCorners(usable.x, usable.y, usable.width, usable.height), true),
      'baskı alanı',
    ),
  )

  const callouts: ImposeCallout[] = [
    { x: sheetW / 2, y: -8, text: fmtMm(sheetW) },
    { x: -10, y: sheetH / 2, text: fmtMm(sheetH) },
  ]

  if (options.dimensionLines && copies > 0) {
    const x0 = usable.x
    const y0 = usable.y
    const x1 = x0 + nestedWidth
    const y1 = y0 + nestedHeight
    const tick = Math.max(2, Math.min(sheetW, sheetH) * 0.004)
    paths.push(
      pathOf('dim-nested-w', 'dimension', dimH(x0, x1, y0 - 10, tick)),
      pathOf('dim-nested-h', 'dimension', dimV(y0, y1, x0 - 10, tick)),
      pathOf('dim-piece-w', 'dimension', dimH(x0, x0 + chosen.pieceWidth, y0 - 22, tick)),
    )
    callouts.push(
      { x: (x0 + x1) / 2, y: y0 - 14, text: fmtMm(nestedWidth) },
      { x: x0 - 16, y: (y0 + y1) / 2, text: fmtMm(nestedHeight) },
      { x: x0 + chosen.pieceWidth / 2, y: y0 - 26, text: fmtMm(chosen.pieceWidth) },
    )
  }

  const cutLength = round(source.stats.cutLength * copies, 2)
  const creaseLength = round(source.stats.creaseLength * copies, 2)
  const perfLength = round(source.stats.perfLength * copies, 2)
  const area = round(source.stats.area * copies, 2)

  const dieline: Dieline = {
    templateId: source.templateId,
    unit: source.unit,
    params: source.params,
    meta: {
      ...source.meta,
      name: {
        tr: `${source.meta.name.tr} — yerleştirme`,
        en: `${source.meta.name.en} — imposition`,
      },
    },
    paths,
    panels: [],
    folds: [],
    rootPanel: '',
    bounds: { x: 0, y: 0, width: sheetW, height: sheetH },
    stats: {
      cutLength,
      creaseLength,
      perfLength,
      flatWidth: sheetW,
      flatHeight: sheetH,
      area,
      boundingArea: round(sheetArea, 2),
      utilisation: round(placedArea / sheetArea, 4),
    },
    warnings:
      copies === 0
        ? [
            {
              code: 'impose_does_not_fit',
              severity: 'warning',
              message: {
                tr: 'Bu bıçak izi seçilen tabakaya ve kenar paylarına sığmıyor.',
                en: 'This blank does not fit the sheet and margins.',
              },
            },
          ]
        : [],
  }

  return {
    dieline,
    layout: {
      cols,
      rows,
      copies,
      maxCopies,
      rotation: chosen.rotation,
      pieceWidth: round(chosen.pieceWidth, 3),
      pieceHeight: round(chosen.pieceHeight, 3),
      nestedWidth: round(nestedWidth, 3),
      nestedHeight: round(nestedHeight, 3),
      usable,
      sheet: { width: sheetW, height: sheetH },
      wasteRatio: round(1 - placedArea / usableArea, 4),
      sheetFill: round(placedArea / sheetArea, 4),
      cutLength,
      creaseLength,
      perfLength,
      alternatives: [alt0, alt90],
      sheetId: presetIdOf(sheetW, sheetH),
      sheetAdjusted,
      placements,
      mixedCopies,
    },
    callouts,
  }
}

function rectCorners(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ]
}
