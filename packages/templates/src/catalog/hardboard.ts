import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline, type Point } from '@diecut/core'
import { foldHorizontal, foldVertical } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/** Sert karton menteşeli kapak — kitap / puro kutusu. */
function buildHingedLid(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const lidY1 = W + H + W

  const b = new DielineBuilder(
    'hinged-lid-box',
    { name: { tr: 'Menteşeli kapaklı kutu', en: 'Hinged lid box' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const corners: Point[] = [
    { x: 0, y: -H },
    { x: L, y: -H },
    { x: L, y: 0 },
    { x: L + H, y: 0 },
    { x: L + H, y: W },
    { x: L, y: W },
    { x: L, y: W + H },
    { x: L + H, y: W + H },
    { x: L + H, y: lidY1 },
    { x: L, y: lidY1 },
    { x: L, y: lidY1 + H },
    { x: 0, y: lidY1 + H },
    { x: 0, y: lidY1 },
    { x: -H, y: lidY1 },
    { x: -H, y: W + H },
    { x: 0, y: W + H },
    { x: 0, y: W },
    { x: -H, y: W },
    { x: -H, y: 0 },
    { x: 0, y: 0 },
  ]
  const outline = new PathBuilder()
  outline.moveTo(corners[0] as Point)
  for (let i = 1; i < corners.length; i++) outline.lineTo(corners[i] as Point)
  outline.close()
  b.cut(outline.build(), 'menteşeli kutu çevresi')

  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'hinge', name: 'hinge', label: { tr: 'Menteşe duvarı', en: 'Hinge wall' }, outline: rectPoints(0, W, L, H), role: 'wall' })
  b.panel({ id: 'lid', name: 'lid', label: { tr: 'Kapak', en: 'Lid' }, outline: rectPoints(0, W + H, L, W), role: 'lid' })
  b.panel({ id: 'front', name: 'front', label: { tr: 'Ön duvar', en: 'Front wall' }, outline: rectPoints(0, -H, L, H), role: 'wall' })
  b.panel({ id: 'lid-front', name: 'lid-front', label: { tr: 'Kapak ön duvar', en: 'Lid front wall' }, outline: rectPoints(0, lidY1, L, H), role: 'wall' })
  b.panel({ id: 'left', name: 'left', label: { tr: 'Sol duvar', en: 'Left wall' }, outline: rectPoints(-H, 0, H, W), role: 'wall' })
  b.panel({ id: 'right', name: 'right', label: { tr: 'Sağ duvar', en: 'Right wall' }, outline: rectPoints(L, 0, H, W), role: 'wall' })
  b.panel({ id: 'lid-left', name: 'lid-left', label: { tr: 'Kapak sol', en: 'Lid left' }, outline: rectPoints(-H, W + H, H, W), role: 'wall' })
  b.panel({ id: 'lid-right', name: 'lid-right', label: { tr: 'Kapak sağ', en: 'Lid right' }, outline: rectPoints(L, W + H, H, W), role: 'wall' })

  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below') })
  b.fold({ parent: 'base', child: 'hinge', ...foldHorizontal(W, 0, L, 'above') })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, W, 'left') })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(L, 0, W, 'right') })
  b.fold({ parent: 'hinge', child: 'lid', ...foldHorizontal(W + H, 0, L, 'above') })
  b.fold({ parent: 'lid', child: 'lid-front', ...foldHorizontal(lidY1, 0, L, 'above') })
  b.fold({ parent: 'lid', child: 'lid-left', ...foldVertical(0, W + H, lidY1, 'left') })
  b.fold({ parent: 'lid', child: 'lid-right', ...foldVertical(L, W + H, lidY1, 'right') })

  if (bleed > 0) {
    b.guide('bleed', rectPath(-H - bleed, -H - bleed, L + 2 * H + 2 * bleed, lidY1 + 2 * H + 2 * bleed), 'taşma payı')
  }
  return b.build()
}

export const hingedLidBox: TemplateDefinition = {
  id: 'hinged-lid-box',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Menteşeli kapaklı sert kutu', en: 'Hinged lid rigid box' },
  description: {
    tr: 'Taban ve kapak arka duvardan birleşir. Puro, mücevher, kitap kutusu.',
    en: 'Base and lid joined at the back wall — cigar, jewellery and book boxes.',
  },
  category: 'boxes-with-hinged-lid',
  materials: ['hardboard', 'carton'],
  maturity: 'beta',
  keywords: ['menteşe', 'hinged', 'sert kutu', 'puro', 'kitap kutusu', 'cigar'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 40, max: 600, step: 1, default: 160, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 30, max: 400, step: 1, default: 110, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 10, max: 120, step: 1, default: 30, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.5, max: 8, step: 0.1, default: 1.5, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: buildHingedLid,
}

function buildBinder(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const H = num(params, 'height')
  const spine = num(params, 'spine')
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const hinge = Math.max(4, caliper * 2)

  const b = new DielineBuilder(
    'ring-binder',
    { name: { tr: 'Klasör kapağı', en: 'Binder cover' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const x1 = L
  const x2 = L + hinge
  const x3 = L + hinge + spine
  const x4 = L + 2 * hinge + spine
  const total = x4 + L

  b.cut(rectPath(0, 0, total, H), 'klasör çevresi')
  b.panel({ id: 'front', name: 'front', label: { tr: 'Ön kapak', en: 'Front cover' }, outline: rectPoints(0, 0, L, H), role: 'wall' })
  b.root('front')
  b.panel({ id: 'hinge-a', name: 'hinge-a', label: { tr: 'Menteşe', en: 'Hinge' }, outline: rectPoints(x1, 0, hinge, H), role: 'flap' })
  b.panel({ id: 'spine-panel', name: 'spine', label: { tr: 'Sırt', en: 'Spine' }, outline: rectPoints(x2, 0, spine, H), role: 'wall' })
  b.panel({ id: 'hinge-b', name: 'hinge-b', label: { tr: 'Menteşe', en: 'Hinge' }, outline: rectPoints(x3, 0, hinge, H), role: 'flap' })
  b.panel({ id: 'back', name: 'back', label: { tr: 'Arka kapak', en: 'Back cover' }, outline: rectPoints(x4, 0, L, H), role: 'wall' })

  b.fold({ parent: 'front', child: 'hinge-a', ...foldVertical(x1, 0, H, 'right') })
  b.fold({ parent: 'hinge-a', child: 'spine-panel', ...foldVertical(x2, 0, H, 'right') })
  b.fold({ parent: 'spine-panel', child: 'hinge-b', ...foldVertical(x3, 0, H, 'right') })
  b.fold({ parent: 'hinge-b', child: 'back', ...foldVertical(x4, 0, H, 'right') })

  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, total + 2 * bleed, H + 2 * bleed), 'taşma payı')
  return b.build()
}

export const ringBinder: TemplateDefinition = {
  id: 'ring-binder',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Halkalı klasör kapağı', en: 'Ring binder cover' },
  description: {
    tr: 'Ön kapak, sırt, arka kapak ve iki menteşe payı. Dosya ve swatch klasörü.',
    en: 'Front, spine, back and two hinge scores — files and swatch binders.',
  },
  category: 'binders',
  materials: ['hardboard', 'carton'],
  maturity: 'beta',
  keywords: ['klasör', 'binder', 'halka', 'sırt', 'dosya'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Kapak genişliği', en: 'Cover width' }, unit: 'mm', min: 80, max: 400, step: 1, default: 220, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Kapak yüksekliği', en: 'Cover height' }, unit: 'mm', min: 120, max: 500, step: 1, default: 310, group: 'dimensions' },
    { kind: 'number', key: 'spine', label: { tr: 'Sırt kalınlığı', en: 'Spine width' }, unit: 'mm', min: 8, max: 80, step: 1, default: 25, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.5, max: 4, step: 0.1, default: 1.5, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildBinder,
}

function buildSwatch(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const H = num(params, 'height')
  const cards = Math.max(2, Math.round(num(params, 'cards')))
  const caliper = num(params, 'caliper')
  const bleed = num(params, 'bleed')
  const bind = 18

  const b = new DielineBuilder(
    'swatch-fan',
    { name: { tr: 'Swatch kartı', en: 'Swatch card' }, caliper, glueFlapSide: 'none' },
    params,
  )

  const total = cards * L
  b.cut(rectPath(0, 0, total, H), 'swatch çevresi')
  for (let i = 0; i < cards; i++) {
    const id = `card-${i}`
    b.panel({
      id,
      name: id,
      label: { tr: `Kart ${i + 1}`, en: `Card ${i + 1}` },
      outline: rectPoints(i * L, 0, L, H),
      role: 'wall',
    })
    if (i === 0) b.root(id)
    else b.fold({ parent: `card-${i - 1}`, child: id, ...foldVertical(i * L, 0, H, 'right') })
  }
  b.cut(rectPath(4, H - bind - 4, 10, 10), 'askı deliği')

  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, total + 2 * bleed, H + 2 * bleed), 'taşma payı')
  return b.build()
}

export const swatchFan: TemplateDefinition = {
  id: 'swatch-fan',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Swatch / numune kartı', en: 'Swatch / sample fan' },
  description: {
    tr: 'Yan yana bağlı numune kartları. Renk, kumaş ve malzeme yelpazesi.',
    en: 'Joined sample cards — colour, fabric and material fans.',
  },
  category: 'swatch-cards',
  materials: ['hardboard', 'carton'],
  maturity: 'beta',
  keywords: ['swatch', 'numune', 'renk', 'kumaş', 'yelpaze'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Kart genişliği', en: 'Card width' }, unit: 'mm', min: 20, max: 120, step: 1, default: 40, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Kart yüksekliği', en: 'Card height' }, unit: 'mm', min: 40, max: 300, step: 1, default: 120, group: 'dimensions' },
    { kind: 'number', key: 'cards', label: { tr: 'Kart sayısı', en: 'Card count' }, min: 2, max: 12, step: 1, default: 5, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 3, step: 0.05, default: 0.4, group: 'material' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 2, advanced: true, group: 'prepress' },
  ],
  build: buildSwatch,
}
