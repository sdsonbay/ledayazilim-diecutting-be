import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * Burger / clamshell — iki tepsi, ortak menteşe.
 *
 * Taban ve kapak aynı ölçüde; yan duvarlar menteşede yarıkla ayrılır.
 * QSR, salata ve pasta kutusu.
 */
function buildClamshell(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const cornerRadius = num(params, 'cornerRadius')
  const bleed = num(params, 'bleed')
  const backY1 = W + H
  const lidY1 = backY1 + W
  const lidFrontY = lidY1 + H

  const b = new DielineBuilder(
    'clamshell-burger',
    { name: { tr: 'Clamshell kutu', en: 'Clamshell box' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const corners: Point[] = [
    { x: 0, y: -H },
    { x: L, y: -H },
    { x: L, y: 0 },
    { x: L + H, y: 0 },
    { x: L + H, y: W },
    { x: L, y: W },
    { x: L, y: backY1 },
    { x: L + H, y: backY1 },
    { x: L + H, y: lidY1 },
    { x: L, y: lidY1 },
    { x: L, y: lidFrontY },
    { x: 0, y: lidFrontY },
    { x: 0, y: lidY1 },
    { x: -H, y: lidY1 },
    { x: -H, y: backY1 },
    { x: 0, y: backY1 },
    { x: 0, y: W },
    { x: -H, y: W },
    { x: -H, y: 0 },
    { x: 0, y: 0 },
  ]
  const outline = new PathBuilder()
  outline.moveTo(corners[0] as Point)
  for (let i = 1; i < corners.length; i++) {
    const p = corners[i] as Point
    const next = corners[(i + 1) % corners.length] as Point
    const round = i === 1 || i === 11
    if (round && cornerRadius > 0) outline.filletTo(p, next, cornerRadius)
    else outline.lineTo(p)
  }
  outline.close()
  b.cut(outline.build(), 'clamshell çevresi')

  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: { tr: 'Ön duvar', en: 'Front wall' }, outline: rectPoints(0, -H, L, H), role: 'wall' })
  b.panel({ id: 'back', name: 'back', label: { tr: 'Arka duvar', en: 'Back wall' }, outline: rectPoints(0, W, L, H), role: 'wall' })
  b.panel({ id: 'left', name: 'left', label: { tr: 'Sol duvar', en: 'Left wall' }, outline: rectPoints(-H, 0, H, W), role: 'wall' })
  b.panel({ id: 'right', name: 'right', label: { tr: 'Sağ duvar', en: 'Right wall' }, outline: rectPoints(L, 0, H, W), role: 'wall' })
  b.panel({ id: 'lid', name: 'lid', label: { tr: 'Kapak', en: 'Lid' }, outline: rectPoints(0, backY1, L, W), role: 'lid' })
  b.panel({ id: 'lid-front', name: 'lid-front', label: { tr: 'Kapak ön duvar', en: 'Lid front wall' }, outline: rectPoints(0, lidY1, L, H), role: 'wall' })
  b.panel({ id: 'lid-left', name: 'lid-left', label: { tr: 'Kapak sol duvar', en: 'Lid left wall' }, outline: rectPoints(-H, backY1, H, W), role: 'wall' })
  b.panel({ id: 'lid-right', name: 'lid-right', label: { tr: 'Kapak sağ duvar', en: 'Lid right wall' }, outline: rectPoints(L, backY1, H, W), role: 'wall' })

  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below') })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(W, 0, L, 'above') })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, W, 'left') })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(L, 0, W, 'right') })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(backY1, 0, L, 'above') })
  b.fold({ parent: 'lid', child: 'lid-front', ...foldHorizontal(lidY1, 0, L, 'above') })
  b.fold({ parent: 'lid', child: 'lid-left', ...foldVertical(0, backY1, lidY1, 'left') })
  b.fold({ parent: 'lid', child: 'lid-right', ...foldVertical(L, backY1, lidY1, 'right') })

  if (bleed > 0) {
    b.guide('bleed', rectPath(-H - bleed, -H - bleed, L + 2 * H + 2 * bleed, lidFrontY + H + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

export const clamshellBox: TemplateDefinition = {
  id: 'clamshell-burger',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Clamshell / burger kutusu', en: 'Clamshell / burger box' },
  description: {
    tr: 'Menteşeli iki tepsi. Burger, sandviç, salata ve pasta — gıda zincirinin klasik formu.',
    en: 'Two hinged trays — the QSR clamshell for burgers, salads and bakery.',
  },
  category: 'food-boxes',
  materials: ['carton', 'corrugated'],
  maturity: 'beta',
  keywords: ['clamshell', 'burger', 'sandviç', 'qsr', 'gıda', 'menteşe'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 50, max: 600, step: 1, default: 140, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 50, max: 600, step: 1, default: 140, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik (yarım)', en: 'Half height' }, unit: 'mm', min: 15, max: 120, step: 1, default: 40, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 6, step: 0.05, default: 0.4, group: 'material' },
    { kind: 'number', key: 'cornerRadius', label: { tr: 'Köşe yarıçapı', en: 'Corner radius' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 6, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildClamshell,
}
