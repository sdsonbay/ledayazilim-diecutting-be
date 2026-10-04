CREATE TABLE IF NOT EXISTS favorites (
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  template_id  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);

CREATE TABLE IF NOT EXISTS designs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  template_id      text NOT NULL,
  name             text NOT NULL,
  params           jsonb NOT NULL DEFAULT '{}'::jsonb,
  print_transform  jsonb NOT NULL DEFAULT '{"scale":1,"offsetX":0,"offsetY":0,"rotation":0}'::jsonb,
  artwork          bytea,
  artwork_mime     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS designs_user_updated_idx ON designs (user_id, updated_at DESC);
