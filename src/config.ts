const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Eksik ortam değişkeni: ${name}`)
  return value
}

export const config = {
  env: process.env.APP_ENV ?? 'local',
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: required('DATABASE_URL', 'postgres://diecutting:diecutting@127.0.0.1:5432/diecutting_dev'),
  authSecret: required('AUTH_SECRET', 'dev-only-change-me-diecutting-auth-secret-32b'),
  publicBaseUrl: required('PUBLIC_BASE_URL', 'http://localhost:8080').replace(/\/$/, ''),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://localhost:19006,https://diecutting.ledayazilim.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  guestCredits: Number(process.env.GUEST_CREDITS ?? 3),
  signupCredits: Number(process.env.SIGNUP_CREDITS ?? 15),
  tokenTtlSeconds: Number(process.env.AUTH_TOKEN_TTL ?? 60 * 60 * 24 * 7),
}

/** JWT `iss` — ortam başına ayrı, dev token'ı prod'da geçmesin. */
export const jwtIssuer = process.env.JWT_ISSUER ?? config.publicBaseUrl
