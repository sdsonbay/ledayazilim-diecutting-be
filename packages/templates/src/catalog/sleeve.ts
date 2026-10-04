import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline } from '@diecut/core'
import {
  edgeWithThumbNotch,
  emitProfile,
  flatEdge,
  foldVertical,
  girthLayout,
  glueFlapProfile,
  reverseProfile,
  type Profile,
} from '../features.ts'
import { bool, num, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * Kılıf / bant (sleeve). Kapaksız dört panelli tüp.
 *
 * Hazır ürünün üzerine geçirilen tanıtım bandı, tepsi kılıfı ve çoklu ürün
 * paketlerinde kullanılır. Kapak olmadığı için açık ölçüsü küçük, tabaka
 * verimi yüksektir.
 */
function buildSleeve(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const glueWidth = num(params, 'glueFlap')
  const wantNotch = bool(params, 'thumbNotch')
  const notchRadius = num(params, 'thumbNotchRadius')
  const bleed = num(params, 'bleed')

  const segments = girthLayout([L, W, L, W])
  const front = segments[2] as { x1: number; x2: number }
  const girthEnd = (segments[3] as { x2: number }).x2
  const glueEnd = girthEnd + glueWidth
  const glueTaper = Math.min(3, H * 0.1)

  const b = new DielineBuilder(
    'sleeve-4panel',
    {
      name: { tr: 'Kılıf', en: 'Sleeve' },
      caliper,
      glueFlapSide: glueWidth > 0 ? 'right' : 'none',
    },
    params,
  )

  const edgeFor = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1): Profile =>
    wantNotch && seg === front ? edgeWithThumbNotch(seg.x1, seg.x2, y, notchRadius, direction) : flatEdge(seg.x1, seg.x2, y)

  const bottomProfiles = segments.map((s) => edgeFor(s, 0, -1))
  const topProfiles = segments.map((s) => edgeFor(s, H, 1))

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: 0 })
  for (const profile of bottomProfiles) emitProfile(outline, profile)

  if (glueWidth > 0) {
    const glue = glueFlapProfile(girthEnd, glueEnd, 0, H, glueTaper)
    for (let i = 1; i < glue.length; i++) outline.lineTo(glue[i] as { x: number; y: number })
  }
  outline.lineTo({ x: girthEnd, y: H })

  for (let i = topProfiles.length - 1; i >= 0; i--) {
    emitProfile(outline, reverseProfile(topProfiles[i] as Profile))
  }
  outline.close()
  b.cut(outline.build(), 'kılıf çevresi')

  const wallNames: [string, { tr: string; en: string }][] = [
    ['back', { tr: 'Arka', en: 'Back' }],
    ['left', { tr: 'Sol', en: 'Left' }],
    ['front', { tr: 'Ön', en: 'Front' }],
    ['right', { tr: 'Sağ', en: 'Right' }],
  ]
  segments.forEach((seg, i) => {
    const [id, label] = wallNames[i] as [string, { tr: string; en: string }]
    b.panel({ id, name: id, label, outline: rectPoints(seg.x1, 0, seg.width, H), role: 'wall' })
  })
  b.root('front')

  if (glueWidth > 0) {
    b.panel({
      id: 'glue',
      name: 'glue-flap',
      label: { tr: 'Yapıştırma payı', en: 'Glue flap' },
      outline: glueFlapProfile(girthEnd, glueEnd, 0, H, glueTaper),
      role: 'glue',
      printable: false,
    })
    b.fold({ parent: 'right', child: 'glue', ...foldVertical(girthEnd, 0, H, 'right') })
    b.guide('glue', rectPath(girthEnd, 0, glueWidth, H), 'yapıştırma alanı')
  }

  b.fold({ parent: 'front', child: 'left', ...foldVertical(front.x1, 0, H, 'left') })
  b.fold({ parent: 'left', child: 'back', ...foldVertical((segments[1] as { x1: number }).x1, 0, H, 'left') })
  b.fold({ parent: 'front', child: 'right', ...foldVertical(front.x2, 0, H, 'right') })

  if (bleed > 0) {
    b.guide('bleed', rectPath(-bleed, -bleed, glueEnd + 2 * bleed, H + 2 * bleed), 'taşma payı')
  }

  if (H < 25) {
    b.warn(
      'narrow-sleeve',
      'info',
      'Kılıf yüksekliği 25 mm’nin altında; yapıştırma makinesinde besleme sorunlu olabilir.',
      'Sleeve height below 25 mm may be difficult to feed on a gluer.',
    )
  }

  return b.build()
}

export const sleeve: TemplateDefinition = {
  id: 'sleeve-4panel',
  code: '',
  standard: 'CUSTOM',
  name: { tr: 'Kılıf / tanıtım bandı', en: 'Sleeve' },
  description: {
    tr: 'Dört panelli açık tüp. Hazır ürünün üzerine geçirilir; tepsi kılıfı, çoklu paket bandı ve tanıtım kuşağı olarak kullanılır.',
    en: 'A four panel open tube that slides over a product — used as tray sleeves, multipack bands and promotional wraps.',
  },
  category: 'special-boxes',
  materials: ['carton', 'corrugated'],
  maturity: 'stable',
  keywords: ['kılıf', 'sleeve', 'bant', 'kuşak', 'tanıtım bandı'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 15, max: 1200, step: 0.5, default: 120, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 5, max: 1200, step: 0.5, default: 60, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 10, max: 1200, step: 0.5, default: 80, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 8, step: 0.05, default: 0.4, group: 'material' },
    { kind: 'number', key: 'glueFlap', label: { tr: 'Yapıştırma payı', en: 'Glue flap' }, unit: 'mm', min: 0, max: 80, step: 0.5, default: 15, group: 'construction' },
    { kind: 'boolean', key: 'thumbNotch', label: { tr: 'Başparmak oyuğu', en: 'Thumb notch' }, default: false, group: 'options' },
    { kind: 'number', key: 'thumbNotchRadius', label: { tr: 'Oyuk yarıçapı', en: 'Notch radius' }, unit: 'mm', min: 3, max: 60, step: 0.5, default: 15, advanced: true, group: 'options' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' },
  ],
  build: buildSleeve,
}
