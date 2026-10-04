ALTER TABLE designs ADD COLUMN IF NOT EXISTS finish_settings jsonb
  NOT NULL DEFAULT '{"foil":{"enabled":false,"color":"#c9a227","intensity":0.85},"emboss":{"enabled":false,"depth":0.35},"varnish":{"enabled":false,"gloss":0.7}}'::jsonb;
