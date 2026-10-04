import { DielineBuilder, PathBuilder, rectPath, type Dieline } from '@diecut/core'
import {
  bowedEdge,
  emitProfile,
  foldVertical,
  girthLayout,
  glueFlapProfile,
  panelFromEdges,
  reverseProfile,
  type Profile,
} from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * ECMA A50.20 — yastık kutu.
 *
 * İki ana yüz + iki yan + yapıştırma. Üst ve alt kenarlar içbükey yay:
 * kutu sıkılınca uçlar kapanır. Hediye, sabun, takı.
 */
function buildPillow(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const glueWidth = num(params, 'glueFlap')
  const bulgeParam = num(params, 'endBulge')
  const bleed = num(params, 'bleed')
  const bulge = bulgeParam > 0 ? bulgeParam : Math.max(6, Math.min(L, H) * 0.18)

  const [sideA, front, sideB, back] = girthLayout([W, L, W, L]) as [
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
  ]
  const glueX1 = back.x2
  const glueX2 = glueX1 + glueWidth
  const glueTaper = Math.min(3, H * 0.1)

  const b = new DielineBuilder(
    'ecma-a50-20',
    { name: { tr: 'Yastık kutu', en: 'Pillow box' }, ecma: 'A50.20', caliper, glueFlapSide: glueWidth > 0 ? 'right' : 'none' },
    params,
  )

  const segments = [sideA, front, sideB, back]
  const isFace = (_seg: { width: number }, i: number) => i === 1 || i === 3
  const topOf = (seg: { x1: number; x2: number; width: number }, i: number): Profile =>
    isFace(seg, i)
      ? bowedEdge(seg.x1, seg.x2, H, 1, bulge)
      : [
          { p: { x: seg.x1, y: H } },
          { p: { x: (seg.x1 + seg.x2) / 2, y: H - Math.min(bulge * 0.7, W * 0.45) } },
          { p: { x: seg.x2, y: H } },
        ]
  const botOf = (seg: { x1: number; x2: number; width: number }, i: number): Profile =>
    isFace(seg, i)
      ? bowedEdge(seg.x1, seg.x2, 0, -1, bulge)
      : [
          { p: { x: seg.x1, y: 0 } },
          { p: { x: (seg.x1 + seg.x2) / 2, y: Math.min(bulge * 0.7, W * 0.45) } },
          { p: { x: seg.x2, y: 0 } },
        ]

  const bottom = segments.map((s, i) => botOf(s, i))
  const top = segments.map((s, i) => topOf(s, i))

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: 0 })
  for (const p of bottom) emitProfile(outline, p)
  if (glueWidth > 0) {
    const glue = glueFlapProfile(glueX1, glueX2, 0, H, glueTaper)
    for (let i = 1; i < glue.length; i++) outline.lineTo(glue[i] as { x: number; y: number })
  }
  outline.lineTo({ x: glueX1, y: H })
  for (let i = top.length - 1; i >= 0; i--) emitProfile(outline, reverseProfile(top[i] as Profile))
  outline.close()
  b.cut(outline.build(), 'yastık çevresi')

  const walls: [string, { x1: number; x2: number; width: number }, { tr: string; en: string }][] = [
    ['left', sideA, { tr: 'Sol yan', en: 'Left side' }],
    ['front', front, { tr: 'Ön', en: 'Front' }],
    ['right', sideB, { tr: 'Sağ yan', en: 'Right side' }],
    ['back', back, { tr: 'Arka', en: 'Back' }],
  ]
  walls.forEach(([id, seg, label], i) => {
    b.panel({
      id,
      name: id,
      label,
      outline: panelFromEdges(botOf(seg, i), topOf(seg, i)),
      role: 'wall',
    })
  })
  b.root('front')
  b.fold({ parent: 'front', child: 'left', ...foldVertical(front.x1, 0, H, 'left') })
  b.fold({ parent: 'front', child: 'right', ...foldVertical(front.x2, 0, H, 'right') })
  b.fold({ parent: 'right', child: 'back', ...foldVertical(sideB.x2, 0, H, 'right') })

  if (glueWidth > 0) {
    b.panel({
      id: 'glue',
      name: 'glue-flap',
      label: { tr: 'Yapıştırma payı', en: 'Glue flap' },
      outline: glueFlapProfile(glueX1, glueX2, 0, H, glueTaper),
      role: 'glue',
      printable: false,
    })
    b.fold({ parent: 'back', child: 'glue', ...foldVertical(glueX1, 0, H, 'right') })
  }

  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, glueX2 + 2 * bleed, H + 2 * bleed), 'taşma payı')
  return b.build()
}

export const pillowBox: TemplateDefinition = {
  id: 'ecma-a50-20',
  code: 'A50.20',
  standard: 'ECMA',
  name: { tr: 'Yastık kutu', en: 'Pillow box' },
  description: {
    tr: 'İki uçtan sıkılınca kapanan kavisli kutu. Hediye, sabun, takı ve küçük tekstil için.',
    en: 'Pinched curved ends close the box — gifts, soap, jewellery and small textiles.',
  },
  category: 'carton-bags-pillows',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['pillow', 'yastık', 'a50', 'hediye', 'sabun', 'takı'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 20, max: 800, step: 0.5, default: 120, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Kalınlık', en: 'Depth' }, unit: 'mm', min: 8, max: 200, step: 0.5, default: 30, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 20, max: 800, step: 0.5, default: 80, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 4, step: 0.05, default: 0.35, group: 'material' },
    { kind: 'number', key: 'glueFlap', label: { tr: 'Yapıştırma payı', en: 'Glue flap' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 12, group: 'construction' },
    { kind: 'number', key: 'endBulge', label: { tr: 'Uç kavis derinliği', en: 'End curve depth' }, unit: 'mm', min: 0, max: 80, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildPillow,
}
