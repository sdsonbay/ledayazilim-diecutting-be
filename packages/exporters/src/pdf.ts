import { flattenPath, mmToPt, round, type Dieline, type LineType, type Point } from '@diecut/core'
import { LAYER_ORDER, LAYER_STYLES } from './layers.ts'

export interface PdfOptions {
  margin?: number
  includeGuides?: boolean
  /** Alt kenara künye bloğu (template adı, ölçüler, bıçak uzunluğu) yaz. */
  infoBlock?: boolean
  locale?: 'tr' | 'en'
  /** Künyeye eklenecek firma adı. */
  producedBy?: string
  tolerance?: number
}

/**
 * Katmanlı, spot renkli PDF üretir — bağımlılıksız minimal PDF yazıcı.
 *
 * Kalıp atölyesinin beklediği iki şey burada karşılanıyor:
 * her çizgi tipi ayrı bir isteğe bağlı içerik grubunda (OCG, Illustrator'da
 * "katman" olarak görünür) ve kesim/kırım çizgileri `CutContour` gibi
 * tanınan spot renk adlarıyla ayrılabilir renk olarak yazılıyor.
 */
export function toPdf(dieline: Dieline, options: PdfOptions = {}): Uint8Array {
  const margin = options.margin ?? 10
  const includeGuides = options.includeGuides ?? true
  const wantInfo = options.infoBlock ?? true
  const locale = options.locale ?? 'tr'
  const tolerance = options.tolerance ?? 0.02

  const infoHeight = wantInfo ? 16 : 0
  const pageWidthMm = dieline.bounds.width + margin * 2
  const pageHeightMm = dieline.bounds.height + margin * 2 + infoHeight
  const originX = margin - dieline.bounds.x
  const originY = margin + infoHeight - dieline.bounds.y

  const usedLayers: LineType[] = LAYER_ORDER.filter((layer) => {
    if (!includeGuides && !LAYER_STYLES[layer].production) return false
    return dieline.paths.some((p) => p.layer === layer)
  })

  const pdf = new PdfWriter()
  const catalogRef = pdf.reserve()
  const pagesRef = pdf.reserve()
  const pageRef = pdf.reserve()
  const contentRef = pdf.reserve()
  const fontRef = pdf.reserve()

  const ocgRefs = new Map<LineType, number>()
  const colorRefs = new Map<LineType, number>()
  for (const layer of usedLayers) {
    const style = LAYER_STYLES[layer]
    ocgRefs.set(layer, pdf.reserve())
    if (style.spotName && style.cmyk) colorRefs.set(layer, pdf.reserve())
  }

  for (const layer of usedLayers) {
    const style = LAYER_STYLES[layer]
    pdf.set(ocgRefs.get(layer) as number, `<< /Type /OCG /Name (${pdfString(style.label[locale])}) >>`)

    const colorRef = colorRefs.get(layer)
    if (colorRef && style.spotName && style.cmyk) {
      const fnRef = pdf.reserve()
      pdf.set(
        fnRef,
        `<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [${style.cmyk.map((c) => round(c, 4)).join(' ')}] /N 1 /Range [0 1 0 1 0 1 0 1] >>`,
      )
      pdf.set(colorRef, `[/Separation /${pdfName(style.spotName)} /DeviceCMYK ${fnRef} 0 R]`)
    }
  }

  const content = buildContentStream(dieline, {
    usedLayers,
    ocgRefs,
    colorRefs,
    originX,
    originY,
    tolerance,
    info: wantInfo ? infoLines(dieline, locale, options.producedBy) : [],
    marginPt: mmToPt(margin),
  })

  pdf.setStream(contentRef, content)
  pdf.set(fontRef, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')

  const properties = usedLayers.map((layer, i) => `/OC${i} ${ocgRefs.get(layer) as number} 0 R`).join(' ')
  const colorSpaces = usedLayers
    .map((layer, i) => (colorRefs.has(layer) ? `/CS${i} ${colorRefs.get(layer) as number} 0 R` : ''))
    .filter(Boolean)
    .join(' ')

  pdf.set(
    pageRef,
    `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${round(mmToPt(pageWidthMm), 3)} ${round(mmToPt(pageHeightMm), 3)}] ` +
      `/Resources << /Font << /F1 ${fontRef} 0 R >> /Properties << ${properties} >> /ColorSpace << ${colorSpaces} >> >> ` +
      `/Contents ${contentRef} 0 R >>`,
  )
  pdf.set(pagesRef, `<< /Type /Pages /Kids [${pageRef} 0 R] /Count 1 >>`)

  const ocgList = usedLayers.map((layer) => `${ocgRefs.get(layer) as number} 0 R`).join(' ')
  pdf.set(
    catalogRef,
    `<< /Type /Catalog /Pages ${pagesRef} 0 R /OCProperties << /OCGs [${ocgList}] /D << /Order [${ocgList}] /ON [${ocgList}] >> >> >>`,
  )

  return pdf.build(catalogRef)
}

interface ContentContext {
  usedLayers: LineType[]
  ocgRefs: Map<LineType, number>
  colorRefs: Map<LineType, number>
  originX: number
  originY: number
  tolerance: number
  info: string[]
  marginPt: number
}

function buildContentStream(dieline: Dieline, ctx: ContentContext): string {
  const ops: string[] = ['q', `1 0 0 1 ${round(mmToPt(ctx.originX), 3)} ${round(mmToPt(ctx.originY), 3)} cm`]

  ctx.usedLayers.forEach((layer, index) => {
    const style = LAYER_STYLES[layer]
    const paths = dieline.paths.filter((p) => p.layer === layer)
    if (paths.length === 0) return

    ops.push(`/OC /OC${index} BDC`)
    ops.push(`${round(mmToPt(style.widthMm), 3)} w`)
    ops.push(style.dash ? `[${style.dash.map((d) => round(mmToPt(d), 2)).join(' ')}] 0 d` : '[] 0 d')

    if (ctx.colorRefs.has(layer)) ops.push(`/CS${index} CS 1 SCN`)
    else ops.push(`${hexToRgbOps(style.stroke)} RG`)

    for (const path of paths) {
      for (const chain of flattenPath(path.commands, ctx.tolerance)) {
        ops.push(chainToOps(chain))
      }
    }
    ops.push('S', 'EMC')
  })

  ops.push('Q')

  if (ctx.info.length > 0) {
    ops.push('q', '0.45 0.45 0.45 rg', 'BT', '/F1 7 Tf', '8.5 TL')
    ops.push(`1 0 0 1 ${round(ctx.marginPt, 2)} ${round(ctx.marginPt + 8.5 * (ctx.info.length - 1), 2)} Tm`)
    ctx.info.forEach((line, i) => {
      if (i > 0) ops.push('T*')
      ops.push(`(${pdfString(line)}) Tj`)
    })
    ops.push('ET', 'Q')
  }

  return ops.join('\n')
}

function chainToOps(chain: readonly Point[]): string {
  const first = chain[0]
  if (!first || chain.length < 2) return ''
  const last = chain[chain.length - 1] as Point
  const closed = Math.hypot(last.x - first.x, last.y - first.y) < 1e-4
  const points = closed ? chain.slice(0, -1) : chain

  const ops = [`${round(mmToPt(first.x), 3)} ${round(mmToPt(first.y), 3)} m`]
  for (let i = 1; i < points.length; i++) {
    const p = points[i] as Point
    ops.push(`${round(mmToPt(p.x), 3)} ${round(mmToPt(p.y), 3)} l`)
  }
  if (closed) ops.push('h')
  return ops.join('\n')
}

function infoLines(dieline: Dieline, locale: 'tr' | 'en', producedBy?: string): string[] {
  const dims = Object.entries(dieline.params)
    .filter(([key]) => ['length', 'width', 'height'].includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join('  ')

  const code = dieline.meta.ecma ?? dieline.meta.fefco ?? dieline.templateId
  const head = `${dieline.meta.name[locale]}  [${code}]   ${dims}   ${locale === 'tr' ? 'kalinlik' : 'caliper'}=${dieline.meta.caliper}mm`
  const flat =
    `${locale === 'tr' ? 'Acik olcu' : 'Flat size'}: ${round(dieline.bounds.width, 1)} x ${round(dieline.bounds.height, 1)} mm   ` +
    `${locale === 'tr' ? 'Kesim' : 'Cut'}: ${round(dieline.stats.cutLength / 1000, 2)} m   ` +
    `${locale === 'tr' ? 'Kirim' : 'Crease'}: ${round(dieline.stats.creaseLength / 1000, 2)} m`
  const footer = `${producedBy ?? 'Ledabasim Diecut'}   ${new Date().toISOString().slice(0, 10)}`

  return [head, flat, footer]
}

function hexToRgbOps(hex: string): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  return `${round(r, 3)} ${round(g, 3)} ${round(b, 3)}`
}

/** PDF metin dizesi: Latin-1 dışı Türkçe harfler sadeleştirilir, ayraçlar kaçırılır. */
function pdfString(value: string): string {
  const folded = value
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/[—–]/g, '-')
    .replace(/[’‘]/g, "'")
  return [...folded]
    .map((ch) => {
      const codePoint = ch.codePointAt(0) ?? 63
      if (codePoint > 0xff) return '?'
      if (ch === '(' || ch === ')' || ch === '\\') return `\\${ch}`
      return ch
    })
    .join('')
}

const pdfName = (value: string): string => value.replace(/[^A-Za-z0-9]/g, '')

class PdfWriter {
  private readonly bodies: (string | null)[] = []
  private readonly streams = new Set<number>()

  reserve(): number {
    this.bodies.push(null)
    return this.bodies.length
  }

  set(ref: number, body: string): void {
    this.bodies[ref - 1] = body
  }

  setStream(ref: number, content: string): void {
    this.bodies[ref - 1] = content
    this.streams.add(ref)
  }

  build(catalogRef: number): Uint8Array {
    let out = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'
    const offsets: number[] = []

    this.bodies.forEach((body, index) => {
      const ref = index + 1
      offsets.push(out.length)
      if (body === null) {
        out += `${ref} 0 obj\nnull\nendobj\n`
        return
      }
      if (this.streams.has(ref)) {
        out += `${ref} 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\n`
      } else {
        out += `${ref} 0 obj\n${body}\nendobj\n`
      }
    })

    const xrefOffset = out.length
    out += `xref\n0 ${this.bodies.length + 1}\n`
    out += '0000000000 65535 f \n'
    for (const offset of offsets) {
      out += `${String(offset).padStart(10, '0')} 00000 n \n`
    }
    out += `trailer\n<< /Size ${this.bodies.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

    const bytes = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
    return bytes
  }
}
