import { DielineBuilder, PathBuilder, rectPath, rectPoints, stadiumPath, type Dieline } from '@diecut/core'
import { bool, num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * Askılı etiket / header kartı. Euroslot isteğe bağlı.
 */
function buildHangTag(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const radius = num(params, 'cornerRadius')
  const hole = bool(params, 'euroHole')
  const bleed = num(params, 'bleed')

  const b = new DielineBuilder(
    'tag-hang',
    { name: { tr: 'Askılı etiket', en: 'Hang tag' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const outline = new PathBuilder()
  outline.moveTo({ x: radius, y: 0 })
  outline.lineTo({ x: L - radius, y: 0 })
  outline.filletTo({ x: L, y: 0 }, { x: L, y: H }, radius)
  outline.lineTo({ x: L, y: H - radius })
  outline.filletTo({ x: L, y: H }, { x: 0, y: H }, radius)
  outline.lineTo({ x: radius, y: H })
  outline.filletTo({ x: 0, y: H }, { x: 0, y: 0 }, radius)
  outline.lineTo({ x: 0, y: radius })
  outline.filletTo({ x: 0, y: 0 }, { x: L, y: 0 }, radius)
  outline.close()
  b.cut(outline.build(), 'etiket çevresi')

  b.panel({ id: 'face', name: 'face', label: { tr: 'Etiket', en: 'Tag' }, outline: rectPoints(0, 0, L, H), role: 'wall' })
  b.root('face')

  if (hole) {
    const slotW = Math.min(30, L * 0.55)
    if (slotW >= 12 && H >= 28) b.cut(stadiumPath({ x: L / 2, y: H - 12 }, slotW, 4), 'euroslot')
  }

  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, L + 2 * bleed, H + 2 * bleed), 'taşma payı')
  return b.build()
}

export const hangTag: TemplateDefinition = {
  id: 'tag-hang',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Askılı etiket', en: 'Hang tag' },
  description: {
    tr: 'Yuvarlatılmış köşeli kart. Euroslot ile askı; giyim, kozmetik ve hediye etiketleri.',
    en: 'Rounded card with an optional euroslot — apparel, cosmetics and gift tags.',
  },
  category: 'tags',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['etiket', 'tag', 'askı', 'header', 'euroslot', 'kart'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 20, max: 300, step: 0.5, default: 50, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 30, max: 400, step: 0.5, default: 90, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 4, step: 0.05, default: 0.5, group: 'material' },
    { kind: 'boolean', key: 'euroHole', label: { tr: 'Askı deliği', en: 'Hang hole' }, default: true, group: 'options' },
    { kind: 'number', key: 'cornerRadius', label: { tr: 'Köşe yarıçapı', en: 'Corner radius' }, unit: 'mm', min: 0, max: 30, step: 0.5, default: 4, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 2, advanced: true, group: 'prepress' },
  ],
  build: buildHangTag,
}
