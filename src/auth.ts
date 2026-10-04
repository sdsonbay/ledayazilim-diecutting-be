import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { config, jwtIssuer } from './config.ts'

const encoder = new TextEncoder()

export interface AuthUser {
  id: string
  email: string
  name: string | null
  plan: string
  credits: number
}

export class AuthError extends Error {
  readonly status: 400 | 401 | 404 | 409
  readonly code: string

  constructor(message: string, status: 400 | 401 | 404 | 409 = 400, code = 'auth') {
    super(message)
    this.name = 'AuthError'
    this.status = status
    this.code = code
  }
}

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32)
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export const verifyPassword = (password: string, stored: string): boolean => {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const actual = scryptSync(password, Buffer.from(salt, 'base64url'), 32)
  const expected = Buffer.from(hash, 'base64url')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export const signAccessToken = async (user: Pick<AuthUser, 'id' | 'email'>): Promise<string> =>
  new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(jwtIssuer)
    .setIssuedAt()
    .setExpirationTime(`${config.tokenTtlSeconds}s`)
    .sign(encoder.encode(config.authSecret))

export const verifyAccessToken = async (token: string): Promise<{ id: string; email?: string }> => {
  const { payload } = await jwtVerify(token, encoder.encode(config.authSecret), { issuer: jwtIssuer })
  const id = String(payload.sub ?? '')
  if (!id) throw new AuthError('Geçersiz oturum', 401, 'invalid_session')
  return { id, email: typeof payload.email === 'string' ? payload.email : undefined }
}

export const bearerToken = (header: string | undefined): string | null => {
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

export const validateCredentials = (email: string, password: string, name?: string): void => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('Geçerli bir e-posta girin', 400, 'invalid_email')
  if (password.length < 8) throw new AuthError('Şifre en az 8 karakter olmalı', 400, 'password_too_short')
  if (name !== undefined && name.trim().length > 80) throw new AuthError('Ad çok uzun', 400, 'name_too_long')
}

export const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
