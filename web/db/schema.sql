-- CogniTara Cloud (cognitara-cloud): Authoritative Neon Serverless Postgres DDL (v2.2)
-- Commercial licensing, Paystack billing, promo/redeem codes, remote control & HQ developer console

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. HQ Users (School Owners, Affiliates, HQ Admins, HQ Super Admins)
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

ALTER TABLE schools ADD COLUMN IF NOT EXISTS custom_notice TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS custom_notice_level TEXT NOT NULL DEFAULT 'info';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS feature_overrides_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS force_signout_before TIMESTAMPTZ;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS last_app_version TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS last_hwid TEXT;

-- 3. Commercial Plans & Dynamic Developer Plan Catalog
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'annual',
    duration_days INTEGER,
    lease_days INTEGER NOT NULL DEFAULT 30,
    price_ngn_kobo BIGINT NOT NULL CHECK (price_ngn_kobo >= 0),
    price_usd_cents BIGINT NOT NULL CHECK (price_usd_cents >= 0),
    default_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00 CHECK (default_commission_pct >= 0 AND default_commission_pct <= 60),
    default_bonus_days INTEGER NOT NULL DEFAULT 14 CHECK (default_bonus_days >= 0),
    features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_slug_check;
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_billing_cycle_check;
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_price_ngn_kobo_check;
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_price_usd_cents_check;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS badge TEXT DEFAULT '';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 10;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'annual';

-- 4. Platform Settings (Encrypted Paystack Keys + Global Developer Controls)
CREATE TABLE IF NOT EXISTS platform_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    paystack_public_key TEXT NOT NULL DEFAULT '',
    paystack_secret_key_enc TEXT NOT NULL DEFAULT '',
    paystack_mode TEXT NOT NULL DEFAULT 'test' CHECK (paystack_mode IN ('test', 'live')),
    default_currency CHAR(3) NOT NULL DEFAULT 'NGN',
    maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
    maintenance_message TEXT NOT NULL DEFAULT '',
    min_desktop_version TEXT NOT NULL DEFAULT '2.0.0',
    global_announcement TEXT NOT NULL DEFAULT '',
    global_announcement_level TEXT NOT NULL DEFAULT 'info',
    allow_self_signup BOOLEAN NOT NULL DEFAULT TRUE,
    allow_paystack_checkout BOOLEAN NOT NULL DEFAULT TRUE,
    allow_trial_activation BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID REFERENCES users_hq(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 5. Promo Discount Codes & License Redeem / Voucher Codes
CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    code_type TEXT NOT NULL CHECK (code_type IN ('discount', 'redeem')),
    discount_kind TEXT CHECK (discount_kind IS NULL OR discount_kind IN ('percent', 'fixed_ngn', 'fixed_usd')),
    discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    grant_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
    grant_duration_days INTEGER,
    applicable_plan_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    max_uses INTEGER,
    uses_count INTEGER NOT NULL DEFAULT 0,
    per_school_limit INTEGER NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT DEFAULT '',
    created_by UUID REFERENCES users_hq(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(code_type, is_active);

-- 6. Paystack Subscriptions, One-Time Payments & Manual / Redeem Orders
CREATE TABLE IF NOT EXISTS subscriptions_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    paystack_reference TEXT NOT NULL UNIQUE,
    paystack_transaction_id BIGINT UNIQUE,
    paystack_customer_code TEXT,
    paystack_authorization_sig TEXT,
    currency CHAR(3) NOT NULL CHECK (currency IN ('NGN', 'USD', 'GHS', 'KES', 'ZAR')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    status TEXT NOT NULL DEFAULT 'initialized' CHECK (status IN ('initialized', 'success', 'failed', 'refunded', 'disputed')),
    webhook_event_id TEXT UNIQUE,
    raw_webhook_payload JSONB,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sub_pay_school ON subscriptions_payments(school_id, created_at DESC);

ALTER TABLE subscriptions_payments DROP CONSTRAINT IF EXISTS subscriptions_payments_currency_check;
ALTER TABLE subscriptions_payments DROP CONSTRAINT IF EXISTS subscriptions_payments_amount_minor_check;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS promo_code_text TEXT;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS original_amount_minor BIGINT;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS discount_amount_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS payment_channel TEXT NOT NULL DEFAULT 'paystack';
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS pending_hwid_hash TEXT;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS pending_display_hwid TEXT;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS notes TEXT;

-- 7. Ed25519 Licenses
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT NOT NULL UNIQUE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    latest_payment_id UUID REFERENCES subscriptions_payments(id) ON DELETE SET NULL,
    plan_tier TEXT NOT NULL DEFAULT 'annual',
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
ALTER TABLE licenses DROP CONSTRAINT IF EXISTS licenses_plan_tier_check;

-- 8. Promo & Redeem Code Usage Audit
CREATE TABLE IF NOT EXISTS promo_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES subscriptions_payments(id) ON DELETE SET NULL,
    license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
    discount_applied_minor BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_code ON promo_redemptions(promo_code_id, school_id);

-- 9. Hardware Activations (1-to-1 HWID Binding + HQ HWID Reset Audit)
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

-- 10. Desktop Telemetry & Anti-Tamper Heartbeats
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

-- 11. Referral Codes & Dual-Mode Partner Configuration
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

-- 12. Referral Conversions (Idempotent per Payment)
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

-- 13. Immutable Cash Commission Wallet Ledger
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

-- 14. Affiliate / School Owner Payout Requests
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

-- 15. HQ Compliance Bans, Revocations & HWID Reset Audit Trail
CREATE TABLE IF NOT EXISTS school_bans_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
    actor_hq_user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    tombstone_id TEXT,
    reason TEXT NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bans_school_time ON school_bans_audit(school_id, created_at DESC);
ALTER TABLE school_bans_audit DROP CONSTRAINT IF EXISTS school_bans_audit_action_check;

-- 16. Immutable Developer HQ Power Audit Log
CREATE TABLE IF NOT EXISTS developer_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID REFERENCES users_hq(id) ON DELETE SET NULL,
    actor_email TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    ip_address TEXT,
    details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_audit_time ON developer_audit_logs(created_at DESC);

-- 17. Cloud Auth Sessions (Revocable tokens for Web Portal, HQ & CogniTara Studio Desktop)
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

-- 18. Brevo Transactional Email & 6-Digit OTP Verification
ALTER TABLE users_hq ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS brevo_api_key_enc TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS brevo_sender_email TEXT NOT NULL DEFAULT 'noreply@cognitara.net';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS brevo_sender_name TEXT NOT NULL DEFAULT 'CogniTara Cloud';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS require_email_otp BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS email_otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users_hq(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('signup_verify', 'signin_otp', 'password_reset')),
    code_hash TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    client_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_otp_lookup ON email_otp_codes(email, purpose, created_at DESC);

-- 19. v2.2.3 Upgrades: Live/Test Paystack Keys, Fee Modes, HQ 2FA (TOTP + Email OTP), Brute-Force Lockouts & Cloud Exam Backups
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS paystack_live_public_key TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS paystack_live_secret_enc TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS paystack_test_public_key TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS paystack_test_secret_enc TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS paystack_fee_mode TEXT NOT NULL DEFAULT 'merchant';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS paystack_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 1.50;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS paystack_fee_flat_ngn INTEGER NOT NULL DEFAULT 100;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS paystack_fee_cap_ngn INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS paystack_fee_flat_threshold_ngn INTEGER NOT NULL DEFAULT 2500;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS test_mode_staff_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS backup_reminder_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS require_hq_2fa BOOLEAN NOT NULL DEFAULT TRUE;

-- Non-destructively copy existing Paystack key pair into live or test slot ONLY if target slot is empty
UPDATE platform_settings
SET paystack_live_public_key = CASE
      WHEN paystack_live_public_key = '' AND (paystack_mode = 'live' OR paystack_public_key LIKE 'pk_live_%') THEN paystack_public_key
      ELSE paystack_live_public_key
    END,
    paystack_live_secret_enc = CASE
      WHEN paystack_live_secret_enc = '' AND (paystack_mode = 'live' OR paystack_public_key LIKE 'pk_live_%') THEN paystack_secret_key_enc
      ELSE paystack_live_secret_enc
    END,
    paystack_test_public_key = CASE
      WHEN paystack_test_public_key = '' AND paystack_mode != 'live' AND paystack_public_key NOT LIKE 'pk_live_%' THEN paystack_public_key
      ELSE paystack_test_public_key
    END,
    paystack_test_secret_enc = CASE
      WHEN paystack_test_secret_enc = '' AND paystack_mode != 'live' AND paystack_public_key NOT LIKE 'pk_live_%' THEN paystack_secret_key_enc
      ELSE paystack_test_secret_enc
    END
WHERE id = 1;

ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS fee_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS customer_paid_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS paystack_sub_channel TEXT;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS verification_checks_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS refund_reason TEXT;

ALTER TABLE users_hq ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE users_hq ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users_hq ADD COLUMN IF NOT EXISTS totp_recovery_hashes_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE schools ADD COLUMN IF NOT EXISTS last_cloud_backup_at TIMESTAMPTZ;

ALTER TABLE email_otp_codes DROP CONSTRAINT IF EXISTS email_otp_codes_purpose_check;
ALTER TABLE email_otp_codes ADD CONSTRAINT email_otp_codes_purpose_check CHECK (purpose IN ('signup_verify', 'signin_otp', 'password_reset', 'hq_2fa'));

CREATE TABLE IF NOT EXISTS auth_lockouts (
    lock_key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_lockouts_until ON auth_lockouts(locked_until);

CREATE TABLE IF NOT EXISTS cloud_exam_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users_hq(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    app_version TEXT,
    raw_size_bytes BIGINT NOT NULL DEFAULT 0,
    compressed_bytes BIGINT NOT NULL DEFAULT 0,
    sha256 CHAR(64) NOT NULL,
    stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload_b64 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cloud_backups_school_time ON cloud_exam_backups(school_id, created_at DESC);

-- Seed Default Commercial Plans (Idempotent)
INSERT INTO plans (slug, display_name, description, badge, sort_order, billing_cycle, plan_tier, duration_days, lease_days, price_ngn_kobo, price_usd_cents, max_devices, default_commission_pct, default_bonus_days, features_json)
VALUES
    ('monthly', 'Monthly School Plan', 'Flexible month-to-month CBT licensing for up to 300 concurrent students.', '', 1, 'monthly', 'monthly', 30, 7, 2500000, 1900, 1, 15.00, 7, '{"highlights":["Up to 300 concurrent students","Offline 7-day lease protection","Automated SQLite hot backups","All Regular & Common Entrance exams"]}'::jsonb),
    ('termly', 'Termly School Plan', 'Full 120-day academic term coverage built for WAEC, BECE, and mock exams.', 'Popular', 2, 'termly', 'termly', 120, 14, 7500000, 5900, 1, 15.00, 10, '{"highlights":["Full 120-day academic term","14-day offline lease window","Unlimited exams & question banks","Priority technical support"]}'::jsonb),
    ('annual', 'Annual School Plan', 'Best value: full 365-day institutional licence covering all three terms.', 'Best Value', 3, 'annual', 'annual', 365, 30, 22000000, 17900, 1, 15.00, 14, '{"highlights":["Full 365-day academic session","30-day offline lease resilience","Instant auto-updates & cloud sync","Priority WhatsApp & remote support"]}'::jsonb),
    ('lifetime', 'Lifetime Institutional Plan', 'One-time perpetual institutional licence with 90-day offline check-in windows.', 'Institutional', 4, 'lifetime', 'lifetime', NULL, 90, 65000000, 49900, 2, 15.00, 30, '{"highlights":["Perpetual licence that never expires","Up to 2 server installations","90-day offline lease window","Lifetime updates & dedicated onboarding"]}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
    description = COALESCE(NULLIF(plans.description, ''), EXCLUDED.description),
    badge = COALESCE(NULLIF(plans.badge, ''), EXCLUDED.badge),
    plan_tier = COALESCE(NULLIF(plans.plan_tier, ''), EXCLUDED.plan_tier);

-- 20. v2.2.4: School Ratings & Testimonials (Submitted from Desktop Studio -> Approved in HQ -> Shown on Website)
CREATE TABLE IF NOT EXISTS school_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
    user_id UUID REFERENCES users_hq(id) ON DELETE SET NULL,
    school_name TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL DEFAULT 'School Administrator',
    city_region TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    headline TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    app_version TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by UUID REFERENCES users_hq(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_school_reviews_status ON school_reviews(status, featured DESC, created_at DESC);

-- 21. v2.3: HQ-Controlled Hero Discount Banner, Configurable Free Trial Days & /download Email Capture Leads
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS promo_banner_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS promo_banner_event TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS promo_banner_text TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS promo_banner_code TEXT NOT NULL DEFAULT '';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS free_trial_days INTEGER NOT NULL DEFAULT 7;

CREATE TABLE IF NOT EXISTS download_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'download_page',
    app_version TEXT NOT NULL DEFAULT 'v2.6.0',
    ip_address TEXT,
    user_agent TEXT,
    email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    clicked_at TIMESTAMPTZ,
    download_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_download_leads_email ON download_leads(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_download_leads_created ON download_leads(created_at DESC);
-- 22. v2.3.5: HQ-authored physical / offline school reviews & ratings
ALTER TABLE school_reviews ALTER COLUMN school_id DROP NOT NULL;
ALTER TABLE school_reviews ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'studio';

-- 23. v2.3.6: HQ Website Content CMS (Blog, Guides, FAQ, Roadmap, Changelogs, About & Support pages)
CREATE TABLE IF NOT EXISTS cms_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section TEXT NOT NULL CHECK (section IN ('blog', 'guide', 'faq', 'roadmap', 'changelog', 'page')),
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published',
    summary TEXT NOT NULL DEFAULT '',
    body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 100,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (section, slug)
);
CREATE INDEX IF NOT EXISTS idx_cms_entries_section ON cms_entries(section, published, sort_order, created_at DESC);

-- 24. v2.4.0: Hardened Web-Only Payments & Upgraded Discount / Redeem Code Engine
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS min_amount_ngn_kobo BIGINT NOT NULL DEFAULT 0;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS min_amount_usd_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS per_email_limit INTEGER NOT NULL DEFAULT 1;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS ip_address TEXT;
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_email ON promo_redemptions(promo_code_id, LOWER(buyer_email));

ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS buyer_school_name TEXT;
ALTER TABLE subscriptions_payments ADD COLUMN IF NOT EXISTS buyer_email TEXT;

-- 25. v2.5.0: Multi-Tenant Online Exam Portal (portal.cognitara.net) on Free Vercel + Neon Postgres
ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_code TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS online_portal_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS online_teachers_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS online_students_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS online_portal_notice TEXT NOT NULL DEFAULT '';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS online_synced_at TIMESTAMPTZ;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS online_source_backup_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_schools_school_code ON schools(UPPER(school_code)) WHERE school_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS portal_school_settings (
    school_id UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
    school_name TEXT NOT NULL DEFAULT 'CogniTara School',
    school_motto TEXT NOT NULL DEFAULT '',
    academic_session TEXT NOT NULL DEFAULT '2026/2027',
    current_term TEXT NOT NULL DEFAULT 'First Term',
    default_result_visibility TEXT NOT NULL DEFAULT 'immediate',
    allow_teacher_release BOOLEAN NOT NULL DEFAULT TRUE,
    allow_student_review BOOLEAN NOT NULL DEFAULT FALSE,
    anti_cheating_profile TEXT NOT NULL DEFAULT 'medium',
    max_warnings INTEGER NOT NULL DEFAULT 5,
    classes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    grading_rules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_admins (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    local_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, local_id),
    UNIQUE (school_id, username)
);

CREATE TABLE IF NOT EXISTS portal_teachers (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    local_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    primary_class TEXT NOT NULL DEFAULT '',
    classes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    specialisations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    class_teacher_of TEXT NOT NULL DEFAULT '',
    created_online BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, local_id),
    UNIQUE (school_id, username)
);
CREATE INDEX IF NOT EXISTS idx_portal_teachers_school ON portal_teachers(school_id);

CREATE TABLE IF NOT EXISTS portal_students (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    local_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    student_class TEXT NOT NULL DEFAULT '',
    specialisation TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'approved',
    created_online BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, local_id),
    UNIQUE (school_id, username)
);
CREATE INDEX IF NOT EXISTS idx_portal_students_school_class ON portal_students(school_id, student_class, status);

CREATE TABLE IF NOT EXISTS portal_exams (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    local_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    exam_class TEXT NOT NULL DEFAULT '',
    duration INTEGER NOT NULL DEFAULT 30,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    teacher_local_id INTEGER,
    specialisation TEXT NOT NULL DEFAULT '',
    subject_tag TEXT NOT NULL DEFAULT '',
    max_warnings INTEGER NOT NULL DEFAULT 5,
    calculator_type TEXT NOT NULL DEFAULT 'none',
    deactivated BOOLEAN NOT NULL DEFAULT FALSE,
    result_release_policy TEXT NOT NULL DEFAULT 'immediate',
    results_released BOOLEAN NOT NULL DEFAULT TRUE,
    anti_cheating_profile TEXT NOT NULL DEFAULT 'medium',
    is_paused_all BOOLEAN NOT NULL DEFAULT FALSE,
    created_online BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, local_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_exams_school ON portal_exams(school_id, exam_class, active);

CREATE TABLE IF NOT EXISTS portal_exam_sections (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    local_id INTEGER NOT NULL,
    exam_local_id INTEGER NOT NULL,
    section_name TEXT NOT NULL DEFAULT 'Section A',
    questions_to_show INTEGER NOT NULL DEFAULT 0,
    randomize BOOLEAN NOT NULL DEFAULT FALSE,
    section_order INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (school_id, local_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_sections_exam ON portal_exam_sections(school_id, exam_local_id, section_order);

CREATE TABLE IF NOT EXISTS portal_exam_groups (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    local_id INTEGER NOT NULL,
    exam_local_id INTEGER NOT NULL,
    section_local_id INTEGER,
    group_name TEXT NOT NULL DEFAULT '',
    group_type TEXT NOT NULL DEFAULT 'passage',
    group_content TEXT NOT NULL DEFAULT '',
    instruction_text TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (school_id, local_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_groups_exam ON portal_exam_groups(school_id, exam_local_id);

CREATE TABLE IF NOT EXISTS portal_questions (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    local_id INTEGER NOT NULL,
    exam_local_id INTEGER NOT NULL,
    section_local_id INTEGER,
    group_local_id INTEGER,
    question TEXT NOT NULL,
    option1 TEXT NOT NULL DEFAULT '',
    option2 TEXT NOT NULL DEFAULT '',
    option3 TEXT NOT NULL DEFAULT '',
    option4 TEXT NOT NULL DEFAULT '',
    answer TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    mandatory BOOLEAN NOT NULL DEFAULT FALSE,
    created_online BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, local_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_questions_exam ON portal_questions(school_id, exam_local_id, display_order);

CREATE TABLE IF NOT EXISTS portal_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    local_score_id INTEGER,
    student_local_id INTEGER NOT NULL,
    exam_local_id INTEGER NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
    grade_label TEXT NOT NULL DEFAULT '',
    grade_remark TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'auto_submitted')),
    submitted BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    authoritative_deadline TIMESTAMPTZ,
    remaining_time INTEGER NOT NULL DEFAULT 0,
    warnings_count INTEGER NOT NULL DEFAULT 0,
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    force_submit BOOLEAN NOT NULL DEFAULT FALSE,
    results_released BOOLEAN NOT NULL DEFAULT TRUE,
    answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    question_order_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    option_shuffle_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    origin TEXT NOT NULL DEFAULT 'online' CHECK (origin IN ('offline', 'online')),
    synced_to_desktop BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, student_local_id, exam_local_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_attempts_school_exam ON portal_attempts(school_id, exam_local_id, submitted);
CREATE INDEX IF NOT EXISTS idx_portal_attempts_unsynced ON portal_attempts(school_id, synced_to_desktop) WHERE origin = 'online' AND synced_to_desktop = FALSE;

-- 26. v2.6.0: Full Offline Parity for Online Portal (Live Support, School Settings, Audit Logs, Warning Logs, Deactivation)
ALTER TABLE portal_school_settings ADD COLUMN IF NOT EXISTS school_address TEXT NOT NULL DEFAULT '';
ALTER TABLE portal_school_settings ADD COLUMN IF NOT EXISTS school_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE portal_school_settings ADD COLUMN IF NOT EXISTS school_email TEXT NOT NULL DEFAULT '';
ALTER TABLE portal_school_settings ADD COLUMN IF NOT EXISTS school_logo_b64 TEXT NOT NULL DEFAULT '';
ALTER TABLE portal_school_settings ADD COLUMN IF NOT EXISTS grading_scheme_name TEXT NOT NULL DEFAULT 'WAEC 9-Point';
ALTER TABLE portal_school_settings ADD COLUMN IF NOT EXISTS grading_scheme_desc TEXT NOT NULL DEFAULT 'Standard grading scale';

ALTER TABLE portal_exams ADD COLUMN IF NOT EXISTS deactivation_note TEXT NOT NULL DEFAULT '';
ALTER TABLE portal_exams ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE portal_exams ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE portal_exams ADD COLUMN IF NOT EXISTS randomize_options BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE portal_attempts ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE portal_attempts ADD COLUMN IF NOT EXISTS resume_requested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE portal_attempts ADD COLUMN IF NOT EXISTS resume_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE portal_attempts ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS portal_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    actor_role TEXT NOT NULL DEFAULT 'admin',
    actor_username TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_audit_school_time ON portal_audit_logs(school_id, created_at DESC);

CREATE TABLE IF NOT EXISTS portal_warning_logs (
    id BIGSERIAL PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_local_id INTEGER NOT NULL DEFAULT 0,
    student_name TEXT NOT NULL DEFAULT '',
    exam_local_id INTEGER NOT NULL DEFAULT 0,
    exam_name TEXT NOT NULL DEFAULT '',
    warning_type TEXT NOT NULL DEFAULT 'focus_loss',
    message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portal_warnings_school_time ON portal_warning_logs(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_warnings_school_student ON portal_warning_logs(school_id, student_local_id, exam_local_id);


