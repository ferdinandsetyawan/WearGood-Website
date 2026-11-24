const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '..', 'database');
const ASSETS_DIR = process.env.ASSETS_DIR || path.join(__dirname, '..', 'public', 'assets');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'database', 'uploads');

try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch (_) {}
try { fs.mkdirSync(ASSETS_DIR, { recursive: true }); } catch (_) {}
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (_) {}

// Daftar Baku Warna (SRS Bagian 4 NFR-03 & 9.2 - 12 warna baku)
const STANDARD_COLORS = [
  'Hitam', 'Putih', 'Olive', 'Beige', 'Navy', 'Abu-abu',
  'Cokelat', 'Tan', 'Krem', 'Biru', 'Merah', 'Hijau'
];

// Pemetaan Kategori (SRS Bagian 1.4 Glosarium)
const CATEGORY_LABELS = {
  top: 'Atasan',
  bottom: 'Bawahan',
  outerwear: 'Luaran',
  footwear: 'Alas Kaki',
  accessory: 'Aksesori',
  one_piece: 'Terusan'
};

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$16384$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;
  const salt = parts[2];
  const expected = parts[3];
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expected, 'hex'));
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function ensureMockupAssets() {
  const svgs = {
    'mockup-outerwear.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="400" height="480">
  <rect width="400" height="480" fill="#e9e6df" rx="8"/>
  <ellipse cx="200" cy="425" rx="95" ry="12" fill="#d5d1c8"/>
  <path d="M135 95 L168 78 L200 148 L232 78 L265 95 L312 135 L292 355 L258 355 L255 190 L248 388 L152 388 L145 190 L142 355 L108 355 L88 135 Z" fill="#1f2d3d" stroke="#15202b" stroke-width="3" stroke-linejoin="round"/>
  <path d="M168 78 L200 220 L150 175 L158 125 L145 115 Z" fill="#27384c" stroke="#15202b" stroke-width="2"/>
  <path d="M232 78 L200 220 L250 175 L242 125 L255 115 Z" fill="#27384c" stroke="#15202b" stroke-width="2"/>
  <path d="M168 78 Q200 88 232 78 L200 155 Z" fill="#f4f1ea" stroke="#d5d1c8" stroke-width="1.5"/>
  <circle cx="200" cy="250" r="5" fill="#8c7355"/>
  <circle cx="200" cy="292" r="5" fill="#8c7355"/>
  <rect x="158" y="315" width="32" height="6" rx="2" fill="#15202b"/>
  <rect x="210" y="315" width="32" height="6" rx="2" fill="#15202b"/>
</svg>`,
    'mockup-top.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="400" height="480">
  <rect width="400" height="480" fill="#e9e6df" rx="8"/>
  <ellipse cx="200" cy="415" rx="90" ry="10" fill="#d5d1c8"/>
  <path d="M142 100 L170 88 Q200 108 230 88 L258 100 L310 150 L282 235 L252 215 L252 380 L148 380 L148 215 L118 235 L90 150 Z" fill="#f5f0e6" stroke="#d4cbbd" stroke-width="3" stroke-linejoin="round"/>
  <path d="M170 88 Q200 116 230 88" fill="none" stroke="#c2b8a8" stroke-width="4"/>
  <line x1="148" y1="365" x2="252" y2="365" stroke="#d4cbbd" stroke-width="3"/>
</svg>`,
    'mockup-bottom.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="400" height="480">
  <rect width="400" height="480" fill="#e9e6df" rx="8"/>
  <ellipse cx="200" cy="430" rx="85" ry="10" fill="#d5d1c8"/>
  <path d="M145 75 L255 75 L272 405 L215 405 L200 185 L185 405 L128 405 Z" fill="#3b4d5e" stroke="#25323e" stroke-width="3" stroke-linejoin="round"/>
  <line x1="145" y1="96" x2="255" y2="96" stroke="#25323e" stroke-width="2.5"/>
  <circle cx="200" cy="86" r="4" fill="#cbd5e0"/>
</svg>`,
    'mockup-footwear.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="400" height="480">
  <rect width="400" height="480" fill="#e9e6df" rx="8"/>
  <ellipse cx="200" cy="330" rx="125" ry="16" fill="#d5d1c8"/>
  <path d="M95 280 Q95 230 140 225 L210 225 Q245 255 295 262 Q320 266 320 295 L320 312 L95 312 Z" fill="#faf8f5" stroke="#c8c2b6" stroke-width="3"/>
  <rect x="92" y="302" width="230" height="16" rx="6" fill="#e2ddd3" stroke="#bfb8aa" stroke-width="2"/>
  <path d="M165 252 L192 285 L210 262" fill="none" stroke="#304c3c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
    'mockup-accessory.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="400" height="480">
  <rect width="400" height="480" fill="#e9e6df" rx="8"/>
  <ellipse cx="200" cy="405" rx="95" ry="12" fill="#d5d1c8"/>
  <path d="M160 185 C160 105, 240 105, 240 185" fill="none" stroke="#8c6239" stroke-width="8" stroke-linecap="round"/>
  <path d="M125 185 L275 185 L260 375 L140 375 Z" fill="#b88b5a" stroke="#8c6239" stroke-width="3" stroke-linejoin="round"/>
  <line x1="132" y1="230" x2="268" y2="230" stroke="#9c7144" stroke-width="2"/>
  <line x1="136" y1="280" x2="264" y2="280" stroke="#9c7144" stroke-width="2"/>
  <line x1="138" y1="330" x2="262" y2="330" stroke="#9c7144" stroke-width="2"/>
</svg>`,
    'mockup-one_piece.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="400" height="480">
  <rect width="400" height="480" fill="#e9e6df" rx="8"/>
  <ellipse cx="200" cy="430" rx="100" ry="12" fill="#d5d1c8"/>
  <path d="M160 85 L180 78 Q200 98 220 78 L240 85 L265 135 L245 160 L235 140 L235 210 L285 405 L115 405 L165 210 L165 140 L155 160 L135 135 Z" fill="#6b7c6e" stroke="#49584c" stroke-width="3" stroke-linejoin="round"/>
  <line x1="165" y1="210" x2="235" y2="210" stroke="#49584c" stroke-width="3"/>
</svg>`
  };
  for (const [name, content] of Object.entries(svgs)) {
    const file = path.join(ASSETS_DIR, name);
    if (!fs.existsSync(file)) {
      try {
        fs.writeFileSync(file, content, 'utf8');
      } catch (_) {}
    }
  }
}

function ensureColumn(db, tableName, columnName, columnDef) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`);
  }
}

function initDatabase(dbPath = path.join(DB_DIR, 'weargoods.sqlite')) {
  ensureMockupAssets();
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS occasions (
      code TEXT PRIMARY KEY,
      label_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS styles (
      code TEXT PRIMARY KEY,
      label_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      nickname TEXT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      gender_preference TEXT NULL CHECK (gender_preference IN ('female', 'male', 'neutral', 'undisclosed')),
      style_preference TEXT NULL REFERENCES styles(code),
      style_preferences TEXT NULL DEFAULT '["minimalist","smart_casual"]',
      city TEXT NULL DEFAULT 'Jakarta',
      fit_preference TEXT NULL DEFAULT 'Relaxed fit',
      favorite_colors TEXT NULL DEFAULT '["Hitam","Putih","Olive","Beige"]',
      material_preference TEXT NULL DEFAULT 'Linen, katun, dan bahan ringan',
      email_verified_at TEXT NULL,
      ai_consent_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS user_tokens (
      token_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('email_verify', 'password_reset', 'refresh')),
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT NULL,
      revoked_at TEXT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      first_failed_at INTEGER NOT NULL,
      cooldown_until INTEGER NULL
    );

    CREATE TABLE IF NOT EXISTS email_outbox (
      email_id TEXT PRIMARY KEY,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      token_type TEXT NOT NULL,
      raw_token TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wardrobe_items (
      item_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      name TEXT NULL,
      image_url TEXT NOT NULL,
      original_image_url TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('top', 'bottom', 'outerwear', 'footwear', 'accessory', 'one_piece')),
      sub_category TEXT NOT NULL,
      primary_color TEXT NOT NULL,
      characteristics TEXT NULL,
      ai_confidence REAL NULL,
      is_user_corrected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_wardrobe_items_lookup
      ON wardrobe_items(user_id, category, primary_color);

    CREATE TABLE IF NOT EXISTS outfits (
      outfit_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      title TEXT NULL,
      occasion_code TEXT NOT NULL REFERENCES occasions(code),
      style_code TEXT NOT NULL REFERENCES styles(code),
      user_prompt TEXT NULL,
      ai_reasoning TEXT NULL,
      styling_note TEXT NULL,
      weather_context TEXT NULL,
      location_context TEXT NULL,
      date_label TEXT NULL,
      preview_image_url TEXT NULL,
      reprompt_count INTEGER NOT NULL DEFAULT 0,
      parent_outfit_id TEXT NULL REFERENCES outfits(outfit_id) ON DELETE SET NULL,
      is_saved INTEGER NOT NULL DEFAULT 0,
      saved_name TEXT NULL,
      saved_at TEXT NULL,
      feedback TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_outfits_user_saved_created
      ON outfits(user_id, is_saved, created_at DESC);

    CREATE TABLE IF NOT EXISTS outfit_items (
      outfit_item_id TEXT PRIMARY KEY,
      outfit_id TEXT NOT NULL REFERENCES outfits(outfit_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES wardrobe_items(item_id) ON DELETE RESTRICT,
      slot TEXT NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 0,
      UNIQUE (outfit_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS mockup_requests (
      mockup_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      outfit_id TEXT NULL REFERENCES outfits(outfit_id) ON DELETE SET NULL,
      source TEXT NOT NULL CHECK (source IN ('auto', 'custom')),
      missing_category TEXT NOT NULL,
      generated_prompt TEXT NOT NULL,
      gap_analysis TEXT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
      mockup_image_url TEXT NULL,
      search_keywords TEXT NULL,
      error_message TEXT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mockup_requests_user_status
      ON mockup_requests(user_id, status);

    CREATE TABLE IF NOT EXISTS ai_usage (
      usage_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      usage_date TEXT NOT NULL,
      feature TEXT NOT NULL CHECK (feature IN ('recognize', 'outfit', 'mockup', 'try_on')),
      count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (user_id, usage_date, feature)
    );
  `);

  // Safe schema migrations for existing SQLite database files
  ensureColumn(db, 'users', 'nickname', 'TEXT NULL');
  ensureColumn(db, 'users', 'style_preferences', `TEXT NULL DEFAULT '["minimalist","smart_casual"]'`);
  ensureColumn(db, 'outfits', 'date_label', 'TEXT NULL');

  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_usage'").get()?.sql || '';
    if (tableSql && !tableSql.includes('try_on')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_usage_v2 (
          usage_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          usage_date TEXT NOT NULL,
          feature TEXT NOT NULL CHECK (feature IN ('recognize', 'outfit', 'mockup', 'try_on')),
          count INTEGER NOT NULL DEFAULT 0,
          UNIQUE (user_id, usage_date, feature)
        );
        INSERT OR IGNORE INTO ai_usage_v2 SELECT * FROM ai_usage;
        DROP TABLE ai_usage;
        ALTER TABLE ai_usage_v2 RENAME TO ai_usage;
      `);
    }
  } catch (_) {}

  // Seed Occasions (SRS Bagian 2.3 + UIUX Laras)
  const occasions = [
    ['kerja_kantor', 'Kerja & meeting'],
    ['hangout', 'Hangout'],
    ['formal', 'Acara spesial'],
    ['jalan_santai', 'Jalan santai'],
    ['kencan', 'Kencan'],
    ['travel', 'Travel'],
    ['kuliah_kampus', 'Kuliah/Kampus'],
    ['presentasi_kampus', 'Presentasi Kampus'],
    ['semi_formal', 'Semi-formal']
  ];
  const insertOccasion = db.prepare('INSERT OR IGNORE INTO occasions (code, label_id, is_active) VALUES (?, ?, 1)');
  for (const [code, label] of occasions) {
    insertOccasion.run(code, label);
  }

  // Seed Styles (SRS Bagian 2.3 + UIUX Laras)
  const styles = [
    ['smart_casual', 'Smart casual'],
    ['minimalist', 'Minimalis'],
    ['casual', 'Santai'],
    ['streetwear', 'Streetwear'],
    ['sporty', 'Sporty'],
    ['vintage', 'Vintage']
  ];
  const insertStyle = db.prepare('INSERT OR IGNORE INTO styles (code, label_id, is_active) VALUES (?, ?, 1)');
  for (const [code, label] of styles) {
    insertStyle.run(code, label);
  }

  // Seed Default User Nadia Putri matching UIUX designs
  const nadiaEmail = 'nadia.putri@email.com';
  const existingNadia = db.prepare('SELECT user_id FROM users WHERE email = ?').get(nadiaEmail);

  if (!existingNadia) {
    const now = new Date().toISOString();
    const nadiaId = '11111111-1111-4111-8111-111111111111';
    db.prepare(`
      INSERT INTO users (
        user_id, full_name, nickname, email, password_hash, gender_preference,
        style_preference, style_preferences, city, fit_preference,
        favorite_colors, material_preference, email_verified_at, ai_consent_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nadiaId,
      'Nadia Putri',
      'Nadia',
      nadiaEmail,
      hashPassword('Password123'),
      'female',
      'smart_casual',
      JSON.stringify(['minimalist', 'smart_casual']),
      'Jakarta',
      'Relaxed fit',
      JSON.stringify(['Hitam', 'Putih', 'Olive', 'Beige']),
      'Linen, katun, dan bahan ringan',
      now,
      now,
      now,
      now
    );

    const seedItems = [
      {
        item_id: '22222222-2222-4222-8222-222222222201',
        name: 'Kemeja linen putih',
        image_url: '/assets/item-1.png',
        category: 'top',
        sub_category: 'Kemeja linen',
        primary_color: 'Putih',
        characteristics: { pattern: 'Polos', fit: 'Relaxed fit', material: 'Linen', formality: 'smart_casual' },
        ai_confidence: 0.96
      },
      {
        item_id: '22222222-2222-4222-8222-222222222202',
        name: 'Celana tailored olive',
        image_url: '/assets/item-2.png',
        category: 'bottom',
        sub_category: 'Celana olive',
        primary_color: 'Olive',
        characteristics: { pattern: 'Polos', fit: 'Regular fit', material: 'Katun', formality: 'smart_casual' },
        ai_confidence: 0.94
      },
      {
        item_id: '22222222-2222-4222-8222-222222222203',
        name: 'Loafers cokelat',
        image_url: '/assets/item-3.png',
        category: 'footwear',
        sub_category: 'Loafers kulit',
        primary_color: 'Cokelat',
        characteristics: { pattern: 'Polos', fit: 'Regular fit', material: 'Kulit', formality: 'smart_casual' },
        ai_confidence: 0.95
      },
      {
        item_id: '22222222-2222-4222-8222-222222222204',
        name: 'Tote kulit tan',
        image_url: '/assets/item-4.png',
        category: 'accessory',
        sub_category: 'Tote tan',
        primary_color: 'Tan',
        characteristics: { pattern: 'Polos', fit: 'Regular fit', material: 'Kulit', formality: 'smart_casual' },
        ai_confidence: 0.92
      }
    ];

    const insertItem = db.prepare(`
      INSERT INTO wardrobe_items (
        item_id, user_id, name, image_url, original_image_url, thumbnail_url,
        category, sub_category, primary_color, characteristics, ai_confidence,
        is_user_corrected, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    for (const item of seedItems) {
      insertItem.run(
        item.item_id,
        nadiaId,
        item.name,
        item.image_url,
        item.image_url,
        item.image_url,
        item.category,
        item.sub_category,
        item.primary_color,
        JSON.stringify(item.characteristics),
        item.ai_confidence,
        now,
        now
      );
    }

    const outfitId = '33333333-3333-4333-8333-333333333301';
    db.prepare(`
      INSERT INTO outfits (
        outfit_id, user_id, title, occasion_code, style_code, user_prompt,
        ai_reasoning, styling_note, weather_context, location_context, date_label,
        preview_image_url, reprompt_count, parent_outfit_id,
        is_saved, saved_name, saved_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 1, ?, ?, ?, ?)
    `).run(
      outfitId,
      nadiaId,
      'Natural, tetap profesional.',
      'kerja_kantor',
      'smart_casual',
      'Cuaca hangat, nyaman bergerak seharian',
      'Putih yang bersih bertemu olive yang tenang. Potongan relaxed membuatmu leluasa bergerak, tanpa kehilangan kesan rapi.',
      'Gulung lengan satu lipatan dan masukkan bagian depan kemeja untuk proporsi yang lebih seimbang.',
      'Hangat · 28–32°C',
      'Jakarta',
      'Jumat, 20 November 2026',
      '/assets/look-1.png',
      'Natural, tetap profesional.',
      now,
      now,
      now
    );

    const insertOutfitItem = db.prepare(`
      INSERT INTO outfit_items (outfit_item_id, outfit_id, item_id, slot, is_locked)
      VALUES (?, ?, ?, ?, 0)
    `);
    for (const item of seedItems) {
      insertOutfitItem.run(crypto.randomUUID(), outfitId, item.item_id, item.category);
    }
  }

  return db;
}

module.exports = {
  initDatabase,
  hashPassword,
  verifyPassword,
  hashToken,
  STANDARD_COLORS,
  CATEGORY_LABELS,
  UPLOADS_DIR,
  ASSETS_DIR
};
