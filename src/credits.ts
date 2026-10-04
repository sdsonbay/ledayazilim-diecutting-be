export const CREDIT_PACKAGES = [
  { id: 'starter', credits: 25, priceTry: 49, name: { tr: 'Başlangıç', en: 'Starter' }, blurb: { tr: 'Küçük işler ve deneme indirmeleri.', en: 'Small jobs and trial downloads.' } },
  { id: 'studio', credits: 80, priceTry: 129, name: { tr: 'Stüdyo', en: 'Studio' }, blurb: { tr: 'Günlük kalıp ve müşteri işleri.', en: 'Daily die-cuts and client work.' } },
  { id: 'press', credits: 250, priceTry: 299, name: { tr: 'Baskı', en: 'Press' }, blurb: { tr: 'Yüksek hacim; PayTR sonrası gerçek ödeme.', en: 'Higher volume; PayTR will replace this mock.' } },
] as const

export type CreditPackageId = (typeof CREDIT_PACKAGES)[number]['id']

export const findCreditPackage = (id: string) => CREDIT_PACKAGES.find((item) => item.id === id)
