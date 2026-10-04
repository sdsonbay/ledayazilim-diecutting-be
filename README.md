# Leda Diecutting API

Parametrik bıçak izi motoru + REST API (Hono, Postgres). `api-diecutting.ledayazilim.com`

```bash
cp .env.example .env   # DATABASE_URL, AUTH_SECRET
npm ci
npm test
npm run dev            # :8080
```

Yerel Postgres yerine Netcup tüneli:

```bash
ssh -L 5432:127.0.0.1:5432 deploy@<netcup-host>
```

## Paketler

| Paket | İş |
|-------|----|
| `@diecut/core` | Geometri, path, doğrulama, tabaka yerleşimi (impose) |
| `@diecut/templates` | ECMA/FEFCO/DCT şablon kataloğu ve parametre şemaları |
| `@diecut/exporters` | SVG / PDF / DXF çıktı |
| `@diecut/importers` | SVG / DXF / PDF / raster içe aktarma |

## Uç noktalar (`/api/v1`)

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/health` | Probe |
| GET | `/session` | Misafir veya hesap oturumu + kredi |
| POST | `/auth/register` · `/auth/login` | JWT (HS256) |
| GET | `/templates` · `/templates/:id` · `/templates/:id/preview.svg` | Katalog (giriş gerekmez) |
| POST | `/dielines` | JSON + SVG önizleme |
| POST | `/dielines/impose` | Tabaka yerleşimi |
| POST | `/dielines/import` | Dosyadan bıçak izi (multipart `file`) |
| POST | `/dielines/export` | PDF / DXF / SVG — 1 kredi |
| GET/PUT/DELETE | `/favorites[/:templateId]` | Favoriler |
| GET/POST/DELETE | `/designs[/:id][/artwork]` | Kayıtlı tasarımlar |
| GET/POST | `/credits/packages` · `/credits/purchase` | Kredi (mock ödeme) |
| GET/POST | `/me` · `/me/keys` · `/me/keys/regenerate` | Hesap ve API anahtarı |

İstemci başlıkları: `Authorization: Bearer …`, `X-Diecut-Guest: <uuid>`, `Accept-Language: tr|en`,
veya API anahtarıyla `x-api-key` + `x-secret-key`.

## Ortam değişkenleri

| Değişken | Açıklama |
|----------|----------|
| `APP_ENV` | `local` / `dev` / `prod` — `local` dışında `AUTH_SECRET` zorunlu |
| `DATABASE_URL` | Postgres bağlantısı (secret) |
| `AUTH_SECRET` | JWT imza anahtarı (secret) |
| `PUBLIC_BASE_URL` | Ör. `https://api-diecutting.ledayazilim.com` — JWT `iss` olarak da kullanılır |
| `CORS_ORIGINS` | Virgülle ayrılmış web origin'leri |
| `GUEST_CREDITS` / `SIGNUP_CREDITS` | Başlangıç kredileri |

## CI/CD (GitHub Actions)

| Workflow | Tetik | İş |
|----------|-------|----|
| `CI` | PR | typecheck + test |
| `Deploy dev` | `main` push | test → `ghcr.io/sdsonbay/ledayazilim-diecutting-be:sha-xxxxxxx` → kube-objects `be/overlays/dev` → ArgoCD |
| `Deploy prod` | **Manuel** (`production` environment onayı) | Dev'de doğrulanan imajı `prod-xxxxxxx` olarak işaretler → `be/overlays/prod` |

Repo secret'ı: `KUBE_OBJECTS_TOKEN` — kube-objects reposuna `contents: write` yetkili fine-grained PAT.
