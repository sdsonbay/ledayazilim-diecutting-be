import type { Point } from '@diecut/core'
import { colorKey, cutScore, chromaOf, layerFromRgb } from './color-layer.ts'
import { decodeRaster, type RasterPixels } from './decode-raster.ts'
import { ImportError, type ImportedPath } from './types.ts'

interface Seg {
  x0: number
  y0: number
  x1: number
  y1: number
  layer: 'cut' | 'crease'
}

const rgba = (img: RasterPixels, x: number, y: number): [number, number, number, number] => {
  const i = (y * img.width + x) * 4
  return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0, img.data[i + 3] ?? 255]
}

const meanLuma = (img: RasterPixels): number => {
  const samples: [number, number][] = [
    [0, 0],
    [img.width - 1, 0],
    [0, img.height - 1],
    [img.width - 1, img.height - 1],
    [Math.floor(img.width / 2), Math.floor(img.height / 2)],
  ]
  let sum = 0
  for (const [x, y] of samples) {
    const [r, g, b] = rgba(img, x, y)
    sum += 0.3 * r + 0.59 * g + 0.11 * b
  }
  return sum / samples.length
}

const buildMasks = (img: RasterPixels): { cut: Uint8Array; crease: Uint8Array } => {
  const n = img.width * img.height
  const cut = new Uint8Array(n)
  const crease = new Uint8Array(n)
  const darkBg = meanLuma(img) < 90
  const counts = new Map<string, { rgb: [number, number, number]; n: number }>()

  const isInk = (r: number, g: number, b: number, a: number, luma: number): boolean => {
    if (a < 24) return false
    if (darkBg && luma < 22) return false
    if (!darkBg && r > 242 && g > 242 && b > 242) return false
    return true
  }

  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const [r, g, b, a] = rgba(img, x, y)
      const luma = 0.3 * r + 0.59 * g + 0.11 * b
      if (!isInk(r, g, b, a, luma) || chromaOf(r, g, b) < 16) continue
      const key = colorKey(r, g, b)
      const prev = counts.get(key)
      if (prev) prev.n += 1
      else counts.set(key, { rgb: [r, g, b], n: 1 })
    }
  }

  const top = [...counts.entries()]
    .filter(([, v]) => v.n >= 6)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 2)
  const ranked =
    top.length >= 2
      ? [...top].sort((a, b) => cutScore(...b[1].rgb) - cutScore(...a[1].rgb))
      : null
  const pair =
    ranked && Math.abs(cutScore(...ranked[0][1].rgb) - cutScore(...ranked[1][1].rgb)) > 50 ? ranked : null
  const cutKey = pair?.[0]?.[0]
  const creaseKey = pair?.[1]?.[0]

  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const [r, g, b, a] = rgba(img, x, y)
      const luma = 0.3 * r + 0.59 * g + 0.11 * b
      if (!isInk(r, g, b, a, luma)) continue
      const idx = y * img.width + x
      if (cutKey && creaseKey) {
        const key = colorKey(r, g, b)
        if (key === cutKey) cut[idx] = 1
        else if (key === creaseKey) crease[idx] = 1
        else {
          const dCut = Math.abs(cutScore(r, g, b) - cutScore(...(pair[0][1].rgb)))
          const dCrease = Math.abs(cutScore(r, g, b) - cutScore(...(pair[1][1].rgb)))
          if (dCut <= dCrease) cut[idx] = 1
          else crease[idx] = 1
        }
        continue
      }
      const layer = layerFromRgb(r, g, b, false)
      if (layer === 'cut') cut[idx] = 1
      else if (layer === 'crease' || layer === 'perf' || layer === 'cutcrease') crease[idx] = 1
    }
  }
  return { cut, crease }
}

const at = (mask: Uint8Array, w: number, h: number, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1

const extractRuns = (mask: Uint8Array, w: number, h: number, minLen: number): { H: number[][]; V: number[][] } => {
  const H: number[][] = []
  const V: number[][] = []
  for (let y = 0; y < h; y += 1) {
    let x = 0
    while (x < w) {
      if (mask[y * w + x]) {
        const x0 = x
        while (x < w && mask[y * w + x]) x += 1
        if (x - x0 >= minLen) H.push([x0, y, x - 1, y])
      } else x += 1
    }
  }
  for (let x = 0; x < w; x += 1) {
    let y = 0
    while (y < h) {
      if (mask[y * w + x]) {
        const y0 = y
        while (y < h && mask[y * w + x]) y += 1
        if (y - y0 >= minLen) V.push([x, y0, x, y - 1])
      } else y += 1
    }
  }
  return { H, V }
}

const collapseH = (runs: number[][], tol: number, gap: number): Seg[] => {
  const sorted = [...runs].sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const groups: number[][][] = []
  for (const r of sorted) {
    let placed = false
    for (const g of groups) {
      if (Math.abs(g[0][1] - r[1]) > tol) continue
      const gx0 = Math.min(...g.map((s) => s[0]))
      const gx1 = Math.max(...g.map((s) => s[2]))
      if (r[0] <= gx1 + gap && r[2] >= gx0 - gap) {
        g.push(r)
        placed = true
        break
      }
    }
    if (!placed) groups.push([r])
  }
  const out: Seg[] = []
  for (const g of groups) {
    const y = Math.round(g.reduce((s, r) => s + r[1], 0) / g.length)
    const segs = g.map((r) => [r[0], r[2]] as [number, number]).sort((a, b) => a[0] - b[0])
    let cur: [number, number] = [segs[0][0], segs[0][1]]
    const merged: [number, number][] = []
    for (let i = 1; i < segs.length; i += 1) {
      const [a, b] = segs[i]
      if (a <= cur[1] + gap) cur[1] = Math.max(cur[1], b)
      else {
        merged.push(cur)
        cur = [a, b]
      }
    }
    merged.push(cur)
    for (const [x0, x1] of merged) out.push({ x0, y0: y, x1, y1: y, layer: 'cut' })
  }
  return out
}

const collapseV = (runs: number[][], tol: number, gap: number): Seg[] => {
  const sorted = [...runs].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const groups: number[][][] = []
  for (const r of sorted) {
    let placed = false
    for (const g of groups) {
      if (Math.abs(g[0][0] - r[0]) > tol) continue
      const gy0 = Math.min(...g.map((s) => s[1]))
      const gy1 = Math.max(...g.map((s) => s[3]))
      if (r[1] <= gy1 + gap && r[3] >= gy0 - gap) {
        g.push(r)
        placed = true
        break
      }
    }
    if (!placed) groups.push([r])
  }
  const out: Seg[] = []
  for (const g of groups) {
    const x = Math.round(g.reduce((s, r) => s + r[0], 0) / g.length)
    const segs = g.map((r) => [r[1], r[3]] as [number, number]).sort((a, b) => a[0] - b[0])
    let cur: [number, number] = [segs[0][0], segs[0][1]]
    const merged: [number, number][] = []
    for (let i = 1; i < segs.length; i += 1) {
      const [a, b] = segs[i]
      if (a <= cur[1] + gap) cur[1] = Math.max(cur[1], b)
      else {
        merged.push(cur)
        cur = [a, b]
      }
    }
    merged.push(cur)
    for (const [y0, y1] of merged) out.push({ x0: x, y0, x1: x, y1, layer: 'cut' })
  }
  return out
}

const coveredBy = (x: number, y: number, segs: Seg[], dist: number): boolean => {
  for (const s of segs) {
    if (s.y0 === s.y1) {
      if (Math.abs(y - s.y0) <= dist && x >= Math.min(s.x0, s.x1) - dist && x <= Math.max(s.x0, s.x1) + dist) {
        return true
      }
    } else if (s.x0 === s.x1) {
      if (Math.abs(x - s.x0) <= dist && y >= Math.min(s.y0, s.y1) - dist && y <= Math.max(s.y0, s.y1) + dist) {
        return true
      }
    }
  }
  return false
}

const components = (pixels: [number, number][]): [number, number][][] => {
  const set = new Set(pixels.map(([x, y]) => `${x},${y}`))
  const seen = new Set<string>()
  const out: [number, number][][] = []
  for (const [sx, sy] of pixels) {
    const key = `${sx},${sy}`
    if (seen.has(key)) continue
    const stack: [number, number][] = [[sx, sy]]
    seen.add(key)
    const comp: [number, number][] = []
    while (stack.length > 0) {
      const [x, y] = stack.pop() as [number, number]
      comp.push([x, y])
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const nk = `${x + dx},${y + dy}`
          if (set.has(nk) && !seen.has(nk)) {
            seen.add(nk)
            stack.push([x + dx, y + dy])
          }
        }
      }
    }
    out.push(comp)
  }
  return out
}

const circlePath = (comp: [number, number][]): Point[] => {
  const xs = comp.map((p) => p[0])
  const ys = comp.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const r = Math.max((Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2, 2)
  const pts: Point[] = []
  const n = 20
  for (let i = 0; i <= n; i += 1) {
    const a = (Math.PI * 2 * i) / n
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

const farthestLine = (comp: [number, number][]): Seg | null => {
  if (comp.length < 3) return null
  let best: Seg | null = null
  let bestD = 0
  const step = Math.max(1, Math.floor(comp.length / 40))
  for (let i = 0; i < comp.length; i += step) {
    for (let j = i + step; j < comp.length; j += step) {
      const d = Math.hypot(comp[i][0] - comp[j][0], comp[i][1] - comp[j][1])
      if (d > bestD) {
        bestD = d
        best = { x0: comp[i][0], y0: comp[i][1], x1: comp[j][0], y1: comp[j][1], layer: 'cut' }
      }
    }
  }
  return bestD >= 4 ? best : null
}

const cluster1d = (values: number[], tol: number): Map<number, number> => {
  const sorted = [...new Set(values.map((v) => Math.round(v)))].sort((a, b) => a - b)
  const groups: number[][] = []
  for (const v of sorted) {
    const last = groups[groups.length - 1]
    if (last && v - last[last.length - 1] <= tol) last.push(v)
    else groups.push([v])
  }
  const map = new Map<number, number>()
  for (const g of groups) {
    const mean = Math.round(g.reduce((s, n) => s + n, 0) / g.length)
    for (const v of g) map.set(v, mean)
  }
  return map
}

const snapSegs = (segs: Seg[], tol: number): Seg[] => {
  const xs: number[] = []
  const ys: number[] = []
  for (const s of segs) {
    xs.push(s.x0, s.x1)
    ys.push(s.y0, s.y1)
  }
  const xm = cluster1d(xs, tol)
  const ym = cluster1d(ys, tol)
  return segs
    .map((s) => ({
      ...s,
      x0: xm.get(Math.round(s.x0)) ?? s.x0,
      x1: xm.get(Math.round(s.x1)) ?? s.x1,
      y0: ym.get(Math.round(s.y0)) ?? s.y0,
      y1: ym.get(Math.round(s.y1)) ?? s.y1,
    }))
    .filter((s) => Math.hypot(s.x1 - s.x0, s.y1 - s.y0) >= 2)
}

const distPointSeg = (px: number, py: number, s: Seg): number => {
  const ax = s.x0
  const ay = s.y0
  const bx = s.x1
  const by = s.y1
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2))
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t))
}

const extendToNetwork = (segs: Seg[], maxExtend: number): Seg[] => {
  return segs.map((s) => {
    const dx = s.x1 - s.x0
    const dy = s.y1 - s.y0
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const grow = (x: number, y: number, dir: number): [number, number] => {
      let best = maxExtend + 1
      let hit: [number, number] | null = null
      for (const o of segs) {
        if (o === s) continue
        for (let t = 0.5; t <= maxExtend; t += 0.5) {
          const px = x + ux * dir * t
          const py = y + uy * dir * t
          const d = distPointSeg(px, py, o)
          if (d <= 1.2 && t < best) {
            best = t
            hit = [px, py]
          }
        }
      }
      return hit ?? [x, y]
    }
    const a = grow(s.x0, s.y0, -1)
    const b = grow(s.x1, s.y1, 1)
    return { ...s, x0: a[0], y0: a[1], x1: b[0], y1: b[1] }
  })
}

const ensureOuterCuts = (segs: Seg[]): Seg[] => {
  const cuts = segs.filter((s) => s.layer === 'cut')
  const creases = segs.filter((s) => s.layer === 'crease')
  if (cuts.length === 0) return segs
  const xs = segs.flatMap((s) => [s.x0, s.x1])
  const ys = segs.flatMap((s) => [s.y0, s.y1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const longH = cuts
    .filter((s) => Math.abs(s.y0 - s.y1) <= 1)
    .sort((a, b) => Math.abs(b.x1 - b.x0) - Math.abs(a.x1 - a.x0))[0]
  const bottomY = longH ? Math.round((longH.y0 + longH.y1) / 2) : maxY
  const vCrease = creases.filter((s) => Math.abs(s.x0 - s.x1) <= 1)
  const bodyTop = vCrease.length
    ? Math.round(Math.min(...vCrease.map((s) => Math.min(s.y0, s.y1))))
    : Math.min(...ys)
  const hasV = (x: number) =>
    segs.some(
      (s) =>
        Math.abs(s.x0 - x) <= 2 &&
        Math.abs(s.x1 - x) <= 2 &&
        Math.min(s.y0, s.y1) <= bodyTop + 4 &&
        Math.max(s.y0, s.y1) >= bottomY - 4,
    )
  const extra: Seg[] = []
  if (!hasV(minX)) extra.push({ x0: minX, y0: bodyTop, x1: minX, y1: bottomY, layer: 'cut' })
  if (!hasV(maxX)) extra.push({ x0: maxX, y0: bodyTop, x1: maxX, y1: bottomY, layer: 'cut' })
  return extra.length ? [...segs, ...extra] : segs
}

const tracesFromMask = (
  mask: Uint8Array,
  w: number,
  h: number,
  layer: 'cut' | 'crease',
  minLen: number,
): { segs: Seg[]; remain: [number, number][] } => {
  const { H, V } = extractRuns(mask, w, h, minLen)
  const segs = [
    ...collapseH(H, 2, 4).map((s) => ({ ...s, layer })),
    ...collapseV(V, 2, 4).map((s) => ({ ...s, layer })),
  ]
  const remain: [number, number][] = []
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (at(mask, w, h, x, y) && !coveredBy(x, y, segs, 2)) remain.push([x, y])
    }
  }
  return { segs, remain }
}

export const parseRaster = (bytes: Uint8Array, filename: string): ImportedPath[] => {
  const img = decodeRaster(bytes, filename)
  if (img.width < 16 || img.height < 16) {
    throw new ImportError('Görsel çok küçük. Daha yüksek çözünürlüklü PNG/JPG veya SVG/DXF verin.')
  }
  const { cut, crease } = buildMasks(img)
  const cutCount = cut.reduce((s, v) => s + v, 0)
  const creaseCount = crease.reduce((s, v) => s + v, 0)
  if (cutCount < 20) {
    throw new ImportError('Kesim çizgisi bulunamadı. Kırmızı kesim (CUT) ve yeşil/mavi kırım (CREASE) kullanın.')
  }
  if (creaseCount < 10) {
    throw new ImportError('Kırım çizgisi bulunamadı. Katlama izleri yeşil veya mavi olmalı.')
  }

  const minLen = Math.max(6, Math.round(0.035 * Math.max(img.width, img.height)))
  const cutTrace = tracesFromMask(cut, img.width, img.height, 'cut', minLen)
  const creaseTrace = tracesFromMask(crease, img.width, img.height, 'crease', minLen)
  const segs: Seg[] = [...cutTrace.segs, ...creaseTrace.segs]
  const extraPaths: ImportedPath[] = []

  for (const [remain, layer] of [
    [cutTrace.remain, 'cut'],
    [creaseTrace.remain, 'crease'],
  ] as const) {
    for (const comp of components(remain)) {
      if (comp.length < 6) continue
      const xs = comp.map((p) => p[0])
      const ys = comp.map((p) => p[1])
      const bw = Math.max(...xs) - Math.min(...xs) + 1
      const bh = Math.max(...ys) - Math.min(...ys) + 1
      const aspect = bw / Math.max(bh, 1)
      const roundish =
        aspect > 0.55 &&
        aspect < 1.8 &&
        Math.max(bw, bh) < 0.28 * Math.min(img.width, img.height) &&
        comp.length > Math.max(bw, bh) * 1.4
      if (roundish && layer === 'cut') extraPaths.push({ layer, points: circlePath(comp) })
      else {
        const line = farthestLine(comp)
        if (line) segs.push({ ...line, layer })
      }
    }
  }

  let snapped = snapSegs(segs, 2)
  snapped = extendToNetwork(snapped, 6)
  snapped = snapSegs(snapped, 2)
  snapped = ensureOuterCuts(snapped)

  const spanX = Math.max(...snapped.flatMap((s) => [s.x0, s.x1])) - Math.min(...snapped.flatMap((s) => [s.x0, s.x1]))
  const spanY = Math.max(...snapped.flatMap((s) => [s.y0, s.y1])) - Math.min(...snapped.flatMap((s) => [s.y0, s.y1]))
  const span = Math.max(spanX, spanY, 1)
  const mmPerPx = img.mmPerPx > 0.02 && img.mmPerPx < 8 ? img.mmPerPx : 280 / span

  const toMm = (x: number, y: number): Point => ({
    x: x * mmPerPx,
    y: (img.height - 1 - y) * mmPerPx,
  })

  const out: ImportedPath[] = extraPaths.map((p) => ({
    layer: p.layer,
    points: p.points.map((pt) => toMm(pt.x, pt.y)),
  }))
  for (const s of snapped) {
    out.push({ layer: s.layer, points: [toMm(s.x0, s.y0), toMm(s.x1, s.y1)] })
  }
  return out
}
