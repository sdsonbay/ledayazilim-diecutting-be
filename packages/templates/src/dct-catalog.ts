import { DCT_INVENTORY } from './dct-inventory.ts'
import { DCT_CONFIGURABLE_FAMILIES, DCT_VARIATIONS } from './dct-variations.ts'
import type { MaterialKind, TemplateCategory } from './types.ts'

/**
 * diecuttemplates.com katalog kartı — sitedeki her bıçak izi (ana, adlandırılmış varyasyon,
 * yapılandırıcı permütasyonu) burada bir kayıttır. Sitemap ile birebir (37 326 kayıt).
 */
export interface DctCard {
  id: string
  material: MaterialKind
  group: TemplateCategory
  /** `ECMA A20.20.01.03`, `FEFCO 0210` ya da boş. */
  code: string
  standard: 'ECMA' | 'FEFCO' | 'CUSTOM'
  /** DCT’nin “+N Variations” sayısı — aynı ailedeki diğer kartlar. */
  variations: number
  /** Ailenin ana kaydı (kendisi ana ise kendi kimliği). */
  base: string
}

/** DCT gezinme menüsündeki malzeme → grup sırası. */
export const DCT_TREE: readonly { material: MaterialKind; groups: readonly TemplateCategory[] }[] = [
  {
    material: 'carton',
    groups: [
      'food-boxes',
      'tuck-end-boxes',
      'snap-lock-boxes',
      'tuck-top-auto-bottom-boxes',
      'tray-boxes',
      'shirt-boxes',
      'polygonal-boxes',
      'standard-boxes',
      'special-boxes',
      'angled-boxes',
      'carton-bags-pillows',
      'envelopes',
      'tags',
      'folders',
      'separators',
      'wrap-around-labels',
    ],
  },
  {
    material: 'corrugated',
    groups: ['tray-boxes', 'tuck-end-boxes', 'snap-lock-boxes', 'tuck-top-auto-bottom-boxes', 'standard-boxes', 'special-boxes', 'separators'],
  },
  {
    material: 'hardboard',
    groups: ['covered-solid-board-boxes', 'boxes-with-hinged-lid', 'binders', 'swatch-cards', 'display-materials'],
  },
]

const codeOf = (ecma: string, fefco: string): Pick<DctCard, 'code' | 'standard'> => {
  if (ecma) return { code: `ECMA ${ecma}`, standard: 'ECMA' }
  if (fefco) return { code: `FEFCO ${fefco}`, standard: 'FEFCO' }
  return { code: '', standard: 'CUSTOM' }
}

const configurablePrefix = (id: string): boolean => DCT_CONFIGURABLE_FAMILIES.some((f) => id.startsWith(f.prefix))

const buildCards = (): DctCard[] => {
  const familySize = new Map<string, number>()
  for (const e of DCT_INVENTORY) familySize.set(e.id, 1)
  for (const v of DCT_VARIATIONS) {
    if (v.id === v.base) continue
    familySize.set(v.base, (familySize.get(v.base) ?? 1) + 1)
  }
  const codeByBase = new Map(DCT_INVENTORY.map((e) => [e.id, codeOf(e.ecma, e.fefco)]))

  const out: DctCard[] = []
  const seen = new Set<string>()
  const push = (card: DctCard) => {
    if (seen.has(card.id)) return
    seen.add(card.id)
    out.push(card)
  }

  for (const e of DCT_INVENTORY) {
    if (configurablePrefix(e.id)) continue
    push({ id: e.id, material: e.material, group: e.group, ...codeOf(e.ecma, e.fefco), variations: (familySize.get(e.id) ?? 1) - 1, base: e.id })
  }
  for (const v of DCT_VARIATIONS) {
    if (v.id === v.base || configurablePrefix(v.id)) continue
    const code = v.ecma ? codeOf(v.ecma, '') : (codeByBase.get(v.base) ?? codeOf('', ''))
    push({ id: v.id, material: v.material, group: v.group, ...code, variations: (familySize.get(v.base) ?? 1) - 1, base: v.base })
  }
  for (const f of DCT_CONFIGURABLE_FAMILIES) {
    const baseEntry = DCT_INVENTORY.find((e) => e.id === f.base)
    const code = baseEntry ? codeOf(baseEntry.ecma, baseEntry.fefco) : codeOf('', '')
    const material: MaterialKind = baseEntry?.material ?? 'carton'
    for (let i = 1; i <= f.total; i += 1) {
      const id = `${f.prefix}${i.toString(16).padStart(2, '0')}`
      push({ id, material, group: f.group, ...code, variations: f.variations, base: f.base })
    }
  }
  const order = new Map<string, number>()
  DCT_TREE.forEach((b, bi) => b.groups.forEach((g, gi) => order.set(`${b.material}/${g}`, bi * 100 + gi)))
  const rank = (c: DctCard) => order.get(`${c.material}/${c.group}`) ?? 9999
  // Menü sırası → grup içinde kısa (ana) kimlikler önce → kimlik
  out.sort((x, y) => rank(x) - rank(y) || x.id.length - y.id.length || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  return out
}

export const DCT_CARDS: readonly DctCard[] = buildCards()

const cardById = new Map(DCT_CARDS.map((c) => [c.id, c]))
export const dctCardOf = (id: string): DctCard | undefined => cardById.get(id.toLowerCase())
