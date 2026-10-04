import { validateDieline, type Dieline } from '@diecut/core'
import { taperedTray } from './catalog/angled.ts'
import { toteBag, sosBag, matchbox } from './catalog/bags.ts'
import { tuckTopAutoBottom } from './catalog/auto-bottom.ts'
import { cartonTemplates } from './catalog/carton.ts'
import { trayTemplates } from './catalog/tray-family.ts'
import { foodTemplates } from './catalog/food.ts'
import { twoPieceTemplates } from './catalog/two-piece-tray.ts'
import { bagTemplates } from './catalog/bags-dct.ts'
import { folderTemplates } from './catalog/folders-dct.ts'
import { separatorTemplates } from './catalog/separators-dct.ts'
import { polyTemplates } from './catalog/polygonal-dct.ts'
import { specialTemplates } from './catalog/special-dct.ts'
import { tagWrapTemplates } from './catalog/tags-wraps-dct.ts'
import { rigidTemplates } from './catalog/rigid-dct.ts'
import { clamshellBox } from './catalog/clamshell.ts'
import { counterDisplay } from './catalog/display.ts'
import { walletEnvelope } from './catalog/envelope.ts'
import { fivePanelFolder } from './catalog/folder.ts'
import { fourCornerTray } from './catalog/four-corner-tray.ts'
import { fruitTray } from './catalog/fruit-tray.ts'
import { hingedLidBox, ringBinder, swatchFan } from './catalog/hardboard.ts'
import { hexTray } from './catalog/hex-tray.ts'
import { ecommerceMailer, lockingFolderMailer } from './catalog/mailer.ts'
import { pillowBox } from './catalog/pillow.ts'
import { pizzaBox } from './catalog/pizza.ts'
import { cellPartition } from './catalog/partition.ts'
import { rollEndTuckTop } from './catalog/roll-end.ts'
import {
  fullOverlapContainer,
  halfSlottedContainer,
  innerOverlapSlottedContainer,
  overlapSlottedContainer,
  regularSlottedContainer,
} from './catalog/rsc-0201.ts'
import { sealEnd } from './catalog/seal-end.ts'
import { sleeve } from './catalog/sleeve.ts'
import { snapLockBottom } from './catalog/snap-lock.ts'
import { easelDisplay, postalTag, windowTray } from './catalog/specialty.ts'
import { hangTag } from './catalog/tag.ts'
import { telescopeBox } from './catalog/telescope.ts'
import { reverseTuckEnd, straightTuckEnd } from './catalog/tuck-end.ts'
import { hexTube, octagonTube, pentagonTube, triangleTube } from './catalog/tubes.ts'
import { fefco0421, rigidSetupBox, shirtBox } from './catalog/two-piece.ts'
import { wrapAround } from './catalog/wrap-around.ts'
import { wrapLabel } from './catalog/wrap-label.ts'
import { resolveParams, type I18nText, type MaterialKind, type ParamDef, type ParamValue, type TemplateCategory, type TemplateDefinition } from './types.ts'
import { buildCatalogListings, buildDctListings, type CatalogListing } from './catalog-skus.ts'
import { DCT_TREE } from './dct-catalog.ts'
import { dctBaseIdsOf, dctMappingOf } from './dct-map.ts'

export const templates: readonly TemplateDefinition[] = [
  reverseTuckEnd,
  straightTuckEnd,
  snapLockBottom,
  tuckTopAutoBottom,
  sealEnd,
  pillowBox,
  regularSlottedContainer,
  halfSlottedContainer,
  innerOverlapSlottedContainer,
  overlapSlottedContainer,
  fullOverlapContainer,
  wrapAround,
  ecommerceMailer,
  lockingFolderMailer,
  fourCornerTray,
  fruitTray,
  hexTray,
  clamshellBox,
  pizzaBox,
  telescopeBox,
  sleeve,
  hexTube,
  octagonTube,
  fivePanelFolder,
  counterDisplay,
  cellPartition,
  hangTag,
  postalTag,
  walletEnvelope,
  shirtBox,
  triangleTube,
  pentagonTube,
  matchbox,
  windowTray,
  taperedTray,
  toteBag,
  sosBag,
  wrapLabel,
  rigidSetupBox,
  hingedLidBox,
  ringBinder,
  swatchFan,
  easelDisplay,
  rollEndTuckTop,
  fefco0421,
  ...cartonTemplates,
  ...trayTemplates,
  ...foodTemplates,
  ...twoPieceTemplates,
  ...bagTemplates,
  ...folderTemplates,
  ...separatorTemplates,
  ...polyTemplates,
  ...specialTemplates,
  ...tagWrapTemplates,
  ...rigidTemplates,
]

const byId = new Map(templates.map((t) => [t.id, t]))
/** Katalog: diecuttemplates.com kartları (gezinme) + kendi aile/SKU kartlarımız (legacy — arama/kimlik). */
const listings: readonly CatalogListing[] = [...buildDctListings(templates), ...buildCatalogListings(templates).filter((l) => !l.id.startsWith('becf-'))]
const listingsById = new Map(listings.map((item) => [item.id, item]))

const listingMaterials = (item: CatalogListing): MaterialKind[] => item.materials ?? item.template.materials
const listingCategory = (item: CatalogListing): TemplateCategory => item.category ?? item.template.category

/** Arama metni bir kez hesaplanır (37k kart × istek başına join pahalı). */
const haystacks = new Map<string, string>(
  listings.map((item) => [
    item.id,
    [
      item.id,
      item.template.id,
      item.template.code,
      item.code ?? '',
      item.name.tr,
      item.name.en,
      item.description.tr,
      item.description.en,
      // Aile anahtar kelimelerindeki DCT kimlikleri kartın kendi kimliği değildir (becf-10803 aramasında tüm aile çıkmasın)
      ...item.keywords.filter((k) => !/^becf-/i.test(k)),
      ...item.template.keywords.filter((k) => !/^becf-/i.test(k)),
      ...(item.dct ?? []),
    ]
      .join(' ')
      .toLocaleLowerCase('tr'),
  ]),
)

export class UnknownTemplateError extends Error {
  readonly id: string
  readonly code = 'template_not_found' as const

  constructor(id: string) {
    super(`Unknown template: ${id}`)
    this.name = 'UnknownTemplateError'
    this.id = id
  }
}

export function getTemplate(id: string): TemplateDefinition {
  const template = byId.get(id) ?? listingsById.get(id)?.template
  if (!template) throw new UnknownTemplateError(id)
  return template
}

/** Katalog kartı, aile id’si veya DCT kimliğini (`becf-…`) üretece ve ön ayarlara çevirir. */
export function resolveCatalog(id: string): CatalogListing {
  const listing = listingsById.get(id)
  if (listing) return listing
  const template = byId.get(id)
  if (template) {
    return {
      id: template.id,
      template,
      params: {},
      name: template.name,
      description: template.description,
      keywords: template.keywords,
      badges: [],
    }
  }
  const mapping = dctMappingOf(id)
  if (mapping) {
    const base = resolveCatalog(mapping.templateId)
    const known = Object.fromEntries(Object.entries(mapping.params ?? {}).filter(([k]) => base.template.params.some((p) => p.key === k)))
    return { ...base, params: { ...base.params, ...known }, dct: [mapping.dct] }
  }
  throw new UnknownTemplateError(id)
}

export const withParamDefaults = (params: readonly ParamDef[], overrides: Record<string, ParamValue>): ParamDef[] =>
  params.map((p) => {
    const next = overrides[p.key]
    if (next === undefined) return p
    if (p.kind === 'number' && typeof next === 'number') return { ...p, default: next }
    if (p.kind === 'boolean' && typeof next === 'boolean') return { ...p, default: next }
    if (p.kind === 'enum' && typeof next === 'string') return { ...p, default: next }
    return p
  })

/** DCT grup adları (Cartons / Corrugated cardboards / Hard cardboards altındaki alt kategoriler). */
export const categoryLabels: Record<TemplateCategory, I18nText> = {
  'tuck-end-boxes': { tr: 'Kapaklı kutular (tuck end)', en: 'Tuck end boxes' },
  'food-boxes': { tr: 'Gıda kutuları', en: 'Food boxes' },
  'snap-lock-boxes': { tr: 'Kilitli tabanlı kutular (snap lock)', en: 'Snap lock boxes' },
  'tuck-top-auto-bottom-boxes': { tr: 'Otomatik tabanlı kutular', en: 'Tuck top auto bottom boxes' },
  'tray-boxes': { tr: 'Tepsi kutular', en: 'Tray boxes' },
  'shirt-boxes': { tr: 'Gömlek kutuları', en: 'Shirt boxes' },
  'polygonal-boxes': { tr: 'Çokgen kutular', en: 'Polygonal boxes' },
  'standard-boxes': { tr: 'Standart kutular', en: 'Standard boxes' },
  'special-boxes': { tr: 'Özel kutular', en: 'Special boxes' },
  'angled-boxes': { tr: 'Açılı kutular', en: 'Angled boxes' },
  'carton-bags-pillows': { tr: 'Karton çanta ve yastık kutular', en: 'Carton bags & pillows' },
  envelopes: { tr: 'Zarflar', en: 'Envelopes' },
  tags: { tr: 'Etiketler', en: 'Tags' },
  folders: { tr: 'Dosya ve klasörler', en: 'Folders' },
  separators: { tr: 'Ayırıcılar', en: 'Separators' },
  'wrap-around-labels': { tr: 'Sargı etiketler', en: 'Wrap around labels' },
  'covered-solid-board-boxes': { tr: 'Kaplamalı sert kutular', en: 'Covered solid board boxes' },
  'boxes-with-hinged-lid': { tr: 'Menteşeli kapaklı kutular', en: 'Boxes with hinged lid' },
  binders: { tr: 'Klasörler', en: 'Binders' },
  'swatch-cards': { tr: 'Numune kartları', en: 'Swatch cards' },
  'display-materials': { tr: 'Display malzemeleri', en: 'Display materials' },
}

/** DCT’de grupların hangi malzeme dalında bulunduğu. */
export const categoryMaterials: Record<TemplateCategory, MaterialKind[]> = {
  'tuck-end-boxes': ['carton', 'corrugated'],
  'food-boxes': ['carton'],
  'snap-lock-boxes': ['carton', 'corrugated'],
  'tuck-top-auto-bottom-boxes': ['carton', 'corrugated'],
  'tray-boxes': ['carton', 'corrugated'],
  'shirt-boxes': ['carton'],
  'polygonal-boxes': ['carton'],
  'standard-boxes': ['carton', 'corrugated'],
  'special-boxes': ['carton', 'corrugated'],
  'angled-boxes': ['carton'],
  'carton-bags-pillows': ['carton'],
  envelopes: ['carton'],
  tags: ['carton'],
  folders: ['carton'],
  separators: ['carton', 'corrugated'],
  'wrap-around-labels': ['carton'],
  'covered-solid-board-boxes': ['hardboard'],
  'boxes-with-hinged-lid': ['hardboard'],
  binders: ['hardboard'],
  'swatch-cards': ['hardboard'],
  'display-materials': ['hardboard'],
}

export const materialLabels: Record<MaterialKind, I18nText> = {
  carton: { tr: 'Karton', en: 'Cartons' },
  corrugated: { tr: 'Oluklu mukavva', en: 'Corrugated cardboards' },
  hardboard: { tr: 'Sert karton', en: 'Hard cardboards' },
  plastic: { tr: 'Plastik', en: 'Plastic' },
}

export interface TemplateFilter {
  category?: TemplateCategory
  material?: TemplateDefinition['materials'][number]
  query?: string
  ids?: string[]
  /** Kendi aile/SKU kartlarımızı da listele (varsayılan: yalnızca sorgu ya da kimlik listesi varsa). */
  includeLegacy?: boolean
}

const showsLegacy = (filter: TemplateFilter): boolean => filter.includeLegacy === true || Boolean(filter.query?.trim()) || Boolean(filter.ids && filter.ids.length > 0)

const matchesListing = (item: CatalogListing, filter: TemplateFilter, query: string, legacyOk: boolean): boolean => {
  if (item.legacy && !legacyOk) return false
  if (filter.ids && filter.ids.length > 0 && !filter.ids.includes(item.id)) return false
  if (filter.category && listingCategory(item) !== filter.category) return false
  if (filter.material && !listingMaterials(item).includes(filter.material)) return false
  if (!query) return true
  return (haystacks.get(item.id) ?? '').includes(query)
}

const DCT_QUERY = /^(?:becf-)?([0-9a-f]{5,7})$/

const filteredListings = (filter: TemplateFilter = {}): CatalogListing[] => {
  const query = filter.query?.trim().toLocaleLowerCase('tr') ?? ''
  const legacyOk = showsLegacy(filter)
  const matched = listings.filter((item) => matchesListing(item, filter, query, legacyOk))
  if (matched.length > 0) return matched
  // Kartı olmayan DCT kimliği (sitemap dışı ama çözülebilen)
  const q = query.match(DCT_QUERY)
  if (!q) return matched
  const mapping = dctMappingOf(`becf-${q[1]}`)
  if (!mapping) return matched
  try {
    const item = resolveCatalog(mapping.dct)
    if (filter.category && listingCategory(item) !== filter.category) return matched
    if (filter.material && !listingMaterials(item).includes(filter.material)) return matched
    return [{ ...item, id: mapping.dct, keywords: [...item.keywords, mapping.dct] }]
  } catch {
    return matched
  }
}

export interface CatalogGroup {
  id: TemplateCategory
  label: I18nText
  count: number
  materials: MaterialKind[]
}

export interface CatalogMaterial {
  id: MaterialKind
  label: I18nText
  count: number
}

export interface CatalogBranch {
  id: MaterialKind
  label: I18nText
  count: number
  groups: CatalogGroup[]
}

/** Tek geçişte malzeme × grup sayımı (DCT ağacı). */
const countTree = (items: readonly CatalogListing[]): { branches: CatalogBranch[]; total: number } => {
  const counts = new Map<string, number>()
  const matCounts = new Map<MaterialKind, number>()
  for (const item of items) {
    const mats = listingMaterials(item)
    const cat = listingCategory(item)
    for (const m of mats) counts.set(`${m}/${cat}`, (counts.get(`${m}/${cat}`) ?? 0) + 1)
    const primary = DCT_TREE.find((b) => mats.includes(b.material) && b.groups.includes(cat))?.material ?? mats[0]
    if (primary) matCounts.set(primary, (matCounts.get(primary) ?? 0) + 1)
  }
  const branches: CatalogBranch[] = DCT_TREE.map((b) => {
    const groups: CatalogGroup[] = b.groups.map((g) => ({ id: g, label: categoryLabels[g], count: counts.get(`${b.material}/${g}`) ?? 0, materials: [b.material] }))
    return { id: b.material, label: materialLabels[b.material], count: matCounts.get(b.material) ?? 0, groups }
  })
  return { branches, total: items.length }
}

const defaultTree = countTree(filteredListings())

const treeFor = (filter: Pick<TemplateFilter, 'query'> = {}): CatalogBranch[] => (filter.query?.trim() ? countTree(filteredListings(filter)).branches : defaultTree.branches)

/** DCT’deki üst kategori: Karton / Oluklu / Sert karton. */
export const usedMaterials = (filter: Pick<TemplateFilter, 'query'> = {}): CatalogMaterial[] =>
  treeFor(filter)
    .filter((b) => b.count > 0)
    .map(({ id, label, count }) => ({ id, label, count }))

/** DCT’deki “group”: Kapaklı, Tepsi, Koli… — malzeme altında alt kategori. */
export const usedGroups = (filter: Pick<TemplateFilter, 'material' | 'query'> = {}): CatalogGroup[] => {
  const branches = treeFor(filter).filter((b) => !filter.material || b.id === filter.material)
  const merged = new Map<TemplateCategory, CatalogGroup>()
  for (const b of branches) {
    for (const g of b.groups) {
      if (g.count === 0) continue
      const prev = merged.get(g.id)
      merged.set(g.id, prev ? { ...prev, count: prev.count + g.count, materials: [...prev.materials, b.id] } : g)
    }
  }
  return [...merged.values()]
}

export const usedCategories = (): { id: TemplateCategory; label: I18nText }[] =>
  usedGroups().map(({ id, label }) => ({ id, label }))

/** DCT ağacı: malzeme (Karton/Oluklu/Sert karton) → grup — sabit menü sırası, sayılar gezinme kartları. */
export const catalogTree = (filter: Pick<TemplateFilter, 'query'> = {}): CatalogBranch[] => treeFor(filter).filter((b) => b.count > 0)

export interface PreviewDims {
  a: number
  b: number
  c: number
  kind: 'box' | 'card' | 'tube'
}

const numDefault = (t: TemplateDefinition, key: string): number => {
  const def = t.params.find((p) => p.key === key && p.kind === 'number')
  return def && typeof def.default === 'number' ? def.default : 0
}

export const previewDimsOf = (t: TemplateDefinition): PreviewDims => {
  const diameter = numDefault(t, 'diameter')
  const length = numDefault(t, 'length')
  const width = numDefault(t, 'width')
  const height = numDefault(t, 'height')
  const spine = numDefault(t, 'spine')
  if (diameter > 0 && height > 0) return { a: diameter, b: diameter, c: height, kind: 'tube' }
  if (length > 0 && width > 0 && height > 0) return { a: length, b: width, c: height, kind: 'box' }
  if (length > 0 && height > 0) return { a: length, b: Math.max(8, spine || 12), c: height, kind: 'card' }
  return { a: 100, b: 60, c: 80, kind: 'box' }
}

export interface TemplateSummary {
  id: string
  familyId: string
  code: string
  standard: TemplateDefinition['standard']
  name: I18nText
  description: I18nText
  category: TemplateCategory
  categoryLabel: I18nText
  materials: TemplateDefinition['materials']
  maturity: TemplateDefinition['maturity']
  keywords: string[]
  badges: I18nText[]
  previewDims: PreviewDims
  /** Karşılık gelen diecuttemplates.com kimlikleri. */
  dct: string[]
  /** DCT “+N Variations”. */
  variations?: number
}

export const toSummary = (item: CatalogListing): TemplateSummary => ({
  id: item.id,
  familyId: item.template.id,
  code: item.code ?? item.template.code,
  standard: item.standard ?? item.template.standard,
  name: item.name,
  description: item.description,
  category: listingCategory(item),
  categoryLabel: categoryLabels[listingCategory(item)],
  materials: listingMaterials(item),
  maturity: item.template.maturity,
  keywords: item.keywords,
  badges: item.badges,
  previewDims: previewDimsOf(item.template),
  dct: item.dct ?? (item.badges.length === 0 ? dctBaseIdsOf(item.template.id) : []),
  ...(item.variations !== undefined ? { variations: item.variations } : {}),
})

export function listTemplates(filter: TemplateFilter = {}): TemplateSummary[] {
  return filteredListings(filter).map(toSummary)
}

export interface CatalogPage {
  items: TemplateSummary[]
  total: number
  page: number
  limit: number
  pageCount: number
}

/** Sayfalı katalog — yalnızca sayfadaki kartlar özetlenir (37k kartta tümünü özetlemek pahalı). */
export function queryCatalog(filter: TemplateFilter = {}, page = 1, limit = 48): CatalogPage {
  const matched = filteredListings(filter)
  const pageCount = Math.max(1, Math.ceil(matched.length / limit))
  const p = Math.min(Math.max(1, page), pageCount)
  const start = (p - 1) * limit
  return { items: matched.slice(start, start + limit).map(toSummary), total: matched.length, page: p, limit, pageCount }
}

export function countTemplates(filter: TemplateFilter = {}): number {
  return filteredListings(filter).length
}

export interface GenerateOptions {
  maxSheet?: { width: number; height: number }
}

export function generateDieline(templateId: string, input: Record<string, unknown> = {}, options: GenerateOptions = {}): Dieline {
  const listing = resolveCatalog(templateId)
  const params = resolveParams(listing.template, { ...listing.params, ...input })
  const dieline = listing.template.build(params)
  const checks = validateDieline(dieline, options.maxSheet ? { maxSheet: options.maxSheet } : {})
  return { ...dieline, warnings: [...dieline.warnings, ...checks] }
}