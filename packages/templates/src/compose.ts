import type { Dieline, DielineBuilder, PathCommand, Point } from '@diecut/core'

/**
 * Hazır bir dieline'ı (ör. tek tepsi) başka bir builder'a ötelenmiş ve
 * kimlikleri öneklenmiş olarak ekler. İki parçalı kutular (taban + kapak)
 * gibi birden fazla bağımsız gövdeyi tek kalıpta toplamak için kullanılır.
 *
 * Kaynak dieline'ın taşma payı (bleed) kılavuzu atlanır; bileşik kalıp kendi
 * payını çizer. Kırımlar `draw: false` ile eklenir çünkü kaynak yollar
 * kırım çizgilerini zaten içerir.
 */
export function appendDieline(b: DielineBuilder, src: Dieline, dx: number, dy: number, prefix: string): { root: string; minX: number; minY: number; maxX: number; maxY: number } {
  const p = (id: string) => (prefix ? `${prefix}-${id}` : id)
  const tp = (pt: Point): Point => ({ x: pt.x + dx, y: pt.y + dy })
  const tc = (c: PathCommand): PathCommand => {
    switch (c.c) {
      case 'M':
      case 'L':
        return { c: c.c, x: c.x + dx, y: c.y + dy }
      case 'C':
        return { c: 'C', x1: c.x1 + dx, y1: c.y1 + dy, x2: c.x2 + dx, y2: c.y2 + dy, x: c.x + dx, y: c.y + dy }
      case 'A':
        return { ...c, x: c.x + dx, y: c.y + dy }
      case 'Z':
        return c
    }
  }
  for (const path of src.paths) {
    if (path.layer === 'bleed') continue
    b.addPath(path.layer, path.commands.map(tc), path.note ? `${prefix ? prefix + ' ' : ''}${path.note}` : undefined)
  }
  for (const panel of src.panels) {
    b.panel({
      id: p(panel.id),
      name: p(panel.name),
      label: panel.label,
      outline: panel.outline.map(tp),
      ...(panel.holes ? { holes: panel.holes.map((h) => h.map(tp)) } : {}),
      role: panel.role,
      ...(panel.printable === false ? { printable: false } : {}),
    })
  }
  for (const fold of src.folds) {
    b.fold({ parent: p(fold.parent), child: p(fold.child), axis: [tp(fold.axis[0]), tp(fold.axis[1])], angle: fold.angle, kind: fold.kind, draw: false })
  }
  for (const w of src.warnings) b.warn(w.code, w.severity, w.message.tr, w.message.en)
  return {
    root: p(src.rootPanel),
    minX: src.bounds.x + dx,
    minY: src.bounds.y + dy,
    maxX: src.bounds.x + src.bounds.width + dx,
    maxY: src.bounds.y + src.bounds.height + dy,
  }
}
