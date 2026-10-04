import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline } from '@diecut/core'
import { foldVertical, girthLayout } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * Beş panelli klasör (5PF) — kitap, evrak ve e-ticaret gönderisi.
 *
 * Soldan sağa: iç kapak · sol yan · taban · sağ yan · iç kapak.
 */
function buildFivePanel(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const innerParam = num(params, 'innerFlap')
  const bleed = num(params, 'bleed')
  const inner = innerParam > 0 ? innerParam : Math.max(20, L * 0.7)

  const [leftInner, left, base, right, rightInner] = girthLayout([inner, H, L, H, inner]) as [
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
  ]
  const end = rightInner.x2
  const taper = Math.min(8, W * 0.08)

  const b = new DielineBuilder(
    'folder-5panel',
    { name: { tr: 'Beş panelli klasör', en: 'Five panel folder' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const outline = new PathBuilder()
  outline.moveTo({ x: taper, y: 0 })
  outline.lineTo({ x: end - taper, y: 0 })
  outline.lineTo({ x: end, y: taper })
  outline.lineTo({ x: end, y: W - taper })
  outline.lineTo({ x: end - taper, y: W })
  outline.lineTo({ x: taper, y: W })
  outline.lineTo({ x: 0, y: W - taper })
  outline.lineTo({ x: 0, y: taper })
  outline.close()
  b.cut(outline.build(), 'klasör çevresi')

  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: rectPoints(base.x1, 0, base.width, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'left', name: 'left', label: { tr: 'Sol yan', en: 'Left wall' }, outline: rectPoints(left.x1, 0, left.width, W), role: 'wall' })
  b.panel({ id: 'right', name: 'right', label: { tr: 'Sağ yan', en: 'Right wall' }, outline: rectPoints(right.x1, 0, right.width, W), role: 'wall' })
  b.panel({ id: 'left-inner', name: 'left-inner', label: { tr: 'Sol iç kapak', en: 'Left inner flap' }, outline: rectPoints(leftInner.x1, 0, leftInner.width, W), role: 'flap' })
  b.panel({ id: 'right-inner', name: 'right-inner', label: { tr: 'Sağ iç kapak', en: 'Right inner flap' }, outline: rectPoints(rightInner.x1, 0, rightInner.width, W), role: 'flap' })

  b.fold({ parent: 'base', child: 'left', ...foldVertical(base.x1, 0, W, 'left') })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(base.x2, 0, W, 'right') })
  b.fold({ parent: 'left', child: 'left-inner', ...foldVertical(left.x1, 0, W, 'left') })
  b.fold({ parent: 'right', child: 'right-inner', ...foldVertical(right.x2, 0, W, 'right') })

  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, end + 2 * bleed, W + 2 * bleed), 'taşma payı')
  return b.build()
}

export const fivePanelFolder: TemplateDefinition = {
  id: 'folder-5panel',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Beş panelli klasör', en: 'Five panel folder' },
  description: {
    tr: 'Kitap, katalog ve evrak gönderisi. Tutkalsız kapanır; e-ticaret mailer’a ucuz alternatif.',
    en: 'Ships books and documents — a glueless folder and a cheap mailer alternative.',
  },
  category: 'folders',
  materials: ['corrugated', 'carton'],
  maturity: 'beta',
  keywords: ['5pf', 'klasör', 'folder', 'kitap', 'evrak', 'beş panel'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk (taban)', en: 'Length (base)' }, unit: 'mm', min: 40, max: 1200, step: 1, default: 250, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 40, max: 800, step: 1, default: 180, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik (yan)', en: 'Height (side)' }, unit: 'mm', min: 10, max: 200, step: 1, default: 40, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.3, max: 8, step: 0.1, default: 2, group: 'material' },
    { kind: 'number', key: 'innerFlap', label: { tr: 'İç kapak genişliği', en: 'Inner flap width' }, unit: 'mm', min: 0, max: 800, step: 1, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: buildFivePanel,
}
