import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Dieline } from '@diecut/core'
import { generateDieline, recognizeDieline } from '../src/index.ts'

/** Dışarıdan gelmiş gibi: model bilgisi yok, 90° döndürülmüş ve aynalanmış. */
const asForeign = (d: Dieline): Dieline => ({
  ...d,
  templateId: 'imported',
  panels: [],
  folds: [],
  paths: d.paths.map((p) => ({
    ...p,
    commands: p.commands.map((c) => ('x' in c ? { ...c, x: c.y, y: c.x } : c)) as typeof p.commands,
  })),
})

test('tanıma: döndürülmüş/aynalanmış ters kapaklı kutu şablonu ve ölçüleri bulunur', () => {
  const vars = { length: 87, width: 54, height: 132 }
  const match = recognizeDieline(asForeign(generateDieline('ecma-a20-20', vars)), 30_000)
  assert.ok(match, 'eşleşme yok')
  assert.equal(match.templateId, 'ecma-a20-20')
  assert.ok(match.exact, `tam eşleşme bekleniyordu (sapma ${match.deviation})`)
  for (const [k, v] of Object.entries(vars)) assert.ok(Math.abs((match.variables[k] as number) - v) <= 0.2, `${k}: ${match.variables[k]} ≠ ${v}`)
})

test('tanıma: oluklu FEFCO 0427 posta kutusu', () => {
  const vars = { length: 310, width: 220, height: 90 }
  const match = recognizeDieline(asForeign(generateDieline('fefco-0427', vars)), 30_000)
  assert.equal(match?.templateId, 'fefco-0427')
  for (const [k, v] of Object.entries(vars)) assert.ok(Math.abs((match!.variables[k] as number) - v) <= 0.2, `${k}`)
})
