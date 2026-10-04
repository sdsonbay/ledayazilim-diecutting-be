import { DielineBuilder, rectPath, type Dieline } from '@diecut/core'
import { appendDieline } from '../compose.ts'
import { DCT_INVENTORY } from '../dct-inventory.ts'
import { num, str, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'
import { buildTray, type CornerStyle, type TraySpec, type WallStyle } from './tray-family.ts'

/**
 * İki parçalı tepsi kutular (gömlek kutusu, B31 / B48 çiftleri): taban tepsisi
 * ve onun üstüne geçen kapak tepsisi aynı kalıpta yan yana. Her parça
 * tepsi ailesi üreteciyle çizilir; kapak iç ölçüsü taban dış ölçüsü + pay.
 */

interface PieceStyle {
  sides: WallStyle
  ends: WallStyle
  corners: CornerStyle
  cornerOwner?: 'sides' | 'ends'
  lockTabs?: boolean
}

export interface TwoPieceSpec {
  id: string
  code: string
  standard: 'ECMA' | 'FEFCO' | 'CUSTOM'
  dct: string[]
  name: I18nText
  description: I18nText
  keywords: string[]
  category: TemplateCategory
  materials: MaterialKind[]
  base: PieceStyle
  lid: PieceStyle
  /** Kapak yüksekliği / taban yüksekliği (lidHeight=0 iken). */
  lidRatio: number
  dims?: { a: number; b: number; c: number }
}

const T = (tr: string, en: string): I18nText => ({ tr, en })
const CARTON: MaterialKind[] = ['carton']
const GUSSET: PieceStyle = { sides: 'single', ends: 'single', corners: 'gusset' }
const ROLLOVER: PieceStyle = { sides: 'rollover', ends: 'single', corners: 'flap' }

const traySpecOf = (spec: TwoPieceSpec, style: PieceStyle, id: string): TraySpec => ({
  id,
  code: spec.code,
  standard: spec.standard === 'FEFCO' ? 'FEFCO' : 'ECMA',
  dct: [],
  name: spec.name,
  description: spec.description,
  keywords: [],
  category: spec.category,
  materials: spec.materials,
  ...style,
  lid: 'none',
})

function buildTwoPiece(spec: TwoPieceSpec, params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const fit = num(params, 'fitClearance')
  const lidHParam = num(params, 'lidHeight')
  const bleed = num(params, 'bleed')
  const piece = str(params, 'piece') as 'both' | 'base' | 'lid'
  const lidH = lidHParam > 0 ? lidHParam : Math.max(10, H * spec.lidRatio)
  const wantBase = piece !== 'lid'
  const wantLid = piece !== 'base'

  const b = new DielineBuilder(spec.id, { name: spec.name, ...(spec.standard === 'ECMA' ? { ecma: spec.code } : spec.standard === 'FEFCO' ? { fefco: spec.code } : {}), caliper, glueFlapSide: 'none' }, params)
  const sub = (style: PieceStyle, id: string, l: number, w: number, h: number): Dieline =>
    buildTray(traySpecOf(spec, style, id), { length: l, width: w, height: h, caliper, tuckDepth: 0, lidDust: 0, bleed: 0 })

  let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null
  let baseRoot = ''
  if (wantBase) {
    const r = appendDieline(b, sub(spec.base, `${spec.id}-base`, L, W, H), 0, 0, wantLid ? 'base' : '')
    baseRoot = r.root
    bounds = r
  }
  if (wantLid) {
    const lid = sub(spec.lid, `${spec.id}-lid`, L + 2 * caliper + fit, W + 2 * caliper + fit, lidH)
    const dx = bounds ? bounds.maxX - lid.bounds.x + 20 : 0
    const r = appendDieline(b, lid, dx, 0, wantBase ? 'lid' : '')
    if (wantBase && bounds) {
      // Parçalar bağımsız; 3D için sıfır açılı görünmez bağ
      b.fold({ parent: baseRoot, child: r.root, axis: [{ x: bounds.maxX, y: 0 }, { x: bounds.maxX, y: W }], angle: 0, draw: false })
      bounds = { minX: Math.min(bounds.minX, r.minX), minY: Math.min(bounds.minY, r.minY), maxX: Math.max(bounds.maxX, r.maxX), maxY: Math.max(bounds.maxY, r.maxY) }
    } else {
      bounds = r
      baseRoot = r.root
    }
  }
  b.root(baseRoot)
  if (bleed > 0 && bounds) {
    b.guide('bleed', rectPath(bounds.minX - bleed, bounds.minY - bleed, bounds.maxX - bounds.minX + 2 * bleed, bounds.maxY - bounds.minY + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

const dctDims = (spec: TwoPieceSpec): { a: number; b: number; c: number } => {
  if (spec.dims) return spec.dims
  for (const id of spec.dct) {
    const e = DCT_INVENTORY.find((x) => x.id === id)
    if (e?.dims.a && e.dims.b && e.dims.c) return { a: e.dims.a, b: e.dims.b, c: e.dims.c }
  }
  return { a: 200, b: 100, c: 40 }
}

const paramsFor = (spec: TwoPieceSpec): ParamDef[] => {
  const d = dctDims(spec)
  return [
    { kind: 'number', key: 'length', label: { tr: 'İç uzunluk (a)', en: 'Inside length (a)' }, unit: 'mm', min: 30, max: 1500, step: 0.5, default: d.a, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'İç genişlik (b)', en: 'Inside width (b)' }, unit: 'mm', min: 30, max: 1500, step: 0.5, default: d.b, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Taban yüksekliği (c)', en: 'Base height (c)' }, unit: 'mm', min: 8, max: 400, step: 0.5, default: d.c, group: 'dimensions' },
    { kind: 'number', key: 'lidHeight', label: { tr: 'Kapak yüksekliği', en: 'Lid height' }, unit: 'mm', min: 0, max: 400, step: 0.5, default: 0, autoWhenZero: true, group: 'dimensions' },
    {
      kind: 'enum',
      key: 'piece',
      label: { tr: 'Parça', en: 'Piece' },
      default: 'both',
      group: 'construction',
      options: [
        { value: 'both', label: { tr: 'Kapak + taban', en: 'Lid + base' } },
        { value: 'base', label: { tr: 'Yalnızca taban', en: 'Base only' } },
        { value: 'lid', label: { tr: 'Yalnızca kapak', en: 'Lid only' } },
      ],
    },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: 0.5, group: 'material' },
    { kind: 'number', key: 'fitClearance', label: { tr: 'Kapak payı', en: 'Lid fit clearance' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 1, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ]
}

export const twoPieceTemplate = (spec: TwoPieceSpec): TemplateDefinition => ({
  id: spec.id,
  code: spec.code,
  standard: spec.standard,
  name: spec.name,
  description: spec.description,
  category: spec.category,
  materials: spec.materials,
  maturity: 'beta',
  keywords: [...spec.keywords, ...(spec.code ? [spec.code.toLowerCase()] : []), ...spec.dct],
  params: paramsFor(spec),
  build: (params) => buildTwoPiece(spec, params),
})

export const TWO_PIECE_SPECS: readonly TwoPieceSpec[] = [
  {
    id: 'ecma-b31-21',
    code: 'B31.21.00.00',
    standard: 'ECMA',
    dct: ['becf-12401', 'becf-1240f'],
    name: T('Gömlek kutusu, çift kat duvar (taban + kapak)', 'Shirt box, roll-over walls (base + lid)'),
    description: T('Taban ve kapak tepsileri; yan duvarlar içe katlanan çift kat, köşe kulakları uç duvarlardan.', 'Base and lid trays with roll-over side walls; corner flaps on the end walls.'),
    keywords: ['gömlek kutusu', 'shirt box', 'two piece', 'iki parça'],
    category: 'shirt-boxes',
    materials: CARTON,
    base: ROLLOVER,
    lid: ROLLOVER,
    lidRatio: 0.9,
  },
  {
    id: 'ecma-b48-02-set',
    code: 'B48.02.00.00 ×2',
    standard: 'ECMA',
    dct: ['becf-12406', 'becf-12407', 'becf-12410'],
    name: T('Gömlek kutusu, körüklü (taban + kapak)', 'Shirt box, webbed corners (base + lid)'),
    description: T('Körüklü köşeli taban ve kapak tepsileri tek kalıpta.', 'Webbed-corner base and lid trays on one die.'),
    keywords: ['gömlek kutusu', 'shirt box', 'set', 'körük'],
    category: 'shirt-boxes',
    materials: CARTON,
    base: GUSSET,
    lid: GUSSET,
    lidRatio: 0.9,
  },
]

export const twoPieceTemplates: TemplateDefinition[] = TWO_PIECE_SPECS.map(twoPieceTemplate)
