import type { Unit } from './types.ts'

/** Motorun iç birimi milimetredir; bu tablo 1 birimin kaç mm ettiğini verir. */
const TO_MM: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
}

export const toMillimetres = (value: number, from: Unit): number => value * TO_MM[from]

export const fromMillimetres = (millimetres: number, to: Unit): number => millimetres / TO_MM[to]

export const convert = (value: number, from: Unit, to: Unit): number => fromMillimetres(toMillimetres(value, from), to)

/** PDF kullanıcı birimi (pt) — export katmanı için. */
export const mmToPt = (mm: number): number => (mm * 72) / 25.4

export const ptToMm = (pt: number): number => (pt * 25.4) / 72
