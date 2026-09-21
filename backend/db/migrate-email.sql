-- Idempotent migration for an existing Iteration-0/old SMS database.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE users ALTER COLUMN mobile DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (email) WHERE email IS NOT NULL;

ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE otp_codes ALTER COLUMN mobile DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_email_created ON otp_codes (email, created_at DESC);
