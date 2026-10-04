import { DielineBuilder, rectPath, type Dieline } from '@diecut/core'
import { num, str, type ParamValue, type TemplateDefinition } from '../types.ts'
import { addCrossTray, linkTwoPiece } from './cross-tray.ts'

type Piece = 'base' | 'lid'

function buildTwoPiece(
  id: string,
  name: { tr: string; en: string },
  params: Record<string, ParamValue>,
  defaults: { lidRatio: number },
): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const fit = num(params, 'fitClearance')
  const lidHParam = num(params, 'lidHeight')
  const cornerRadius = num(params, 'cornerRadius')
  const bleed = num(params, 'bleed')
  const piece = str(params, 'piece') as Piece | 'both'
  const lidH = lidHParam > 0 ? lidHParam : Math.max(15, H * defaults.lidRatio)
  const lidL = L + 2 * caliper + fit
  const lidW = W + 2 * caliper + fit
  const gap = 20

  const b = new DielineBuilder(id, { name, caliper, glueFlapSide: 'none' }, params)
  const wantBase = piece === 'both' || piece === 'base'
  const wantLid = piece === 'both' || piece === 'lid'
  let bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  if (wantBase) {
    bounds = addCrossTray(b, piece === 'both' ? 'base' : '', { x: 0, y: 0 }, L, W, H, caliper, cornerRadius, true)
  }
  if (wantLid) {
    const dx = wantBase ? L + H + gap + lidH : 0
    const lidBounds = addCrossTray(b, wantBase ? 'lid' : '', { x: dx, y: 0 }, lidL, lidW, lidH, caliper, cornerRadius, !wantBase)
    if (wantBase) {
      linkTwoPiece(b, 'base-base', 'lid-base', { x: bounds.maxX, y: 0 }, { x: bounds.maxX, y: W })
      bounds = {
        minX: Math.min(bounds.minX, lidBounds.minX),
        minY: Math.min(bounds.minY, lidBounds.minY),
        maxX: Math.max(bounds.maxX, lidBounds.maxX),
        maxY: Math.max(bounds.maxY, lidBounds.maxY),
      }
    } else {
      bounds = lidBounds
    }
  }
  if (bleed > 0) {
    b.guide(
      'bleed',
      rectPath(bounds.minX - bleed, bounds.minY - bleed, bounds.maxX - bounds.minX + 2 * bleed, bounds.maxY - bounds.minY + 2 * bleed),
      'taşma payı',
    )
  }
  return b.build()
}

const twoPieceParams = (
  L: number,
  W: number,
  H: number,
  caliper: number,
): TemplateDefinition['params'] => [
  { kind: 'number', key: 'length', label: { tr: 'İç uzunluk', en: 'Inside length' }, unit: 'mm', min: 40, max: 1500, step: 1, default: L, group: 'dimensions' },
  { kind: 'number', key: 'width', label: { tr: 'İç genişlik', en: 'Inside width' }, unit: 'mm', min: 40, max: 1500, step: 1, default: W, group: 'dimensions' },
  { kind: 'number', key: 'height', label: { tr: 'Taban yüksekliği', en: 'Base height' }, unit: 'mm', min: 15, max: 400, step: 1, default: H, group: 'dimensions' },
  { kind: 'number', key: 'lidHeight', label: { tr: 'Kapak yüksekliği', en: 'Lid height' }, unit: 'mm', min: 0, max: 400, step: 1, default: 0, autoWhenZero: true, group: 'dimensions' },
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
  { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.3, max: 12, step: 0.1, default: caliper, group: 'material' },
  { kind: 'number', key: 'fitClearance', label: { tr: 'Kapak payı', en: 'Lid fit clearance' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 1, advanced: true, group: 'construction' },
  { kind: 'number', key: 'cornerRadius', label: { tr: 'Dış köşe yarıçapı', en: 'Outer corner radius' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 4, advanced: true, group: 'construction' },
  { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
]

export const shirtBox: TemplateDefinition = {
  id: 'shirt-box',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Gömlek kutusu', en: 'Shirt box' },
  description: {
    tr: 'Sığ iki parçalı kutu: taban tepsisi ve üzerine geçen kapak. Gömlek, bluz ve tekstil.',
    en: 'Shallow two-piece box — base tray and a lid that slides over it. Shirts and apparel.',
  },
  category: 'shirt-boxes',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['gömlek', 'shirt', 'tekstil', 'giyim', 'kapak taban'],
  params: twoPieceParams(350, 240, 40, 0.6),
  build: (p) =>
    buildTwoPiece('shirt-box', { tr: 'Gömlek kutusu', en: 'Shirt box' }, p, { lidRatio: 0.9 }),
}

export const rigidSetupBox: TemplateDefinition = {
  id: 'rigid-setup-box',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Kaplamalı sert kutu', en: 'Covered rigid / setup box' },
  description: {
    tr: 'Kalın mukavva taban + kapak. Mücevher, hediye ve lüks ambalajın formu; kâğıt kaplama ayrıca basılır.',
    en: 'Thick-board base and lid — jewellery and luxury gift boxes. Wrap paper is printed separately.',
  },
  category: 'covered-solid-board-boxes',
  materials: ['hardboard', 'carton'],
  maturity: 'beta',
  keywords: ['sert kutu', 'setup box', 'rigid', 'hediye', 'mücevher', 'kaplamalı'],
  params: twoPieceParams(180, 120, 40, 1.5),
  build: (p) =>
    buildTwoPiece('rigid-setup-box', { tr: 'Kaplamalı sert kutu', en: 'Covered rigid box' }, p, { lidRatio: 0.95 }),
}

export const fefco0421: TemplateDefinition = {
  id: 'fefco-0421',
  code: '0421',
  standard: 'FEFCO',
  name: { tr: 'Dört köşe yapıştırmalı tepsi (0421)', en: 'Four-corner glued tray (0421)' },
  description: {
    tr: 'Oluklu dört köşe tepsi. Meyve, fırın ve e-ticaret tepsisi — FEFCO 0421.',
    en: 'Corrugated four-corner tray — produce, bakery and e-commerce, FEFCO 0421.',
  },
  category: 'tray-boxes',
  materials: ['corrugated'],
  maturity: 'beta',
  keywords: ['0421', 'tepsi', 'tray', 'dört köşe', 'oluklu'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 40, max: 1500, step: 1, default: 300, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 40, max: 1500, step: 1, default: 200, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Duvar yüksekliği', en: 'Wall height' }, unit: 'mm', min: 15, max: 250, step: 1, default: 50, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.5, max: 12, step: 0.1, default: 2.5, group: 'material' },
    { kind: 'number', key: 'cornerRadius', label: { tr: 'Dış köşe yarıçapı', en: 'Outer corner radius' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 3, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: (p) => {
    const L = num(p, 'length')
    const W = num(p, 'width')
    const H = num(p, 'height')
    const caliper = num(p, 'caliper')
    const cornerRadius = num(p, 'cornerRadius')
    const bleed = num(p, 'bleed')
    const b = new DielineBuilder(
      'fefco-0421',
      { name: { tr: 'FEFCO 0421 tepsi', en: 'FEFCO 0421 tray' }, fefco: '0421', caliper, glueFlapSide: 'none' },
      p,
    )
    const bounds = addCrossTray(b, '', { x: 0, y: 0 }, L, W, H, caliper, cornerRadius, true)
    if (bleed > 0) {
      b.guide(
        'bleed',
        rectPath(bounds.minX - bleed, bounds.minY - bleed, bounds.maxX - bounds.minX + 2 * bleed, bounds.maxY - bounds.minY + 2 * bleed),
        'taşma payı',
      )
    }
    return b.build()
  },
}
