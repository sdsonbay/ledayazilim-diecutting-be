import { PRODUCTION_LAYERS, type Dieline, type PathCommand } from '@diecut/core'
import { DCT_CARDS, type DctCard } from './dct-catalog.ts'
import { dctMappingOf, type DctMapping } from './dct-map.ts'
import { resolveParams, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from './types.ts'

export interface CatalogListing {
  id: string
  template: TemplateDefinition
  params: Record<string, ParamValue>
  name: I18nText
  description: I18nText
  keywords: string[]
  badges: I18nText[]
  /** Bu kartın karşıladığı diecuttemplates.com kimlikleri (varyasyon kartlarında dolu). */
  dct?: string[]
  /** Kart malzemesi (DCT kartlarında tek malzeme); yoksa şablonun malzemeleri. */
  materials?: MaterialKind[]
  /** Kart grubu (DCT kartlarında sitedeki grup); yoksa şablonun kategorisi. */
  category?: TemplateCategory
  /** Kartta gösterilen standart kodu (DCT kartlarında DCT’nin ECMA/FEFCO kodu). */
  code?: string
  standard?: TemplateDefinition['standard']
  /** DCT “+N Variations”. */
  variations?: number
  /** Kendi aile/SKU kartı — gezinmede listelenmez, arama / kimlik / favori ile erişilir. */
  legacy?: boolean
}

const LOCKS = ['none', 'top', 'bottom', 'both'] as const
const WINDOWS = ['none', 'oval', 'rect'] as const
const FLAPS = ['angled', 'uni', 'friction'] as const
const DUSTS = ['normal', 'angled', 'rounded', 'slit'] as const

type Lock = (typeof LOCKS)[number]
type Notch = 'none' | 'top' | 'bottom' | 'both'
type WindowStyle = (typeof WINDOWS)[number]
type Flap = (typeof FLAPS)[number]
type Dust = (typeof DUSTS)[number]

const lockCode: Record<Lock, string> = { none: '0', top: 't', bottom: 'b', both: '2' }
const notchCode: Record<Notch, string> = { none: '0', top: 't', bottom: 'b', both: '2' }
const windowCode: Record<WindowStyle, string> = { none: '0', oval: 'o', rect: 'r' }
const flapCode: Record<Flap, string> = { angled: 'a', uni: 'u', friction: 'i' }
const dustCode: Record<Dust, string> = { normal: 'n', angled: 'a', rounded: 'r', slit: 's' }

const join = (parts: I18nText[]): I18nText => ({
  tr: parts.map((p) => p.tr).join(' · '),
  en: parts.map((p) => p.en).join(' · '),
})

interface Choice {
  code: string
  params: Record<string, ParamValue>
  badges: I18nText[]
  isDefault: boolean
}

const blank: Choice = { code: '', params: {}, badges: [], isDefault: true }

const listingOf = (template: TemplateDefinition, choice: Choice): CatalogListing => {
  const isDefault = choice.isDefault || choice.code === ''
  const id = isDefault ? template.id : `${template.id}--${choice.code}`
  const badges = choice.badges
  const name = badges.length === 0 ? template.name : { tr: `${template.name.tr} — ${join(badges).tr}`, en: `${template.name.en} — ${join(badges).en}` }
  const description =
    badges.length === 0
      ? template.description
      : {
          tr: `Aynı ${template.code || template.id} ailesi; ${join(badges).tr.toLocaleLowerCase('tr')}.`,
          en: `Same ${template.code || template.id} family with ${join(badges).en.toLowerCase()}.`,
        }
  return {
    id,
    template,
    params: choice.params,
    name,
    description,
    keywords: [...template.keywords, ...badges.flatMap((b) => [b.tr, b.en])],
    badges,
  }
}

const glueZero = (t: TemplateDefinition): Choice | null => {
  const def = t.params.find((p) => p.kind === 'number' && (p.key === 'glueFlap' || p.key === 'jointFlap'))
  if (!def || def.kind !== 'number' || def.min > 0 || def.default === 0) return null
  return {
    code: 'g0',
    params: { [def.key]: 0 },
    badges: [{ tr: 'Yapıştırmasız', en: 'No glue flap' }],
    isDefault: false,
  }
}

const boolFlip = (p: Extract<ParamDef, { kind: 'boolean' }>): Choice => ({
  code: `${p.key.slice(0, 3)}${p.default ? 0 : 1}`,
  params: { [p.key]: !p.default },
  badges: [{ tr: `${p.label.tr}: ${!p.default ? 'açık' : 'kapalı'}`, en: `${p.label.en}: ${!p.default ? 'on' : 'off'}` }],
  isDefault: false,
})

/** Ölçü/kalınlık kartezyeni yok — yalnızca geometriyi değiştiren tekil seçenekler. */
const explodeGeneric = (template: TemplateDefinition): CatalogListing[] => {
  const out: CatalogListing[] = [listingOf(template, blank)]
  const glue = glueZero(template)
  if (glue) out.push(listingOf(template, glue))
  for (const p of template.params) {
    if (p.advanced) continue
    if (p.kind === 'boolean') out.push(listingOf(template, boolFlip(p)))
    else if (p.kind === 'enum') {
      for (const opt of p.options) {
        if (opt.value === p.default) continue
        out.push(
          listingOf(template, {
            code: `e${opt.value}`.slice(0, 12),
            params: { [p.key]: opt.value },
            badges: [opt.label],
            isDefault: false,
          }),
        )
      }
    }
  }
  return out
}

const TUCK_SPECS: { hang: boolean; lock: Lock; notch: Notch; window: WindowStyle; flap: Flap; dust: Dust }[] = [
  { hang: false, lock: 'none', notch: 'top', window: 'none', flap: 'angled', dust: 'normal' },
  { hang: false, lock: 'none', notch: 'none', window: 'none', flap: 'angled', dust: 'normal' },
  { hang: false, lock: 'none', notch: 'bottom', window: 'none', flap: 'angled', dust: 'normal' },
  { hang: false, lock: 'none', notch: 'both', window: 'none', flap: 'angled', dust: 'normal' },
  { hang: true, lock: 'none', notch: 'none', window: 'none', flap: 'angled', dust: 'normal' },
  { hang: false, lock: 'top', notch: 'top', window: 'none', flap: 'angled', dust: 'normal' },
  { hang: false, lock: 'bottom', notch: 'top', window: 'none', flap: 'angled', dust: 'normal' },
  { hang: false, lock: 'both', notch: 'top', window: 'none', flap: 'angled', dust: 'normal' },
  { hang: false, lock: 'none', notch: 'top', window: 'oval', flap: 'angled', dust: 'normal' },
  { hang: false, lock: 'none', notch: 'top', window: 'rect', flap: 'angled', dust: 'normal' },
  { hang: false, lock: 'none', notch: 'top', window: 'none', flap: 'uni', dust: 'normal' },
  { hang: false, lock: 'none', notch: 'top', window: 'none', flap: 'friction', dust: 'normal' },
  { hang: false, lock: 'none', notch: 'top', window: 'none', flap: 'angled', dust: 'angled' },
  { hang: false, lock: 'none', notch: 'top', window: 'none', flap: 'angled', dust: 'rounded' },
  { hang: false, lock: 'none', notch: 'top', window: 'none', flap: 'angled', dust: 'slit' },
  { hang: false, lock: 'none', notch: 'none', window: 'oval', flap: 'angled', dust: 'normal' },
  { hang: false, lock: 'both', notch: 'none', window: 'none', flap: 'angled', dust: 'slit' },
]

const explodeTuck = (template: TemplateDefinition): CatalogListing[] => TUCK_SPECS.map((spec) => tuckSku(template, spec))

const tuckSku = (
  template: TemplateDefinition,
  o: { hang: boolean; lock: Lock; notch: Notch; window: WindowStyle; flap: Flap; dust: Dust },
): CatalogListing => {
  const isDefault =
    !o.hang && o.lock === 'none' && o.notch === 'top' && o.window === 'none' && o.flap === 'angled' && o.dust === 'normal'
  const id = isDefault
    ? template.id
    : `${template.id}--h${o.hang ? 1 : 0}-L${lockCode[o.lock]}-n${notchCode[o.notch]}-w${windowCode[o.window]}-f${flapCode[o.flap]}-d${dustCode[o.dust]}`

  const badges: I18nText[] = []
  if (o.hang) badges.push({ tr: 'Askılı', en: 'Hang tab' })
  if (o.lock === 'top') badges.push({ tr: 'Dilli kilit (üst)', en: 'Sit lock (top)' })
  if (o.lock === 'bottom') badges.push({ tr: 'Dilli kilit (alt)', en: 'Sit lock (bottom)' })
  if (o.lock === 'both') badges.push({ tr: 'Dilli kilit', en: 'Sit lock' })
  if (o.notch === 'none') badges.push({ tr: 'Parmak kesiği yok', en: 'No thumb notch' })
  if (o.notch === 'bottom') badges.push({ tr: 'Parmak kesiği (alt)', en: 'Thumb notch (bottom)' })
  if (o.notch === 'both') badges.push({ tr: 'Parmak kesiği (üst+alt)', en: 'Thumb notch (both)' })
  if (o.window === 'oval') badges.push({ tr: 'Oval pencere', en: 'Oval window' })
  if (o.window === 'rect') badges.push({ tr: 'Dikdörtgen pencere', en: 'Rectangle window' })
  if (o.flap === 'uni') badges.push({ tr: 'Düz dil', en: 'Uni tuck' })
  if (o.flap === 'friction') badges.push({ tr: 'Sürtünmeli dil', en: 'Friction-fit' })
  if (o.dust === 'angled') badges.push({ tr: 'Açılı kanat', en: 'Angled dust flap' })
  if (o.dust === 'rounded') badges.push({ tr: 'Yuvarlak kanat', en: 'Rounded dust flap' })
  if (o.dust === 'slit') badges.push({ tr: 'Yarıklı kanat', en: 'Slit-lock dust' })

  const params: Record<string, ParamValue> = {
    euroHole: o.hang,
    sitLockTop: o.lock === 'top' || o.lock === 'both',
    sitLockBottom: o.lock === 'bottom' || o.lock === 'both',
    thumbNotch: o.notch === 'top' || o.notch === 'both',
    thumbNotchBottom: o.notch === 'bottom' || o.notch === 'both',
    window: o.window,
    tuckFlapStyle: o.flap,
    dustFlapStyle: o.dust,
  }

  const keywords = [
    ...template.keywords,
    ...badges.flatMap((b) => [b.tr, b.en]),
    o.hang ? 'askılık' : '',
    o.lock !== 'none' ? 'sitlock' : '',
  ].filter(Boolean)

  const name = badges.length === 0 ? template.name : { tr: `${template.name.tr} — ${join(badges).tr}`, en: `${template.name.en} — ${join(badges).en}` }
  const description =
    badges.length === 0
      ? template.description
      : {
          tr: `Aynı ${template.code} ailesi; ${join(badges).tr.toLocaleLowerCase('tr')}.`,
          en: `Same ${template.code} family with ${join(badges).en.toLowerCase()}.`,
        }

  return { id, template, params, name, description, keywords, badges }
}

const quantizeCmd = (cmd: PathCommand, ox: number, oy: number, scale: number): string => {
  const q = (n: number) => Math.round(n * scale)
  switch (cmd.c) {
    case 'M':
    case 'L':
      return `${cmd.c}${q(cmd.x - ox)},${q(cmd.y - oy)}`
    case 'C':
      return `C${q(cmd.x1 - ox)},${q(cmd.y1 - oy)},${q(cmd.x2 - ox)},${q(cmd.y2 - oy)},${q(cmd.x - ox)},${q(cmd.y - oy)}`
    case 'A':
      return `A${q(cmd.rx)},${q(cmd.ry)},${Math.round(cmd.rot)},${cmd.large ? 1 : 0}${cmd.sweep ? 1 : 0},${q(cmd.x - ox)},${q(cmd.y - oy)}`
    case 'Z':
      return 'Z'
  }
}

const djb2 = (s: string): string => {
  let h = 5381
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}

/** Ölçeğe duyarsız bıçak izi imzası — aynı şekil, farklı mm ölçü klonlarını birleştirir. */
export const geometryKey = (dieline: Dieline): string => {
  const { x, y, width, height } = dieline.bounds
  const scale = 80 / Math.max(width, height, 1)
  const bits: string[] = []
  for (const path of dieline.paths) {
    if (!PRODUCTION_LAYERS.includes(path.layer)) continue
    bits.push(path.layer, ...path.commands.map((c) => quantizeCmd(c, x, y, scale)))
  }
  for (const panel of dieline.panels) {
    for (const hole of panel.holes ?? []) {
      bits.push('h', ...hole.map((p) => `${Math.round((p.x - x) * scale)},${Math.round((p.y - y) * scale)}`))
    }
  }
  return djb2(bits.join(' '))
}

const mergeDct = (keep: CatalogListing, other: CatalogListing): CatalogListing => {
  const ids = [...(keep.dct ?? []), ...(other.dct ?? [])]
  return ids.length > 0 ? { ...keep, dct: [...new Set(ids)] } : keep
}

const preferListing = (a: CatalogListing, b: CatalogListing): CatalogListing => {
  // Aynı geometri: az rozetli (aile varsayılanı) kalır, sonra kısa id; DCT kimlikleri birleşir.
  const aDct = a.id.startsWith('becf-')
  const bDct = b.id.startsWith('becf-')
  let keep: CatalogListing
  if (a.badges.length !== b.badges.length) keep = a.badges.length < b.badges.length ? a : b
  else if (aDct !== bDct) keep = aDct ? b : a
  else keep = a.id.length <= b.id.length ? a : b
  return mergeDct(keep, keep === a ? b : a)
}

const uniqueByGeometry = (items: CatalogListing[]): CatalogListing[] => {
  const byKey = new Map<string, CatalogListing>()
  for (const item of items) {
    try {
      const params = resolveParams(item.template, item.params)
      const key = `${item.template.id}:${geometryKey(item.template.build(params))}`
      const prev = byKey.get(key)
      byKey.set(key, prev ? preferListing(prev, item) : item)
    } catch {
      /* geçersiz kombinasyon katalogda durmasın */
    }
  }
  return [...byKey.values()]
}

const knownParams = (template: TemplateDefinition, params: Record<string, ParamValue>): Record<string, ParamValue> =>
  Object.fromEntries(Object.entries(params).filter(([k]) => template.params.some((p) => p.key === k)))

const optionLabel = (template: TemplateDefinition, key: string, value: ParamValue): I18nText | null => {
  const def = template.params.find((p) => p.key === key)
  if (!def) return null
  if (def.kind === 'enum') {
    if (value === def.default) return null
    return def.options.find((o) => o.value === value)?.label ?? null
  }
  if (def.kind === 'boolean') {
    if (value === def.default) return null
    return value ? def.label : { tr: `${def.label.tr} yok`, en: `No ${def.label.en.toLowerCase()}` }
  }
  return null
}

const dctBadges = (template: TemplateDefinition, params: Record<string, ParamValue>): I18nText[] => {
  const bothLocks = params.sitLockTop === true && params.sitLockBottom === true
  const badges = Object.entries(params)
    .filter(([k]) => !(bothLocks && (k === 'sitLockTop' || k === 'sitLockBottom')))
    .map(([k, v]) => optionLabel(template, k, v))
    .filter((b): b is I18nText => b !== null)
  if (bothLocks && template.params.some((p) => p.key === 'sitLockTop' && p.kind === 'boolean' && !p.default)) badges.unshift({ tr: 'Dilli kilit', en: 'Sit lock' })
  return badges
}

/**
 * diecuttemplates.com kartı → katalog kartı. Sitedeki her kayıt ayrı karttır (geometri birleştirmesi yok);
 * kart adı DCT kimliği, kod DCT’nin ECMA/FEFCO kodu, açıklama bizim aile adımız + teknik farklar.
 */
export const dctListing = (card: DctCard, template: TemplateDefinition, m: DctMapping): CatalogListing => {
  const params = knownParams(template, m.params ?? {})
  const badges = dctBadges(template, params)
  const label = card.id.toUpperCase()
  const tech = badges.length ? { tr: ` — ${join(badges).tr.toLocaleLowerCase('tr')}`, en: ` — ${join(badges).en.toLowerCase()}` } : { tr: '', en: '' }
  return {
    id: card.id,
    template,
    params,
    name: { tr: label, en: label },
    description: { tr: `${template.name.tr}${tech.tr}`, en: `${template.name.en}${tech.en}` },
    keywords: [card.id, card.id.replace(/^becf-/, ''), card.code, template.code, template.name.tr, template.name.en, ...badges.flatMap((b) => [b.tr, b.en])].filter(Boolean),
    badges,
    dct: [card.id],
    materials: [card.material],
    category: card.group,
    code: card.code,
    standard: card.standard,
    variations: card.variations,
  }
}

/** Sitedeki 37 326 kayıt → 37 326 kart (sıra: DCT menü sırası, sonra kimlik). */
export const buildDctListings = (templates: readonly TemplateDefinition[]): CatalogListing[] => {
  const byId = new Map(templates.map((t) => [t.id, t]))
  const out: CatalogListing[] = []
  for (const card of DCT_CARDS) {
    const m = dctMappingOf(card.id)
    if (!m) continue
    const template = byId.get(m.templateId)
    if (!template) continue
    out.push(dctListing(card, template, m))
  }
  return out
}

/** Kendi ailelerimiz: aile başına bir varsayılan + geometrisi farklı teknik varyantlar (gezinmede gizli, aramada açık). */
export const buildCatalogListings = (templates: readonly TemplateDefinition[]): CatalogListing[] => {
  const out: CatalogListing[] = []
  const seen = new Set<string>()
  for (const template of templates) {
    const raw = template.id === 'ecma-a20-20' || template.id === 'ecma-a20-21' ? explodeTuck(template) : explodeGeneric(template)
    for (const item of uniqueByGeometry(raw)) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push({ ...item, legacy: true })
    }
  }
  return out
}
