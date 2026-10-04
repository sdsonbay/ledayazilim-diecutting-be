import {
  ParamError,
  UnknownTemplateError,
  catalogTree,
  dctCoverage,
  generateDieline,
  getTemplate,
  countTemplates,
  queryCatalog,
  resolveCatalog,
  toSummary,
  usedGroups,
  usedMaterials,
  withParamDefaults,
} from '@diecut/templates'
import { toDxf, toPdf, toSvg } from '@diecut/exporters'
import { ImportError, importDieline } from '@diecut/importers'
import { imposeDieline, ImposeError, parseImposeOptions, dielineFromPayload, SHEET_PRESETS, type Dieline } from '@diecut/core'
import { type Context, Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  AuthError,
  bearerToken,
  isUuid,
  signAccessToken,
  validateCredentials,
  verifyAccessToken,
} from './auth.ts'
import { config } from './config.ts'
import { CREDIT_PACKAGES } from './credits.ts'
import {
  absorbGuestCredits,
  addCredits,
  addFavorite,
  authenticateApiKey,
  consumeCredit,
  CreditError,
  deleteDesign,
  ensureGuest,
  getActiveApiKey,
  getDesign,
  getDesignArtwork,
  listDesigns,
  listFavorites,
  loginUser,
  registerUser,
  removeFavorite,
  rotateApiKey,
  saveDieline,
  sessionView,
  upsertDesign,
  type DesignRow,
} from './db.ts'
import { localizeError, requestLocale, type Locale } from './errors.ts'

type Variables = { userId: string | null; guestId: string | null }

export const app = new Hono<{ Variables: Variables }>()

app.use(
  '*',
  cors({
    origin: config.corsOrigins,
    allowHeaders: [
      'Authorization',
      'Content-Type',
      'X-Diecut-Guest',
      'X-Api-Key',
      'X-Secret-Key',
      'Accept-Language',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Disposition', 'X-Diecut-Credits'],
  }),
)

app.use('*', async (c, next) => {
  const token = bearerToken(c.req.header('Authorization'))
  const guestHeader = c.req.header('X-Diecut-Guest') ?? ''
  const apiKey = (c.req.header('x-api-key') ?? '').trim()
  const secretKey = (c.req.header('x-secret-key') ?? '').trim()
  c.set('userId', null)
  c.set('guestId', isUuid(guestHeader) ? guestHeader : null)

  if (token) {
    try {
      const payload = await verifyAccessToken(token)
      c.set('userId', payload.id)
    } catch {
      c.set('userId', null)
    }
    return next()
  }

  if (apiKey || secretKey) {
    if (!apiKey || !secretKey) {
      return jsonError(c, 'api_key_incomplete', 401)
    }
    try {
      const userId = await authenticateApiKey(apiKey, secretKey)
      if (!userId) return jsonError(c, 'invalid_api_key', 401)
      c.set('userId', userId)
      c.set('guestId', null)
    } catch (error) {
      return handleError(c, error)
    }
  }

  return next()
})

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/api/v1/session', async (c) => {
  const guestId = c.get('guestId')
  if (guestId) await ensureGuest(guestId)
  return c.json(await sessionView({ userId: c.get('userId') ?? undefined, guestId: guestId ?? undefined }))
})

app.post('/api/v1/auth/register', async (c) => {
  try {
    const body = await c.req.json<{ email?: string; password?: string; name?: string }>()
    const email = body.email ?? ''
    const password = body.password ?? ''
    validateCredentials(email, password, body.name)
    const user = await registerUser({ email, password, name: body.name })
    const guestId = c.get('guestId')
    if (guestId) await absorbGuestCredits(user.id, guestId)
    const token = await signAccessToken({ id: user.id, email: user.email ?? email })
    return c.json({
      token,
      session: await sessionView({ userId: user.id }),
    })
  } catch (error) {
    return handleError(c, error)
  }
})

app.post('/api/v1/auth/login', async (c) => {
  try {
    const body = await c.req.json<{ email?: string; password?: string }>()
    const email = body.email ?? ''
    const password = body.password ?? ''
    validateCredentials(email, password)
    const user = await loginUser(email, password)
    const token = await signAccessToken({ id: user.id, email: user.email ?? email })
    return c.json({
      token,
      session: await sessionView({ userId: user.id }),
    })
  } catch (error) {
    return handleError(c, error)
  }
})

app.get('/api/v1/templates', (c) => {
  const category = c.req.query('category')
  const material = c.req.query('material')
  const query = c.req.query('q') ?? c.req.query('query')
  const idsRaw = c.req.query('ids')
  const ids = idsRaw ? idsRaw.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 200) : undefined
  const page = Math.max(1, Number(c.req.query('page') || 1) || 1)
  const limit = Math.min(96, Math.max(1, Number(c.req.query('limit') || 48) || 48))
  const filter = {
    ...(category ? { category: category as never } : {}),
    ...(material ? { material: material as never } : {}),
    ...(query ? { query } : {}),
    ...(ids && ids.length > 0 ? { ids } : {}),
  }
  const result = queryCatalog(filter, page, limit)
  const catalogTotal = ids && ids.length > 0 ? result.total : countTemplates({ ...(query ? { query } : {}) })
  const facets = {
    ...(material ? { material: material as never } : {}),
    ...(query ? { query } : {}),
  }
  return c.json({
    items: result.items,
    total: result.total,
    catalogTotal,
    page: result.page,
    limit: result.limit,
    pageCount: result.pageCount,
    categories: usedGroups(facets),
    materials: usedMaterials(query ? { query } : {}),
    tree: catalogTree(query ? { query } : {}),
  })
})

/** Önizleme SVG önbelleği — 37k kart × 2 tema sınırsız büyümesin (LRU). */
const PREVIEW_CACHE_MAX = 6000
const previewCache = new Map<string, string>()
const rememberPreview = (key: string, svg: string) => {
  if (previewCache.size >= PREVIEW_CACHE_MAX) {
    const oldest = previewCache.keys().next().value
    if (oldest !== undefined) previewCache.delete(oldest)
  }
  previewCache.set(key, svg)
}

app.get('/api/v1/templates/:id/preview.svg', (c) => {
  try {
    const id = c.req.param('id')
    const theme = c.req.query('theme') === 'light' ? 'light' : 'dark'
    const cacheKey = `${id}:${theme}`
    let svg = previewCache.get(cacheKey)
    if (svg) {
      previewCache.delete(cacheKey)
      previewCache.set(cacheKey, svg)
    } else {
      const dieline = generateDieline(id)
      svg = toSvg(dieline, {
        preview: true,
        previewTheme: theme,
        includeGuides: false,
        showPanelLabels: false,
      })
      rememberPreview(cacheKey, svg)
    }
    return new Response(svg, {
      status: 200,
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    return handleError(c, error)
  }
})

app.get('/api/v1/templates/:id', (c) => {
  try {
    const listing = resolveCatalog(c.req.param('id'))
    const template = listing.template
    return c.json({
      ...toSummary(listing),
      params: withParamDefaults(template.params, listing.params),
    })
  } catch (error) {
    return handleError(c, error)
  }
})

/** diecuttemplates.com envanterine göre kapsam — grup grup eksik kimlikler. */
app.get('/api/v1/catalog/dct-coverage', (c) => c.json(dctCoverage()))

app.post('/api/v1/dielines', async (c) => {
  try {
    const body = await c.req.json<{
      templateId?: string
      variables?: Record<string, unknown>
      persist?: boolean
    }>()
    const templateId = body.templateId
    if (!templateId) return jsonError(c, 'template_id_required')
    const dieline = generateDieline(templateId, body.variables ?? {})
    const userId = c.get('userId')
    let id: string | undefined
    if (body.persist && userId) {
      id = await saveDieline({
        userId,
        templateId,
        params: dieline.params,
        stats: dieline.stats,
      })
    }
    return c.json(dielineJson(dieline, id, localeOf(c)))
  } catch (error) {
    return handleError(c, error)
  }
})

app.post('/api/v1/dielines/impose', async (c) => {
  try {
    const body = await c.req.json<{
      templateId?: string
      variables?: Record<string, unknown>
      dieline?: unknown
      impose?: Record<string, unknown>
      theme?: string
    }>()
    const source = resolveDielineSource(body)
    const options = parseImposeOptions(body.impose ?? {})
    const result = imposeDieline(source, options)
    const theme = body.theme === 'light' ? 'light' : 'dark'
    return c.json({
      layout: result.layout,
      presets: SHEET_PRESETS,
      svg: toSvg(result.dieline, {
        preview: true,
        previewTheme: theme,
        includeGuides: true,
        showPanelLabels: false,
        locale: localeOf(c),
        callouts: options.dimensionLines ? result.callouts : [],
        background: theme === 'light' ? '#ffffff' : '#0b0b0b',
        previewStrokeMm: 0.55,
        embedModel: false,
      }),
    })
  } catch (error) {
    return handleError(c, error)
  }
})

app.post('/api/v1/dielines/import', async (c) => {
  try {
    const form = await c.req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return jsonError(c, 'file_required')
    if (file.size > 8 * 1024 * 1024) return jsonError(c, 'file_too_large')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const dieline = importDieline(bytes, file.name || 'import.svg')
    return c.json(dielineJson(dieline, undefined, localeOf(c)))
  } catch (error) {
    return handleError(c, error)
  }
})

app.post('/api/v1/dielines/export', async (c) => {
  try {
    const body = await c.req.json<{
      templateId?: string
      variables?: Record<string, unknown>
      dieline?: unknown
      format?: string
      impose?: Record<string, unknown>
    }>()
    const format = (body.format ?? 'pdf').toLowerCase()
    const userId = c.get('userId')
    const guestId = c.get('guestId')
    if (!userId && !guestId) {
      return jsonError(c, 'session_required', 400)
    }
    if (!userId && guestId) await ensureGuest(guestId)
    const spent = await consumeCredit({
      userId: userId ?? undefined,
      guestId: userId ? undefined : guestId ?? undefined,
      reason: `export:${format}`,
    })
    const source = resolveDielineSource(body)
    const imposed = body.impose ? imposeDieline(source, parseImposeOptions(body.impose)) : null
    const dieline = imposed?.dieline ?? source
    const stamp = imposed
      ? `${source.templateId}-${imposed.layout.cols}x${imposed.layout.rows}-${Math.round(imposed.layout.sheet.width)}x${Math.round(imposed.layout.sheet.height)}`
      : `${source.templateId}-${Math.round(dieline.bounds.width)}x${Math.round(dieline.bounds.height)}`
    const headers: Record<string, string> = {
      'x-diecut-credits': String(spent.credits),
    }

    if (format === 'svg') {
      return new Response(
        toSvg(dieline, {
          includeGuides: true,
          showPanelLabels: !imposed,
          locale: localeOf(c),
          callouts: imposed?.callouts,
          embedModel: imposed ? false : undefined,
        }),
        {
          headers: {
            ...headers,
            'content-type': 'image/svg+xml; charset=utf-8',
            'content-disposition': `attachment; filename="${stamp}.svg"`,
          },
        },
      )
    }
    if (format === 'dxf') {
      return new Response(toDxf(dieline), {
        headers: {
          ...headers,
          'content-type': 'application/dxf',
          'content-disposition': `attachment; filename="${stamp}.dxf"`,
        },
      })
    }
    if (format === 'pdf') {
      const bytes = toPdf(dieline, { producedBy: 'Leda Diecutting' })
      return new Response(Buffer.from(bytes), {
        headers: {
          ...headers,
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${stamp}.pdf"`,
        },
      })
    }
    return jsonError(c, 'format_invalid')
  } catch (error) {
    return handleError(c, error)
  }
})

app.get('/api/v1/me', async (c) => {
  try {
    const userId = requireUser(c)
    return c.json(await sessionView({ userId }))
  } catch (error) {
    return handleError(c, error)
  }
})

app.get('/api/v1/credits/packages', (c) => c.json({ items: CREDIT_PACKAGES, provider: 'mock' }))

app.post('/api/v1/credits/purchase', async (c) => {
  try {
    const userId = requireUser(c)
    const body = await c.req.json<{ packageId?: string }>().catch(() => ({ packageId: '' }))
    const result = await addCredits(userId, String(body.packageId ?? ''))
    return c.json({
      ...result,
      session: await sessionView({ userId }),
    })
  } catch (error) {
    return handleError(c, error)
  }
})

app.get('/api/v1/me/keys', async (c) => {
  try {
    const userId = requireUser(c)
    const key = await getActiveApiKey(userId)
    return c.json({ key })
  } catch (error) {
    return handleError(c, error)
  }
})

app.post('/api/v1/me/keys/regenerate', async (c) => {
  try {
    const userId = requireUser(c)
    const created = await rotateApiKey(userId)
    return c.json({
      publicKey: created.publicKey,
      secretKey: created.secretKey,
      secretHint: created.secretHint,
      createdAt: created.createdAt,
      lastUsedAt: created.lastUsedAt,
    })
  } catch (error) {
    return handleError(c, error)
  }
})

app.get('/api/v1/favorites', async (c) => {
  try {
    const userId = requireUser(c)
    return c.json({ items: await listFavorites(userId) })
  } catch (error) {
    return handleError(c, error)
  }
})

app.put('/api/v1/favorites/:templateId', async (c) => {
  try {
    const userId = requireUser(c)
    const templateId = c.req.param('templateId')
    getTemplate(templateId)
    await addFavorite(userId, templateId)
    return c.json({ items: await listFavorites(userId) })
  } catch (error) {
    return handleError(c, error)
  }
})

app.delete('/api/v1/favorites/:templateId', async (c) => {
  try {
    const userId = requireUser(c)
    await removeFavorite(userId, c.req.param('templateId'))
    return c.json({ items: await listFavorites(userId) })
  } catch (error) {
    return handleError(c, error)
  }
})

app.get('/api/v1/designs', async (c) => {
  try {
    const userId = requireUser(c)
    const items = await listDesigns(userId)
    return c.json({ items: items.map(designJson) })
  } catch (error) {
    return handleError(c, error)
  }
})

app.post('/api/v1/designs', async (c) => {
  try {
    const userId = requireUser(c)
    const form = await c.req.formData()
    const templateId = String(form.get('templateId') ?? '').trim()
    if (!templateId) return jsonError(c, 'template_id_required')
    getTemplate(templateId)
    const idRaw = String(form.get('id') ?? '').trim()
    const artwork = await readArtwork(form.get('artwork'))
    const row = await upsertDesign({
      id: idRaw && isUuid(idRaw) ? idRaw : undefined,
      userId,
      templateId,
      name: String(form.get('name') ?? ''),
      params: parseJsonObject(String(form.get('params') ?? '{}')),
      printTransform: parsePrintTransform(parseJsonObject(String(form.get('printTransform') ?? '{}'))),
      finishSettings: parseFinishSettings(parseJsonObject(String(form.get('finishSettings') ?? '{}'))),
      artwork: artwork?.bytes,
      artworkMime: artwork?.mime,
      clearArtwork: String(form.get('clearArtwork') ?? '') === '1',
    })
    return c.json(designJson(row))
  } catch (error) {
    return handleError(c, error)
  }
})

app.get('/api/v1/designs/:id', async (c) => {
  try {
    const userId = requireUser(c)
    const id = c.req.param('id')
    if (!isUuid(id)) throw new AuthError('Kayıt bulunamadı', 404, 'design_not_found')
    const row = await getDesign(userId, id)
    if (!row) throw new AuthError('Kayıt bulunamadı', 404, 'design_not_found')
    return c.json(designJson(row))
  } catch (error) {
    return handleError(c, error)
  }
})

app.get('/api/v1/designs/:id/artwork', async (c) => {
  try {
    const userId = requireUser(c)
    const id = c.req.param('id')
    if (!isUuid(id)) throw new AuthError('Kayıt bulunamadı', 404, 'design_not_found')
    const art = await getDesignArtwork(userId, id)
    if (!art) throw new AuthError('Baskı görseli yok', 404, 'artwork_missing')
    return new Response(Buffer.from(art.bytes), {
      headers: {
        'content-type': art.mime,
        'cache-control': 'private, max-age=120',
      },
    })
  } catch (error) {
    return handleError(c, error)
  }
})

app.delete('/api/v1/designs/:id', async (c) => {
  try {
    const userId = requireUser(c)
    const id = c.req.param('id')
    if (!isUuid(id)) throw new AuthError('Kayıt bulunamadı', 404, 'design_not_found')
    const ok = await deleteDesign(userId, id)
    if (!ok) throw new AuthError('Kayıt bulunamadı', 404, 'design_not_found')
    return c.json({ ok: true })
  } catch (error) {
    return handleError(c, error)
  }
})

const ARTWORK_MAX = 4 * 1024 * 1024
const ARTWORK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function localeOf(c: Context): Locale {
  return requestLocale(c.req.header('Accept-Language'))
}

function jsonError(c: Context, code: string, status?: number, extra?: Record<string, unknown>): Response {
  const locale = localeOf(c)
  return c.json({ error: localizeError(code, locale), code, ...extra }, (status ?? 400) as 400 | 401 | 404)
}

function requireUser(c: Context): string {
  const userId = c.get('userId')
  if (!userId) throw new AuthError('Oturum gerekli', 401, 'session_required')
  return userId
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {
    /* ignore */
  }
  return {}
}

function resolveDielineSource(body: {
  templateId?: string
  variables?: Record<string, unknown>
  dieline?: unknown
}): Dieline {
  if (body.templateId) {
    try {
      return generateDieline(body.templateId, body.variables ?? {})
    } catch (error) {
      if (body.dieline) return dielineFromPayload(body.dieline)
      throw error
    }
  }
  if (body.dieline) return dielineFromPayload(body.dieline)
  throw new ImposeError('template_id_required', 'templateId veya dieline gerekli')
}

function parsePrintTransform(raw: Record<string, unknown>): {
  scale: number
  offsetX: number
  offsetY: number
  rotation: number
} {
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return {
    scale: Math.min(2.5, Math.max(0.4, num(raw.scale, 1))),
    offsetX: num(raw.offsetX, 0),
    offsetY: num(raw.offsetY, 0),
    rotation: num(raw.rotation, 0),
  }
}

function parseFinishSettings(raw: Record<string, unknown>): {
  foil: { enabled: boolean; color: string; intensity: number }
  emboss: { enabled: boolean; depth: number }
  varnish: { enabled: boolean; gloss: number }
} {
  const bool = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : fallback)
  const num = (value: unknown, fallback: number, min: number, max: number) => {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
    return Math.min(max, Math.max(min, n))
  }
  const str = (value: unknown, fallback: string) => (typeof value === 'string' && value ? value : fallback)
  const foilRaw = raw.foil && typeof raw.foil === 'object' ? (raw.foil as Record<string, unknown>) : {}
  const embossRaw = raw.emboss && typeof raw.emboss === 'object' ? (raw.emboss as Record<string, unknown>) : {}
  const varnishRaw = raw.varnish && typeof raw.varnish === 'object' ? (raw.varnish as Record<string, unknown>) : {}
  return {
    foil: {
      enabled: bool(foilRaw.enabled),
      color: str(foilRaw.color, '#c9a227'),
      intensity: num(foilRaw.intensity, 0.85, 0, 1),
    },
    emboss: {
      enabled: bool(embossRaw.enabled),
      depth: num(embossRaw.depth, 0.35, 0, 1),
    },
    varnish: {
      enabled: bool(varnishRaw.enabled),
      gloss: num(varnishRaw.gloss, 0.7, 0, 1),
    },
  }
}

async function readArtwork(
  value: unknown,
): Promise<{ bytes: Uint8Array; mime: string } | undefined> {
  if (!(value instanceof File) || value.size === 0) return undefined
  if (value.size > ARTWORK_MAX) throw new AuthError('Baskı görseli 4 MB üstü olamaz', 400, 'artwork_too_large')
  const mime = value.type === 'image/jpg' ? 'image/jpeg' : value.type
  if (!ARTWORK_TYPES.has(mime)) throw new AuthError('Baskı görseli PNG, JPG veya WebP olmalı', 400, 'artwork_type')
  return { bytes: new Uint8Array(await value.arrayBuffer()), mime }
}

function designJson(row: DesignRow) {
  const params = row.params && typeof row.params === 'object' ? row.params : {}
  const transform =
    row.print_transform && typeof row.print_transform === 'object'
      ? (row.print_transform as Record<string, unknown>)
      : {}
  const finishRaw =
    row.finish_settings && typeof row.finish_settings === 'object'
      ? (row.finish_settings as Record<string, unknown>)
      : {}
  return {
    id: row.id,
    templateId: row.template_id,
    name: row.name,
    params,
    printTransform: parsePrintTransform(transform),
    finishSettings: parseFinishSettings(finishRaw),
    hasArtwork: Boolean(row.has_artwork),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function dielineJson(dieline: Dieline, id?: string, locale: Locale = 'tr') {
  return {
    id,
    templateId: dieline.templateId,
    unit: dieline.unit,
    params: dieline.params,
    meta: dieline.meta,
    bounds: dieline.bounds,
    stats: dieline.stats,
    warnings: dieline.warnings,
    panels: dieline.panels,
    folds: dieline.folds,
    rootPanel: dieline.rootPanel,
    paths: dieline.paths,
    svg: toSvg(dieline, { includeGuides: false, showPanelLabels: false, locale }),
  }
}

function handleError(c: Context, error: unknown): Response {
  const locale = localeOf(c)
  if (error instanceof AuthError) {
    return c.json({ error: localizeError(error.code, locale, error.message), code: error.code }, error.status)
  }
  if (error instanceof CreditError) {
    return c.json(
      {
        error: localizeError(error.code, locale, error.message),
        code: error.code,
        credits: error.credits,
        guest: error.guest,
      },
      402,
    )
  }
  if (error instanceof UnknownTemplateError) {
    return c.json({ error: localizeError('template_not_found', locale, error.message), code: 'template_not_found' }, 404)
  }
  if (error instanceof ImportError) {
    return c.json({ error: localizeError(error.code, locale, error.message), code: error.code }, 400)
  }
  if (error instanceof ParamError) {
    return c.json(
      { error: localizeError('param', locale, error.message), code: 'param', key: error.key },
      400,
    )
  }
  if (error instanceof ImposeError) {
    return c.json({ error: localizeError(error.code, locale, error.message), code: error.code }, 400)
  }
  const message = error instanceof Error ? error.message : localizeError('unexpected', locale)
  return c.json({ error: message, code: 'unexpected' }, 400)
}
