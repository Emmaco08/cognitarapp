-- CogniTara Cloud (cognitara-cloud) — Authoritative Neon Serverless Postgres DDL
-- 12 core commercial & licensing tables + cloud_sessions for web & desktop online auth

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. HQ Users (School Owners, Affiliates, HQ Super Admins)
CREATE TABLE IF NOT EXISTS users_hq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'school_owner' CHECK (role IN ('school_owner', 'affiliate', 'hq_admin', 'hq_super_admin')),
    email_verified_at TIMESTAMPTZ,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Registered Customer Schools
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE RESTRICT,
    school_name TEXT NOT NULL,
    country_code CHAR(2) NOT NULL DEFAULT 'NG',
    state_region TEXT,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    referral_code_used TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
    ban_reason TEXT,
    banned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schools_owner ON schools(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);

-- 3. Commercial Plans & Configurable Referral Policies
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE CHECK (slug IN ('monthly', 'annual', 'lifetime')),
    display_name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual', 'lifetime')),
    duration_days INTEGER,
    lease_days INTEGER NOT NULL DEFAULT 30,
    price_ngn_kobo BIGINT NOT NULL CHECK (price_ngn_kobo > 0),
    price_usd_cents BIGINT NOT NULL CHECK (price_usd_cents > 0),
    default_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00 CHECK (default_commission_pct >= 0 AND default_commission_pct <= 60),
    default_bonus_days INTEGER NOT NULL DEFAULT 14 CHECK (default_bonus_days >= 0),
    features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Paystack Subscriptions & One-Time Payments
CREATE TABLE IF NOT EXISTS subscriptions_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    paystack_reference TEXT NOT NULL UNIQUE,
    paystack_transaction_id BIGINT UNIQUE,
    paystack_customer_code TEXT,
    paystack_authorization_sig TEXT,
    currency CHAR(3) NOT NULL CHECK (currency IN ('NGN', 'USD')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    status TEXT NOT NULL DEFAULT 'initialized' CHECK (status IN ('initialized', 'success', 'failed', 'refunded', 'disputed')),
    webhook_event_id TEXT UNIQUE,
    raw_webhook_payload JSONB,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sub_pay_school ON subscriptions_payments(school_id, created_at DESC);

-- 5. Ed25519 Licenses
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT NOT NULL UNIQUE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    latest_payment_id UUID REFERENCES subscriptions_payments(id) ON DELETE SET NULL,
    plan_tier TEXT NOT NULL CHECK (plan_tier IN ('monthly', 'annual', 'lifetime')),
    status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'active', 'expired', 'revoked', 'suspended')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    bonus_days_total INTEGER NOT NULL DEFAULT 0,
    lease_seconds INTEGER NOT NULL DEFAULT 2592000,
    max_activations INTEGER NOT NULL DEFAULT 1,
    signed_lease_json JSONB NOT NULL,
    ed25519_sig TEXT NOT NULL,
    revocation_tombstone_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_licenses_school ON licenses(school_id, status);

-- 6. Hardware Activations (1-to-1 HWID Binding + HQ HWID Reset Audit)
CREATE TABLE IF NOT EXISTS license_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    hwid_hash CHAR(64) NOT NULL,
    display_hwid TEXT NOT NULL,
    machine_hostname TEXT,
    os_version TEXT,
    hw_components_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,
    deactivated_by UUID REFERENCES users_hq(id),
    deactivation_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_license_hwid ON license_activations(license_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_activations_hwid ON license_activations(hwid_hash);

-- 7. Desktop Telemetry & Anti-Tamper Heartbeats
CREATE TABLE IF NOT EXISTS license_heartbeats (
    id BIGSERIAL PRIMARY KEY,
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    activation_id UUID REFERENCES license_activations(id) ON DELETE SET NULL,
    hwid_hash CHAR(64) NOT NULL,
    app_version TEXT NOT NULL,
    client_utc TIMESTAMPTZ NOT NULL,
    server_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_seconds BIGINT NOT NULL DEFAULT 0,
    lock_state TEXT NOT NULL,
    tamper_strikes INTEGER NOT NULL DEFAULT 0,
    active_exams_count INTEGER NOT NULL DEFAULT 0,
    approved_students_count INTEGER NOT NULL DEFAULT 0,
    client_ip INET
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_license_time ON license_heartbeats(license_id, server_utc DESC);

-- 8. Referral Codes & Dual-Mode Partner Configuration
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    referral_code TEXT NOT NULL UNIQUE,
    reward_mode TEXT NOT NULL DEFAULT 'dual' CHECK (reward_mode IN ('cash_commission', 'bonus_days', 'dual')),
    custom_commission_pct NUMERIC(5,2) CHECK (custom_commission_pct >= 0 AND custom_commission_pct <= 60),
    custom_bonus_days INTEGER CHECK (custom_bonus_days >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Referral Conversions (Idempotent per Payment)
CREATE TABLE IF NOT EXISTS referral_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE RESTRICT,
    referrer_user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE RESTRICT,
    referred_school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL UNIQUE REFERENCES subscriptions_payments(id) ON DELETE CASCADE,
    applied_reward_mode TEXT NOT NULL CHECK (applied_reward_mode IN ('cash_commission', 'bonus_days', 'dual')),
    commission_pct_applied NUMERIC(5,2) NOT NULL DEFAULT 0,
    commission_amount_kobo BIGINT NOT NULL DEFAULT 0,
    bonus_days_granted_referrer INTEGER NOT NULL DEFAULT 0,
    bonus_days_granted_referee INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'credited' CHECK (status IN ('pending', 'credited', 'reversed_fraud')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_conv_referrer ON referral_conversions(referrer_user_id, created_at DESC);

-- 10. Immutable Cash Commission Wallet Ledger
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE RESTRICT,
    conversion_id UUID REFERENCES referral_conversions(id) ON DELETE SET NULL,
    payout_request_id UUID,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('commission_credit', 'payout_hold', 'payout_release', 'payout_settled', 'reversal')),
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    amount_minor BIGINT NOT NULL,
    balance_after_minor BIGINT NOT NULL CHECK (balance_after_minor >= 0),
    idempotency_key TEXT NOT NULL UNIQUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_user_time ON wallet_ledger(user_id, created_at DESC);

-- 11. Affiliate / School Owner Payout Requests
CREATE TABLE IF NOT EXISTS payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE RESTRICT,
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    bank_code TEXT NOT NULL,
    account_number_masked TEXT NOT NULL,
    paystack_recipient_code TEXT,
    paystack_transfer_code TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'paid', 'rejected')),
    reviewed_by UUID REFERENCES users_hq(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payout_status ON payout_requests(status, created_at ASC);

-- 12. HQ Compliance Bans, Revocations & HWID Reset Audit Trail
CREATE TABLE IF NOT EXISTS school_bans_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
    actor_hq_user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('ban_school', 'unban_school', 'revoke_license', 'reset_hwid', 'grant_bonus_days')),
    tombstone_id TEXT,
    reason TEXT NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bans_school_time ON school_bans_audit(school_id, created_at DESC);

-- 13. Cloud Auth Sessions (Revocable tokens for Web Portal & CogniTara Studio Desktop)
CREATE TABLE IF NOT EXISTS cloud_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    client_type TEXT NOT NULL DEFAULT 'web' CHECK (client_type IN ('web', 'desktop')),
    device_label TEXT,
    display_hwid TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cloud_sessions_user ON cloud_sessions(user_id, expires_at DESC);

-- Seed Default Commercial Plans (Idempotent)
INSERT INTO plans (slug, display_name, billing_cycle, duration_days, lease_days, price_ngn_kobo, price_usd_cents, default_commission_pct, default_bonus_days, features_json)
VALUES
    ('monthly', 'Monthly School Plan', 'monthly', 30, 7, 2500000, 1900, 15.00, 7, '{"max_concurrent":300,"offline_lease_days":7,"hot_backups":true}'::jsonb),
    ('annual', 'Annual School Plan', 'annual', 365, 30, 22000000, 17900, 15.00, 14, '{"max_concurrent":300,"offline_lease_days":30,"hot_backups":true,"priority_support":true}'::jsonb),
    ('lifetime', 'Lifetime Institutional Plan', 'lifetime', NULL, 90, 65000000, 49900, 15.00, 30, '{"max_concurrent":300,"offline_lease_days":90,"hot_backups":true,"priority_support":true,"perpetual":true}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
