import type { Dieline, PathCommand, Point } from '@diecut/core'
import { flattenPath } from '@diecut/core'
import {
  buildColorLayerMap,
  isGuideLayer,
  layerFromName,
  parseCssColor,
  resolveLayer,
  type LayerHint,
} from './color-layer.ts'
import { ImportError, type ImportedPath } from './types.ts'

const attr = (tag: string, name: string): string => {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
  const m = re.exec(tag)
  return m?.[2] ?? m?.[3] ?? ''
}

const tokenizePath = (d: string): string[] => d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? []

const nums = (tokens: string[], i: number, count: number): { values: number[]; next: number } => {
  const values: number[] = []
  let k = i
  while (values.length < count && k < tokens.length) {
    const n = Number(tokens[k])
    if (!Number.isFinite(n)) break
    values.push(n)
    k += 1
  }
  return { values, next: k }
}

const parsePathD = (d: string): PathCommand[] => {
  const tokens = tokenizePath(d)
  const cmds: PathCommand[] = []
  let i = 0
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let prev: string = 'M'

  const isCmd = (t: string | undefined) => t !== undefined && /[A-Za-z]/.test(t)

  while (i < tokens.length) {
    let cmd = tokens[i] ?? ''
    if (!isCmd(cmd)) {
      cmd = prev === 'M' ? 'L' : prev === 'm' ? 'l' : prev
    } else {
      i += 1
    }
    prev = cmd
    const rel = cmd === cmd.toLowerCase()
    const kind = cmd.toUpperCase()

    const take = (n: number): number[] | null => {
      const got = nums(tokens, i, n)
      if (got.values.length < n) return null
      i = got.next
      return got.values
    }

    if (kind === 'Z') {
      cmds.push({ c: 'Z' })
      x = sx
      y = sy
      continue
    }
    if (kind === 'M' || kind === 'L') {
      const pair = take(2)
      if (!pair) break
      const nx = rel ? x + pair[0] : pair[0]
      const ny = rel ? y + pair[1] : pair[1]
      if (kind === 'M') {
        cmds.push({ c: 'M', x: nx, y: ny })
        sx = nx
        sy = ny
        prev = rel ? 'l' : 'L'
      } else {
        cmds.push({ c: 'L', x: nx, y: ny })
      }
      x = nx
      y = ny
      continue
    }
    if (kind === 'H') {
      const v = take(1)
      if (!v) break
      x = rel ? x + v[0] : v[0]
      cmds.push({ c: 'L', x, y })
      continue
    }
    if (kind === 'V') {
      const v = take(1)
      if (!v) break
      y = rel ? y + v[0] : v[0]
      cmds.push({ c: 'L', x, y })
      continue
    }
    if (kind === 'C') {
      const v = take(6)
      if (!v) break
      const x1 = rel ? x + v[0] : v[0]
      const y1 = rel ? y + v[1] : v[1]
      const x2 = rel ? x + v[2] : v[2]
      const y2 = rel ? y + v[3] : v[3]
      const nx = rel ? x + v[4] : v[4]
      const ny = rel ? y + v[5] : v[5]
      cmds.push({ c: 'C', x1, y1, x2, y2, x: nx, y: ny })
      x = nx
      y = ny
      continue
    }
    if (kind === 'A') {
      const v = take(7)
      if (!v) break
      const nx = rel ? x + v[5] : v[5]
      const ny = rel ? y + v[6] : v[6]
      cmds.push({
        c: 'A',
        rx: v[0],
        ry: v[1],
        rot: v[2],
        large: v[3] !== 0,
        sweep: v[4] !== 0,
        x: nx,
        y: ny,
      })
      x = nx
      y = ny
      continue
    }
    const skip = kind === 'S' || kind === 'Q' ? 4 : kind === 'T' ? 2 : 0
    if (skip) {
      const v = take(skip)
      if (!v) break
      const nx = rel ? x + v[skip - 2] : v[skip - 2]
      const ny = rel ? y + v[skip - 1] : v[skip - 1]
      cmds.push({ c: 'L', x: nx, y: ny })
      x = nx
      y = ny
    }
  }
  return cmds
}

const styleVal = (style: string, name: string): string => {
  const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(style)
  return m?.[1]?.trim() ?? ''
}

const present = (tag: string, name: string): string => {
  const direct = attr(tag, name)
  if (direct) return direct
  return styleVal(attr(tag, 'style'), name)
}

type ClassStyle = { stroke: string; dash: string }
type StyleSheet = Map<string, ClassStyle>

/** Illustrator/Figma SVG: stroke CSS `.cls-1 { stroke: #00a651 }` içinde, attribute değil. */
const parseStyleSheet = (source: string): StyleSheet => {
  const sheet: StyleSheet = new Map()
  for (const block of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    let css = block[1] ?? ''
    css = css.replace(/<!\[CDATA\[/gi, '').replace(/\]\]>/g, '')
    css = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const rule of css.split('}')) {
      const brace = rule.indexOf('{')
      if (brace < 0) continue
      const sel = rule.slice(0, brace)
      const body = rule.slice(brace + 1).replace(/\s+/g, ' ')
      const stroke = styleVal(body, 'stroke')
      const dash = styleVal(body, 'stroke-dasharray')
      if (!stroke && !dash) continue
      for (const cls of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
        const name = cls[1]
        if (!name) continue
        const prev = sheet.get(name) ?? { stroke: '', dash: '' }
        if (stroke) prev.stroke = stroke
        if (dash) prev.dash = dash
        sheet.set(name, prev)
      }
    }
  }
  return sheet
}

const classesOf = (tag: string): string[] =>
  present(tag, 'class')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

const classStyleOf = (tag: string, sheet: StyleSheet): ClassStyle => {
  let stroke = ''
  let dash = ''
  for (const cls of classesOf(tag)) {
    const st = sheet.get(cls)
    if (!st) continue
    if (st.stroke) stroke = st.stroke
    if (st.dash) dash = st.dash
  }
  return { stroke, dash }
}

const parsePointsAttr = (raw: string): Point[] => {
  const nums = raw.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)?.map(Number) ?? []
  const pts: Point[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i]
    const y = nums[i + 1]
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y })
  }
  return pts
}

const hintFromTags = (
  elAttrs: string,
  groupAttrs: string[],
  sheet: StyleSheet,
): { hint: LayerHint; skip: boolean } => {
  let named: ImportedPath['layer'] | null = null
  let stroke = ''
  let dash = ''
  for (let i = groupAttrs.length - 1; i >= 0; i -= 1) {
    const g = groupAttrs[i] ?? ''
    const id = present(g, 'id').replace(/^layer-/i, '')
    if (id && isGuideLayer(id)) return { hint: { named: null, rgb: null, dashed: false }, skip: true }
    const fromId = id ? layerFromName(id) : null
    const fromClass = classStyleOf(g, sheet)
    const gStroke = present(g, 'stroke') || fromClass.stroke
    const gDash = present(g, 'stroke-dasharray') || fromClass.dash
    if (fromId || gStroke || gDash) {
      named = fromId
      stroke = gStroke
      dash = gDash
      break
    }
  }
  const elId = present(elAttrs, 'id').replace(/^layer-/i, '')
  if (elId && isGuideLayer(elId)) return { hint: { named: null, rgb: null, dashed: false }, skip: true }
  named = layerFromName(elId) ?? named
  const elClass = classStyleOf(elAttrs, sheet)
  stroke = present(elAttrs, 'stroke') || elClass.stroke || stroke
  dash = present(elAttrs, 'stroke-dasharray') || elClass.dash || dash
  const rgb = parseCssColor(stroke)
  const dashed = Boolean(dash) && dash !== 'none' && dash !== '0'
  if (!named && !rgb && !dashed) {
    return { hint: { named: null, rgb: null, dashed: false }, skip: true }
  }
  return { hint: { named, rgb, dashed }, skip: false }
}

const groupsBefore = (source: string, index: number): string[] =>
  [...source.slice(0, index).matchAll(/<g\b([^>]*)>/gi)].map((m) => m[1] ?? '')

interface Pending {
  points: Point[]
  hint: LayerHint
}

export const parseEmbeddedDieline = (source: string): Dieline | null => {
  const match = /<script[^>]*id=["']ledabasim-diecut["'][^>]*>([\s\S]*?)<\/script>/i.exec(source)
  if (!match?.[1]) return null
  try {
    const payload = JSON.parse(match[1]) as { v?: number; dieline?: Dieline }
    const d = payload.v === 1 ? payload.dieline : undefined
    if (!d || !Array.isArray(d.panels) || !Array.isArray(d.folds) || typeof d.rootPanel !== 'string') return null
    if (d.panels.length === 0) return null
    return d
  } catch {
    return null
  }
}

export const parseSvg = (source: string): ImportedPath[] => {
  if (!/<svg[\s>]/i.test(source)) throw new ImportError('SVG dosyası geçersiz')
  const pending: Pending[] = []
  const sheet = parseStyleSheet(source)
  const nativeYUp = /id="layer-cut"|scale\(1\s*,\s*-1\)/i.test(source)
  const elRe = /<(path|line|polyline|polygon|rect)\b([^>]*)\/?\s*>/gi
  let elMatch: RegExpExecArray | null

  while ((elMatch = elRe.exec(source))) {
    const tag = (elMatch[1] ?? '').toLowerCase()
    const pAttrs = elMatch[2] ?? ''
    const { hint, skip } = hintFromTags(pAttrs, groupsBefore(source, elMatch.index), sheet)
    if (skip) continue
    let points: Point[] = []
    if (tag === 'path') {
      const d = attr(pAttrs, 'd')
      if (!d) continue
      for (const chain of flattenPath(parsePathD(d), 0.15)) {
        if (chain.length >= 2) pending.push({ points: chain, hint })
      }
      continue
    }
    if (tag === 'line') {
      const x1 = Number(present(pAttrs, 'x1') || 0)
      const y1 = Number(present(pAttrs, 'y1') || 0)
      const x2 = Number(present(pAttrs, 'x2') || 0)
      const y2 = Number(present(pAttrs, 'y2') || 0)
      points = [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ]
    } else if (tag === 'polyline' || tag === 'polygon') {
      points = parsePointsAttr(present(pAttrs, 'points'))
      if (tag === 'polygon' && points.length > 2) points = [...points, points[0] as Point]
    } else if (tag === 'rect') {
      const x = Number(present(pAttrs, 'x') || 0)
      const y = Number(present(pAttrs, 'y') || 0)
      const w = Number(present(pAttrs, 'width') || 0)
      const h = Number(present(pAttrs, 'height') || 0)
      points = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
      ]
    }
    if (points.length >= 2) pending.push({ points, hint })
  }

  if (pending.length === 0) throw new ImportError('SVG içinde kesim veya kırım yolu bulunamadı')

  const colorMap = buildColorLayerMap(pending.map((p) => p.hint))
  const out: ImportedPath[] = pending.map((p) => ({ layer: resolveLayer(p.hint, colorMap), points: p.points }))

  if (!nativeYUp) {
    // Yeni nesneler: kapalı yolda ilk ve son nokta aynı nesne olabilir (yerinde çevirmek iki kez çevirirdi).
    for (const path of out) path.points = path.points.map((p) => ({ x: p.x, y: -p.y }))
  }
  return out
}

