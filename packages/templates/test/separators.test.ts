import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SEPARATOR_SPECS, dctCoverage, generateDieline, resolveCatalog, separatorTemplates } from '../src/index.ts'

test('ayırıcı şablonları varsayılan ve farklı ölçülerde hatasız', () => {
  for (const t of separatorTemplates) {
    const inputs: Record<string, number>[] = [{}, { length: 60 }, { length: 300 }]
    for (const input of inputs) {
      const d = generateDieline(t.id, input)
      const errors = d.warnings.filter((x) => x.severity === 'error')
      assert.deepEqual(errors, [], `${t.id} ${JSON.stringify(input)}: ${errors.map((e) => e.code).join(',')}`)
      assert.ok(!d.warnings.some((w) => w.code === 'panel-too-small'), `${t.id}: panel-too-small`)
    }
  }
})

test('platform iç parça: dört duvar, dönüş kanatları, delik türleri', () => {
  const plain = generateDieline('ecma-f80-03', { length: 200, width: 150, height: 50 })
  assert.equal(plain.panels.filter((p) => p.role === 'wall').length, 4)
  assert.equal(plain.rootPanel, 'base')
  const ret = generateDieline('ecma-f80-03-b')
  assert.equal(ret.panels.filter((p) => p.id.startsWith('return-')).length, 4)
  assert.equal(ret.folds.find((f) => f.child === 'return-top')?.parent, 'wall-top')
  const cross = generateDieline('separator-insert-cross-2', { length: 200, width: 150, height: 70 })
  assert.equal(cross.paths.filter((p) => p.note === 'çapraz kesim').length, 4)
  assert.equal(cross.paths.filter((p) => p.note === 'delik çerçevesi').length, 8)
  const circle = generateDieline('separator-insert-circle-chamfer')
  assert.equal(circle.paths.filter((p) => p.note === 'delik').length, 1)
  const wall = circle.panels.find((p) => p.id === 'wall-bottom')!
  const xs = wall.outline.map((q) => q.x)
  assert.ok(Math.max(...xs) - Math.min(...xs) < 300 - 1e-6, 'pahlı duvarın uç kenarı taban kenarından kısa')
  const rect = generateDieline('separator-insert-rect')
  assert.equal(rect.paths.filter((p) => p.note === 'dikdörtgen delik').length, 3)
})

test('taraklı şerit ve FEFCO 0930: yarık sayısı = hücre − 1', () => {
  const one = generateDieline('ecma-f80-31', { length: 60, cells: 5, height: 80, slotDepth: 40 })
  assert.equal(one.panels.length, 1)
  assert.equal(one.bounds.width, 300)
  const strip = one.panels[0]!
  const ys = strip.outline.map((q) => q.y)
  assert.equal(strip.outline.filter((q) => Math.abs(q.y - 40) < 1e-6).length, 8, '4 yarık × 2 dip köşesi')
  assert.ok(Math.max(...ys) === 80)
  const two = generateDieline('fefco-0930', { length: 40, cells: 4, height: 100 })
  assert.equal(two.panels.length, 2)
  const s2 = two.panels[1]!
  assert.ok(s2.outline.some((q) => Math.abs(q.y - (100 + 8)) < 1e-6), 'ikinci şeridin yarıkları alt kenarda')
})

test('akordeon, U ped, L köşe koruyucu', () => {
  const acc = generateDieline('separator-accordion', { length: 20, cells: 6, width: 150 })
  assert.equal(acc.panels.length, 6)
  assert.deepEqual(
    acc.folds.map((f) => Boolean(f.reverse)),
    [false, true, false, true, false],
    'zikzak: her ikinci kırım ters (mountain)',
  )
  const u = generateDieline('separator-u-pad', { length: 150, width: 75, height: 50 })
  assert.equal(u.panels.length, 2)
  assert.equal(u.bounds.height, 125)
  const l = generateDieline('separator-l-pad', { length: 150, width: 100, height: 200, baseFlap: 30 })
  assert.equal(l.panels.filter((p) => p.role === 'flap').length, 2)
  assert.equal(generateDieline('separator-l-pad', { baseFlap: 0 }).panels.length, 2)
})

test('ayırıcı grupları DCT kapsamı tam (karton + oluklu)', () => {
  const groups = dctCoverage().groups.filter((g) => g.group === 'separators')
  for (const g of groups) assert.equal(g.covered, g.total, `${g.material}: eksik ${g.missing.join(',')}`)
  assert.equal(resolveCatalog('becf-11f01').template.id, 'ecma-f80-03')
  assert.equal(resolveCatalog('becf-11f05').template.id, 'fefco-0904')
  assert.equal(resolveCatalog('becf-21f03').template.id, 'fefco-0458')
  assert.equal(SEPARATOR_SPECS.length, 14)
})
