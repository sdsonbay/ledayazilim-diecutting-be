import { DielineBuilder, PathBuilder, rectPath, rectPoints, stadiumPath, type Dieline } from '@diecut/core'
import {
  autoTongueDepth,
  dustByStyle,
  emitTuckClosure,
  edgeWithThumbNotch,
  emitProfile,
  flatEdge,
  foldHorizontal,
  foldVertical,
  girthLayout,
  glueFlapProfile,
  hangTabProfile,
  profileToPolygon,
  reverseProfile,
  tuckByStyle,
  tuckClosure,
  type Profile,
  type TuckClosure,
} from '../features.ts'
import { bool, num, str, type ParamValue, type TemplateDefinition } from '../types.ts'

/**
 * Tuck end kutu ailesi.
 *
 * Gövde dizilimi soldan sağa: arka · sol · ön · sağ · yapıştırma payı.
 * Kapak dilleri kutunun derinliği (width) kadar uzar; toz kapakları
 * dilin altında kalacak şekilde biraz daha kısadır.
 *
 * - `reverse` (ECMA A20.20): üst dil arka panelden, alt dil ön panelden.
 *   Yapıştırma makinesinde daha hızlı, en yaygın kullanılan tip.
 * - `straight` (ECMA A20.21): her iki dil de arka panelden. Ön yüzde
 *   hiç kesim izi görünmez, kozmetik/parfüm kutularında tercih edilir.
 */
function buildTuckEnd(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const style = str(params, 'tuckStyle')
  const glueWidth = num(params, 'glueFlap')
  const dustChamfer = num(params, 'dustFlapChamfer')
  const cornerRadius = num(params, 'tuckCornerRadius')
  const wantNotchTop = bool(params, 'thumbNotch')
  const wantNotchBottom = bool(params, 'thumbNotchBottom')
  const sitLockTop = bool(params, 'sitLockTop')
  const sitLockBottom = bool(params, 'sitLockBottom')
  const flapStyle = str(params, 'tuckFlapStyle') || 'angled'
  const dustStyle = str(params, 'dustFlapStyle') || 'normal'
  const notchRadius = num(params, 'thumbNotchRadius')
  const euroHole = bool(params, 'euroHole')
  const hangTabParam = num(params, 'hangTabHeight')
  const windowStyle = str(params, 'window')
  const windowWParam = num(params, 'windowWidth')
  const windowHParam = num(params, 'windowHeight')
  const bleed = num(params, 'bleed')

  const tuckDepthParam = num(params, 'tuckDepth')
  // Kapak kutunun derinliği kadar; ucundaki dil kırımla ayrılır ve ön duvarın içine girer.
  const lidDepth = W
  const tongueDepth = tuckDepthParam > 0 ? tuckDepthParam : autoTongueDepth(W, H)
  const tuckDepth = lidDepth + tongueDepth
  // Toz kapakları kapağın altında kalacak kadar kısa.
  const dustDepth = Math.max(4, W - 2 * caliper - Math.max(1.5, 2 * caliper))
  const clearance = Math.max(0.5, caliper)

  const [back, left, front, right] = girthLayout([L, W, L, W]) as [
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
    { x1: number; x2: number; width: number },
  ]

  const glueX1 = right.x2
  const glueX2 = glueX1 + glueWidth
  const flatWidth = glueWidth > 0 ? glueX2 : glueX1

  const meta = {
    name: { tr: 'Tuck end kutu', en: 'Tuck end carton' },
    ecma: style === 'straight' ? 'A20.21' : 'A20.20',
    caliper,
    glueFlapSide: glueWidth > 0 ? ('right' as const) : ('none' as const),
  }

  const b = new DielineBuilder(style === 'straight' ? 'ecma-a20-21' : 'ecma-a20-20', meta, params)

  const closures = new Map<Profile, TuckClosure>()
  const tuck = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1, sitLock: boolean): Profile => {
    const c = tuckClosure((o) => tuckByStyle(flapStyle, o, sitLock), { x1: seg.x1, x2: seg.x2, y, direction, depth: tongueDepth, clearance, cornerRadius, lidDepth })
    closures.set(c.outer, c)
    return c.outer
  }

  const dust = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1): Profile =>
    dustByStyle(dustStyle, { x1: seg.x1, x2: seg.x2, y, direction, depth: dustDepth, chamfer: dustChamfer })

  const bottomTuckOnFront = style === 'reverse'
  const hangHeight = euroHole ? (hangTabParam > 0 ? hangTabParam : 25) : 0
  const hangGap = Math.max(1.5, caliper)
  const wantDustSlits = dustStyle === 'slit' || sitLockTop || sitLockBottom

  const frontTop: Profile = euroHole
    ? tuck(front, H, 1, sitLockTop)
    : wantNotchTop
      ? edgeWithThumbNotch(front.x1, front.x2, H, notchRadius, 1)
      : flatEdge(front.x1, front.x2, H)

  const topProfiles: Profile[] = [
    euroHole
      ? hangTabProfile({ x1: back.x1, x2: back.x2, y: H, direction: 1, height: hangHeight, gap: hangGap })
      : tuck(back, H, 1, sitLockTop),
    dust(left, H, 1),
    frontTop,
    dust(right, H, 1),
  ]

  const backBottom: Profile = bottomTuckOnFront
    ? wantNotchBottom
      ? edgeWithThumbNotch(back.x1, back.x2, 0, notchRadius, -1)
      : flatEdge(back.x1, back.x2, 0)
    : tuck(back, 0, -1, sitLockBottom)

  const frontBottom: Profile = bottomTuckOnFront
    ? tuck(front, 0, -1, sitLockBottom)
    : wantNotchBottom
      ? edgeWithThumbNotch(front.x1, front.x2, 0, notchRadius, -1)
      : flatEdge(front.x1, front.x2, 0)

  const bottomProfiles: Profile[] = [backBottom, dust(left, 0, -1), frontBottom, dust(right, 0, -1)]

  // --- Dış kontur: alt kenar soldan sağa, yapıştırma payı, üst kenar sağdan sola
  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: 0 })
  for (const profile of bottomProfiles) emitProfile(outline, profile)

  if (glueWidth > 0) {
    const glue = glueFlapProfile(glueX1, glueX2, 0, H, Math.min(3, H * 0.1))
    for (let i = 1; i < glue.length; i++) outline.lineTo(glue[i] as { x: number; y: number })
  }
  outline.lineTo({ x: glueX1, y: H })

  for (let i = topProfiles.length - 1; i >= 0; i--) {
    emitProfile(outline, reverseProfile(topProfiles[i] as Profile))
  }
  outline.close()
  b.cut(outline.build(), 'gövde çevresi')

  // --- Paneller
  const walls: [string, { x1: number; width: number }, { tr: string; en: string }][] = [
    ['back', back, { tr: 'Arka', en: 'Back' }],
    ['left', left, { tr: 'Sol', en: 'Left' }],
    ['front', front, { tr: 'Ön', en: 'Front' }],
    ['right', right, { tr: 'Sağ', en: 'Right' }],
  ]
  for (const [id, seg, label] of walls) {
    b.panel({ id, name: id, label, outline: rectPoints(seg.x1, 0, seg.width, H), role: 'wall' })
  }
  b.root('front')

  if (glueWidth > 0) {
    b.panel({
      id: 'glue',
      name: 'glue-flap',
      label: { tr: 'Yapıştırma payı', en: 'Glue flap' },
      outline: glueFlapProfile(glueX1, glueX2, 0, H, Math.min(3, H * 0.1)),
      role: 'glue',
      printable: false,
    })
  }

  const flapPanels: [string, Profile, string, { tr: string; en: string }, 'flap' | 'dust'][] = [
    euroHole
      ? ['hang-tab', topProfiles[0] as Profile, 'back', { tr: 'Askı kulağı', en: 'Hang tab' }, 'flap']
      : ['top-tuck', topProfiles[0] as Profile, 'back', { tr: 'Üst kapak dili', en: 'Top tuck flap' }, 'flap'],
    ['top-dust-left', topProfiles[1] as Profile, 'left', { tr: 'Üst sol toz kapağı', en: 'Top left dust flap' }, 'dust'],
    ['top-dust-right', topProfiles[3] as Profile, 'right', { tr: 'Üst sağ toz kapağı', en: 'Top right dust flap' }, 'dust'],
    ['bottom-dust-left', bottomProfiles[1] as Profile, 'left', { tr: 'Alt sol toz kapağı', en: 'Bottom left dust flap' }, 'dust'],
    ['bottom-dust-right', bottomProfiles[3] as Profile, 'right', { tr: 'Alt sağ toz kapağı', en: 'Bottom right dust flap' }, 'dust'],
  ]
  if (euroHole) {
    flapPanels.unshift([
      'top-tuck',
      topProfiles[2] as Profile,
      'front',
      { tr: 'Üst kapak dili', en: 'Top tuck flap' },
      'flap',
    ])
  }
  const bottomTuckIndex = bottomTuckOnFront ? 2 : 0
  flapPanels.push([
    'bottom-tuck',
    bottomProfiles[bottomTuckIndex] as Profile,
    bottomTuckOnFront ? 'front' : 'back',
    { tr: 'Alt kapak dili', en: 'Bottom tuck flap' },
    'flap',
  ])

  for (const [id, profile, parent, label, role] of flapPanels) {
    const closure = closures.get(profile)
    if (closure) {
      emitTuckClosure(b, closure, { id, parent, label })
      continue
    }
    b.panel({ id, name: id, label, outline: profileToPolygon(profile), role, printable: role === 'flap' })
    const isTop = id.startsWith('top')
    const seg = profile[0] as { p: { x: number } }
    const end = profile[profile.length - 1] as { p: { x: number } }
    const isHang = id === 'hang-tab'
    const spec = foldHorizontal(isTop || isHang ? H : 0, seg.p.x, end.p.x, isTop || isHang ? 'above' : 'below')
    b.fold({ parent, child: id, axis: spec.axis, angle: spec.angle })
  }

  // --- Gövde kırımları (kök panelden dışa doğru)
  const bodyFolds: [string, string, number, 'left' | 'right'][] = [
    ['front', 'left', front.x1, 'left'],
    ['left', 'back', left.x1, 'left'],
    ['front', 'right', front.x2, 'right'],
  ]
  if (glueWidth > 0) bodyFolds.push(['right', 'glue', right.x2, 'right'])

  for (const [parent, child, x, side] of bodyFolds) {
    const spec = foldVertical(x, 0, H, side)
    b.fold({ parent, child, axis: spec.axis, angle: spec.angle })
  }

  // --- Yardımcı katmanlar
  if (euroHole) {
    const slotW = Math.min(30, back.width * 0.55)
    const slotH = 4
    const cx = (back.x1 + back.x2) / 2
    const cy = H + hangHeight * 0.55
    if (slotW >= 12 && hangHeight >= 14) {
      b.cut(stadiumPath({ x: cx, y: cy }, slotW, slotH), 'euroslot askı deliği')
    } else {
      b.warn(
        'euro-hole-small',
        'warning',
        'Askı kulağı euroslot için dar; delik atlandı. Askı yüksekliğini artırın.',
        'Hang tab is too small for a euroslot; the hole was skipped.',
      )
    }
  }

  if (windowStyle === 'oval' || windowStyle === 'rect') {
    const ww = windowWParam > 0 ? windowWParam : Math.min(L * 0.58, L - 12)
    const wh = windowHParam > 0 ? windowHParam : Math.min(H * 0.42, H - 16)
    const cx = (front.x1 + front.x2) / 2
    const cy = H * 0.5
    if (ww >= 8 && wh >= 8) {
      b.cut(
        windowStyle === 'oval' ? stadiumPath({ x: cx, y: cy }, ww, wh) : rectPath(cx - ww / 2, cy - wh / 2, ww, wh),
        'pencere',
      )
    }
  }

  if (bleed > 0) {
    const minY = -tuckDepth
    const maxY = H + Math.max(tuckDepth, hangHeight)
    b.guide('bleed', rectPath(-bleed, minY - bleed, flatWidth + 2 * bleed, maxY - minY + 2 * bleed), 'taşma payı')
  }
  if (glueWidth > 0) {
    b.guide('glue', rectPath(glueX1, 0, glueWidth, H), 'yapıştırma alanı')
  }

  const slitDust = (seg: { x1: number; x2: number }, y: number, direction: 1 | -1): void => {
    const mid = (seg.x1 + seg.x2) / 2
    const half = Math.min(7.5, (seg.x2 - seg.x1) * 0.22)
    if (half < 2) return
    const yy = y + direction * Math.max(3.2, dustDepth * 0.42)
    b.cutLine({ x: mid - half, y: yy }, { x: mid + half, y: yy }, 'toz kapağı kilit yarığı')
  }
  if (wantDustSlits && (sitLockTop || dustStyle === 'slit')) {
    slitDust(left, H, 1)
    slitDust(right, H, 1)
  }
  if (wantDustSlits && (sitLockBottom || dustStyle === 'slit')) {
    slitDust(left, 0, -1)
    slitDust(right, 0, -1)
  }

  if (W > L) {
    b.warn(
      'depth-exceeds-length',
      'info',
      'Derinlik uzunluktan büyük; kapak dili ön panele göre çok uzun kalabilir. Ölçüleri kontrol edin.',
      'Depth is larger than length; the tuck flap may be disproportionately long.',
    )
  }
  if (tongueDepth > H * 0.8) {
    b.warn(
      'tuck-too-deep',
      'warning',
      'Kapak dili gövde yüksekliğine göre çok uzun; ön duvarın içine sığmaz.',
      'Tuck tongue is too long for the body height; it will not fit inside the front wall.',
    )
  }
  if (glueWidth > 0 && glueWidth < 8) {
    b.warn(
      'glue-flap-narrow',
      'warning',
      'Yapıştırma payı 8 mm’den dar; otomatik yapıştırma makinesinde tutunma zayıf olur.',
      'Glue flap narrower than 8 mm; bonding on an automatic gluer will be weak.',
    )
  }

  return b.build()
}

const sharedParams: TemplateDefinition['params'] = [
  {
    kind: 'number',
    key: 'length',
    label: { tr: 'Uzunluk (a)', en: 'Length (a)' },
    unit: 'mm',
    min: 15,
    max: 1200,
    step: 0.5,
    default: 100,
    group: 'dimensions',
    help: { tr: 'Ön panelin genişliği.', en: 'Width of the front panel.' },
  },
  {
    kind: 'number',
    key: 'width',
    label: { tr: 'Genişlik / derinlik (b)', en: 'Width / depth (b)' },
    unit: 'mm',
    min: 8,
    max: 1200,
    step: 0.5,
    default: 50,
    group: 'dimensions',
    help: { tr: 'Yan panelin genişliği; kapak dilinin derinliğini belirler.', en: 'Side panel width; drives the tuck depth.' },
  },
  {
    kind: 'number',
    key: 'height',
    label: { tr: 'Yükseklik (c)', en: 'Height (c)' },
    unit: 'mm',
    min: 15,
    max: 2000,
    step: 0.5,
    default: 150,
    group: 'dimensions',
  },
  {
    kind: 'number',
    key: 'caliper',
    label: { tr: 'Malzeme kalınlığı', en: 'Material thickness' },
    unit: 'mm',
    min: 0.1,
    max: 8,
    step: 0.05,
    default: 0.4,
    group: 'material',
    help: {
      tr: 'Kilit boşlukları ve dil toleransları bu değere göre hesaplanır.',
      en: 'Lock clearances and flap tolerances are derived from this value.',
    },
  },
  {
    kind: 'number',
    key: 'glueFlap',
    label: { tr: 'Yapıştırma payı', en: 'Glue flap' },
    unit: 'mm',
    min: 0,
    max: 80,
    step: 0.5,
    default: 15,
    group: 'construction',
  },
  {
    kind: 'number',
    key: 'tuckDepth',
    label: { tr: 'Kapak dili derinliği', en: 'Tuck depth' },
    unit: 'mm',
    min: 0,
    max: 600,
    step: 0.5,
    default: 0,
    autoWhenZero: true,
    advanced: true,
    group: 'construction',
    help: { tr: 'Kapağın ucundaki, ön duvarın içine giren dil. 0 bırakılırsa derinliğin ~%35’i (8–25 mm).', en: 'The tongue at the lid tip that tucks inside the front wall. Leave 0 for ~35% of depth (8–25 mm).' },
  },
  {
    kind: 'number',
    key: 'dustFlapChamfer',
    label: { tr: 'Toz kapağı pahı', en: 'Dust flap chamfer' },
    unit: 'mm',
    min: 0,
    max: 25,
    step: 0.5,
    default: 3,
    advanced: true,
    group: 'construction',
  },
  {
    kind: 'number',
    key: 'tuckCornerRadius',
    label: { tr: 'Dil köşe yarıçapı', en: 'Tuck corner radius' },
    unit: 'mm',
    min: 0,
    max: 25,
    step: 0.5,
    default: 3,
    advanced: true,
    group: 'construction',
  },
  {
    kind: 'boolean',
    key: 'sitLockBottom',
    label: { tr: 'Dilli kilit (alt)', en: 'Sit lock (bottom)' },
    default: false,
    group: 'options',
    help: {
      tr: 'Alt kapak diline kilit kulağı ekler; toz kapaklarında yarık açılır.',
      en: 'Adds lock ears on the bottom tuck and slits in the dust flaps.',
    },
  },
  {
    kind: 'boolean',
    key: 'thumbNotchBottom',
    label: { tr: 'Parmak kesiği (alt)', en: 'Thumb notch (bottom)' },
    default: false,
    group: 'options',
  },
  {
    kind: 'boolean',
    key: 'euroHole',
    label: { tr: 'Askılık', en: 'Hang tab' },
    default: false,
    group: 'options',
    help: {
      tr: 'Arka panele askı kulağı ve euroslot deliği ekler; üst kapak önden kapanır.',
      en: 'Adds a hang tab with euroslot on the back and moves the top tuck to the front.',
    },
  },
  {
    kind: 'boolean',
    key: 'sitLockTop',
    label: { tr: 'Dilli kilit (üst)', en: 'Sit lock (top)' },
    default: false,
    group: 'options',
    help: {
      tr: 'Üst kapak diline kilit kulağı ekler; üst toz kapaklarında yarık açılır.',
      en: 'Adds lock ears on the top tuck and slits in the top dust flaps.',
    },
  },
  {
    kind: 'boolean',
    key: 'thumbNotch',
    label: { tr: 'Parmak kesiği (üst)', en: 'Thumb notch (top)' },
    default: true,
    group: 'options',
  },
  {
    kind: 'enum',
    key: 'tuckFlapStyle',
    label: { tr: 'Dil', en: 'Tuck flap' },
    default: 'angled',
    group: 'options',
    options: [
      { value: 'angled', label: { tr: 'Açılı dil', en: 'Angled flap' } },
      { value: 'uni', label: { tr: 'Düz dil', en: 'Uni tuck' } },
      { value: 'friction', label: { tr: 'Sürtünmeli dil', en: 'Friction-fit' } },
    ],
    help: {
      tr: 'Kapak dilinin uç formu. Dilli kilit açıksa kulaklı kilit profili kullanılır.',
      en: 'Tuck flap outline. Sit lock overrides this with a locked-ear profile.',
    },
  },
  {
    kind: 'enum',
    key: 'dustFlapStyle',
    label: { tr: 'Yan kanat', en: 'Dust flap' },
    default: 'normal',
    group: 'options',
    options: [
      { value: 'normal', label: { tr: 'Normal kanat', en: 'Standard' } },
      { value: 'angled', label: { tr: 'Açılı kanat', en: 'Full angled' } },
      { value: 'rounded', label: { tr: 'Yuvarlak kanat', en: 'Rounded' } },
      { value: 'slit', label: { tr: 'Yarıklı kilit', en: 'Slit lock' } },
    ],
    help: {
      tr: 'Toz kapaklarının kesim formu. Yarıklı kilit, dilli kilit olmasa da yarık açar.',
      en: 'Dust flap cut. Slit lock adds lock slits even without sit-lock ears.',
    },
  },
  {
    kind: 'number',
    key: 'hangTabHeight',
    label: { tr: 'Askı kulağı yüksekliği', en: 'Hang tab height' },
    unit: 'mm',
    min: 0,
    max: 80,
    step: 0.5,
    default: 0,
    autoWhenZero: true,
    advanced: true,
    group: 'options',
    help: { tr: '0 bırakılırsa 25 mm kullanılır.', en: 'Leave 0 to use 25 mm.' },
  },
  {
    kind: 'enum',
    key: 'window',
    label: { tr: 'Pencere', en: 'Window' },
    default: 'none',
    group: 'options',
    options: [
      { value: 'none', label: { tr: 'Yok', en: 'None' } },
      { value: 'oval', label: { tr: 'Oval', en: 'Oval' } },
      { value: 'rect', label: { tr: 'Dikdörtgen', en: 'Rectangle' } },
    ],
    help: { tr: 'Ön panele asetat pencere kesimi. Ayrı template değil, aynı ailenin varyantı.', en: 'Acetate window cut in the front panel — a variant, not a separate template.' },
  },
  {
    kind: 'number',
    key: 'windowWidth',
    label: { tr: 'Pencere genişliği', en: 'Window width' },
    unit: 'mm',
    min: 0,
    max: 800,
    step: 0.5,
    default: 0,
    autoWhenZero: true,
    advanced: true,
    group: 'options',
  },
  {
    kind: 'number',
    key: 'windowHeight',
    label: { tr: 'Pencere yüksekliği', en: 'Window height' },
    unit: 'mm',
    min: 0,
    max: 800,
    step: 0.5,
    default: 0,
    autoWhenZero: true,
    advanced: true,
    group: 'options',
  },
  {
    kind: 'number',
    key: 'thumbNotchRadius',
    label: { tr: 'Oyuk yarıçapı', en: 'Notch radius' },
    unit: 'mm',
    min: 3,
    max: 60,
    step: 0.5,
    default: 12,
    advanced: true,
    group: 'options',
  },
  {
    kind: 'number',
    key: 'bleed',
    label: { tr: 'Taşma payı', en: 'Bleed' },
    unit: 'mm',
    min: 0,
    max: 20,
    step: 0.5,
    default: 3,
    advanced: true,
    group: 'prepress',
  },
]

export const reverseTuckEnd: TemplateDefinition = {
  id: 'ecma-a20-20',
  code: 'A20.20',
  standard: 'ECMA',
  name: { tr: 'Ters kapaklı kutu', en: 'Reverse tuck end box' },
  description: {
    tr: 'En yaygın karton kutu. Üst kapak arka panelden, alt kapak ön panelden katlanır; otomatik yapıştırma makinesinde hızlı üretilir.',
    en: 'The most common folding carton. Top tuck hinges from the back panel and the bottom from the front, which suits automatic gluing.',
  },
  category: 'tuck-end-boxes',
  materials: ['carton', 'corrugated'],
  maturity: 'stable',
  keywords: [
    'rte',
    'ters kapak',
    'reverse tuck',
    'karton kutu',
    'ilaç kutusu',
    'askı',
    'euro hole',
    'pencere',
    'dilli kilit',
    'sit lock',
    'parmak kesiği',
  ],
  params: sharedParams,
  build: (p) => buildTuckEnd({ ...p, tuckStyle: 'reverse' }),
}

export const straightTuckEnd: TemplateDefinition = {
  id: 'ecma-a20-21',
  code: 'A20.21',
  standard: 'ECMA',
  name: { tr: 'Düz kapaklı kutu', en: 'Straight tuck end box' },
  description: {
    tr: 'Her iki kapak dili de arka panelden katlanır. Ön yüzde kesim izi görünmediği için kozmetik ve parfüm kutularında tercih edilir.',
    en: 'Both tuck flaps hinge from the back panel, leaving the front face free of cut lines — preferred for cosmetics and fragrance.',
  },
  category: 'tuck-end-boxes',
  materials: ['carton', 'corrugated'],
  maturity: 'stable',
  keywords: ['ste', 'düz kapak', 'straight tuck', 'kozmetik kutu', 'askı', 'euro hole', 'dilli kilit', 'sit lock'],
  params: sharedParams,
  build: (p) => buildTuckEnd({ ...p, tuckStyle: 'straight' }),
}
