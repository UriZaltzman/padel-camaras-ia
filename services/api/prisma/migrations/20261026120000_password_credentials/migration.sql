-- Password login (#343): Argon2id credentials for owners, club staff and internal staff, and
-- single-use reset tokens. Both are person tables (no club_id): a credential belongs to a user, not
-- to a club. They are readable only by the owner of the row or by the API acting as `system`.
CREATE TABLE "user_credentials" (
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "pepper_version" INTEGER NOT NULL,
    "totp_secret_enc" TEXT,
    "totp_confirmed_at" TIMESTAMPTZ(3),
    "totp_last_step" BIGINT,
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_credentials_hash_is_argon2id" CHECK ("password_hash" LIKE '$argon2id$%'),
    CONSTRAINT "user_credentials_pepper_check" CHECK ("pepper_version" > 0)
);

CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_credentials" FORCE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_credentials" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "password_reset_tokens" TO app_runtime;

-- A user reads and changes their own credential; the API as `system` handles login and reset
-- before any user is known. Nobody else (not even internal support) can read a hash.
CREATE POLICY user_credentials_all ON "user_credentials" FOR ALL TO app_runtime
    USING (user_id = app_user_id() OR app_role() = 'system')
    WITH CHECK (user_id = app_user_id() OR app_role() = 'system');

-- Reset tokens are only ever touched by the API as `system`: a user never reads their own.
CREATE POLICY password_reset_tokens_system ON "password_reset_tokens" FOR ALL TO app_runtime
    USING (app_role() = 'system') WITH CHECK (app_role() = 'system');

CREATE TRIGGER user_credentials_immutable_keys BEFORE UPDATE ON "user_credentials"
    FOR EACH ROW EXECUTE FUNCTION forbid_key_change('user_id');
CREATE TRIGGER password_reset_tokens_immutable_keys BEFORE UPDATE ON "password_reset_tokens"
    FOR EACH ROW EXECUTE FUNCTION forbid_key_change('user_id');
