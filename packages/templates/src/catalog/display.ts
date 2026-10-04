import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * Tezgâh display — tepsi + yüksek arka header.
 *
 * POS / shelf ready. Ön duvar alçak, arka duvar header kadar uzar.
 */
function buildDisplay(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const header = num(params, 'headerHeight')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const headerH = header > 0 ? header : Math.max(40, H * 2.2)
  const backTop = W + H + headerH

  const b = new DielineBuilder(
    'display-counter',
    { name: { tr: 'Tezgâh display', en: 'Counter display' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const corners: Point[] = [
    { x: 0, y: -H },
    { x: L, y: -H },
    { x: L, y: 0 },
    { x: L + H, y: 0 },
    { x: L + H, y: W },
    { x: L, y: W },
    { x: L, y: backTop },
    { x: 0, y: backTop },
    { x: 0, y: W },
    { x: -H, y: W },
    { x: -H, y: 0 },
    { x: 0, y: 0 },
  ]
  const outline = new PathBuilder()
  outline.moveTo(corners[0] as Point)
  for (let i = 1; i < corners.length; i++) outline.lineTo(corners[i] as Point)
  outline.close()
  b.cut(outline.build(), 'display çevresi')

  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: { tr: 'Ön duvar', en: 'Front wall' }, outline: rectPoints(0, -H, L, H), role: 'wall' })
  b.panel({ id: 'left', name: 'left', label: { tr: 'Sol duvar', en: 'Left wall' }, outline: rectPoints(-H, 0, H, W), role: 'wall' })
  b.panel({ id: 'right', name: 'right', label: { tr: 'Sağ duvar', en: 'Right wall' }, outline: rectPoints(L, 0, H, W), role: 'wall' })
  b.panel({ id: 'back', name: 'back', label: { tr: 'Arka duvar + header', en: 'Back wall + header' }, outline: rectPoints(0, W, L, H + headerH), role: 'wall' })

  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below') })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(W, 0, L, 'above') })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, W, 'left') })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(L, 0, W, 'right') })

  if (bleed > 0) {
    b.guide('bleed', rectPath(-H - bleed, -H - bleed, L + 2 * H + 2 * bleed, backTop + H + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

export const counterDisplay: TemplateDefinition = {
  id: 'display-counter',
  code: '08',
  standard: 'FEFCO',
  name: { tr: 'Tezgâh display', en: 'Counter display' },
  description: {
    tr: 'Alçak ön duvar, yüksek header. POS ve raf üstü sergileme — FEFCO 08 ailesi.',
    en: 'Low front wall and a tall header — POS / shelf-ready, FEFCO 08 family.',
  },
  category: 'special-boxes',
  materials: ['corrugated', 'carton'],
  maturity: 'beta',
  keywords: ['display', 'tezgâh', 'pos', 'header', 'raf', '08'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 40, max: 800, step: 1, default: 220, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Derinlik', en: 'Depth' }, unit: 'mm', min: 30, max: 400, step: 1, default: 80, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Ön duvar', en: 'Front wall' }, unit: 'mm', min: 15, max: 200, step: 1, default: 40, group: 'dimensions' },
    { kind: 'number', key: 'headerHeight', label: { tr: 'Header yüksekliği', en: 'Header height' }, unit: 'mm', min: 0, max: 500, step: 1, default: 0, autoWhenZero: true, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.3, max: 8, step: 0.1, default: 2, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: buildDisplay,
}
