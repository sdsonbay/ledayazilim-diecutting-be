import type { Context } from 'hono'

/**
 * Bellek içi sabit pencereli hız sınırlayıcı (pod başına).
 * Kaba kuvvet giriş denemelerini, misafir kredisi istismarını ve ağır hesaplama
 * uçlarının boğulmasını engeller. Birden çok replikada sınır replika sayısıyla çarpılır.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()
  private lastSweep = 0

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** İzin verildiyse 0, verilmediyse saniye cinsinden bekleme süresi. */
  take(key: string, now = Date.now()): number {
    this.sweep(now)
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return 0
    }
    if (entry.count >= this.limit) return Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    entry.count += 1
    return 0
  }

  /** Başarılı girişten sonra sayaç sıfırlanır. */
  reset(key: string): void {
    this.hits.delete(key)
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs && this.hits.size < 50_000) return
    this.lastSweep = now
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key)
  }
}

/**
 * İstemci IP'si. Traefik dışarıdan gelen X-Forwarded-For'u güvenmeyip istemci IP'siyle
 * yeniden yazar; web'deki nginx vekili kendi adresini sona ekler. Bu yüzden ilk değer
 * gerçek istemcidir. Başlık yoksa (yerel geliştirme) soket adresi kullanılır.
 */
export const clientIp = (c: Context): string => {
  const forwarded = c.req.header('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first.slice(0, 64)
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? 'unknown'
}

export const limiters = {
  /** Giriş / kayıt denemesi: IP başına dakikada 10. */
  auth: new RateLimiter(10, 60_000),
  /** Aynı e-postaya 15 dakikada 10 yanlış şifre. */
  loginEmail: new RateLimiter(10, 15 * 60_000),
  /** Misafir indirmesi: IP başına saatte 10 (her yeni misafir kimliği 3 kredi getirir). */
  guestExport: new RateLimiter(10, 60 * 60_000),
  /** Ağır hesaplama (tabaka, içe aktarma, indirme): IP başına dakikada 60. */
  heavy: new RateLimiter(60, 60_000),
  /** Bıçak izi üretimi (editörde her değişiklikte çağrılır): IP başına dakikada 240. */
  generate: new RateLimiter(240, 60_000),
}
