export type Locale = 'tr' | 'en'

export const errorCatalog = {
  email_taken: { status: 409, tr: 'Bu e-posta ile zaten bir hesap var', en: 'An account with this email already exists' },
  invalid_credentials: { status: 401, tr: 'E-posta veya şifre hatalı', en: 'Email or password is incorrect' },
  invalid_email: { status: 400, tr: 'Geçerli bir e-posta girin', en: 'Enter a valid email address' },
  password_too_short: { status: 400, tr: 'Şifre en az 8 karakter olmalı', en: 'Password must be at least 8 characters' },
  name_too_long: { status: 400, tr: 'Ad çok uzun', en: 'Name is too long' },
  invalid_session: { status: 401, tr: 'Geçersiz oturum', en: 'Invalid session' },
  session_required: { status: 401, tr: 'Oturum gerekli', en: 'Sign in required' },
  register_failed: { status: 400, tr: 'Kayıt oluşturulamadı', en: 'Could not create the account' },
  guest_failed: { status: 400, tr: 'Misafir oturumu oluşturulamadı', en: 'Could not create a guest session' },
  credits_exhausted: {
    status: 402,
    tr: 'Kredin bitti. Satın alma sayfasından kredi yükleyebilirsin.',
    en: 'You are out of credits. Buy a pack on the credits page.',
  },
  credits_exhausted_guest: {
    status: 402,
    tr: 'Deneme kredin bitti. Kayıt ol, 15 kredi hediye.',
    en: 'Trial credits are gone. Sign up for 15 credits.',
  },
  template_id_required: { status: 400, tr: 'templateId gerekli', en: 'templateId is required' },
  file_required: { status: 400, tr: 'Dosya gerekli', en: 'A file is required' },
  file_too_large: { status: 400, tr: 'Dosya 8 MB üstü olamaz', en: 'File must be 8 MB or smaller' },
  format_invalid: { status: 400, tr: 'format svg, pdf veya dxf olmalı', en: 'format must be svg, pdf or dxf' },
  design_not_found: { status: 404, tr: 'Kayıt bulunamadı', en: 'Design not found' },
  artwork_missing: { status: 404, tr: 'Baskı görseli yok', en: 'No print artwork' },
  artwork_too_large: { status: 400, tr: 'Baskı görseli 4 MB üstü olamaz', en: 'Artwork must be 4 MB or smaller' },
  artwork_type: { status: 400, tr: 'Baskı görseli PNG, JPG veya WebP olmalı', en: 'Artwork must be PNG, JPG or WebP' },
  design_limit: { status: 400, tr: 'En fazla 40 kayıt tutabilirsin. Eskilerden birini sil.', en: 'You can keep at most 40 designs. Delete an older one.' },
  design_update_failed: { status: 400, tr: 'Kayıt güncellenemedi', en: 'Could not update the design' },
  package_not_found: { status: 400, tr: 'Paket bulunamadı', en: 'Package not found' },
  purchase_login_required: { status: 401, tr: 'Kredi almak için giriş yap', en: 'Sign in to buy credits' },
  invalid_api_key: { status: 401, tr: 'API anahtarı veya secret geçersiz', en: 'API key or secret is invalid' },
  api_key_incomplete: {
    status: 401,
    tr: 'x-api-key ve x-secret-key birlikte gönderilmeli',
    en: 'Send both x-api-key and x-secret-key headers',
  },
  api_key_revoked: { status: 401, tr: 'Bu API anahtarı iptal edilmiş', en: 'This API key has been revoked' },
  template_not_found: { status: 404, tr: 'Bilinmeyen şablon', en: 'Unknown template' },
  param: { status: 400, tr: 'Parametre geçersiz', en: 'Invalid parameter' },
  import_too_large: { status: 400, tr: 'Dosyanın içeriği çok büyük', en: 'The file content is too large' },
  import: { status: 400, tr: 'İçe aktarma başarısız', en: 'Import failed' },
  impose_invalid: { status: 400, tr: 'Tabaka ölçüleri veya kenar payları geçersiz', en: 'Sheet size or margins are invalid' },
  impose_does_not_fit: {
    status: 400,
    tr: 'Bu bıçak izi seçilen tabakaya sığmıyor',
    en: 'This blank does not fit the selected sheet',
  },
  impose_too_many: {
    status: 400,
    tr: 'Bu tabakaya çok fazla adet düşüyor; daha küçük bir tabaka seç',
    en: 'Too many copies for this sheet; pick a smaller sheet',
  },
  rate_limited: { status: 429, tr: 'Çok fazla istek. Biraz bekleyip tekrar dene.', en: 'Too many requests. Please wait a moment and try again.' },
  payload_too_large: { status: 413, tr: 'İstek çok büyük', en: 'Request is too large' },
  invalid_json: { status: 400, tr: 'İstek gövdesi geçerli JSON değil', en: 'Request body is not valid JSON' },
  payments_unavailable: {
    status: 503,
    tr: 'Kredi satın alma şu an kapalı. Yakında açılacak.',
    en: 'Buying credits is not available yet.',
  },
  password_too_long: { status: 400, tr: 'Şifre en fazla 200 karakter olabilir', en: 'Password must be at most 200 characters' },
  unexpected: { status: 400, tr: 'Beklenmeyen hata', en: 'Unexpected error' },
  request_failed: { status: 400, tr: 'İstek başarısız', en: 'Request failed' },
} as const

export type ErrorCode = keyof typeof errorCatalog

export const isErrorCode = (value: string): value is ErrorCode => value in errorCatalog

export const requestLocale = (header: string | undefined): Locale => {
  const raw = (header ?? '').toLowerCase()
  return raw.startsWith('tr') ? 'tr' : 'en'
}

export const localizeError = (code: string, locale: Locale, fallback?: string): string => {
  if (isErrorCode(code)) return errorCatalog[code][locale]
  return fallback || errorCatalog.unexpected[locale]
}
