import { DielineBuilder, PathBuilder, circlePath, rectPath, rectPoints, stadiumPath, type Dieline } from '@diecut/core'
import { foldDiagonal, foldHorizontal, foldVertical, girthLayout, glueFlapProfile } from '../features.ts'
import { DCT_INVENTORY } from '../dct-inventory.ts'
import { num, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from '../types.ts'

/**
 * Karton çanta ailesi (DCT carton-bags): dört gövde paneli (ön, körük, arka,
 * körük) + yapıştırma payı; körüklerde dikey orta kırım; alt uç 45° körüklü
 * "pinch" taban; üstte içe katlanan takviye bandı. Tutma: ip deliği, kesme
 * kulp veya yok.
 */

type Handle = 'cord' | 'diecut' | 'none'

export interface BagSpec {
  id: string
  code: string
  dct: string[]
  name: I18nText
  description: I18nText
  keywords: string[]
  category: TemplateCategory
  materials: MaterialKind[]
  handle: Handle
  dims?: { a: number; b: number; c: number }
}

const T = (tr: string, en: string): I18nText => ({ tr, en })

function buildBag(spec: BagSpec, params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const hem = num(params, 'topHem')
  const glueW = num(params, 'glueFlap')
  const holeR = num(params, 'holeRadius')
  const holeSpacing = num(params, 'holeSpacing')
  const bleed = num(params, 'bleed')
  const handle = spec.handle

  const b = new DielineBuilder(spec.id, { name: spec.name, caliper, glueFlapSide: glueW > 0 ? 'right' : 'none' }, params)
  const gap = Math.max(0.8, caliper)
  const D = W / 2 // körük taban üçgeni derinliği
  const Dm = W / 2 + Math.min(12, W * 0.2) // ön/arka taban kanadı (bindirme payı)
  const cols = girthLayout([L, W, L, W])
  const [c0, c1, c2, c3] = cols as [typeof cols[0], typeof cols[0], typeof cols[0], typeof cols[0]]
  const xEnd = c3.x2
  const top = H + hem

  // Dış hat
  const o = new PathBuilder()
  o.moveTo({ x: 0, y: 0 })
  // Alt kenar: ön kanat, körük üçgen bölgesi (düz kenar), arka kanat, körük
  o.lineTo({ x: c0.x1 + gap, y: 0 }).lineTo({ x: c0.x1 + gap + 2, y: -Dm }).lineTo({ x: c0.x2 - gap - 2, y: -Dm }).lineTo({ x: c0.x2 - gap, y: 0 })
  o.lineTo({ x: c1.x1, y: 0 }).lineTo({ x: c1.x1, y: -D }).lineTo({ x: c1.x2, y: -D }).lineTo({ x: c1.x2, y: 0 })
  o.lineTo({ x: c2.x1 + gap, y: 0 }).lineTo({ x: c2.x1 + gap + 2, y: -Dm }).lineTo({ x: c2.x2 - gap - 2, y: -Dm }).lineTo({ x: c2.x2 - gap, y: 0 })
  o.lineTo({ x: c3.x1, y: 0 }).lineTo({ x: c3.x1, y: -D }).lineTo({ x: c3.x2, y: -D }).lineTo({ x: c3.x2, y: 0 })
  const gl = glueW > 0 ? glueFlapProfile(xEnd, xEnd + glueW, 0, top, Math.min(6, glueW * 0.6)) : [{ x: xEnd, y: 0 }, { x: xEnd, y: top }]
  for (const p of gl) o.lineTo(p)
  o.lineTo({ x: 0, y: top })
  o.close()
  b.cut(o.build(), 'çanta çevresi')

  // Gövde
  const names: [string, I18nText][] = [
    ['front', T('Ön', 'Front')],
    ['gusset-right', T('Sağ körük', 'Right gusset')],
    ['back', T('Arka', 'Back')],
    ['gusset-left', T('Sol körük', 'Left gusset')],
  ]
  cols.forEach((c, i) => {
    const [id, label] = names[i] as [string, I18nText]
    b.panel({ id, name: id, label, outline: rectPoints(c.x1, 0, c.width, H), role: 'wall' })
    if (i === 0) b.root(id)
    else b.fold({ parent: (names[i - 1] as [string, I18nText])[0], child: id, ...foldVertical(c.x1, 0, top, 'right') })
    // Üst takviye bandı — içe 180°
    const hid = `${id}-hem`
    b.panel({ id: hid, name: hid, label: T('Üst takviye', 'Top hem'), outline: rectPoints(c.x1, H, c.width, hem), role: 'flap', printable: false })
    b.fold({ parent: id, child: hid, ...foldHorizontal(H, c.x1, c.x2, 'above', 180) })
  })
  // Körük orta kırımı (çanta yassı katlanırken içe; açık kutu görünümünde düz)
  for (const c of [c1, c3]) {
    const mid = (c.x1 + c.x2) / 2
    b.creaseLine({ x: mid, y: -D }, { x: mid, y: top }, 'körük orta kırımı')
  }
  if (glueW > 0) {
    // Yapıştırma payının takviye bandındaki kısmı bantla birlikte içe döner; yoksa çanta ağzından dışarı taşar.
    const ch = Math.min(6, glueW * 0.6)
    b.panel({ id: 'glue', name: 'glue', label: T('Yapıştırma payı', 'Glue flap'), outline: hem > 0 ? [{ x: xEnd, y: 0 }, { x: xEnd + glueW, y: Math.min(ch, top * 0.3) }, { x: xEnd + glueW, y: H }, { x: xEnd, y: H }] : gl, role: 'glue', printable: false })
    b.fold({ parent: 'gusset-left', child: 'glue', ...foldVertical(xEnd, 0, top, 'right') })
    if (hem > 0) {
      b.panel({ id: 'glue-top', name: 'glue-top', label: T('Yapıştırma payı (takviye)', 'Glue flap (hem)'), outline: [{ x: xEnd, y: H }, { x: xEnd + glueW, y: H }, { x: xEnd + glueW, y: top - ch }, { x: xEnd + glueW - ch, y: top }, { x: xEnd, y: top }], role: 'glue', printable: false })
      b.fold({ parent: 'glue', child: 'glue-top', ...foldHorizontal(H, xEnd, xEnd + glueW, 'above', 180) })
    }
    b.guide('glue', rectPath(0, 0, Math.min(glueW, L * 0.3), top), 'yapıştırma alanı')
  }

  // Taban: ön/arka kanatlar
  for (const [c, parent] of [[c0, 'front'], [c2, 'back']] as [typeof c0, string][]) {
    const id = `${parent}-bottom`
    b.panel({ id, name: id, label: T('Taban kanadı', 'Bottom flap'), outline: [{ x: c.x1 + gap, y: 0 }, { x: c.x1 + gap + 2, y: -Dm }, { x: c.x2 - gap - 2, y: -Dm }, { x: c.x2 - gap, y: 0 }], role: 'flap', printable: false })
    b.fold({ parent, child: id, ...foldHorizontal(0, c.x1 + gap, c.x2 - gap, 'below') })
  }
  // Taban: körük üçgenleri (orta üçgen + iki kanat 180°)
  for (const [c, parent] of [[c1, 'gusset-right'], [c3, 'gusset-left']] as [typeof c1, string][]) {
    const a = { x: c.x1, y: 0 }
    const bb = { x: c.x2, y: 0 }
    const mid = { x: (c.x1 + c.x2) / 2, y: -D }
    const center = `${parent}-bottom`
    b.panel({ id: center, name: center, label: T('Taban körüğü', 'Bottom gusset'), outline: [a, bb, mid], role: 'gusset', printable: false })
    b.fold({ parent, child: center, ...foldHorizontal(0, c.x1, c.x2, 'below') })
    b.panel({ id: `${center}-l`, name: `${center}-l`, label: T('Körük kanadı', 'Gusset wing'), outline: [a, mid, { x: c.x1, y: -D }], role: 'glue', printable: false })
    b.fold({ parent: center, child: `${center}-l`, ...foldDiagonal(a, mid, 180) })
    b.panel({ id: `${center}-r`, name: `${center}-r`, label: T('Körük kanadı', 'Gusset wing'), outline: [bb, { x: c.x2, y: -D }, mid], role: 'glue', printable: false })
    b.fold({ parent: center, child: `${center}-r`, ...foldDiagonal(bb, mid, -180) })
    b.creaseLine(a, mid, 'körük çaprazı')
    b.creaseLine(bb, mid, 'körük çaprazı')
  }

  // Tutma
  const faces = [c0, c2]
  if (handle === 'cord') {
    const r = Math.max(1.5, holeR)
    const sp = Math.min(holeSpacing, L - 4 * r - 10)
    const yIn = H - Math.min(hem * 0.5, 15)
    const yOut = H + (H - yIn) // takviye bandında ayna
    for (const c of faces) {
      const cx = (c.x1 + c.x2) / 2
      for (const x of [cx - sp / 2, cx + sp / 2]) {
        b.cut(circlePath({ x, y: yIn }, r), 'ip deliği')
        b.cut(circlePath({ x, y: yOut }, r), 'ip deliği (takviye)')
      }
    }
  } else if (handle === 'diecut') {
    const len = Math.min(L * 0.55, 100)
    const t = Math.min(16, hem * 0.6)
    const yIn = H - Math.max(t, hem * 0.55)
    const yOut = H + (H - yIn)
    for (const c of faces) {
      const cx = (c.x1 + c.x2) / 2
      b.cut(stadiumPath({ x: cx, y: yIn }, len, t), 'kesme kulp')
      b.cut(stadiumPath({ x: cx, y: yOut }, len, t), 'kesme kulp (takviye)')
    }
  }

  if (bleed > 0) b.guide('bleed', rectPath(-bleed, -Dm - bleed, xEnd + glueW + 2 * bleed, top + Dm + 2 * bleed), 'taşma payı')
  if (hem < 10 && handle !== 'none') b.warn('hem-too-short', 'warning', 'Üst takviye bandı kulp/ip deliği için dar.', 'Top hem is too narrow for the handle/cord holes.')
  return b.build()
}

const dctDims = (spec: BagSpec): { a: number; b: number; c: number } => {
  if (spec.dims) return spec.dims
  for (const id of spec.dct) {
    const e = DCT_INVENTORY.find((x) => x.id === id)
    if (e?.dims.a && e.dims.b && e.dims.c) return { a: e.dims.a, b: e.dims.b, c: e.dims.c }
  }
  return { a: 100, b: 50, c: 150 }
}

const paramsFor = (spec: BagSpec): ParamDef[] => {
  const d = dctDims(spec)
  const out: ParamDef[] = [
    { kind: 'number', key: 'length', label: { tr: 'Ön genişlik (a)', en: 'Face width (a)' }, unit: 'mm', min: 30, max: 800, step: 0.5, default: d.a, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Körük / derinlik (b)', en: 'Gusset / depth (b)' }, unit: 'mm', min: 15, max: 400, step: 0.5, default: d.b, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik (c)', en: 'Height (c)' }, unit: 'mm', min: 30, max: 900, step: 0.5, default: d.c, group: 'dimensions' },
    { kind: 'number', key: 'topHem', label: { tr: 'Üst takviye bandı (d)', en: 'Top hem (d)' }, unit: 'mm', min: 0, max: 120, step: 0.5, default: spec.handle === 'diecut' ? 40 : 25, group: 'construction' },
    { kind: 'number', key: 'glueFlap', label: { tr: 'Yapıştırma payı', en: 'Glue flap' }, unit: 'mm', min: 0, max: 40, step: 0.5, default: 15, group: 'construction' },
    { kind: 'number', key: 'caliper', label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' }, unit: 'mm', min: 0.1, max: 4, step: 0.05, default: 0.4, group: 'material' },
  ]
  if (spec.handle === 'cord') {
    out.push(
      { kind: 'number', key: 'holeRadius', label: { tr: 'İp deliği yarıçapı (r)', en: 'Cord hole radius (r)' }, unit: 'mm', min: 1, max: 10, step: 0.25, default: 3, group: 'options' },
      { kind: 'number', key: 'holeSpacing', label: { tr: 'Delik aralığı (x)', en: 'Hole spacing (x)' }, unit: 'mm', min: 10, max: 600, step: 0.5, default: Math.round(d.a * 0.5), group: 'options' },
    )
  } else {
    out.push(
      { kind: 'number', key: 'holeRadius', label: { tr: 'İp deliği yarıçapı', en: 'Cord hole radius' }, unit: 'mm', min: 1, max: 10, step: 0.25, default: 3, advanced: true, group: 'options' },
      { kind: 'number', key: 'holeSpacing', label: { tr: 'Delik aralığı', en: 'Hole spacing' }, unit: 'mm', min: 10, max: 600, step: 0.5, default: Math.round(d.a * 0.5), advanced: true, group: 'options' },
    )
  }
  out.push({ kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 3, advanced: true, group: 'prepress' })
  return out
}

export const bagTemplate = (spec: BagSpec): TemplateDefinition => ({
  id: spec.id,
  code: spec.code,
  standard: 'CUSTOM',
  name: spec.name,
  description: spec.description,
  category: spec.category,
  materials: spec.materials,
  maturity: 'beta',
  keywords: [...spec.keywords, ...spec.dct],
  params: paramsFor(spec),
  build: (params) => buildBag(spec, params),
})

export const BAG_SPECS: readonly BagSpec[] = [
  {
    id: 'bag-cord-handle',
    code: '',
    dct: ['becf-12101', 'becf-12102', 'becf-12109', 'becf-1210d', 'becf-1210e'],
    name: T('Karton çanta, ip kulplu', 'Carton bag with cord handles'),
    description: T('Körüklü çanta; 45° körüklü pinch taban, içe katlanan üst takviye ve ip delikleri.', 'Gusseted carton bag; pinch bottom with 45° gussets, folded top hem and cord holes.'),
    keywords: ['çanta', 'bag', 'ip kulp', 'cord', 'körük', 'gusset'],
    category: 'carton-bags-pillows',
    materials: ['carton'],
    handle: 'cord',
  },
  {
    id: 'bag-plain',
    code: '',
    dct: ['becf-12103', 'becf-12104'],
    name: T('Karton çanta, kulpsuz', 'Carton bag without handles'),
    description: T('Körüklü çanta; pinch taban ve içe katlanan üst takviye, tutma yeri yok.', 'Gusseted carton bag; pinch bottom and folded top hem, no handle.'),
    keywords: ['çanta', 'bag', 'körük', 'kulpsuz'],
    category: 'carton-bags-pillows',
    materials: ['carton'],
    handle: 'none',
  },
  {
    id: 'bag-diecut-handle',
    code: '',
    dct: ['becf-1210b', 'becf-1210c'],
    name: T('Karton çanta, kesme kulplu', 'Carton bag with die-cut handles'),
    description: T('Körüklü çanta; geniş üst takviye bandında kesme kulp oyuğu.', 'Gusseted carton bag; die-cut grip slots through a wide top hem.'),
    keywords: ['çanta', 'bag', 'kesme kulp', 'die-cut handle', 'körük'],
    category: 'carton-bags-pillows',
    materials: ['carton'],
    handle: 'diecut',
  },
]

export const bagTemplates: TemplateDefinition[] = BAG_SPECS.map(bagTemplate)
