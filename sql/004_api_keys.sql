ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS public_key text;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS secret_hash text;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS secret_hint text;

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_public_key_active_idx
  ON api_keys (public_key)
  WHERE public_key IS NOT NULL AND revoked_at IS NULL;
