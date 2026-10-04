import { round, type Dieline, type LineType, type PathCommand } from '@diecut/core'
import { LAYER_ORDER, LAYER_STYLES } from './layers.ts'

export interface SvgOptions {
  /** Çevrede bırakılacak boşluk (mm). */
  margin?: number
  /** Taşma payı, güvenli alan, ölçü gibi üretim dışı katmanlar dahil edilsin mi. */
  includeGuides?: boolean
  /** Panel adlarını gri metin olarak yaz. */
  showPanelLabels?: boolean
  locale?: 'tr' | 'en'
  /** Arka plan rengi; verilmezse şeffaf. */
  background?: string
  /**
   * Katalog küçük resmi: kırmızı kesim / yeşil düz kırım,
   * ekranda görünecek kalınlık, mm birimi yok.
   */
  preview?: boolean
  /** Katalog önizleme teması; `preview` açıkken zemin ve çizgi kontrastı. */
  previewTheme?: 'light' | 'dark'
  /** Yerleştirme ölçü yazıları (dieline koordinatı, +y yukarı). */
  callouts?: { x: number; y: number; text: string }[]
  /** Platform JSON modelini SVG içine göm. Yerleştirme çıktısında kapat. */
  embedModel?: boolean
  /** `preview` açıkken çizgi kalınlığı (mm cinsinden viewBox birimi). */
  previewStrokeMm?: number
}

export function commandsToSvgPath(commands: readonly PathCommand[]): string {
  const parts: string[] = []
  for (const cmd of commands) {
    switch (cmd.c) {
      case 'M':
        parts.push(`M${round(cmd.x, 3)} ${round(cmd.y, 3)}`)
        break
      case 'L':
        parts.push(`L${round(cmd.x, 3)} ${round(cmd.y, 3)}`)
        break
      case 'C':
        parts.push(
          `C${round(cmd.x1, 3)} ${round(cmd.y1, 3)} ${round(cmd.x2, 3)} ${round(cmd.y2, 3)} ${round(cmd.x, 3)} ${round(cmd.y, 3)}`,
        )
        break
      case 'A':
        parts.push(
          `A${round(cmd.rx, 3)} ${round(cmd.ry, 3)} ${round(cmd.rot, 3)} ${cmd.large ? 1 : 0} ${cmd.sweep ? 1 : 0} ${round(cmd.x, 3)} ${round(cmd.y, 3)}`,
        )
        break
      case 'Z':
        parts.push('Z')
        break
    }
  }
  return parts.join(' ')
}

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string)

/**
 * Dieline'ı SVG'ye çevirir.
 *
 * Motorun koordinatları +y yukarı olduğu için tüm çizim bir
 * `scale(1,-1)` grubuna sarılır; böylece yay yönleri ve metin
 * konumları tarayıcıda doğru görünür.
 */
export function toSvg(dieline: Dieline, options: SvgOptions = {}): string {
  const preview = options.preview === true
  const previewTheme = options.previewTheme ?? 'dark'
  const margin = options.margin ?? (preview ? 8 : 5)
  const includeGuides = options.includeGuides ?? !preview
  const locale = options.locale ?? 'tr'

  const { bounds } = dieline
  const width = bounds.width + margin * 2
  const height = bounds.height + margin * 2
  const offsetX = margin - bounds.x
  const offsetY = margin - bounds.y
  const previewStroke = options.previewStrokeMm ?? Math.max(0.9, Math.min(width, height) * 0.007)

  const grouped = new Map<LineType, string[]>()
  for (const path of dieline.paths) {
    const style = LAYER_STYLES[path.layer]
    if (!includeGuides && !style.production) continue
    const list = grouped.get(path.layer) ?? []
    list.push(`<path d="${commandsToSvgPath(path.commands)}"/>`)
    grouped.set(path.layer, list)
  }

  const previewStrokeOf = (layer: LineType): { stroke: string; width: number; dash?: string } => {
    if (!preview) {
      const style = LAYER_STYLES[layer]
      return { stroke: style.stroke, width: style.widthMm, dash: style.dash ? style.dash.join(' ') : undefined }
    }
    const light = previewTheme === 'light'
    if (layer === 'cut') return { stroke: light ? '#c1121f' : '#ff2d2d', width: previewStroke }
    if (layer === 'crease') {
      return { stroke: light ? '#1a9c4b' : '#3dce6a', width: previewStroke * 0.85 }
    }
    if (layer === 'perf' || layer === 'cutcrease') {
      return {
        stroke: light ? '#2f6fd6' : '#6aa7ff',
        width: previewStroke * 0.75,
        dash: `${previewStroke * 2} ${previewStroke}`,
      }
    }
    const style = LAYER_STYLES[layer]
    return { stroke: style.stroke, width: previewStroke * 0.6 }
  }

  const layerMarkup = LAYER_ORDER.filter((layer) => grouped.has(layer))
    .map((layer) => {
      const style = LAYER_STYLES[layer]
      const drawn = previewStrokeOf(layer)
      const dash = drawn.dash ? ` stroke-dasharray="${drawn.dash}"` : ''
      return [
        `<g id="layer-${style.name.toLowerCase()}" data-layer="${style.name}" fill="none" stroke="${drawn.stroke}" stroke-width="${drawn.width}"${dash} stroke-linejoin="round" stroke-linecap="round">`,
        ...(grouped.get(layer) as string[]).map((p) => `  ${p}`),
        '</g>',
      ].join('\n')
    })
    .join('\n')

  let labelMarkup = ''
  const calloutFill = preview ? (previewTheme === 'light' ? '#333333' : '#d0d0d0') : '#8A8A8A'
  const calloutSize = Math.max(3.2, Math.min(width, height) * 0.012)
  if (options.callouts?.length) {
    const marks = options.callouts.map((item) => {
      return `  <text x="${round(item.x, 2)}" y="${round(-item.y, 2)}" transform="scale(1,-1)" font-size="${round(calloutSize, 2)}" fill="${calloutFill}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif">${escapeXml(item.text)}</text>`
    })
    labelMarkup += `<g id="layer-callouts">\n${marks.join('\n')}\n</g>\n`
  }
  if (options.showPanelLabels) {
    const labels = dieline.panels
      .filter((panel) => panel.outline.length > 2)
      .map((panel) => {
        const cx = panel.outline.reduce((s, p) => s + p.x, 0) / panel.outline.length
        const cy = panel.outline.reduce((s, p) => s + p.y, 0) / panel.outline.length
        const size = Math.max(2.5, Math.min(bounds.width, bounds.height) * 0.035)
        // Metin ters çevrilmiş grubun içinde olduğu için tekrar çevriliyor.
        return `  <text x="${round(cx, 2)}" y="${round(-cy, 2)}" transform="scale(1,-1)" font-size="${round(size, 2)}" fill="#9aa4b2" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif">${escapeXml(panel.label[locale])}</text>`
      })
    labelMarkup += `<g id="layer-labels">\n${labels.join('\n')}\n</g>`
  }

  const bgFill =
    options.background ?? (preview ? (previewTheme === 'light' ? '#ffffff' : '#0b0b0b') : '')
  const background = bgFill ? `<rect width="${round(width, 3)}" height="${round(height, 3)}" fill="${bgFill}"/>` : ''

  const sizeAttrs = preview
    ? `width="100%" height="100%" viewBox="0 0 ${round(width, 3)} ${round(height, 3)}" preserveAspectRatio="xMidYMid meet"`
    : `width="${round(width, 3)}mm" height="${round(height, 3)}mm" viewBox="0 0 ${round(width, 3)} ${round(height, 3)}"`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" ${sizeAttrs}>`,
    `<title>${escapeXml(dieline.meta.name[locale])} — ${round(bounds.width, 1)}×${round(bounds.height, 1)} mm</title>`,
    background,
    `<g transform="translate(${round(offsetX, 3)} ${round(height - offsetY, 3)}) scale(1,-1)">`,
    layerMarkup,
    labelMarkup,
    '</g>',
    preview || options.embedModel === false ? '' : embedDiecutModel(dieline),
    '</svg>',
  ]
    .filter(Boolean)
    .join('\n')
}

const DIECUT_SCRIPT_ID = 'ledabasim-diecut'

/** Platform SVG’sini tekrar yükleyince aynı panel/kırım ağacı kullanılsın. */
function embedDiecutModel(dieline: Dieline): string {
  const json = JSON.stringify({ v: 1, dieline }).replace(/</g, '\\u003c')
  return `<script type="application/json" id="${DIECUT_SCRIPT_ID}">${json}</script>`
}
