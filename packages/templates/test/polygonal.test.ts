import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POLY_SPECS, dctCoverage, generateDieline, polyTemplates, resolveCatalog } from '../src/index.ts'

test('çokgen / açılı şablonlar varsayılan ve farklı ölçülerde hatasız', () => {
  for (const t of polyTemplates) {
    const has = (k: string) => t.params.some((p) => p.key === k)
    for (const scale of [null, 0.5, 1.6]) {
      const input: Record<string, number> = {}
      if (scale !== null) for (const k of ['length', 'width', 'height']) if (has(k)) input[k] = Math.round(((t.params.find((p) => p.key === k)!.kind === 'number' ? (t.params.find((p) => p.key === k) as { default: number }).default : 100) * scale))
      const d = generateDieline(t.id, input)
      const errors = d.warnings.filter((x) => x.severity === 'error')
      assert.deepEqual(errors, [], `${t.id} ${JSON.stringify(input)}: ${errors.map((e) => e.code + ':' + e.message.tr).join(',')}`)
    }
  }
})

test('altıgen kutu: 6 yüz + yapıştırma, altıgen kapak ve dil, crash-lock taban', () => {
  const d = generateDieline('ecma-c10-40-55-20', { length: 100, height: 150 })
  assert.equal(d.panels.filter((p) => p.role === 'wall').length, 6)
  const lid = d.panels.find((p) => p.id === 'top-2')!
  assert.equal(lid.outline.length, 6, 'kapak altıgen')
  const side = Math.hypot(lid.outline[1]!.x - lid.outline[0]!.x, lid.outline[1]!.y - lid.outline[0]!.y)
  assert.ok(Math.abs(side - 100) < 1e-6)
  assert.ok(d.panels.some((p) => p.id === 'top-2-tuck' && p.role === 'lock'))
  assert.equal(d.panels.filter((p) => p.id.startsWith('bottom-')).length, 6)
  const yFold = d.folds.filter((f) => f.parent.startsWith('wall-') && f.child.startsWith('wall-'))
  assert.ok(yFold.every((f) => Math.abs(Math.abs(f.angle) - 60) < 1e-9), 'altıgen yüzler arası 60°')
  const petal = generateDieline('ecma-c10-40-55-90')
  assert.equal(petal.paths.filter((p) => p.layer === 'perf').length, 6)
})

test('üçgen prizma: 120° yüz kırımları, iki üçgen kapak', () => {
  const d = generateDieline('ecma-c10-10-20-20', { length: 200, width: 110 })
  const walls = d.folds.filter((f) => f.parent.startsWith('wall-') && f.child.startsWith('wall-'))
  assert.ok(walls.every((f) => Math.abs(Math.abs(f.angle) - 120) < 1e-9))
  assert.equal(d.panels.filter((p) => p.role === 'lid').length, 2)
})

test('iki parçalı sekizgen tepsi: 8 duvar + 8 kulak her parçada, kapak boşluk payıyla büyük', () => {
  const d = generateDieline('ecma-d10-51-oct', { width: 200, height: 60, lidHeight: 40, caliper: 0.6, fitClearance: 1 })
  assert.equal(d.panels.filter((p) => p.id.startsWith('base-wall-') && !p.id.endsWith('-tab')).length, 8)
  assert.equal(d.panels.filter((p) => p.id.startsWith('lid-wall-') && p.id.endsWith('-tab')).length, 8)
  const ext = (id: string) => {
    const o = d.panels.find((p) => p.id === id)!.outline
    return [Math.max(...o.map((q) => q.x)) - Math.min(...o.map((q) => q.x)), Math.max(...o.map((q) => q.y)) - Math.min(...o.map((q) => q.y))]
  }
  const [bx, by] = ext('base-base')
  const [lx, ly] = ext('lid-base')
  assert.ok(Math.abs(Math.min(bx!, by!) - 200) < 1e-6, `taban karşı kenar ${Math.min(bx!, by!)}`)
  assert.ok(Math.abs(Math.min(lx!, ly!) - 203.2) < 1e-6, `kapak karşı kenar ${Math.min(lx!, ly!)}`)
})

test('kesik piramit: yüzler arası kırım açısı eğime bağlı, yapıştırma payı son yüzde', () => {
  const d = generateDieline('ecma-c20-20-10-10', { length: 100, width: 80, height: 50, splay: 12 })
  const faceFolds = d.folds.filter((f) => f.parent.startsWith('face-') && f.child.startsWith('face-'))
  assert.equal(faceFolds.length, 3)
  const L = Math.hypot(12, 50)
  const expected = (Math.acos((12 / L) ** 2) * 180) / Math.PI
  assert.ok(faceFolds.every((f) => Math.abs(Math.abs(f.angle) - expected) < 1e-6), `açı ${faceFolds[0]!.angle} ≠ ${expected}`)
  assert.ok(d.panels.some((p) => p.id === 'glue'))
  const straight = generateDieline('ecma-c20-20-10-10', { splay: 0.5 })
  assert.ok(straight.folds.filter((f) => f.child === 'face-2').every((f) => Math.abs(Math.abs(f.angle) - 90) < 0.5))
  const tuck = generateDieline('angled-tuck-box')
  assert.ok(tuck.panels.some((p) => p.id === 'top-1-tuck'))
  assert.equal(tuck.panels.filter((p) => p.id.startsWith('top-')).length, 4, 'kapak + dil + 2 toz')
})

test('altıgen külah: 6 üçgen yüz tepe noktasında, altıgen kapak, kısa eğik kenar hata verir', () => {
  const d = generateDieline('ecma-c30-40-01-20', { length: 90, width: 150 })
  const faces = d.panels.filter((p) => p.id.startsWith('face-'))
  assert.equal(faces.length, 6)
  assert.ok(faces.every((p) => p.outline.some((q) => Math.hypot(q.x, q.y) < 1e-9)), 'her yüz tepe noktasını içerir')
  assert.equal(d.panels.find((p) => p.id === 'lid')!.outline.length, 6)
  assert.equal(d.panels.filter((p) => p.id.startsWith('dust-')).length, 2)
  const bad = generateDieline('ecma-c30-40-01-20', { length: 200, width: 60 })
  assert.ok(bad.warnings.some((w) => w.code === 'slant-too-short' && w.severity === 'error'))
})

test('çokgen ve açılı gruplar DCT kapsamı tam', () => {
  const groups = dctCoverage().groups
  for (const g of ['polygonal-boxes', 'angled-boxes']) {
    const c = groups.find((x) => x.material === 'carton' && x.group === g)!
    assert.equal(c.covered, c.total, `${g}: eksik ${c.missing.join(',')}`)
  }
  assert.equal(resolveCatalog('becf-12804').template.id, 'ecma-c10-10-20-20')
  assert.equal(resolveCatalog('becf-12902').template.id, 'ecma-c30-40-01-20')
  assert.equal(POLY_SPECS.length, 9)
})
