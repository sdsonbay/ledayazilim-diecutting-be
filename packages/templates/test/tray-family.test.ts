import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DCT_INVENTORY, TRAY_SPECS, generateDieline, resolveCatalog, trayTemplates } from '../src/index.ts'

test('her tepsi spec’i geçerli bir DCT kaydına bağlanır; id’ler benzersizdir', () => {
  const inventory = new Set(DCT_INVENTORY.map((e) => e.id))
  const seen = new Set<string>()
  for (const spec of TRAY_SPECS) {
    assert.ok(!seen.has(spec.id), `tekrar eden id: ${spec.id}`)
    seen.add(spec.id)
    for (const dct of spec.dct) assert.ok(inventory.has(dct), `${spec.id}: envanterde olmayan DCT kimliği ${dct}`)
    const entry = DCT_INVENTORY.find((e) => e.id === spec.dct[0])
    assert.equal(entry?.group, spec.category, `${spec.id}: kategori DCT grubuyla uyuşmalı`)
    assert.ok(spec.materials.includes(entry!.material), `${spec.id}: malzeme DCT dalıyla uyuşmalı`)
  }
})

test('tüm tepsi şablonları varsayılan ve küçük/büyük ölçülerle hatasız üretilir', () => {
  for (const t of trayTemplates) {
    for (const input of [{}, { length: 120, width: 80, height: 30 }, { length: 400, width: 300, height: 60, caliper: 3 }]) {
      const d = generateDieline(t.id, input)
      const errors = d.warnings.filter((w) => w.severity === 'error')
      assert.deepEqual(errors, [], `${t.id} ${JSON.stringify(input)}: ${errors.map((e) => e.code).join(',')}`)
      assert.ok(d.panels.length >= 5, `${t.id}: panel sayısı`)
      assert.ok(d.folds.length >= 4, `${t.id}: kat sayısı`)
      assert.equal(d.rootPanel, 'base')
    }
  }
})

test('varsayılan ölçülerde uyarı yok (yarıklar delik, çift kat duvar taban yarısını aşmaz)', () => {
  for (const t of trayTemplates) {
    const d = generateDieline(t.id)
    const codes = d.warnings.map((w) => w.code)
    assert.ok(!codes.includes('panel-too-small'), `${t.id}: ${codes.join(',')}`)
    assert.ok(!codes.includes('rollover-too-tall'), `${t.id}: ${codes.join(',')}`)
  }
})

test('çift kat duvar: iç duvar paneli ve kilit dili + taban yarığı üretilir', () => {
  const d = generateDieline('fefco-0425')
  const ids = d.panels.map((p) => p.id)
  assert.ok(ids.includes('left-inner') && ids.includes('right-inner'), ids.join(','))
  const slots = d.paths.filter((p) => p.layer === 'cut' && p.note?.includes('kilit yarığı'))
  assert.equal(slots.length, 4)
  const base = d.panels.find((p) => p.id === 'base')!
  const minX = Math.min(...base.outline.map((q) => q.x))
  const maxX = Math.max(...base.outline.map((q) => q.x))
  assert.ok(maxX - minX > Number(d.params.length) - 1, 'taban ana hattı yarıklardan etkilenmez')
  // iç duvarın yükseklik farkı: dış duvar H, iç duvar H - biraz
  const outer = d.panels.find((p) => p.id === 'left')!
  const inner = d.panels.find((p) => p.id === 'left-inner')!
  const h = (poly: typeof outer.outline) => Math.max(...poly.map((q) => q.x)) - Math.min(...poly.map((q) => q.x))
  assert.ok(h(inner.outline) < h(outer.outline), 'iç duvar dış duvardan alçak')
})

test('köşe kulakları: flap stilinde ayrı panel, gusset stilinde çapraz kırım', () => {
  const flap = generateDieline('fefco-0422')
  assert.ok(flap.panels.some((p) => p.id.startsWith('corner-')), 'corner panelleri')
  const gusset = generateDieline('ecma-b40-22')
  const diag = gusset.paths.filter((p) => {
    if (p.layer !== 'crease') return false
    const m = p.commands[0]
    const l = p.commands[1]
    if (!m || !l || m.c !== 'M' || l.c !== 'L') return false
    return Math.abs(Math.abs(l.x - m.x) - Math.abs(l.y - m.y)) < 0.01 && Math.abs(l.x - m.x) > 1
  })
  assert.ok(diag.length >= 4, `45° gusset kırımları: ${diag.length}`)
})

test('kapak stilleri: tuck kapakta dil + yarık, toz kanatlı kapakta dust panelleri', () => {
  const tuck = generateDieline('fefco-0426')
  assert.ok(tuck.panels.some((p) => p.id === 'lid-tuck'))
  assert.ok(tuck.paths.some((p) => p.note?.includes('kapak dili yarığı')))
  const dust = generateDieline('ecma-b20-01-53')
  assert.ok(dust.panels.filter((p) => p.id.startsWith('lid-dust')).length === 2)
  const plain = generateDieline('fefco-0400')
  assert.ok(plain.panels.some((p) => p.id === 'lid') && !plain.panels.some((p) => p.id === 'lid-tuck'))
})

test('DCT kimliğiyle tepsi çözümlenir', () => {
  assert.equal(resolveCatalog('becf-21a01').template.id, 'fefco-0422')
  assert.equal(resolveCatalog('becf-11a08').template.id, 'ecma-b15-06')
})
