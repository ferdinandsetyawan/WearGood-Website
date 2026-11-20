-- =============================================================================
-- SRS WearGoods / Laras — Spesifikasi Kebutuhan Perangkat Lunak (Versi 1.1 MVP)
-- Bagian 6: Perancangan Data (PostgreSQL 15+ DDL Schema)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Tabel Referensi: occasions & styles (Bagian 2.3 & 6.2)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS occasions (
    code VARCHAR(30) PRIMARY KEY,
    label_id VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS styles (
    code VARCHAR(30) PRIMARY KEY,
    label_id VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed daftar baku Occasion (Bagian 2.3 + UIUX Laras)
INSERT INTO occasions (code, label_id, is_active) VALUES
    ('kerja_kantor', 'Kerja & meeting', TRUE),
    ('kuliah_kampus', 'Kuliah/Kampus', TRUE),
    ('presentasi_kampus', 'Presentasi Kampus', TRUE),
    ('hangout', 'Hangout', TRUE),
    ('formal', 'Formal / Acara spesial', TRUE),
    ('semi_formal', 'Semi-formal', TRUE),
    ('kencan', 'Kencan', TRUE),
    ('jalan_santai', 'Jalan santai', TRUE),
    ('travel', 'Travel', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Seed daftar baku Style (Bagian 2.3 + UIUX Laras)
INSERT INTO styles (code, label_id, is_active) VALUES
    ('smart_casual', 'Smart casual', TRUE),
    ('minimalist', 'Minimalis', TRUE),
    ('casual', 'Casual / Santai', TRUE),
    ('streetwear', 'Streetwear', TRUE),
    ('sporty', 'Sporty', TRUE),
    ('vintage', 'Vintage', TRUE)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Tabel users (FR-01, FR-02, FR-03, FR-17, FR-20)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    gender_preference VARCHAR(20) NULL CHECK (gender_preference IN ('female', 'male', 'neutral', 'undisclosed')),
    style_preference VARCHAR(30) NULL REFERENCES styles(code) ON UPDATE CASCADE ON DELETE SET NULL,
    city VARCHAR(80) NULL DEFAULT 'Jakarta',
    fit_preference VARCHAR(30) NULL DEFAULT 'Relaxed fit',
    favorite_colors JSONB NULL DEFAULT '["Hitam", "Putih", "Olive", "Beige"]'::jsonb,
    material_preference VARCHAR(150) NULL DEFAULT 'Linen, katun, dan bahan ringan',
    email_verified_at TIMESTAMPTZ NULL,
    ai_consent_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email));

-- -----------------------------------------------------------------------------
-- 3. Tabel user_tokens (FR-02, FR-16, FR-20)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('email_verify', 'password_reset', 'refresh')),
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_tokens_user_type ON user_tokens(user_id, type);

-- -----------------------------------------------------------------------------
-- 4. Tabel wardrobe_items (FR-04, FR-05, FR-06, FR-07, FR-08, FR-09, FR-18)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wardrobe_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(100) NULL,
    image_url TEXT NOT NULL,
    original_image_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('top', 'bottom', 'outerwear', 'footwear', 'accessory', 'one_piece')),
    sub_category VARCHAR(50) NOT NULL,
    primary_color VARCHAR(30) NOT NULL,
    characteristics JSONB NULL CHECK (
        characteristics IS NULL OR (
            (characteristics->>'formality') IS NULL OR
            (characteristics->>'formality') IN ('casual', 'smart_casual', 'formal')
        )
    ),
    ai_confidence NUMERIC(3,2) NULL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
    is_user_corrected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_wardrobe_items_lookup
    ON wardrobe_items(user_id, category, primary_color)
    WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 5. Tabel outfits (FR-10, FR-11, FR-12, FR-13)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outfits (
    outfit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    occasion_code VARCHAR(30) NOT NULL REFERENCES occasions(code),
    style_code VARCHAR(30) NOT NULL REFERENCES styles(code),
    user_prompt TEXT NULL CHECK (user_prompt IS NULL OR CHAR_LENGTH(user_prompt) <= 300),
    ai_reasoning TEXT NULL,
    styling_note TEXT NULL,
    weather_context VARCHAR(80) NULL,
    location_context VARCHAR(80) NULL,
    preview_image_url TEXT NULL,
    reprompt_count INT NOT NULL DEFAULT 0,
    parent_outfit_id UUID NULL REFERENCES outfits(outfit_id) ON DELETE SET NULL,
    is_saved BOOLEAN NOT NULL DEFAULT FALSE,
    saved_name VARCHAR(100) NULL,
    saved_at TIMESTAMPTZ NULL,
    feedback VARCHAR(20) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outfits_user_saved_created
    ON outfits(user_id, is_saved, created_at DESC);

-- -----------------------------------------------------------------------------
-- 6. Tabel outfit_items (FR-11, FR-12, FR-09)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outfit_items (
    outfit_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outfit_id UUID NOT NULL REFERENCES outfits(outfit_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES wardrobe_items(item_id) ON DELETE RESTRICT,
    slot VARCHAR(20) NOT NULL CHECK (slot IN ('top', 'bottom', 'outerwear', 'footwear', 'accessory', 'one_piece')),
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (outfit_id, item_id)
);

-- -----------------------------------------------------------------------------
-- 7. Tabel mockup_requests (FR-14, FR-15)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mockup_requests (
    mockup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    outfit_id UUID NULL REFERENCES outfits(outfit_id) ON DELETE SET NULL,
    source VARCHAR(10) NOT NULL CHECK (source IN ('auto', 'custom')),
    missing_category VARCHAR(20) NOT NULL,
    generated_prompt TEXT NOT NULL,
    gap_analysis TEXT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
    mockup_image_url TEXT NULL,
    search_keywords JSONB NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_mockup_requests_user_status
    ON mockup_requests(user_id, status);

-- -----------------------------------------------------------------------------
-- 8. Tabel ai_usage (FR-19)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage (
    usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    usage_date DATE NOT NULL,
    feature VARCHAR(12) NOT NULL CHECK (feature IN ('recognize', 'outfit', 'mockup')),
    count INT NOT NULL DEFAULT 0,
    UNIQUE (user_id, usage_date, feature)
);
