import { randomBytes } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { AuthError, hashPassword, normalizeEmail, verifyPassword } from './auth.ts'
import { config } from './config.ts'
import { findCreditPackage } from './credits.ts'

const sql = postgres(config.databaseUrl, {
  max: 8,
  idle_timeout: 20,
  connect_timeout: 10,
})

export { sql }

export async function migrate(): Promise<void> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../sql')
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  for (const file of files) {
    await sql.file(join(dir, file))
  }
}

export interface UserRow {
  id: string
  email: string | null
  name: string | null
  plan: string
  credits: number
  password_hash: string | null
}

export interface SessionView {
  user: { id: string; email: string; name: string | null; plan: string } | null
  credits: number
  plan: string
  guest: boolean
}

export async function registerUser(input: { email: string; password: string; name?: string }): Promise<UserRow> {
  const email = normalizeEmail(input.email)
  const existing = await sql<UserRow[]>`SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1`
  if (existing[0]) throw new AuthError('Bu e-posta ile zaten bir hesap var', 409, 'email_taken')
  const rows = await sql<UserRow[]>`
    INSERT INTO users (email, name, password_hash, credits, plan)
    VALUES (${email}, ${input.name?.trim() || null}, ${hashPassword(input.password)}, ${config.signupCredits}, 'free')
    RETURNING id, email, name, plan, credits, password_hash
  `
  const user = rows[0]
  if (!user) throw new Error('Kayıt oluşturulamadı')
  await sql`
    INSERT INTO credit_ledger (user_id, delta, reason)
    VALUES (${user.id}, ${config.signupCredits}, 'signup_grant')
  `
  return user
}

export async function loginUser(email: string, password: string): Promise<UserRow> {
  const rows = await sql<UserRow[]>`
    SELECT id, email, name, plan, credits, password_hash
    FROM users
    WHERE lower(email) = ${normalizeEmail(email)}
    LIMIT 1
  `
  const user = rows[0]
  if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
    throw new AuthError('E-posta veya şifre hatalı', 401, 'invalid_credentials')
  }
  await sql`UPDATE users SET last_seen_at = now() WHERE id = ${user.id}`
  return user
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, email, name, plan, credits, password_hash FROM users WHERE id = ${id} LIMIT 1
  `
  return rows[0] ?? null
}

export async function ensureGuest(id: string): Promise<{ id: string; credits: number }> {
  const rows = await sql<{ id: string; credits: number }[]>`
    INSERT INTO guests (id, credits)
    VALUES (${id}, ${config.guestCredits})
    ON CONFLICT (id) DO UPDATE SET last_seen_at = now()
    RETURNING id, credits
  `
  const guest = rows[0]
  if (!guest) throw new Error('Misafir oturumu oluşturulamadı')
  return guest
}

export class CreditError extends Error {
  readonly status = 402 as const
  readonly credits: number
  readonly guest: boolean
  readonly code: 'credits_exhausted' | 'credits_exhausted_guest'

  constructor(credits: number, guest: boolean) {
    super(guest ? 'Deneme kredin bitti. Kayıt ol, 15 kredi hediye.' : 'Kredin bitti. Satın alma sayfasından kredi yükleyebilirsin.')
    this.name = 'CreditError'
    this.credits = credits
    this.guest = guest
    this.code = guest ? 'credits_exhausted_guest' : 'credits_exhausted'
  }
}

export async function consumeCredit(input: {
  userId?: string
  guestId?: string
  reason: string
}): Promise<{ credits: number; guest: boolean }> {
  if (input.userId) {
    const rows = await sql<{ credits: number }[]>`
      UPDATE users SET credits = credits - 1
      WHERE id = ${input.userId} AND credits > 0
      RETURNING credits
    `
    const row = rows[0]
    if (!row) {
      const current = await getUserById(input.userId)
      throw new CreditError(current?.credits ?? 0, false)
    }
    await sql`
      INSERT INTO credit_ledger (user_id, delta, reason) VALUES (${input.userId}, -1, ${input.reason})
    `
    return { credits: row.credits, guest: false }
  }
  if (input.guestId) {
    const rows = await sql<{ credits: number }[]>`
      UPDATE guests SET credits = credits - 1, last_seen_at = now()
      WHERE id = ${input.guestId} AND credits > 0
      RETURNING credits
    `
    const row = rows[0]
    if (!row) {
      const guest = await ensureGuest(input.guestId)
      throw new CreditError(guest.credits, true)
    }
    await sql`
      INSERT INTO credit_ledger (guest_id, delta, reason) VALUES (${input.guestId}, -1, ${input.reason})
    `
    return { credits: row.credits, guest: true }
  }
  throw new CreditError(0, true)
}

export async function sessionView(input: { userId?: string; guestId?: string }): Promise<SessionView> {
  if (input.userId) {
    const user = await getUserById(input.userId)
    if (user?.email) {
      return {
        user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
        credits: user.credits,
        plan: user.plan,
        guest: false,
      }
    }
  }
  if (input.guestId) {
    const guest = await ensureGuest(input.guestId)
    return { user: null, credits: guest.credits, plan: 'guest', guest: true }
  }
  return { user: null, credits: config.guestCredits, plan: 'guest', guest: true }
}

export async function absorbGuestCredits(userId: string, guestId: string): Promise<void> {
  await ensureGuest(guestId)
  await sql.begin(async (tx) => {
    const rows = await tx<{ credits: number }[]>`
      SELECT credits FROM guests WHERE id = ${guestId} FOR UPDATE
    `
    const credits = rows[0]?.credits ?? 0
    if (credits <= 0) return
    await tx`UPDATE guests SET credits = 0, last_seen_at = now() WHERE id = ${guestId}`
    await tx`UPDATE users SET credits = credits + ${credits} WHERE id = ${userId}`
    await tx`
      INSERT INTO credit_ledger (user_id, guest_id, delta, reason)
      VALUES (${userId}, ${guestId}, ${credits}, 'guest_absorb')
    `
  })
}

const jsonValue = (value: unknown) => sql.json(JSON.parse(JSON.stringify(value)) as never)

export async function saveDieline(input: {
  userId: string | null
  templateId: string
  params: unknown
  stats: unknown
}): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO dielines (user_id, template_id, params, stats)
    VALUES (${input.userId}, ${input.templateId}, ${jsonValue(input.params)}, ${jsonValue(input.stats)})
    RETURNING id
  `
  return rows[0]?.id ?? ''
}

export async function listFavorites(userId: string): Promise<string[]> {
  const rows = await sql<{ template_id: string }[]>`
    SELECT template_id FROM favorites WHERE user_id = ${userId} ORDER BY created_at DESC
  `
  return rows.map((r) => r.template_id)
}

export async function addFavorite(userId: string, templateId: string): Promise<void> {
  await sql`
    INSERT INTO favorites (user_id, template_id)
    VALUES (${userId}, ${templateId})
    ON CONFLICT (user_id, template_id) DO NOTHING
  `
}

export async function removeFavorite(userId: string, templateId: string): Promise<void> {
  await sql`DELETE FROM favorites WHERE user_id = ${userId} AND template_id = ${templateId}`
}

export interface DesignRow {
  id: string
  template_id: string
  name: string
  params: unknown
  print_transform: unknown
  finish_settings: unknown
  has_artwork: boolean
  created_at: Date
  updated_at: Date
}

const DESIGN_LIMIT = 40

const defaultFinishSettings = () => ({
  foil: { enabled: false, color: '#c9a227', intensity: 0.85 },
  emboss: { enabled: false, depth: 0.35 },
  varnish: { enabled: false, gloss: 0.7 },
})

export async function listDesigns(userId: string): Promise<DesignRow[]> {
  return sql<DesignRow[]>`
    SELECT id, template_id, name, params, print_transform, finish_settings,
           (artwork IS NOT NULL) AS has_artwork, created_at, updated_at
    FROM designs
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `
}

export async function getDesign(userId: string, id: string): Promise<DesignRow | null> {
  const rows = await sql<DesignRow[]>`
    SELECT id, template_id, name, params, print_transform, finish_settings,
           (artwork IS NOT NULL) AS has_artwork, created_at, updated_at
    FROM designs
    WHERE id = ${id} AND user_id = ${userId}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getDesignArtwork(
  userId: string,
  id: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const rows = await sql<{ artwork: Uint8Array | Buffer | null; artwork_mime: string | null }[]>`
    SELECT artwork, artwork_mime FROM designs WHERE id = ${id} AND user_id = ${userId} LIMIT 1
  `
  const row = rows[0]
  if (!row?.artwork) return null
  const bytes = row.artwork instanceof Uint8Array ? row.artwork : new Uint8Array(row.artwork)
  return { bytes, mime: row.artwork_mime || 'image/jpeg' }
}

export async function upsertDesign(input: {
  id?: string
  userId: string
  templateId: string
  name: string
  params: unknown
  printTransform: unknown
  finishSettings?: unknown
  artwork?: Uint8Array | null
  artworkMime?: string | null
  clearArtwork?: boolean
}): Promise<DesignRow> {
  const name = input.name.trim().slice(0, 80) || 'Kayıtlı kutu'
  const finishJson = input.finishSettings !== undefined ? jsonValue(input.finishSettings) : null
  if (input.id) {
    const existing = await getDesign(input.userId, input.id)
    if (!existing) throw new AuthError('Kayıt bulunamadı', 404, 'design_not_found')
    const finish = finishJson ?? jsonValue(existing.finish_settings ?? defaultFinishSettings())
    if (input.clearArtwork) {
      await sql`
        UPDATE designs
        SET name = ${name}, template_id = ${input.templateId}, params = ${jsonValue(input.params)},
            print_transform = ${jsonValue(input.printTransform)},
            finish_settings = ${finish},
            artwork = NULL, artwork_mime = NULL,
            updated_at = now()
        WHERE id = ${input.id} AND user_id = ${input.userId}
      `
    } else if (input.artwork) {
      await sql`
        UPDATE designs
        SET name = ${name}, template_id = ${input.templateId}, params = ${jsonValue(input.params)},
            print_transform = ${jsonValue(input.printTransform)},
            finish_settings = ${finish},
            artwork = ${input.artwork},
            artwork_mime = ${input.artworkMime ?? 'image/jpeg'}, updated_at = now()
        WHERE id = ${input.id} AND user_id = ${input.userId}
      `
    } else {
      await sql`
        UPDATE designs
        SET name = ${name}, template_id = ${input.templateId}, params = ${jsonValue(input.params)},
            print_transform = ${jsonValue(input.printTransform)},
            finish_settings = ${finish},
            updated_at = now()
        WHERE id = ${input.id} AND user_id = ${input.userId}
      `
    }
    const updated = await getDesign(input.userId, input.id)
    if (!updated) throw new Error('Kayıt güncellenemedi')
    return updated
  }
  const count = await sql<{ n: string | number }[]>`SELECT count(*)::int AS n FROM designs WHERE user_id = ${input.userId}`
  if (Number(count[0]?.n ?? 0) >= DESIGN_LIMIT) {
    throw new AuthError(`En fazla ${DESIGN_LIMIT} kayıt tutabilirsin. Eskilerden birini sil.`, 400, 'design_limit')
  }
  const rows = await sql<{ id: string }[]>`
    INSERT INTO designs (user_id, template_id, name, params, print_transform, finish_settings, artwork, artwork_mime)
    VALUES (
      ${input.userId}, ${input.templateId}, ${name}, ${jsonValue(input.params)},
      ${jsonValue(input.printTransform)}, ${jsonValue(input.finishSettings ?? defaultFinishSettings())},
      ${input.artwork ?? null}, ${input.artwork ? (input.artworkMime ?? 'image/jpeg') : null}
    )
    RETURNING id
  `
  const id = rows[0]?.id
  if (!id) throw new Error('Kayıt oluşturulamadı')
  const created = await getDesign(input.userId, id)
  if (!created) throw new Error('Kayıt oluşturulamadı')
  return created
}

export async function deleteDesign(userId: string, id: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM designs WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `
  return Boolean(rows[0])
}

export async function addCredits(userId: string, packageId: string): Promise<{ credits: number; packageId: string; granted: number }> {
  const pack = findCreditPackage(packageId)
  if (!pack) throw new AuthError('Paket bulunamadı', 400, 'package_not_found')
  const rows = await sql<{ credits: number }[]>`
    UPDATE users SET credits = credits + ${pack.credits} WHERE id = ${userId} RETURNING credits
  `
  const row = rows[0]
  if (!row) throw new AuthError('Oturum gerekli', 401, 'session_required')
  await sql`
    INSERT INTO credit_ledger (user_id, delta, reason)
    VALUES (${userId}, ${pack.credits}, ${`purchase_mock:${pack.id}`})
  `
  return { credits: row.credits, packageId: pack.id, granted: pack.credits }
}

export interface ApiKeyView {
  publicKey: string
  secretHint: string
  createdAt: Date
  lastUsedAt: Date | null
}

export interface ApiKeyCreated extends ApiKeyView {
  secretKey: string
}

const generateToken = (prefix: string, bytes: number): string => `${prefix}${randomBytes(bytes).toString('base64url')}`

export async function getActiveApiKey(userId: string): Promise<ApiKeyView | null> {
  const rows = await sql<
    { public_key: string | null; secret_hint: string | null; created_at: Date; last_used_at: Date | null }[]
  >`
    SELECT public_key, secret_hint, created_at, last_used_at
    FROM api_keys
    WHERE user_id = ${userId} AND revoked_at IS NULL AND public_key IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `
  const row = rows[0]
  if (!row?.public_key) return null
  return {
    publicKey: row.public_key,
    secretHint: row.secret_hint || '••••',
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

export async function rotateApiKey(userId: string): Promise<ApiKeyCreated> {
  const publicKey = generateToken('dk_', 18)
  const secretKey = generateToken('sk_', 24)
  const secretHint = `••••${secretKey.slice(-4)}`
  const secretHash = hashPassword(secretKey)
  const prefix = publicKey.slice(0, 12)
  await sql.begin(async (tx) => {
    await tx`UPDATE api_keys SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`
    await tx`
      INSERT INTO api_keys (user_id, name, prefix, hash, public_key, secret_hash, secret_hint)
      VALUES (${userId}, 'default', ${prefix}, ${secretHash}, ${publicKey}, ${secretHash}, ${secretHint})
    `
  })
  return {
    publicKey,
    secretKey,
    secretHint,
    createdAt: new Date(),
    lastUsedAt: null,
  }
}

export async function authenticateApiKey(publicKey: string, secretKey: string): Promise<string | null> {
  const key = publicKey.trim()
  const secret = secretKey.trim()
  if (!key || !secret) return null
  const rows = await sql<{ id: string; user_id: string; secret_hash: string | null; revoked_at: Date | null }[]>`
    SELECT id, user_id, secret_hash, revoked_at
    FROM api_keys
    WHERE public_key = ${key}
    ORDER BY created_at DESC
    LIMIT 1
  `
  const row = rows[0]
  if (!row?.secret_hash) return null
  if (row.revoked_at) throw new AuthError('Bu API anahtarı iptal edilmiş', 401, 'api_key_revoked')
  if (!verifyPassword(secret, row.secret_hash)) return null
  await sql`UPDATE api_keys SET last_used_at = now() WHERE id = ${row.id}`
  return row.user_id
}
