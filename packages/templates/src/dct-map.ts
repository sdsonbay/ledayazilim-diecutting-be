import { CARTON_SPECS } from './catalog/carton.ts'
import { TRAY_SPECS } from './catalog/tray-family.ts'
import { FOOD_SPECS } from './catalog/food.ts'
import { TWO_PIECE_SPECS } from './catalog/two-piece-tray.ts'
import { BAG_SPECS } from './catalog/bags-dct.ts'
import { FOLDER_SPECS } from './catalog/folders-dct.ts'
import { SEPARATOR_SPECS } from './catalog/separators-dct.ts'
import { POLY_SPECS } from './catalog/polygonal-dct.ts'
import { SPECIAL_SPECS } from './catalog/special-dct.ts'
import { TAG_WRAP_SPECS } from './catalog/tags-wraps-dct.ts'
import { RIGID_SPECS } from './catalog/rigid-dct.ts'
import { DCT_GROUPS, DCT_INVENTORY, type DctEntry } from './dct-inventory.ts'
import { DCT_CONFIGURABLE_FAMILIES, DCT_VARIATIONS, type DctVariation } from './dct-variations.ts'
import type { MaterialKind, ParamValue, TemplateCategory } from './types.ts'

/**
 * diecuttemplates.com kimliği → bizim üretecimiz.
 *
 * `exact`: aynı ECMA/FEFCO yapısı (panel dizilimi ayna görüntüsü olabilir).
 * `false`: aynı kutu ailesi, ayrıntılar (kulak, pencere, ölçü mantığı) farklı olabilir.
 */
export interface DctMapping {
  dct: string
  templateId: string
  params?: Record<string, ParamValue>
  exact: boolean
  /** Adlandırılmış varyasyon ise DCT ana kaydı. */
  variantOf?: string
  /** becf-108… / 10c… / 10d… yapılandırıcı permütasyonu — desenle çözüldü. */
  configurable?: boolean
}

const manual: DctMapping[] = [
  // Tuck end — mevcut zengin üreteç (pencere, askı, dil/kanat stilleri)
  { dct: 'becf-10101', templateId: 'ecma-a20-20', exact: true },
  { dct: 'becf-10301', templateId: 'ecma-a20-21', exact: true },
  // Snap lock: A55.20.01.03 — kancalı kapak ve dil karşı panellerde (ayna)
  { dct: 'becf-10a01', templateId: 'ecma-a20-80', exact: true },
  // Auto bottom: A60.20.00.01 — dil arkada
  { dct: 'becf-11001', templateId: 'ecma-a21-20', exact: true },
  // Seal end A10.10.03.03
  { dct: 'becf-11d01', templateId: 'ecma-a40-20', exact: true },
  // Oluklu standart koliler
  { dct: 'becf-21d01', templateId: 'fefco-0201', exact: true },
  { dct: 'becf-21d04', templateId: 'fefco-0201', exact: true },
  { dct: 'becf-21d0a', templateId: 'fefco-0201', exact: true },
  { dct: 'becf-21d02', templateId: 'fefco-0202', exact: false },
  { dct: 'becf-21d05', templateId: 'fefco-0202', exact: false },
  { dct: 'becf-21d03', templateId: 'fefco-0203', exact: true },
  { dct: 'becf-21d06', templateId: 'fefco-0203', exact: true },
  { dct: 'becf-21e02', templateId: 'fefco-0471', exact: true },
  // Oluklu tepsiler
  { dct: 'becf-21701', templateId: 'fefco-0427', exact: true },
  { dct: 'becf-21707', templateId: 'fefco-0427', exact: false },
  { dct: 'becf-2170a', templateId: 'fefco-0421', exact: true },
  { dct: 'becf-21c06', templateId: 'fefco-0713', exact: true },
  { dct: 'becf-21c0b', templateId: 'fefco-0301', exact: true },
  { dct: 'becf-21c03', templateId: 'tray-4corner-glued', exact: false },
  // Karton tepsiler — mevcut özel üreteçler
  { dct: 'becf-11a0b', templateId: 'tapered-tray', exact: false },
  { dct: 'becf-11a0c', templateId: 'tapered-tray', exact: false },
  { dct: 'becf-11a0d', templateId: 'tray-hex', exact: false },
  { dct: 'becf-11a05', templateId: 'fefco-0301', exact: false },
  { dct: 'becf-11a0a', templateId: 'fefco-0301', exact: false },
  // Karton diğer gruplar
  { dct: 'becf-1240a', templateId: 'fefco-0427', exact: false },
  { dct: 'becf-1240b', templateId: 'sleeve-4panel', exact: false },
  { dct: 'becf-1240d', templateId: 'ecma-b40-10-84', exact: false },
  // Yastık kutular (F70.01 A/B)
  { dct: 'becf-12105', templateId: 'ecma-a50-20', exact: true },
  { dct: 'becf-12106', templateId: 'ecma-a50-20', exact: false },
  { dct: 'becf-12107', templateId: 'ecma-a50-20', exact: false },
  { dct: 'becf-12108', templateId: 'ecma-a50-20', exact: false },
  { dct: 'becf-1210a', templateId: 'ecma-a50-20', exact: false },
  { dct: 'becf-12703', templateId: 'tag-hang', exact: false },
  { dct: 'becf-12501', templateId: 'wrap-label', exact: false },
  // Yarıklı bölme setleri: uzun + çapraz şeritler (hücre sayısı DCT görseline göre)
  { dct: 'becf-11f05', templateId: 'fefco-0904', params: { cellsX: 3, cellsY: 2 }, exact: false },
  { dct: 'becf-11f06', templateId: 'fefco-0904', params: { cellsX: 2, cellsY: 2 }, exact: false },
  // Oluklu tepsi / teleskop / kapaklı tepsi varyantları — aynı aile, ayrıntı farkı
  { dct: 'becf-11a06', templateId: 'ecma-b20-01-53', exact: false },
  { dct: 'becf-11a0f', templateId: 'tray-4corner-glued', exact: false },
  { dct: 'becf-21711', templateId: 'fefco-0301', exact: false },
  { dct: 'becf-21712', templateId: 'fefco-0452', exact: false },
  { dct: 'becf-21a02', templateId: 'fefco-0427', exact: false },
  { dct: 'becf-21b01', templateId: 'fefco-0301', exact: false },
  { dct: 'becf-21b02', templateId: 'fefco-0301', exact: false },
  { dct: 'becf-21b04', templateId: 'fefco-0301', exact: false },
  { dct: 'becf-21b05', templateId: 'ecma-b40-20-82', exact: false },
  { dct: 'becf-21b06', templateId: 'fefco-0301', exact: false },
  { dct: 'becf-21b07', templateId: 'ecma-b40-20-82', exact: false },
  { dct: 'becf-21c02', templateId: 'fefco-0301', params: { piece: 'base' }, exact: true },
  { dct: 'becf-21c04', templateId: 'fefco-0301', params: { piece: 'base' }, exact: false },
  { dct: 'becf-21c0a', templateId: 'fefco-0452', exact: false },
  { dct: 'becf-21e01', templateId: 'fefco-0713', exact: false },
  { dct: 'becf-21e03', templateId: 'fefco-0421', exact: false },
  { dct: 'becf-21e26', templateId: 'fefco-0301', exact: false },
  // Sert karton
  { dct: 'becf-30301', templateId: 'ring-binder', exact: false },
  { dct: 'becf-30600', templateId: 'swatch-fan', exact: false },
  { dct: 'becf-30205', templateId: 'hinged-lid-box', exact: false },
  { dct: 'becf-30102', templateId: 'rigid-setup-box', exact: false },
  { dct: 'becf-30701', templateId: 'easel-display', exact: false },
]

const fromCartonSpecs: DctMapping[] = CARTON_SPECS.flatMap((spec) =>
  spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 || spec.dct.length <= 2 })),
)

const fromTraySpecs: DctMapping[] = TRAY_SPECS.flatMap((spec) => spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 })))
const fromFoodSpecs: DctMapping[] = FOOD_SPECS.flatMap((spec) => spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 })))
const fromTwoPieceSpecs: DctMapping[] = TWO_PIECE_SPECS.flatMap((spec) => spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 })))
const fromBagSpecs: DctMapping[] = BAG_SPECS.flatMap((spec) => spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 })))
const fromFolderSpecs: DctMapping[] = FOLDER_SPECS.flatMap((spec) => spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 })))
const fromSeparatorSpecs: DctMapping[] = SEPARATOR_SPECS.flatMap((spec) => spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 })))
const fromPolySpecs: DctMapping[] = POLY_SPECS.flatMap((spec) => spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 })))
const fromSpecialSpecs: DctMapping[] = SPECIAL_SPECS.flatMap((spec) => spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 })))
const fromTagWrapSpecs: DctMapping[] = TAG_WRAP_SPECS.flatMap((spec) => spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 })))
const fromRigidSpecs: DctMapping[] = RIGID_SPECS.flatMap((spec) => spec.dct.map((dct, i) => ({ dct, templateId: spec.id, exact: i === 0 })))

const BASE_MAP: readonly DctMapping[] = [...manual, ...fromCartonSpecs, ...fromTraySpecs, ...fromFoodSpecs, ...fromTwoPieceSpecs, ...fromBagSpecs, ...fromFolderSpecs, ...fromSeparatorSpecs, ...fromPolySpecs, ...fromSpecialSpecs, ...fromTagWrapSpecs, ...fromRigidSpecs]
const baseByDct = new Map(BASE_MAP.map((m) => [m.dct, m]))

/**
 * DCT varyasyon alanları → üretec parametreleri. Hem eski tuck üreteci
 * (`sitLockTop`, `euroHole`) hem birleşik karton üreteci (`tuckLock`, `hangTab`)
 * anahtarları yazılır; şablonun tanımadığı anahtarlar çözümlemede atılır.
 */
export const variationParams = (v: DctVariation): Record<string, ParamValue> => {
  const p: Record<string, ParamValue> = {}
  if (v.flap) p.tuckFlapStyle = v.flap
  if (v.dust) p.dustFlapStyle = v.dust
  if (v.tuck) {
    const on = v.tuck === 'sit'
    p.tuckLock = on
    p.sitLockTop = on
    p.sitLockBottom = on
  }
  if (v.window !== null) p.window = v.window ? 'rect' : 'none'
  if (v.thumbNotch !== null) p.thumbNotch = v.thumbNotch
  if (v.hangTab !== null) {
    p.hangTab = v.hangTab
    p.euroHole = v.hangTab
  }
  return p
}

/** Ana kayıt satırları (id === base) ana eşlemeye DCT’nin gerçek dil/kanat/kilit değerlerini işler. */
const baseFeatureOverrides = new Map<string, Record<string, ParamValue>>()
for (const v of DCT_VARIATIONS) if (v.id === v.base) baseFeatureOverrides.set(v.id, variationParams(v))

const withBaseFeatures = (m: DctMapping): DctMapping => {
  const extra = baseFeatureOverrides.get(m.dct)
  return extra ? { ...m, params: { ...(m.params ?? {}), ...extra } } : m
}

const fromVariations: DctMapping[] = DCT_VARIATIONS.flatMap((v) => {
  if (v.id === v.base) return []
  const base = baseByDct.get(v.base)
  if (!base) return []
  const baseParams = withBaseFeatures(base).params ?? {}
  return [{ dct: v.id, templateId: base.templateId, params: { ...baseParams, ...variationParams(v) }, exact: false, variantOf: v.base }]
})

export const DCT_MAP: readonly DctMapping[] = [...BASE_MAP.map(withBaseFeatures), ...fromVariations]

const byDct = new Map(DCT_MAP.map((m) => [m.dct, m]))
const byTemplate = new Map<string, string[]>()
for (const m of DCT_MAP) {
  const list = byTemplate.get(m.templateId) ?? []
  if (!list.includes(m.dct)) list.push(m.dct)
  byTemplate.set(m.templateId, list)
}

const CONFIGURABLE_ID = /^becf-[0-9a-f]{5,7}$/

/**
 * Yapılandırıcı aileleri: DCT bu kutuları tek ana modelin binlerce permütasyonu
 * olarak numaralandırır (becf-108 → 34 992 kimlik). Kimlik indeksinin ilk iki
 * üçlü basamağı dil köşe biçimi ve toz kapağı biçimidir; kalan basamaklar
 * (kilit çentikleri, yapıştırma payı tarafı, ek panel) ana modelle temsil edilir.
 */
export const configurableOf = (dctId: string): DctMapping | undefined => {
  const id = dctId.toLowerCase()
  if (!CONFIGURABLE_ID.test(id)) return undefined
  const fam = DCT_CONFIGURABLE_FAMILIES.find((f) => id.startsWith(f.prefix))
  if (!fam) return undefined
  const idx = Number.parseInt(id.slice(fam.prefix.length), 16)
  if (!Number.isFinite(idx) || idx < 1 || idx > fam.total) return undefined
  const base = byDct.get(fam.base)
  if (!base) return undefined
  const params: Record<string, ParamValue> = { ...(base.params ?? {}) }
  if (fam.prefix === 'becf-108') {
    const d0 = (idx - 1) % 3
    const d1 = Math.floor((idx - 1) / 3) % 3
    params.tuckFlapStyle = (['uni', 'angled', 'friction'] as const)[d0] as ParamValue
    params.dustFlapStyle = (['angled', 'rounded', 'normal'] as const)[d1] as ParamValue
  }
  return { dct: id, templateId: base.templateId, params, exact: false, variantOf: fam.base, configurable: true }
}

export const dctMappingOf = (dctId: string): DctMapping | undefined => byDct.get(dctId.toLowerCase()) ?? configurableOf(dctId)

const hasParams = (m: DctMapping): boolean => Object.keys(m.params ?? {}).length > 0

/** Bir şablona bağlı adlandırılmış varyasyonlar (ana kayıtlar hariç). */
export const dctVariationsOf = (templateId: string): DctMapping[] => DCT_MAP.filter((m) => m.templateId === templateId && m.variantOf !== undefined)

/** Kendi katalog kartını alan DCT kayıtları: varyasyonlar + parametre taşıyan ana kayıtlar. */
export const dctCardMappingsOf = (templateId: string): DctMapping[] => DCT_MAP.filter((m) => m.templateId === templateId && (m.variantOf !== undefined || hasParams(m)))

/** Bir şablonun karşıladığı tüm DCT kimlikleri (varyasyonlar dahil). */
export const dctIdsOf = (templateId: string): string[] => byTemplate.get(templateId) ?? []

/** Şablon varsayılanıyla birebir ana kayıtlar (parametre farkı yok) — varsayılan katalog kartında gösterilir. */
export const dctBaseIdsOf = (templateId: string): string[] =>
  dctIdsOf(templateId).filter((id) => {
    const m = byDct.get(id)
    return m !== undefined && m.variantOf === undefined && !hasParams(m)
  })

export const dctEntry = (dctId: string): DctEntry | undefined => DCT_INVENTORY.find((e) => e.id === dctId)

export interface DctGroupCoverage {
  material: MaterialKind
  group: TemplateCategory
  total: number
  covered: number
  missing: string[]
  /** Gruptaki adlandırılmış varyasyon sayısı / karşılanan. */
  variations: number
  variationsCovered: number
}

export interface DctCoverage {
  /** Ana kayıtlar (grup sayfalarındaki kartlar). */
  total: number
  covered: number
  /** Adlandırılmış varyasyonlar (+N Variations). */
  variations: number
  variationsCovered: number
  /** Yapılandırıcı permütasyonları (desenle çözülür). */
  configurable: { prefix: string; base: string; total: number; group: TemplateCategory }[]
  configurableTotal: number
  /** Sitemap’teki tüm dieline kimlikleri. */
  grandTotal: number
  grandCovered: number
  groups: DctGroupCoverage[]
}

/** Envanterin ne kadarının üreteçle karşılandığı — katalog “DCT uyumu” göstergesi. */
export const dctCoverage = (): DctCoverage => {
  const groups: DctGroupCoverage[] = DCT_GROUPS.map((g) => {
    const items = DCT_INVENTORY.filter((e) => e.material === g.material && e.group === g.group)
    const missing = items.filter((e) => !byDct.has(e.id)).map((e) => e.id)
    const vars = DCT_VARIATIONS.filter((v) => v.id !== v.base && v.material === g.material && v.group === g.group)
    return {
      material: g.material,
      group: g.group,
      total: items.length,
      covered: items.length - missing.length,
      missing,
      variations: vars.length,
      variationsCovered: vars.filter((v) => byDct.has(v.id)).length,
    }
  })
  const total = DCT_INVENTORY.length
  const covered = DCT_INVENTORY.filter((e) => byDct.has(e.id)).length
  const named = DCT_VARIATIONS.filter((v) => v.id !== v.base)
  const variations = named.length
  const variationsCovered = named.filter((v) => byDct.has(v.id)).length
  const configurable = [...DCT_CONFIGURABLE_FAMILIES]
  const configurableTotal = configurable.reduce((n, f) => n + f.total, 0)
  const configurableCovered = configurable.reduce((n, f) => n + (byDct.has(f.base) ? f.total : 0), 0)
  return {
    total,
    covered,
    variations,
    variationsCovered,
    configurable,
    configurableTotal,
    grandTotal: total + variations + configurableTotal,
    grandCovered: covered + variationsCovered + configurableCovered,
    groups,
  }
}
