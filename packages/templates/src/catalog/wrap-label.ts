import { DielineBuilder, rectPath, rectPoints, type Dieline } from '@diecut/core'
import { foldVertical } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

function buildWrapLabel(params: Record<string, ParamValue>): Dieline {
  const diameter = num(params, 'diameter')
  const H = num(params, 'height')
  const overlap = num(params, 'overlap')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const wrap = Math.PI * diameter + overlap

  const b = new DielineBuilder(
    'wrap-label',
    { name: { tr: 'Sargı etiket', en: 'Wrap-around label' }, caliper, glueFlapSide: overlap > 0 ? 'right' : 'none' },
    params,
  )

  b.cut(rectPath(0, 0, wrap, H), 'etiket çevresi')
  b.panel({ id: 'face', name: 'face', label: { tr: 'Etiket', en: 'Label' }, outline: rectPoints(0, 0, wrap - overlap, H), role: 'wall' })
  b.root('face')
  if (overlap > 0) {
    b.panel({
      id: 'overlap',
      name: 'overlap',
      label: { tr: 'Bindirme', en: 'Overlap' },
      outline: rectPoints(wrap - overlap, 0, overlap, H),
      role: 'glue',
      printable: false,
    })
    b.fold({ parent: 'face', child: 'overlap', ...foldVertical(wrap - overlap, 0, H, 'right', 0) })
  }
  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, wrap + 2 * bleed, H + 2 * bleed), 'taşma payı')
  return b.build()
}

export const wrapLabel: TemplateDefinition = {
  id: 'wrap-label',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Sargı etiket', en: 'Wrap-around label' },
  description: {
    tr: 'Şişe / kavanoz çevresi: π × çap + bindirme. Düz dikdörtgen bıçak izi.',
    en: 'Bottle / jar wrap: π × diameter plus overlap. A rectangular dieline.',
  },
  category: 'wrap-around-labels',
  materials: ['carton', 'plastic'],
  maturity: 'beta',
  keywords: ['sargı', 'etiket', 'label', 'wrap', 'şişe', 'kavanoz'],
  params: [
    { kind: 'number', key: 'diameter', label: { tr: 'Çap', en: 'Diameter' }, unit: 'mm', min: 15, max: 200, step: 0.5, default: 70, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 10, max: 400, step: 0.5, default: 80, group: 'dimensions' },
    { kind: 'number', key: 'overlap', label: { tr: 'Bindirme', en: 'Overlap' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 8, group: 'construction' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.05, max: 1, step: 0.01, default: 0.12, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 10, step: 0.5, default: 2, advanced: true, group: 'prepress' },
  ],
  build: buildWrapLabel,
}
