import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical, snapLockMinorProfile, profileToPolygon } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * Pizza kutusu — menteşeli kapak, ön kilit kulakları, yan toz kapakları.
 */
function buildPizza(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const dustParam = num(params, 'lidDust')
  const bleed = num(params, 'bleed')
  const dustW = dustParam > 0 ? dustParam : Math.max(14, H * 0.85)
  const lidY0 = W + H
  const lidY1 = lidY0 + W
  const tab = Math.max(14, H * 0.55)

  const b = new DielineBuilder(
    'pizza-box',
    { name: { tr: 'Pizza kutusu', en: 'Pizza box' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const leftTab = snapLockMinorProfile({ x1: 8, x2: Math.min(L * 0.28, 70), y: -H, direction: -1, depth: tab, chamfer: tab * 0.35 })
  const rightTab = snapLockMinorProfile({ x1: Math.max(L * 0.72, L - 70), x2: L - 8, y: -H, direction: -1, depth: tab, chamfer: tab * 0.35 })

  const corners: Point[] = [
    { x: 0, y: -H },
    { x: L, y: -H },
    { x: L, y: 0 },
    { x: L + H, y: 0 },
    { x: L + H, y: W },
    { x: L, y: W },
    { x: L, y: lidY0 },
    { x: L + dustW, y: lidY0 },
    { x: L + dustW, y: lidY1 },
    { x: L, y: lidY1 },
    { x: 0, y: lidY1 },
    { x: -dustW, y: lidY1 },
    { x: -dustW, y: lidY0 },
    { x: 0, y: lidY0 },
    { x: 0, y: W },
    { x: -H, y: W },
    { x: -H, y: 0 },
    { x: 0, y: 0 },
  ]

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: -H })
  // Ön kenar: düz + iki kilit kulağı
  outline.lineTo({ x: 8, y: -H })
  for (let i = 1; i < leftTab.length; i++) outline.lineTo(leftTab[i]!.p)
  outline.lineTo({ x: rightTab[0]!.p.x, y: -H })
  for (let i = 1; i < rightTab.length; i++) outline.lineTo(rightTab[i]!.p)
  for (let i = 1; i < corners.length; i++) outline.lineTo(corners[i] as Point)
  outline.close()
  b.cut(outline.build(), 'pizza çevresi')

  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: { tr: 'Ön duvar', en: 'Front wall' }, outline: rectPoints(0, -H, L, H), role: 'wall' })
  b.panel({ id: 'back', name: 'back', label: { tr: 'Arka duvar', en: 'Back wall' }, outline: rectPoints(0, W, L, H), role: 'wall' })
  b.panel({ id: 'left', name: 'left', label: { tr: 'Sol duvar', en: 'Left wall' }, outline: rectPoints(-H, 0, H, W), role: 'wall' })
  b.panel({ id: 'right', name: 'right', label: { tr: 'Sağ duvar', en: 'Right wall' }, outline: rectPoints(L, 0, H, W), role: 'wall' })
  b.panel({ id: 'lid', name: 'lid', label: { tr: 'Kapak', en: 'Lid' }, outline: rectPoints(0, lidY0, L, W), role: 'lid' })
  b.panel({ id: 'lid-dust-left', name: 'lid-dust-left', label: { tr: 'Kapak sol toz', en: 'Lid left dust' }, outline: rectPoints(-dustW, lidY0, dustW, W), role: 'dust', printable: false })
  b.panel({ id: 'lid-dust-right', name: 'lid-dust-right', label: { tr: 'Kapak sağ toz', en: 'Lid right dust' }, outline: rectPoints(L, lidY0, dustW, W), role: 'dust', printable: false })
  b.panel({ id: 'lock-left', name: 'lock-left', label: { tr: 'Sol kilit', en: 'Left lock' }, outline: profileToPolygon(leftTab), role: 'lock' })
  b.panel({ id: 'lock-right', name: 'lock-right', label: { tr: 'Sağ kilit', en: 'Right lock' }, outline: profileToPolygon(rightTab), role: 'lock' })

  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below') })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(W, 0, L, 'above') })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, W, 'left') })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(L, 0, W, 'right') })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(lidY0, 0, L, 'above') })
  b.fold({ parent: 'lid', child: 'lid-dust-left', ...foldVertical(0, lidY0, lidY1, 'left') })
  b.fold({ parent: 'lid', child: 'lid-dust-right', ...foldVertical(L, lidY0, lidY1, 'right') })
  b.fold({ parent: 'front', child: 'lock-left', ...foldHorizontal(-H, leftTab[0]!.p.x, leftTab[leftTab.length - 1]!.p.x, 'below') })
  b.fold({ parent: 'front', child: 'lock-right', ...foldHorizontal(-H, rightTab[0]!.p.x, rightTab[rightTab.length - 1]!.p.x, 'below') })

  if (bleed > 0) {
    b.guide('bleed', rectPath(-H - dustW - bleed, -H - tab - bleed, L + 2 * H + 2 * dustW + 2 * bleed, lidY1 + H + tab + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

export const pizzaBox: TemplateDefinition = {
  id: 'pizza-box',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Pizza kutusu', en: 'Pizza box' },
  description: {
    tr: 'Menteşeli kapak, yan tozlar ve ön kilit kulakları. Pizza, pide ve büyük düz gıda.',
    en: 'Hinged lid with side dust flaps and front lock tabs — pizza and flat food.',
  },
  category: 'standard-boxes',
  materials: ['corrugated', 'carton'],
  maturity: 'beta',
  keywords: ['pizza', 'pide', 'gıda', 'menteşeli kapak'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 120, max: 600, step: 1, default: 320, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 120, max: 600, step: 1, default: 320, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 20, max: 80, step: 1, default: 40, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.5, max: 8, step: 0.1, default: 2.5, group: 'material' },
    { kind: 'number', key: 'lidDust', label: { tr: 'Kapak toz kapağı', en: 'Lid dust flap' }, unit: 'mm', min: 0, max: 80, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: buildPizza,
}
