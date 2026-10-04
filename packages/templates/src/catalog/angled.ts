import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/** Açılı / konik tepsi — üst ağız tabandan daha geniş. */
function buildTaperedTray(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const splay = num(params, 'splay')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const S = Math.max(0, splay)

  const b = new DielineBuilder(
    'tapered-tray',
    { name: { tr: 'Açılı tepsi', en: 'Tapered tray' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const corners: Point[] = [
    { x: -S, y: -H },
    { x: L + S, y: -H },
    { x: L, y: 0 },
    { x: L + H, y: -S },
    { x: L + H, y: W + S },
    { x: L, y: W },
    { x: L + S, y: W + H },
    { x: -S, y: W + H },
    { x: 0, y: W },
    { x: -H, y: W + S },
    { x: -H, y: -S },
    { x: 0, y: 0 },
  ]
  const outline = new PathBuilder()
  outline.moveTo(corners[0] as Point)
  for (let i = 1; i < corners.length; i++) outline.lineTo(corners[i] as Point)
  outline.close()
  b.cut(outline.build(), 'açılı tepsi çevresi')

  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({
    id: 'front',
    name: 'front',
    label: { tr: 'Ön duvar', en: 'Front wall' },
    outline: [
      { x: 0, y: 0 },
      { x: L, y: 0 },
      { x: L + S, y: -H },
      { x: -S, y: -H },
    ],
    role: 'wall',
  })
  b.panel({
    id: 'back',
    name: 'back',
    label: { tr: 'Arka duvar', en: 'Back wall' },
    outline: [
      { x: 0, y: W },
      { x: L, y: W },
      { x: L + S, y: W + H },
      { x: -S, y: W + H },
    ],
    role: 'wall',
  })
  b.panel({
    id: 'left',
    name: 'left',
    label: { tr: 'Sol duvar', en: 'Left wall' },
    outline: [
      { x: 0, y: 0 },
      { x: 0, y: W },
      { x: -H, y: W + S },
      { x: -H, y: -S },
    ],
    role: 'wall',
  })
  b.panel({
    id: 'right',
    name: 'right',
    label: { tr: 'Sağ duvar', en: 'Right wall' },
    outline: [
      { x: L, y: 0 },
      { x: L, y: W },
      { x: L + H, y: W + S },
      { x: L + H, y: -S },
    ],
    role: 'wall',
  })

  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below') })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(W, 0, L, 'above') })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, W, 'left') })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(L, 0, W, 'right') })

  if (bleed > 0) {
    b.guide('bleed', rectPath(-H - S - bleed, -H - bleed, L + 2 * H + 2 * S + 2 * bleed, W + 2 * H + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

export const taperedTray: TemplateDefinition = {
  id: 'tapered-tray',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Açılı / konik tepsi', en: 'Tapered tray' },
  description: {
    tr: 'Üst ağız tabandan geniş. Meyve, çiçek ve istiflenen tepsiler; açılı kutu ailesi.',
    en: 'Opening wider than the base — produce, flowers and nested trays.',
  },
  category: 'angled-boxes',
  materials: ['carton', 'corrugated'],
  maturity: 'beta',
  keywords: ['açılı', 'konik', 'tapered', 'eğik', 'tepsi', 'nested'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Taban uzunluğu', en: 'Base length' }, unit: 'mm', min: 40, max: 800, step: 1, default: 180, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Taban genişliği', en: 'Base width' }, unit: 'mm', min: 40, max: 800, step: 1, default: 120, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Duvar yüksekliği', en: 'Wall height' }, unit: 'mm', min: 15, max: 200, step: 1, default: 45, group: 'dimensions' },
    { kind: 'number', key: 'splay', label: { tr: 'Açılma (yan başına)', en: 'Splay per side' }, unit: 'mm', min: 0, max: 80, step: 0.5, default: 12, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 8, step: 0.05, default: 0.5, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildTaperedTray,
}
