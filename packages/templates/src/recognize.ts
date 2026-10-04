import { flattenPath, type Dieline, type LineType, type Point } from '@diecut/core'
import { generateDieline, templates } from './registry.ts'
import type { NumberParam, ParamValue, TemplateDefinition } from './types.ts'

/**
 * Şablon tanıma: dışarıdan gelen (SVG/DXF/PDF) bir bıçak izini parametrik
 * şablonlarla karşılaştırır, en uygun şablonu ve ölçülerini bulur.
 *
 * 1. İmza: düşey/yatay kırım hatlarının konumları + açık ölçü (8 yön: 4 dönüş × ayna).
 * 2. Kırım hattı sayıları tutan şablonlarda ölçüler en küçük kareler ile çözülür
 *    (kırım konumları parametrelerin neredeyse doğrusal fonksiyonudur).
 * 3. En iyi adaylar tüm kesim/kırım geometrisi üzerinden puanlanır (iki yönlü ortalama uzaklık).
 */

export interface TemplateMatch {
  templateId: string
  variables: Record<string, ParamValue>
  /** Ortalama geometri sapması (mm). */
  deviation: number
  /** Kesim ve kırımların bu kadarı 0.5 mm içinde örtüşüyor (0..1). */
  coverage: number
  /** Birebir aynı (sapma ve örtüşme eşiklerin içinde). */
  exact: boolean
}

type Seg = [Point, Point, 'cut' | 'crease']

interface Signature {
  width: number
  height: number
  xs: number[]
  ys: number[]
}

const LINE_LAYERS: LineType[] = ['cut', 'crease', 'perf', 'cutcrease']
const CLUSTER = 0.8

const segmentsOf = (d: Dieline): Seg[] => {
  const out: Seg[] = []
  for (const p of d.paths) {
    if (!LINE_LAYERS.includes(p.layer)) continue
    const kind = p.layer === 'cut' ? 'cut' : 'crease'
    for (const chain of flattenPath(p.commands, 0.2)) {
      for (let i = 1; i < chain.length; i += 1) {
        const a = chain[i - 1]!
        const b = chain[i]!
        if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-6) out.push([a, b, kind])
      }
    }
  }
  return out
}

/** 8 simetri: k·90° dönüş, isteğe bağlı ayna; sonra sol alt köşe sıfıra. */
const SYMMETRIES = [0, 1, 2, 3].flatMap((k) => [false, true].map((m) => ({ k, m })))

const transform = (segs: Seg[], sym: { k: number; m: boolean }): Seg[] => {
  const f = (p: Point): Point => {
    let x = sym.m ? -p.x : p.x
    let y = p.y
    for (let i = 0; i < sym.k; i += 1) [x, y] = [-y, x]
    return { x, y }
  }
  const moved = segs.map(([a, b, kind]) => [f(a), f(b), kind] as Seg)
  let minX = Infinity
  let minY = Infinity
  for (const [a, b] of moved) {
    minX = Math.min(minX, a.x, b.x)
    minY = Math.min(minY, a.y, b.y)
  }
  return moved.map(([a, b, kind]) => [{ x: a.x - minX, y: a.y - minY }, { x: b.x - minX, y: b.y - minY }, kind] as Seg)
}

const cluster = (entries: { v: number; w: number }[]): number[] => {
  entries.sort((a, b) => a.v - b.v)
  const out: { v: number; w: number }[] = []
  for (const e of entries) {
    const last = out[out.length - 1]
    if (last && e.v - last.v <= CLUSTER) {
      last.v = (last.v * last.w + e.v * e.w) / (last.w + e.w)
      last.w += e.w
    } else out.push({ ...e })
  }
  return out.map((e) => e.v)
}

const signatureOf = (segs: Seg[]): Signature => {
  let width = 0
  let height = 0
  const xs: { v: number; w: number }[] = []
  const ys: { v: number; w: number }[] = []
  for (const [a, b, kind] of segs) {
    width = Math.max(width, a.x, b.x)
    height = Math.max(height, a.y, b.y)
    if (kind !== 'crease') continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 3) continue
    if (Math.abs(b.x - a.x) < len * 0.02) xs.push({ v: (a.x + b.x) / 2, w: len })
    else if (Math.abs(b.y - a.y) < len * 0.02) ys.push({ v: (a.y + b.y) / 2, w: len })
  }
  return { width, height, xs: cluster(xs), ys: cluster(ys) }
}

const vectorOf = (s: Signature): number[] => [...s.xs, s.width, ...s.ys, s.height]
const shapeKey = (s: Signature) => `${s.xs.length}:${s.ys.length}`

// ---------------------------------------------------------------------------
// Şablon tarafı (önbellekli)
// ---------------------------------------------------------------------------

interface TemplateModel {
  def: TemplateDefinition
  params: NumberParam[]
  base: Record<string, ParamValue>
  sig: Signature
  /** Varsayılanlardaki Jacobian: vektör × parametre (sayı değişirse NaN). */
  jacobian: number[][]
}

const fittable = (def: TemplateDefinition): NumberParam[] =>
  def.params.filter(
    (p): p is NumberParam =>
      p.kind === 'number' && p.unit === 'mm' && p.key !== 'caliper' && p.key !== 'bleed' && !(p.autoWhenZero && p.default === 0),
  )

const defaultsOf = (def: TemplateDefinition): Record<string, ParamValue> =>
  Object.fromEntries(def.params.map((p) => [p.key, p.default]))

const signatureFor = (def: TemplateDefinition, values: Record<string, ParamValue>): Signature | null => {
  try {
    return signatureOf(transform(segmentsOf(generateDieline(def.id, values)), { k: 0, m: false }))
  } catch {
    return null
  }
}

const stepOf = (p: NumberParam) => Math.max(0.5, Math.abs(p.default) * 0.02)

const modelCache = new Map<string, TemplateModel | null>()

const modelFor = (def: TemplateDefinition): TemplateModel | null => {
  const base = defaultsOf(def)
  const sig = signatureFor(def, base)
  if (!sig) return null
  const v0 = vectorOf(sig)
  const params = fittable(def)
  const jacobian = v0.map(() => params.map(() => Number.NaN))
  params.forEach((p, k) => {
    const h = stepOf(p)
    const dir = (p.default as number) + h <= p.max ? 1 : -1
    const s = signatureFor(def, { ...base, [p.key]: (p.default as number) + dir * h })
    if (!s || shapeKey(s) !== shapeKey(sig)) return
    const v = vectorOf(s)
    for (let i = 0; i < v0.length; i += 1) jacobian[i]![k] = (v[i]! - v0[i]!) / (dir * h)
  })
  return { def, params, base, sig, jacobian }
}

const cachedModel = (def: TemplateDefinition): TemplateModel | null => {
  if (!modelCache.has(def.id)) modelCache.set(def.id, modelFor(def))
  return modelCache.get(def.id) ?? null
}

/** Tüm şablon modelleri (eksikler ilk çağrıda kurulur). */
export const recognitionModels = (): TemplateModel[] =>
  templates.map(cachedModel).filter((m): m is TemplateModel => m !== null)

/**
 * Modelleri olay döngüsünü bloklamadan arka planda kurar (sunucu açılışında çağrılır;
 * ~15 sn sürer, her şablondan sonra sıra diğer isteklere verilir).
 */
export const warmRecognition = async (): Promise<void> => {
  for (const def of templates) {
    cachedModel(def)
    await new Promise((resolve) => setImmediate(resolve))
  }
}

// ---------------------------------------------------------------------------
// Uydurma
// ---------------------------------------------------------------------------

/** Küçük doğrusal sistem (Gauss eleme, kısmi pivot). */
const solve = (A: number[][], b: number[]): number[] | null => {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]!])
  for (let c = 0; c < n; c += 1) {
    let piv = c
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r
    if (Math.abs(M[piv]![c]!) < 1e-12) return null
    ;[M[c], M[piv]] = [M[piv]!, M[c]!]
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue
      const f = M[r]![c]! / M[c]![c]!
      for (let k = c; k <= n; k += 1) M[r]![k]! -= f * M[c]![k]!
    }
  }
  return M.map((row, i) => row[n]! / row[i]!)
}

/** Sönümlü en küçük kareler adımı: (JᵀJ + λD) Δ = Jᵀ r. */
const lsqStep = (J: number[][], r: number[], params: NumberParam[]): number[] => {
  const cols = params.map((_, k) => J.every((row) => Number.isFinite(row[k]!)) && J.some((row) => Math.abs(row[k]!) > 1e-6))
  const idx = params.map((_, k) => k).filter((k) => cols[k])
  const delta = params.map(() => 0)
  if (idx.length === 0) return delta
  const A = idx.map((a) => idx.map((b) => J.reduce((s, row) => s + row[a]! * row[b]!, 0)))
  const g = idx.map((a) => J.reduce((s, row, i) => s + row[a]! * r[i]!, 0))
  idx.forEach((_, i) => (A[i]![i]! += 1e-3 * (1 + A[i]![i]!)))
  const x = solve(A, g)
  if (!x) return delta
  idx.forEach((k, i) => (delta[k] = x[i]!))
  return delta
}

const clampValues = (m: TemplateModel, values: Record<string, ParamValue>) => {
  for (const p of m.params) {
    const v = values[p.key] as number
    values[p.key] = Math.round(Math.min(p.max, Math.max(p.min, v)) * 10) / 10
  }
  return values
}

const residualOf = (target: number[], sig: Signature | null): number[] | null => {
  if (!sig) return null
  const v = vectorOf(sig)
  if (v.length !== target.length) return null
  return target.map((t, i) => t - v[i]!)
}

const rms = (r: number[]) => Math.sqrt(r.reduce((s, x) => s + x * x, 0) / Math.max(1, r.length))

const fit = (m: TemplateModel, target: number[]): { values: Record<string, ParamValue>; residual: number } | null => {
  let values = { ...m.base }
  let r = residualOf(target, m.sig)
  if (!r) return null
  let J = m.jacobian
  for (let iter = 0; iter < 3; iter += 1) {
    const delta = lsqStep(J, r, m.params)
    const next = clampValues(m, { ...values, ...Object.fromEntries(m.params.map((p, k) => [p.key, (values[p.key] as number) + delta[k]!])) })
    const nr = residualOf(target, signatureFor(m.def, next))
    if (!nr || rms(nr) >= rms(r) - 1e-3) break
    values = next
    r = nr
    if (rms(r) < 0.05) break
    // Yeni noktada Jacobian (doğrusal olmayan şablonlar için).
    const sig = signatureFor(m.def, values)!
    const v0 = vectorOf(sig)
    J = v0.map(() => m.params.map(() => Number.NaN))
    m.params.forEach((p, k) => {
      const h = stepOf(p)
      const cur = values[p.key] as number
      const dir = cur + h <= p.max ? 1 : -1
      const s = signatureFor(m.def, { ...values, [p.key]: cur + dir * h })
      if (!s || shapeKey(s) !== shapeKey(sig)) return
      const v = vectorOf(s)
      for (let i = 0; i < v0.length; i += 1) J[i]![k] = (v[i]! - v0[i]!) / (dir * h)
    })
  }
  return { values, residual: rms(r) }
}

// ---------------------------------------------------------------------------
// Geometri puanı
// ---------------------------------------------------------------------------

const samples = (segs: Seg[], kind: 'cut' | 'crease', step = 1): Point[] => {
  const out: Point[] = []
  for (const [a, b, k] of segs) {
    if (k !== kind) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const n = Math.max(1, Math.ceil(len / step))
    for (let i = 0; i <= n; i += 1) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n })
  }
  return out
}

const CELL = 2
const gridOf = (pts: Point[]) => {
  const g = new Map<string, Point[]>()
  for (const p of pts) {
    const key = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`
    const list = g.get(key)
    if (list) list.push(p)
    else g.set(key, [p])
  }
  return g
}

const nearest = (g: Map<string, Point[]>, p: Point, cap: number): number => {
  const cx = Math.floor(p.x / CELL)
  const cy = Math.floor(p.y / CELL)
  const r = Math.ceil(cap / CELL)
  let best = cap
  for (let dx = -r; dx <= r; dx += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (const q of g.get(`${cx + dx},${cy + dy}`) ?? []) best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y))
    }
  }
  return best
}

/** İki yönlü ortalama uzaklık (katman katman) ve 0.5 mm içinde kalan oran. */
const compare = (a: Seg[], b: Seg[]): { deviation: number; coverage: number } => {
  let total = 0
  let count = 0
  let close = 0
  for (const kind of ['cut', 'crease'] as const) {
    const pa = samples(a, kind)
    const pb = samples(b, kind)
    if (pa.length === 0 && pb.length === 0) continue
    const ga = gridOf(pa)
    const gb = gridOf(pb)
    for (const p of pa) {
      const d = nearest(gb, p, 6)
      total += d
      count += 1
      if (d <= 0.5) close += 1
    }
    for (const p of pb) {
      const d = nearest(ga, p, 6)
      total += d
      count += 1
      if (d <= 0.5) close += 1
    }
  }
  return { deviation: count ? total / count : 99, coverage: count ? close / count : 0 }
}

// ---------------------------------------------------------------------------

/**
 * İçe aktarılan bıçak izine en uygun şablonu bulur. `budgetMs` aşılınca o ana
 * kadarki en iyi sonuç döner. Uygun şablon yoksa null.
 */
export function recognizeDieline(imported: Dieline, budgetMs = 4000): TemplateMatch | null {
  const started = Date.now()
  const segs = segmentsOf(imported)
  if (segs.length === 0) return null
  const views = SYMMETRIES.map((sym) => {
    const moved = transform(segs, sym)
    const sig = signatureOf(moved)
    return { sym, moved, sig, key: shapeKey(sig), vector: vectorOf(sig) }
  })

  // 1) Hızlı eleme: kırım hattı sayıları tutan şablon × yön; doğrusal çözümle kaba sapma.
  type Candidate = { model: TemplateModel; view: (typeof views)[number]; residual: number; values: Record<string, ParamValue> }
  const rough: Candidate[] = []
  for (const model of recognitionModels()) {
    for (const view of views) {
      if (view.key !== shapeKey(model.sig)) continue
      const r0 = residualOf(view.vector, model.sig)
      if (!r0) continue
      const delta = lsqStep(model.jacobian, r0, model.params)
      const values = clampValues(model, { ...model.base, ...Object.fromEntries(model.params.map((p, k) => [p.key, (p.default as number) + delta[k]!])) })
      const predicted = r0.map((x, i) => x - model.jacobian[i]!.reduce((s, j, k) => s + (Number.isFinite(j) ? j * delta[k]! : 0), 0))
      rough.push({ model, view, residual: rms(predicted), values })
    }
  }
  rough.sort((a, b) => a.residual - b.residual)

  // 2) En iyi adayları gerçek üretimle doğrula ve tüm geometriyle puanla.
  let best: TemplateMatch | null = null
  const seen = new Set<string>()
  for (const cand of rough.slice(0, 24)) {
    if (Date.now() - started > budgetMs) break
    const key = `${cand.model.def.id}`
    if (seen.has(key)) continue
    const fitted = fit(cand.model, cand.view.vector)
    if (!fitted || fitted.residual > Math.max(3, Math.max(cand.view.sig.width, cand.view.sig.height) * 0.03)) continue
    seen.add(key)
    let generated: Dieline
    try {
      generated = generateDieline(cand.model.def.id, fitted.values)
    } catch {
      continue
    }
    let { deviation, coverage } = compare(transform(segmentsOf(generated), { k: 0, m: false }), cand.view.moved)
    // Ölçüler genelde tam milimetredir: yuvarlamak sapmayı büyütmüyorsa yuvarlanmış hali al.
    const rounded = clampValues(cand.model, { ...fitted.values, ...Object.fromEntries(cand.model.params.map((p) => [p.key, Math.round(fitted.values[p.key] as number)])) })
    if (cand.model.params.some((p) => rounded[p.key] !== fitted.values[p.key])) {
      try {
        const alt = compare(transform(segmentsOf(generateDieline(cand.model.def.id, rounded)), { k: 0, m: false }), cand.view.moved)
        if (alt.deviation <= deviation + 0.03 && alt.coverage >= coverage - 0.01) {
          fitted.values = rounded
          deviation = alt.deviation
          coverage = alt.coverage
        }
      } catch {
        /* yuvarlanmış değer geçersizse uydurulmuş değerle devam */
      }
    }
    // Zayıf benzerlik öneri olarak gösterilmez (ör. tepsiye zarf): çizgilerin en az %85'i örtüşmeli.
    if (deviation > 4 || coverage < 0.85) continue
    const variables = Object.fromEntries(cand.model.params.map((p) => [p.key, fitted.values[p.key]!]))
    const match: TemplateMatch = {
      templateId: cand.model.def.id,
      variables,
      deviation: Math.round(deviation * 100) / 100,
      coverage: Math.round(coverage * 1000) / 1000,
      exact: deviation <= 0.35 && coverage >= 0.95,
    }
    // Daha az sapma; eşitse daha yüksek örtüşme. Neredeyse sıfır sapmada aramayı bitir.
    if (!best || match.deviation < best.deviation - 0.005 || (Math.abs(match.deviation - best.deviation) <= 0.005 && match.coverage > best.coverage)) best = match
    if (best.deviation < 0.02 && best.coverage > 0.995) break
  }
  return best
}
