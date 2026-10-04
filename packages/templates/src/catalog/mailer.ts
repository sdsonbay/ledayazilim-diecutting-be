import { DielineBuilder, PathBuilder, rectPath, rectPoints, stadiumPath, type Dieline, type Point } from '@diecut/core'
import {
  emitProfile,
  foldHorizontal,
  foldVertical,
  profileToPolygon,
  reverseProfile,
  snapLockMajorProfile,
  snapLockMinorProfile,
  tuckFlapProfile,
  type Profile,
} from '../features.ts'
import { num, type ParamValue, type TemplateDefinition } from '../types.ts'

function flapX(x: number, y1: number, y2: number, depth: number, chamfer: number, direction: 1 | -1): Profile {
  const c = Math.min(chamfer, Math.abs(depth) * 0.85, (y2 - y1) * 0.4)
  const tip = x + direction * depth
  if (direction === 1) {
    return [
      { p: { x, y: y1 } },
      { p: { x: tip, y: y1 + c } },
      { p: { x: tip, y: y2 - c } },
      { p: { x, y: y2 } },
    ]
  }
  return [
    { p: { x, y: y2 } },
    { p: { x: tip, y: y2 - c } },
    { p: { x: tip, y: y1 + c } },
    { p: { x, y: y1 } },
  ]
}

/**
 * FEFCO 0427 — menteşeli kapaklı e-ticaret mailer.
 *
 * Taban ortada artı form; arka duvardan tam kapak + dil. Ön duvarda
 * dilin girdiği yarık. Tutkalsız kapanır.
 */
function build0427(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const tuckParam = num(params, 'tuckDepth')
  const dustParam = num(params, 'lidDust')
  const bleed = num(params, 'bleed')
  const tuckDepth = tuckParam > 0 ? tuckParam : Math.max(18, Math.min(40, H * 0.7))
  const dustW = dustParam > 0 ? dustParam : Math.max(12, H * 0.75)
  const clearance = Math.max(0.5, caliper)

  const lidY0 = W + H
  const lidY1 = lidY0 + W
  const tuckY = lidY1 + tuckDepth

  const b = new DielineBuilder(
    'fefco-0427',
    { name: { tr: 'E-ticaret mailer', en: 'E-commerce mailer' }, fefco: '0427', caliper, glueFlapSide: 'none' },
    params,
  )

  const tuck = tuckFlapProfile({
    x1: 0,
    x2: L,
    y: lidY1,
    direction: 1,
    depth: tuckDepth,
    clearance,
    cornerRadius: 4,
  })

  const corners: Point[] = [
    { x: 0, y: -H },
    { x: L, y: -H },
    { x: L, y: 0 },
    { x: L + H, y: 0 },
    { x: L + H, y: W },
    { x: L, y: W },
    { x: L, y: lidY0 },
    { x: L + dustW, y: lidY0 },
    { x: L + dustW, y: lidY1 },
    { x: L, y: lidY1 },
  ]

  const outline = new PathBuilder()
  outline.moveTo(corners[0] as Point)
  for (let i = 1; i < corners.length; i++) outline.lineTo(corners[i] as Point)
  emitProfile(outline, reverseProfile(tuck))
  outline.lineTo({ x: -dustW, y: lidY1 })
  outline.lineTo({ x: -dustW, y: lidY0 })
  outline.lineTo({ x: 0, y: lidY0 })
  outline.lineTo({ x: 0, y: W })
  outline.lineTo({ x: -H, y: W })
  outline.lineTo({ x: -H, y: 0 })
  outline.lineTo({ x: 0, y: 0 })
  outline.close()
  b.cut(outline.build(), 'mailer çevresi')

  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: { tr: 'Ön duvar', en: 'Front wall' }, outline: rectPoints(0, -H, L, H), role: 'wall' })
  b.panel({ id: 'back', name: 'back', label: { tr: 'Arka duvar', en: 'Back wall' }, outline: rectPoints(0, W, L, H), role: 'wall' })
  b.panel({ id: 'left', name: 'left', label: { tr: 'Sol duvar', en: 'Left wall' }, outline: rectPoints(-H, 0, H, W), role: 'wall' })
  b.panel({ id: 'right', name: 'right', label: { tr: 'Sağ duvar', en: 'Right wall' }, outline: rectPoints(L, 0, H, W), role: 'wall' })
  b.panel({ id: 'lid', name: 'lid', label: { tr: 'Kapak', en: 'Lid' }, outline: rectPoints(0, lidY0, L, W), role: 'lid' })
  b.panel({ id: 'tuck', name: 'lid-tuck', label: { tr: 'Kapak dili', en: 'Lid tuck' }, outline: profileToPolygon(tuck), role: 'flap' })
  b.panel({
    id: 'lid-dust-left',
    name: 'lid-dust-left',
    label: { tr: 'Kapak sol toz', en: 'Lid left dust' },
    outline: rectPoints(-dustW, lidY0, dustW, W),
    role: 'dust',
    printable: false,
  })
  b.panel({
    id: 'lid-dust-right',
    name: 'lid-dust-right',
    label: { tr: 'Kapak sağ toz', en: 'Lid right dust' },
    outline: rectPoints(L, lidY0, dustW, W),
    role: 'dust',
    printable: false,
  })

  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below') })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(W, 0, L, 'above') })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, W, 'left') })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(L, 0, W, 'right') })
  b.fold({ parent: 'back', child: 'lid', ...foldHorizontal(lidY0, 0, L, 'above') })
  b.fold({ parent: 'lid', child: 'tuck', ...foldHorizontal(lidY1, 0, L, 'above') })
  b.fold({ parent: 'lid', child: 'lid-dust-left', ...foldVertical(0, lidY0, lidY1, 'left') })
  b.fold({ parent: 'lid', child: 'lid-dust-right', ...foldVertical(L, lidY0, lidY1, 'right') })

  const slotW = Math.min(48, L * 0.45)
  const slotH = Math.max(3.5, caliper + 1)
  if (L > 40 && H > 18) {
    b.cut(stadiumPath({ x: L / 2, y: -H + 10 }, slotW, slotH), 'kapak dili yarığı')
  }

  if (bleed > 0) {
    b.guide('bleed', rectPath(-H - dustW - bleed, -H - bleed, L + 2 * H + 2 * dustW + 2 * bleed, tuckY + H + 2 * bleed), 'taşma payı')
  }

  return b.build()
}

/**
 * FEFCO 0471 — kilitli klasör / mailer.
 *
 * Dört duvar + tutkalsız kilit kapakları. 0427’den ucuz dizgi; evrak ve
 * düz ürün gönderiminde yaygındır.
 */
function build0471(params: Record<string, ParamValue>): Dieline {
  const L = num(params, 'length')
  const W = num(params, 'width')
  const H = num(params, 'height')
  const caliper = num(params, 'caliper')
  const lockParam = num(params, 'lockDepth')
  const bleed = num(params, 'bleed')
  const lockDepth = lockParam > 0 ? lockParam : Math.max(18, Math.min(L, W) * 0.38)
  const minor = lockDepth * 0.82
  const chamfer = minor * 0.4
  const tabWidth = Math.min(16, L * 0.14)
  const tabHeight = Math.min(9, lockDepth * 0.28)
  const tabInset = Math.max(6, L * 0.08)

  const b = new DielineBuilder(
    'fefco-0471',
    { name: { tr: 'Kilitli klasör mailer', en: 'Locking folder mailer' }, fefco: '0471', caliper, glueFlapSide: 'none' },
    params,
  )

  const frontFlap = snapLockMajorProfile({
    x1: 0,
    x2: L,
    y: -H,
    direction: -1,
    depth: lockDepth,
    tabWidth,
    tabHeight,
    tabInset,
  })
  const backFlap = snapLockMinorProfile({ x1: 0, x2: L, y: W + H, direction: 1, depth: minor, chamfer })
  const rightFlap = flapX(L + H, 0, W, minor, chamfer, 1)
  const leftFlap = flapX(-H, 0, W, minor, chamfer, -1)

  const outline = new PathBuilder()
  outline.moveTo({ x: 0, y: -H })
  emitProfile(outline, frontFlap)
  outline.lineTo({ x: L, y: 0 })
  outline.lineTo({ x: L + H, y: 0 })
  emitProfile(outline, rightFlap)
  outline.lineTo({ x: L, y: W })
  outline.lineTo({ x: L, y: W + H })
  emitProfile(outline, reverseProfile(backFlap))
  outline.lineTo({ x: 0, y: W })
  outline.lineTo({ x: -H, y: W })
  emitProfile(outline, leftFlap)
  outline.lineTo({ x: 0, y: 0 })
  outline.close()
  b.cut(outline.build(), 'mailer çevresi')

  b.panel({ id: 'base', name: 'base', label: { tr: 'Taban', en: 'Base' }, outline: rectPoints(0, 0, L, W), role: 'bottom' })
  b.root('base')
  b.panel({ id: 'front', name: 'front', label: { tr: 'Ön duvar', en: 'Front wall' }, outline: rectPoints(0, -H, L, H), role: 'wall' })
  b.panel({ id: 'back', name: 'back', label: { tr: 'Arka duvar', en: 'Back wall' }, outline: rectPoints(0, W, L, H), role: 'wall' })
  b.panel({ id: 'left', name: 'left', label: { tr: 'Sol duvar', en: 'Left wall' }, outline: rectPoints(-H, 0, H, W), role: 'wall' })
  b.panel({ id: 'right', name: 'right', label: { tr: 'Sağ duvar', en: 'Right wall' }, outline: rectPoints(L, 0, H, W), role: 'wall' })

  b.panel({ id: 'front-lock', name: 'front-lock', label: { tr: 'Ön kilit kapağı', en: 'Front lock flap' }, outline: profileToPolygon(frontFlap), role: 'lock' })
  b.panel({ id: 'back-lock', name: 'back-lock', label: { tr: 'Arka kilit kapağı', en: 'Back lock flap' }, outline: profileToPolygon(backFlap), role: 'lock' })
  b.panel({ id: 'left-lock', name: 'left-lock', label: { tr: 'Sol kilit kapağı', en: 'Left lock flap' }, outline: profileToPolygon(leftFlap), role: 'lock' })
  b.panel({ id: 'right-lock', name: 'right-lock', label: { tr: 'Sağ kilit kapağı', en: 'Right lock flap' }, outline: profileToPolygon(rightFlap), role: 'lock' })

  b.fold({ parent: 'base', child: 'front', ...foldHorizontal(0, 0, L, 'below') })
  b.fold({ parent: 'base', child: 'back', ...foldHorizontal(W, 0, L, 'above') })
  b.fold({ parent: 'base', child: 'left', ...foldVertical(0, 0, W, 'left') })
  b.fold({ parent: 'base', child: 'right', ...foldVertical(L, 0, W, 'right') })
  b.fold({ parent: 'front', child: 'front-lock', ...foldHorizontal(-H, 0, L, 'below') })
  b.fold({ parent: 'back', child: 'back-lock', ...foldHorizontal(W + H, 0, L, 'above') })
  b.fold({ parent: 'left', child: 'left-lock', ...foldVertical(-H, 0, W, 'left') })
  b.fold({ parent: 'right', child: 'right-lock', ...foldVertical(L + H, 0, W, 'right') })

  const slotW = Math.min(tabWidth + 4, L * 0.2)
  if (L > 50) {
    b.cut(stadiumPath({ x: tabInset + tabWidth / 2, y: W + H + minor * 0.45 }, slotW, Math.max(3, caliper * 2)), 'sol kilit yarığı')
    b.cut(stadiumPath({ x: L - tabInset - tabWidth / 2, y: W + H + minor * 0.45 }, slotW, Math.max(3, caliper * 2)), 'sağ kilit yarığı')
  }

  if (bleed > 0) {
    const minX = -H - minor
    const maxX = L + H + minor
    const minY = -H - lockDepth
    const maxY = W + H + minor
    b.guide('bleed', rectPath(minX - bleed, minY - bleed, maxX - minX + 2 * bleed, maxY - minY + 2 * bleed), 'taşma payı')
  }

  return b.build()
}

export const ecommerceMailer: TemplateDefinition = {
  id: 'fefco-0427',
  code: '0427',
  standard: 'FEFCO',
  name: { tr: 'E-ticaret mailer', en: 'E-commerce mailer' },
  description: {
    tr: 'Menteşeli kapak + dil, ön duvarda yarık. Tutkalsız kapanır; kargo kutularının standart formu.',
    en: 'Hinged lid with a tuck into a front-wall slot — the glueless e-commerce mailer.',
  },
  category: 'tray-boxes',
  materials: ['corrugated', 'carton'],
  maturity: 'beta',
  keywords: ['0427', 'mailer', 'e-ticaret', 'kargo kutusu', 'tutkalsız'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 40, max: 1200, step: 1, default: 250, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 40, max: 1200, step: 1, default: 180, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 15, max: 400, step: 1, default: 50, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.3, max: 12, step: 0.1, default: 2.5, group: 'material' },
    { kind: 'number', key: 'tuckDepth', label: { tr: 'Kapak dili derinliği', en: 'Lid tuck depth' }, unit: 'mm', min: 0, max: 120, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'lidDust', label: { tr: 'Kapak toz kapağı', en: 'Lid dust flap' }, unit: 'mm', min: 0, max: 80, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: build0427,
}

export const lockingFolderMailer: TemplateDefinition = {
  id: 'fefco-0471',
  code: '0471',
  standard: 'FEFCO',
  name: { tr: 'Kilitli klasör mailer', en: 'Locking folder mailer' },
  description: {
    tr: 'Dört duvar, tutkalsız kilit kapakları. 0427’ye göre daha az karton; evrak ve düz ürün için.',
    en: 'Four walls with glueless lock flaps — a cheaper mailer for documents and flat goods.',
  },
  category: 'standard-boxes',
  materials: ['corrugated', 'carton'],
  maturity: 'beta',
  keywords: ['0471', 'klasör', 'folder', 'mailer', 'kilitli', 'evrak'],
  params: [
    { kind: 'number', key: 'length', label: { tr: 'Uzunluk', en: 'Length' }, unit: 'mm', min: 40, max: 1200, step: 1, default: 280, group: 'dimensions' },
    { kind: 'number', key: 'width', label: { tr: 'Genişlik', en: 'Width' }, unit: 'mm', min: 40, max: 1200, step: 1, default: 200, group: 'dimensions' },
    { kind: 'number', key: 'height', label: { tr: 'Yükseklik', en: 'Height' }, unit: 'mm', min: 15, max: 400, step: 1, default: 40, group: 'dimensions' },
    { kind: 'number', key: 'caliper', label: { tr: 'Mukavva kalınlığı', en: 'Board thickness' }, unit: 'mm', min: 0.3, max: 12, step: 0.1, default: 2.5, group: 'material' },
    { kind: 'number', key: 'lockDepth', label: { tr: 'Kilit kapağı derinliği', en: 'Lock flap depth' }, unit: 'mm', min: 0, max: 200, step: 0.5, default: 0, autoWhenZero: true, advanced: true, group: 'construction' },
    { kind: 'number', key: 'bleed', label: { tr: 'Taşma payı', en: 'Bleed' }, unit: 'mm', min: 0, max: 20, step: 0.5, default: 0, advanced: true, group: 'prepress' },
  ],
  build: build0471,
}
