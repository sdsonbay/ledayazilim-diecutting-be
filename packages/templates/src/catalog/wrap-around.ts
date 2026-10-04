import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline } from '@diecut/core'
import {
  emitProfile,
  foldHorizontal,
  foldVertical,
  girthLayout,
  glueFlapProfile,
  profileToPolygon,
  reverseProfile,
  type Profile,
} from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * FEFCO 0401 — wrap-around (sargı) kutu.
 *
 * Ürünün etrafına sarılan dört gövde paneli; kapaklar yalnızca uzun
 * yüzlerde. İçecek, konserve ve otomatik hat.
 */
function buildWrap(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const glueWidth = num(params, 'glueFlap')
  const flapParam = num(params, 'flapDepth')
  const bleed = num(params, 'bleed')
  const flap = flapParam > 0 ? flapParam : Math.max(12, W * 0.45)

  const [front, bottom, back, top] = girthLayout([L, H, L, H]) as [
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
  ]
  const glueX1 = top.x2
  const glueX2 = glueX1 + glueWidth

  const b = new DielineBuilder(
    'fefco-0713',
    { name: { tr: 'Wrap-around koli', en: 'Wrap-around carton' }, fefco: '0401', caliper, glueFlapSide: glueWidth > 0 ? 'right' : 'none' },
    params,
  )

  const flapAt = (seg: { x1: number; x2: number }, y: number, d: 1 | -1): Profile => [
    { p: { x: seg.x1, y } },
    { p: { x: seg.x1 + 3, y: y + d * flap } },
    { p: { x: seg.x2 - 3, y: y + d * flap } },
    { p: { x: seg.x2, y } },
  ]
  const flat = (seg: { x1: number; x2: number }, y: number): Profile => [
    { p: { x: seg.x1, y } },
    { p: { x: seg.x2, y } },
  ]

  const segs = [front, bottom, back, top]
  const bottomP = segs.map((s, i) => (i % 2 === 0 ? flapAt(s, 0, -1) : flat(s, 0)))
  const topP = segs.map((s, i) => (i % 2 === 0 ? flapAt(s, W, 1) : flat(s, W)))

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: 0 })
  for (const p of bottomP) emitProfile(outline, p)
  if (glueWidth > 0) {
    const glue = glueFlapProfile(glueX1, glueX2, 0, W, Math.min(3, W * 0.1))
    for (let i = 1; i < glue.length; i++) outline.lineTo(glue[i] as { x: number; y: number })
  }
  outline.lineTo({ x: glueX1, y: W })
  for (let i = topP.length - 1; i >= 0; i--) emitProfile(outline, reverseProfile(topP[i] as Profile))
  outline.close()
  b.cut(outline.build(), 'wrap çevresi')

  const walls: [string, { x1: number; width: number }, { tr: string; en: string }][] = [
    ['front', front, { tr: 'Ön', en: 'Front' }],
    ['bottom', bottom, { tr: 'Taban', en: 'Bottom' }],
    ['back', back, { tr: 'Arka', en: 'Back' }],
    ['top', top, { tr: 'Üst', en: 'Top' }],
  ]
  for (const [id, seg, label] of walls) {
    b.panel({ id, name: id, label, outline: rectPoints(seg.x1, 0, seg.width, W), role: id === 'bottom' ? 'bottom' : 'wall' })
  }
  b.root('bottom')
  b.fold({ parent: 'bottom', child: 'front', ...foldVertical(front.x2, 0, W, 'left') })
  b.fold({ parent: 'bottom', child: 'back', ...foldVertical(bottom.x2, 0, W, 'right') })
  b.fold({ parent: 'back', child: 'top', ...foldVertical(back.x2, 0, W, 'right') })

  if (glueWidth > 0) {
    b.panel({
      id: 'glue',
      name: 'glue',
      label: { tr: 'Yapıştırma payı', en: 'Glue flap' },
      outline: glueFlapProfile(glueX1, glueX2, 0, W, Math.min(3, W * 0.1)),
      role: 'glue',
      printable: false,
    })
    b.fold({ parent: 'top', child: 'glue', ...foldVertical(glueX1, 0, W, 'right') })
  }

  segs.forEach((seg, i) => {
    if (i % 2 !== 0) return
    const wall = (walls[i] as [string, unknown, unknown])[0]
    for (const pos of ['top', 'bottom'] as const) {
      const profile = (pos === 'top' ? topP[i] : bottomP[i]) as Profile
      const id = `${wall}-${pos}-flap`
      b.panel({
        id,
        name: id,
        label: { tr: pos === 'top' ? 'Yan kapak' : 'Yan kapak', en: 'End flap' },
        outline: profileToPolygon(profile),
        role: 'flap',
      })
      b.fold({ parent: wall, child: id, ...foldHorizontal(pos === 'top' ? W : 0, seg.x1, seg.x2, pos === 'top' ? 'above' : 'below') })
    }
  })

  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -flap - bleed, glueX2 + 2 * bleed, W + 2 * flap + 2 * bleed), 'taşma payı')
  return b.build()
}

export const wrapAround: TemplateDefinition = {
  id: 'fefco-0713',
  code: '0401',
  standard: 'FEFCO',
  name: { tr: 'Wrap-around koli', en: 'Wrap-around carton' },
  description: {
    tr: 'Ürünün etrafına sarılan koli. Otomatik hat, içecek ve konserve paketlemenin standardı.',
    en: 'Wraps around the product on an automatic line — beverages and cans.',
  },
  category: 'standard-boxes',
  materials: ['corrugated'],
  maturity: 'beta',
  keywords: ['0401', 'wrap-around', 'sarma', 'içecek', 'konserve'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 40, max: 1200, step: 1, default: 300, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 40, max: 1200, step: 1, default: 200, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 20, max: 800, step: 1, default: 250, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.5, max: 12, step: 0.1, default: 3, group: 'material' },
    { kind: 'number', key: 'glueFlap', label: { tr: 'Yapıştırma payı', en: 'Glue flap' }, unit: 'mm', min: 0, max: 80, step: 1, default: 35, group: 'construction' },
    { kind: 'number', key: 'flapDepth', label: { tr: 'Yan kapak derinliği', en: 'End flap depth' }, unit: 'mm', min: 0, max: 400, step: 1, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: buildWrap,
}
