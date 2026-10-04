import type { Dieline, Unit } from '@diecut/core'

export interface I18nText {
  tr: string
  en: string
}

export type ParamValue = number | string | boolean

interface ParamBase {
  key: string
  label: I18nText
  group?: string
  help?: I18nText
  /** Gelişmiş ayar — arayüzde katlanmış panelde gösterilir. */
  advanced?: boolean
}

export interface NumberParam extends ParamBase {
  kind: 'number'
  unit?: Unit
  min: number
  max: number
  step?: number
  default: number
  /** 0 girildiğinde motor kendi hesaplasın (ör. otomatik tuck derinliği). */
  autoWhenZero?: boolean
}

export interface BooleanParam extends ParamBase {
  kind: 'boolean'
  default: boolean
}

export interface EnumParam extends ParamBase {
  kind: 'enum'
  default: string
  options: { value: string; label: I18nText }[]
}

export type ParamDef = NumberParam | BooleanParam | EnumParam

/**
 * Katalog grupları — diecuttemplates.com (DCT) ile birebir aynı ağaç.
 * Malzeme (Karton / Oluklu / Sert karton) üst dal, grup alt dal.
 * Karton ve oluklu aynı grup adlarını paylaşır (tuck end, snap lock, …).
 */
export const TEMPLATE_CATEGORIES = [
  'tuck-end-boxes',
  'food-boxes',
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
  'covered-solid-board-boxes',
  'boxes-with-hinged-lid',
  'binders',
  'swatch-cards',
  'display-materials',
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export type MaterialKind = 'carton' | 'corrugated' | 'hardboard' | 'plastic'

export interface TemplateDefinition {
  id: string
  /** ECMA veya FEFCO kodu; standart dışıysa boş. */
  code: string
  standard: 'ECMA' | 'FEFCO' | 'CUSTOM'
  name: I18nText
  description: I18nText
  category: TemplateCategory
  materials: MaterialKind[]
  /**
   * `stable`: gerçek üretim dosyalarıyla karşılaştırıldı.
   * `beta`: geometri doğru kurgulanmış ama saha doğrulaması bekliyor.
   */
  maturity: 'stable' | 'beta'
  keywords: string[]
  params: ParamDef[]
  build: (params: Record<string, ParamValue>) => Dieline
}

export class ParamError extends Error {
  readonly key: string
  readonly code = 'param' as const

  constructor(message: string, key: string) {
    super(message)
    this.name = 'ParamError'
    this.key = key
  }
}

/**
 * Kullanıcı girdisini template tanımına göre doğrular, eksikleri varsayılanla
 * tamamlar ve sayısal değerleri sınırlara sıkıştırır.
 */
export function resolveParams(template: TemplateDefinition, input: Record<string, unknown> = {}): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {}

  for (const def of template.params) {
    const raw = input[def.key]

    if (def.kind === 'number') {
      if (raw === undefined || raw === null || raw === '') {
        out[def.key] = def.default
        continue
      }
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n)) throw new ParamError(`"${def.key}" sayı olmalı`, def.key)
      if (def.autoWhenZero && n === 0) {
        out[def.key] = 0
        continue
      }
      if (n < def.min || n > def.max) {
        throw new ParamError(`"${def.key}" ${def.min}–${def.max} aralığında olmalı (girilen: ${n})`, def.key)
      }
      out[def.key] = n
      continue
    }

    if (def.kind === 'boolean') {
      if (raw === undefined || raw === null || raw === '') {
        out[def.key] = def.default
        continue
      }
      out[def.key] = raw === true || raw === 'true' || raw === 1 || raw === '1'
      continue
    }

    if (raw === undefined || raw === null || raw === '') {
      out[def.key] = def.default
      continue
    }
    const value = String(raw)
    if (!def.options.some((o) => o.value === value)) {
      throw new ParamError(`"${def.key}" için geçersiz değer: ${value}`, def.key)
    }
    out[def.key] = value
  }

  const known = new Set(template.params.map((p) => p.key))
  const unknown = Object.keys(input).filter((k) => !known.has(k))
  if (unknown.length > 0) {
    throw new ParamError(`Bilinmeyen parametre: ${unknown.join(', ')}`, unknown[0] as string)
  }

  return out
}

export const num = (params: Record<string, ParamValue>, key: string): number => {
  const v = params[key]
  if (typeof v !== 'number') throw new ParamError(`"${key}" sayısal parametre bekleniyordu`, key)
  return v
}

export const bool = (params: Record<string, ParamValue>, key: string): boolean => params[key] === true

export const str = (params: Record<string, ParamValue>, key: string): string => String(params[key] ?? '')
