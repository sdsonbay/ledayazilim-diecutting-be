import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CARTON_SPECS,
  DCT_INVENTORY,
  cartonTemplates,
  dctCoverage,
  dctMappingOf,
  generateDieline,
  listTemplates,
  resolveCatalog,
} from '../src/index.ts'

test('DCT envanteri 3 malzeme × 28 grup × 273 temel şablon', () => {
  assert.equal(DCT_INVENTORY.length, 273)
  const groups = new Set(DCT_INVENTORY.map((e) => `${e.material}/${e.group}`))
  assert.equal(groups.size, 28)
  const ids = new Set(DCT_INVENTORY.map((e) => e.id))
  assert.equal(ids.size, DCT_INVENTORY.length, 'kimlikler benzersiz')
})

test('her carton spec’i geçerli bir DCT kaydına bağlanır ve id’ler benzersizdir', () => {
  const inventory = new Set(DCT_INVENTORY.map((e) => e.id))
  const seen = new Set<string>()
  for (const spec of CARTON_SPECS) {
    assert.ok(!seen.has(spec.id), `tekrar eden şablon id: ${spec.id}`)
    seen.add(spec.id)
    for (const dct of spec.dct) assert.ok(inventory.has(dct), `${spec.id}: envanterde olmayan DCT kimliği ${dct}`)
    const entry = DCT_INVENTORY.find((e) => e.id === spec.dct[0])
    assert.equal(entry?.group, spec.category, `${spec.id}: kategori DCT grubuyla uyuşmalı`)
    assert.ok(spec.materials.includes(entry!.material), `${spec.id}: malzeme DCT dalıyla uyuşmalı`)
  }
})

test('tüm carton şablonları varsayılan ve pencereli/yapıştırmasız varyantlarıyla üretilir', () => {
  for (const t of cartonTemplates) {
    for (const input of [{}, { window: 'rect', glueFlap: 0 }, { length: 60, width: 30, height: 90 }]) {
      const d = generateDieline(t.id, input)
      const errors = d.warnings.filter((w) => w.severity === 'error')
      assert.deepEqual(errors, [], `${t.id} ${JSON.stringify(input)}: ${errors.map((e) => e.code).join(',')}`)
      assert.equal(d.panels.filter((p) => p.role === 'wall').length, 4, `${t.id}: dört duvar`)
      assert.ok(d.folds.length >= d.panels.length - 1, `${t.id}: her panel köke bağlı`)
      assert.ok(d.stats.cutLength > 0 && d.stats.creaseLength > 0)
    }
  }
})

test('uç takımları: snap alt yarık, auto alt üçgen, gable tutamak deliği, askı euroslot', () => {
  const snap = generateDieline('ecma-a55-20-01-01')
  assert.ok(snap.paths.filter((p) => p.note?.includes('kilit yarığı')).length === 2)
  assert.ok(snap.panels.some((p) => p.id === 'bottom-lock-major'))

  const auto = generateDieline('ecma-a60-20-00-03')
  assert.equal(auto.panels.filter((p) => p.id.endsWith('-glue') && p.role === 'glue').length, 2)
  assert.ok(auto.folds.some((f) => Math.abs(f.angle) === 180), 'yapıştırma üçgeni 180° katlanır')

  const gable = generateDieline('ecma-a55-75')
  assert.equal(gable.paths.filter((p) => p.note === 'tutamak deliği').length, 2)
  assert.equal(gable.panels.filter((p) => p.role === 'gusset').length, 2)

  const hang = generateDieline('ecma-a20-20-32-33')
  assert.ok(hang.paths.some((p) => p.note === 'euroslot askı deliği'))
  assert.ok(hang.panels.some((p) => p.id === 'top-hang-tab'))
  assert.equal(hang.paths.filter((p) => p.note === 'toz kapağı kilit yarığı').length, 4, 'üst + alt yarıklar')

  const lock = generateDieline('ecma-a45-45')
  assert.equal(lock.paths.filter((p) => p.layer === 'cutcrease').length, 4, 'çapraz kırımlar')
})

test('DCT kimliği ile şablon çözülür ve aranır', () => {
  assert.equal(resolveCatalog('becf-10803').template.id, 'ecma-a20-20-01-03')
  assert.equal(resolveCatalog('becf-10101').template.id, 'ecma-a20-20')
  assert.equal(resolveCatalog('becf-11001').template.id, 'ecma-a21-20')
  assert.equal(resolveCatalog('becf-21d01').template.id, 'fefco-0201')
  assert.ok(generateDieline('becf-10913').paths.length > 0)

  const hits = listTemplates({ query: 'becf-10912' })
  assert.ok(hits.some((h) => h.familyId === 'ecma-a55-40'))
  const summary = listTemplates({ ids: ['ecma-a20-20-01-03'] })[0]
  assert.ok(summary?.dct.includes('becf-10803'))
})

test('DCT kapsamı: ana gruplar büyük ölçüde karşılanır', () => {
  const cov = dctCoverage()
  assert.equal(cov.total, 273)
  assert.ok(cov.covered >= 70, `kapsam ${cov.covered}`)
  const byGroup = new Map(cov.groups.map((g) => [`${g.material}/${g.group}`, g]))
  assert.equal(byGroup.get('corrugated/tuck-end-boxes')?.missing.length, 0)
  assert.ok((byGroup.get('carton/tuck-end-boxes')?.covered ?? 0) >= 14)
  assert.ok((byGroup.get('carton/snap-lock-boxes')?.covered ?? 0) >= 12)
  assert.ok((byGroup.get('carton/tuck-top-auto-bottom-boxes')?.covered ?? 0) >= 12)
  for (const g of cov.groups) assert.equal(g.covered + g.missing.length, g.total)
  assert.equal(dctMappingOf('becf-00000'), undefined)
})
