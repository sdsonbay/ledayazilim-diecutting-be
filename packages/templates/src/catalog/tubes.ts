import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline } from '@diecut/core'
import { emitProfile, flatEdge, foldVertical, girthLayout, glueFlapProfile, reverseProfile, type Profile } from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

function buildTube(sides: 3 | 4 | 5 | 6 | 8, id: string, params: Record<string, ParamValue>): Dieline {
  const D = num(params, 'diameter')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const glueWidth = num(params, 'glueFlap')
  const bleed = num(params, 'bleed')
  const panelW = D * Math.tan(Math.PI / sides)
  const widths = Array.from({ length: sides }, () => panelW)
  const segments = girthLayout(widths)
  const girthEnd = (segments[sides - 1] as { x2: number }).x2
  const glueEnd = girthEnd + glueWidth
  const foldAngle = 360 / sides

  const names: Record<number, { tr: string; en: string }> = {
    3: { tr: 'Üçgen tüp', en: 'Triangular tube' },
    4: { tr: 'Kare tüp', en: 'Square tube' },
    5: { tr: 'Beşgen tüp', en: 'Pentagon tube' },
    6: { tr: 'Altıgen tüp', en: 'Hexagonal tube' },
    8: { tr: 'Sekizgen tüp', en: 'Octagonal tube' },
  }

  const b = new DielineBuilder(
    id,
    {
      name: names[sides] ?? { tr: 'Çokgen tüp', en: 'Polygonal tube' },
      caliper,
      glueFlapSide: glueWidth > 0 ? 'right' : 'none',
    },
    params,
  )

  const bottom: Profile[] = segments.map((s) => flatEdge(s.x1, s.x2, 0))
  const top: Profile[] = segments.map((s) => flatEdge(s.x1, s.x2, H))
  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: 0 })
  for (const p of bottom) emitProfile(outline, p)
  if (glueWidth > 0) {
    const glue = glueFlapProfile(girthEnd, glueEnd, 0, H, Math.min(3, H * 0.1))
    for (let i = 1; i < glue.length; i++) outline.lineTo(glue[i] as { x: number; y: number })
  }
  outline.lineTo({ x: girthEnd, y: H })
  for (let i = top.length - 1; i >= 0; i--) emitProfile(outline, reverseProfile(top[i] as Profile))
  outline.close()
  b.cut(outline.build(), 'tüp çevresi')

  segments.forEach((seg, i) => {
    const pid = `p${i}`
    b.panel({
      id: pid,
      name: pid,
      label: { tr: `Panel ${i + 1}`, en: `Panel ${i + 1}` },
      outline: rectPoints(seg.x1, 0, seg.width, H),
      role: 'wall',
    })
  })
  b.root('p0')
  for (let i = 1; i < sides; i++) {
    const x = (segments[i] as { x1: number }).x1
    b.fold({ parent: `p${i - 1}`, child: `p${i}`, ...foldVertical(x, 0, H, 'right', foldAngle) })
  }
  if (glueWidth > 0) {
    b.panel({
      id: 'glue',
      name: 'glue',
      label: { tr: 'Yapıştırma payı', en: 'Glue flap' },
      outline: glueFlapProfile(girthEnd, glueEnd, 0, H, Math.min(3, H * 0.1)),
      role: 'glue',
      printable: false,
    })
    b.fold({ parent: `p${sides - 1}`, child: 'glue', ...foldVertical(girthEnd, 0, H, 'right', foldAngle) })
  }

  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -bleed, glueEnd + 2 * bleed, H + 2 * bleed), 'taşma payı')
  return b.build()
}

const tubeParams = (diameter: number): TemplateDefinition['params'] => [
  { kind: 'number', key: 'diameter', label: { tr: 'Düzler arası çap', en: 'Flat-to-flat diameter' }, unit: 'mm', min: 20, max: 400, step: 0.5, default: diameter, group: 'dimensions' },
  { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 20, max: 800, step: 0.5, default: 120, group: 'dimensions' },
  { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.2, max: 6, step: 0.05, default: 0.4, group: 'material' },
  { kind: 'number', key: 'glueFlap', label: { tr: 'Yapıştırma payı', en: 'Glue flap' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 12, group: 'construction' },
  { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
]

export const hexTube: TemplateDefinition = {
  id: 'tube-hex',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Altıgen tüp / kılıf', en: 'Hexagonal tube' },
  description: {
    tr: 'Altı panelli açık tüp. Şişe kılıfı, mum ve özel kesitli ambalaj.',
    en: 'Six-panel open tube — bottle sleeves, candles and specialty packs.',
  },
  category: 'polygonal-boxes',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['altıgen', 'hex', 'tüp', 'kılıf', 'şişe', 'mum', 'çokgen'],
  params: tubeParams(70),
  build: (p) => buildTube(6, 'tube-hex', p),
}

export const octagonTube: TemplateDefinition = {
  id: 'tube-octagon',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Sekizgen tüp / kılıf', en: 'Octagonal tube' },
  description: {
    tr: 'Sekiz panelli açık tüp. Yuvarlağa yakın kılıf; premium şişe ve hediye.',
    en: 'Eight-panel open tube — nearly round sleeves for premium bottles.',
  },
  category: 'polygonal-boxes',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['sekizgen', 'octagon', 'tüp', 'kılıf', 'şişe', 'çokgen'],
  params: tubeParams(80),
  build: (p) => buildTube(8, 'tube-octagon', p),
}

export const triangleTube: TemplateDefinition = {
  id: 'tube-triangle',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Üçgen kutu / tüp', en: 'Triangular tube' },
  description: {
    tr: 'Üç panelli açık tüp. Üçgen prizma; sandviç, parfüm ve hediye.',
    en: 'Three-panel open tube — triangular packs for sandwiches, fragrance and gifts.',
  },
  category: 'polygonal-boxes',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['üçgen', 'triangle', 'prizma', 'çokgen', 'toblerone'],
  params: tubeParams(60),
  build: (p) => buildTube(3, 'tube-triangle', p),
}

export const pentagonTube: TemplateDefinition = {
  id: 'tube-pentagon',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Beşgen kutu / tüp', en: 'Pentagon tube' },
  description: {
    tr: 'Beş panelli açık tüp. Özel kesitli kılıf ve premium ambalaj.',
    en: 'Five-panel open tube — specialty sleeves and premium packs.',
  },
  category: 'polygonal-boxes',
  materials: ['carton'],
  maturity: 'beta',
  keywords: ['beşgen', 'pentagon', 'çokgen', 'tüp'],
  params: tubeParams(70),
  build: (p) => buildTube(5, 'tube-pentagon', p),
}
