import { DielineBuilder, PathBuilder, rectPath, rectPoints, type Dieline } from '@diecut/core'
import {
  emitProfile,
  flatEdge,
  foldHorizontal,
  foldVertical,
  girthLayout,
  profileToPolygon,
  reverseProfile,
  type Profile,
} from '../features.ts'
import { num, str, type ParamDef, type ParamValue, type TemplateDefinition } from '../types.ts'

type SlottedKind = '0200' | '0201' | '0202' | '0203' | '0204'

/**
 * FEFCO 02 serisi yarık kapaklı koliler.
 *
 * - 0200 HSC: kapaklar yalnızca bir uçta (üstü açık).
 * - 0201 RSC: dört kapak da derinliğin yarısı, ortada birleşir.
 * - 0203 OSC: uzun kapaklar bindirmeli; ağır yük ve toz sızdırmazlık.
 */
function buildSlotted(kind: SlottedKind, params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const basis = str(params, 'dimensionBasis')
  const jointWidth = num(params, 'jointFlap')
  const slotParam = num(params, 'slotWidth')
  const flapGap = num(params, 'flapGap')
  const bleed = num(params, 'bleed')
  const overlap = kind === '0202' || kind === '0203' ? num(params, 'overlap') : 0

  const inside = basis === 'inside'
  const panelL = inside ? L + caliper : L
  const panelW = inside ? W + caliper : W
  const bodyHeight = inside ? H + caliper : H
  const minorDepth = Math.max(5, panelW / 2 - flapGap / 2)
  const majorDepth =
    kind === '0204'
      ? Math.max(minorDepth + 5, panelW - Math.max(flapGap, caliper))
      : kind === '0202' || kind === '0203'
        ? Math.min(panelW - caliper, minorDepth + Math.max(0, overlap))
        : minorDepth
  const slot = slotParam > 0 ? slotParam : caliper
  const slotRadius = Math.min(slot / 2, 2)

  const segments = girthLayout([panelL, panelW, panelL, panelW])
  const girthEnd = (segments[3] as { x2: number }).x2
  const jointEnd = girthEnd + jointWidth
  const jointChamfer = Math.min(4, bodyHeight * 0.1)

  const b = new DielineBuilder(
    `fefco-${kind}`,
    {
      name: {
        tr:
          kind === '0200'
            ? 'Yarım yarık koli'
            : kind === '0202'
              ? 'İç kapak bindirmeli koli'
              : kind === '0203'
                ? 'Bindirmeli kapaklı koli'
                : kind === '0204'
                  ? 'Tam bindirmeli koli'
                  : 'Standart amerikan koli',
        en:
          kind === '0200'
            ? 'Half slotted container'
            : kind === '0202'
              ? 'Inner overlap slotted container'
              : kind === '0203'
                ? 'Overlap slotted container'
                : kind === '0204'
                  ? 'Full overlap container'
                  : 'Regular slotted container',
      },
      fefco: kind,
      caliper,
      glueFlapSide: jointWidth > 0 ? 'right' : 'none',
    },
    params,
  )

  const flapProfile = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1, depth: number): Profile => {
    const inner1 = seg.x1 + slot / 2
    const inner2 = seg.x2 - slot / 2
    const tip = y + direction * depth
    return [
      { p: { x: seg.x1, y } },
      { p: { x: inner1, y }, r: slotRadius },
      { p: { x: inner1, y: tip } },
      { p: { x: inner2, y: tip } },
      { p: { x: inner2, y }, r: slotRadius },
      { p: { x: seg.x2, y } },
    ]
  }

  // 0202: kısa kenar (W) kapakları bindirmeli; diğerlerinde uzun kenar (L) uzar.
  const depthFor = (index: number): number => {
    const majorIsEven = kind !== '0202'
    const isMajor = majorIsEven ? index % 2 === 0 : index % 2 === 1
    return isMajor ? majorDepth : minorDepth
  }

  const topProfiles = segments.map((s, i) =>
    kind === '0200' ? flatEdge(s.x1, s.x2, bodyHeight) : flapProfile(s, bodyHeight, 1, depthFor(i)),
  )
  const bottomProfiles = segments.map((s, i) => flapProfile(s, 0, -1, depthFor(i)))

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: 0 })
  for (const profile of bottomProfiles) emitProfile(outline, profile)
  if (jointWidth > 0) {
    outline.lineTo({ x: jointEnd, y: jointChamfer })
    outline.lineTo({ x: jointEnd, y: bodyHeight - jointChamfer })
  }
  outline.lineTo({ x: girthEnd, y: bodyHeight })
  for (let i = topProfiles.length - 1; i >= 0; i--) emitProfile(outline, reverseProfile(topProfiles[i] as Profile))
  outline.close()
  b.cut(outline.build(), 'gövde çevresi')

  const wallNames: [string, { tr: string; en: string }][] = [
    ['front', { tr: 'Ön', en: 'Front' }],
    ['right', { tr: 'Sağ', en: 'Right' }],
    ['back', { tr: 'Arka', en: 'Back' }],
    ['left', { tr: 'Sol', en: 'Left' }],
  ]

  segments.forEach((seg, i) => {
    const [id, label] = wallNames[i] as [string, { tr: string; en: string }]
    b.panel({ id, name: id, label, outline: rectPoints(seg.x1, 0, seg.width, bodyHeight), role: 'wall' })
  })
  b.root('front')

  if (jointWidth > 0) {
    b.panel({
      id: 'joint',
      name: 'manufacturers-joint',
      label: { tr: 'Birleşim payı', en: "Manufacturer's joint" },
      outline: [
        { x: girthEnd, y: 0 },
        { x: jointEnd, y: jointChamfer },
        { x: jointEnd, y: bodyHeight - jointChamfer },
        { x: girthEnd, y: bodyHeight },
      ],
      role: 'glue',
      printable: false,
    })
    b.fold({ parent: 'left', child: 'joint', ...foldVertical(girthEnd, 0, bodyHeight, 'right') })
  }

  segments.forEach((seg, i) => {
    const wall = (wallNames[i] as [string, unknown])[0]
    const positions = kind === '0200' ? (['bottom'] as const) : (['top', 'bottom'] as const)
    for (const position of positions) {
      const profile = (position === 'top' ? topProfiles[i] : bottomProfiles[i]) as Profile
      const id = `${position}-flap-${wall}`
      b.panel({
        id,
        name: id,
        label: {
          tr: position === 'top' ? 'Üst kapak' : 'Alt kapak',
          en: position === 'top' ? 'Top flap' : 'Bottom flap',
        },
        outline: profileToPolygon(profile),
        role: 'flap',
      })
      b.fold({
        parent: wall,
        child: id,
        ...foldHorizontal(position === 'top' ? bodyHeight : 0, seg.x1, seg.x2, position === 'top' ? 'above' : 'below'),
      })
    }
  })

  const bodyFolds: [string, string, number, 'left' | 'right'][] = [
    ['front', 'right', (segments[1] as { x1: number }).x1, 'right'],
    ['right', 'back', (segments[2] as { x1: number }).x1, 'right'],
    ['back', 'left', (segments[3] as { x1: number }).x1, 'right'],
  ]
  for (const [parent, child, x, side] of bodyFolds) {
    b.fold({ parent, child, ...foldVertical(x, 0, bodyHeight, side) })
  }

  const maxFlap = Math.max(majorDepth, minorDepth)
  const topExtra = kind === '0200' ? 0 : maxFlap
  if (bleed > 0) {
    b.guide('bleed', rectPath(-bleed, -maxFlap - bleed, jointEnd + 2 * bleed, bodyHeight + topExtra + maxFlap + 2 * bleed), 'taşma payı')
  }

  if (kind === '0201' && flapGap === 0 && caliper >= 3) {
    b.warn(
      'flap-gap-zero',
      'info',
      'Kapaklar tam ortada birleşecek şekilde hesaplandı. Kalın oluklu mukavvada 2–3 mm boşluk bırakmak katlama kalitesini artırır.',
      'Flaps are sized to meet exactly. On thick board a 2–3 mm gap improves folding.',
    )
  }
  if (kind === '0201' && panelW > panelL) {
    b.warn(
      'wide-box',
      'info',
      'Genişlik uzunluktan büyük; kapaklar birleşmeden önce ters yönde bindirme oluşabilir. FEFCO 0203 (bindirmeli kapak) daha uygun olabilir.',
      'Width exceeds length; consider FEFCO 0203 (overlap flaps) instead.',
    )
  }

  return b.build()
}

const slottedParams = (kind: SlottedKind): ParamDef[] => [
  { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 40, max: 2400, step: 1, default: 300, group: 'dimensions' },
  { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 40, max: 2400, step: 1, default: 200, group: 'dimensions' },
  { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 40, max: 2400, step: 1, default: 150, group: 'dimensions' },
  {
    kind: 'enum',
    key: 'dimensionBasis',
    label: { tr: 'Ölçü esası', en: 'Dimension basis' },
    default: 'inside',
    group: 'dimensions',
    options: [
      { value: 'inside', label: { tr: 'İç ölçü', en: 'Inside' } },
      { value: 'outside', label: { tr: 'Dış ölçü', en: 'Outside' } },
    ],
    help: {
      tr: 'İç ölçü seçilirse panel genişliklerine malzeme kalınlığı payı eklenir — koli üretiminin standart yöntemi.',
      en: 'Inside basis adds board thickness allowances to the panel widths, as box plants do.',
    },
  },
  {
    kind: 'number',
    key: 'caliper',
    label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' },
    unit: 'mm',
    min: 0.3,
    max: 12,
    step: 0.1,
    default: 3,
    group: 'material',
    help: { tr: 'E dalga ≈1.5, B ≈3, C ≈4, BC çift dalga ≈7 mm.', en: 'E flute ≈1.5, B ≈3, C ≈4, BC double wall ≈7 mm.' },
  },
  { kind: 'number', key: 'jointFlap', label: { tr: 'Birleşim payı', en: "Manufacturer's joint" }, unit: 'mm', min: 0, max: 100, step: 1, default: 35, group: 'construction' },
  ...(kind === '0202' || kind === '0203'
    ? [
        {
          kind: 'number' as const,
          key: 'overlap',
          label: { tr: 'Kapak bindirmesi', en: 'Flap overlap' },
          unit: 'mm' as const,
          min: 5,
          max: 400,
          step: 1,
          default: 25,
          group: 'construction',
          help: { tr: 'Bindirmeli kapakların yarım derinliğe eklenen payı.', en: 'Extra length added to the overlapping flaps beyond half-width.' },
        },
      ]
    : []),
  {
    kind: 'number',
    key: 'slotWidth',
    label: { tr: 'Yarık genişliği', en: 'Slot width' },
    unit: 'mm',
    min: 0,
    max: 20,
    step: 0.5,
    default: 0,
    autoWhenZero: true,
    advanced: true,
    group: 'construction',
    help: { tr: '0 bırakılırsa mukavva kalınlığına eşitlenir.', en: 'Leave 0 to match the board thickness.' },
  },
  { kind: 'number', key: 'flapGap', label: { tr: 'Kapak arası boşluk', en: 'Flap gap' }, unit: 'mm', min: 0, max: 30, step: 0.5, default: 0, advanced: true, group: 'construction' },
  { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
]

export const halfSlottedContainer: TemplateDefinition = {
  id: 'fefco-0200',
  code: '0200',
  standard: 'FEFCO',
  name: { tr: 'Yarım yarık koli (HSC)', en: 'Half slotted container (HSC)' },
  description: {
    tr: 'Kapaklar yalnızca altta; üstü açık. Tepsi koli, tarım kasası ve üzerine kapak geçirilen teleskop tabanı olarak kullanılır.',
    en: 'Flaps on one end only — an open-top tray carton, produce crate, or telescope base.',
  },
  category: 'standard-boxes',
  materials: ['corrugated'],
  maturity: 'beta',
  keywords: ['hsc', '0200', 'yarı yarık', 'açık koli', 'tepsi koli'],
  params: slottedParams('0200'),
  build: (p) => buildSlotted('0200', p),
}

export const regularSlottedContainer: TemplateDefinition = {
  id: 'fefco-0201',
  code: '0201',
  standard: 'FEFCO',
  name: { tr: 'Standart amerikan koli (RSC)', en: 'Regular slotted container (RSC)' },
  description: {
    tr: 'Oluklu mukavvanın en yaygın kutusu. Dört kapak da derinliğin yarısı kadardır, üst ve alt kapaklar ortada birleşir. Nakliye ve depolama için standart.',
    en: 'The workhorse of corrugated packaging. All four flaps are half the box depth and meet in the centre.',
  },
  category: 'standard-boxes',
  materials: ['corrugated'],
  maturity: 'stable',
  keywords: ['rsc', '0201', 'amerikan kutu', 'koli', 'shipping box', 'oluklu'],
  params: slottedParams('0201'),
  build: (p) => buildSlotted('0201', p),
}

export const overlapSlottedContainer: TemplateDefinition = {
  id: 'fefco-0203',
  code: '0203',
  standard: 'FEFCO',
  name: { tr: 'Bindirmeli kapaklı koli (OSC)', en: 'Overlap slotted container (OSC)' },
  description: {
    tr: 'Uzun kapaklar ortada bindirilir. Ağır yük, toz sızdırmazlık ve tek yönde bantlanan koliler için RSC’den daha sağlam.',
    en: 'Major flaps overlap at the centre — stronger than an RSC for heavy or dusty loads.',
  },
  category: 'standard-boxes',
  materials: ['corrugated'],
  maturity: 'beta',
  keywords: ['osc', '0203', 'bindirmeli', 'overlap slotted', 'ağır koli'],
  params: slottedParams('0203'),
  build: (p) => buildSlotted('0203', p),
}

export const innerOverlapSlottedContainer: TemplateDefinition = {
  id: 'fefco-0202',
  code: '0202',
  standard: 'FEFCO',
  name: { tr: 'İç kapak bindirmeli koli', en: 'Inner overlap slotted container' },
  description: {
    tr: 'Kısa kenar kapakları ortada bindirilir. Dar ve yüksek kolilerde 0203’ün tersi; iç kapaklar tozu keser.',
    en: 'The width-side flaps overlap — the inverse of 0203, used on tall narrow boxes.',
  },
  category: 'standard-boxes',
  materials: ['corrugated'],
  maturity: 'beta',
  keywords: ['0202', 'iç bindirme', 'inner overlap', 'koli'],
  params: slottedParams('0202'),
  build: (p) => buildSlotted('0202', p),
}

export const fullOverlapContainer: TemplateDefinition = {
  id: 'fefco-0204',
  code: '0204',
  standard: 'FEFCO',
  name: { tr: 'Tam bindirmeli koli (FOL)', en: 'Full overlap container (FOL)' },
  description: {
    tr: 'Uzun kapaklar kutunun tüm genişliğini kaplar. Çift kat kapak; ağır ve değerli ürün nakliyesi.',
    en: 'Major flaps span the full width — a double-layer top for heavy or high-value goods.',
  },
  category: 'standard-boxes',
  materials: ['corrugated'],
  maturity: 'beta',
  keywords: ['0204', 'fol', 'tam bindirme', 'full overlap', 'ağır koli'],
  params: slottedParams('0204'),
  build: (p) => buildSlotted('0204', p),
}
