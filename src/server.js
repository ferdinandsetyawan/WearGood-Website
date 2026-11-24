const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const {
  initDatabase,
  hashPassword,
  verifyPassword,
  hashToken,
  STANDARD_COLORS,
  CATEGORY_LABELS,
  UPLOADS_DIR
} = require('./db');
const { createAiService, loadEnvFile } = require('./ai-service');

const JWT_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update(__dirname + ':weargoods-jwt-secret').digest('hex');
const SIGNED_URL_SECRET = process.env.SIGNED_URL_SECRET || crypto.createHash('sha256').update(__dirname + ':weargoods-signed-url').digest('hex');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Daily AI Quotas (SRS FR-19)
const AI_QUOTA_LIMITS = {
  recognize: 50,
  outfit: 30,
  mockup: 5
};

const passwordResetRate = new Map(); // key: email -> [timestamps]

// -----------------------------------------------------------------------------
// Helpers: Timezone WIB (UTC+7), JWT, Signed URLs, File Validation & EXIF Strip
// -----------------------------------------------------------------------------
function getWibDateString(date = new Date()) {
  const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
  return new Date(wibMs).toISOString().slice(0, 10);
}

function getNextWibMidnightIso(date = new Date()) {
  const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
  const wibDate = new Date(wibMs);
  const nextMidnightWib = Date.UTC(
    wibDate.getUTCFullYear(),
    wibDate.getUTCMonth(),
    wibDate.getUTCDate() + 1,
    0, 0, 0, 0
  );
  const utcMs = nextMidnightWib - 7 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

function createJwt(payload, expiresInSeconds = 15 * 60) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: nowSec,
    exp: nowSec + expiresInSeconds
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Signed URL for private object storage (SRS NFR-06: expires <= 15 minutes)
function createSignedStorageUrl(filePath, ttlSeconds = 15 * 60) {
  if (!filePath || filePath.startsWith('/assets/')) return filePath;
  const cleanPath = filePath.split('?')[0];
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac('sha256', SIGNED_URL_SECRET)
    .update(`${cleanPath}:${exp}`)
    .digest('hex')
    .slice(0, 24);
  return `${cleanPath}?exp=${exp}&sig=${sig}`;
}

function verifySignedStorageUrl(cleanPath, expStr, sig) {
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) return false;
  const expected = crypto
    .createHmac('sha256', SIGNED_URL_SECRET)
    .update(`${cleanPath}:${exp}`)
    .digest('hex')
    .slice(0, 24);
  return sig === expected;
}

// Validate magic bytes & file content (SRS FR-04, NFR-06, NFR-09, TC-02, TC-04, TC-05)
function inspectFileMagicBytes(buffer, filename = '', mimeType = '') {
  if (!buffer || buffer.length < 4) {
    return { valid: false, status: 415, message: 'File kosong atau rusak. Format yang didukung: JPG, JPEG, PNG, WEBP, HEIC/HEIF.' };
  }
  if ((buffer[0] === 0x4D && buffer[1] === 0x5A) || (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46)) {
    return { valid: false, status: 415, message: 'Keamanan: Isi file terdeteksi sebagai program eksekusi (.exe/binary), bukan gambar yang valid.' };
  }
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { valid: false, status: 415, message: 'Format dokumen PDF tidak didukung. Unggah foto dalam format JPG, JPEG, PNG, WEBP, atau HEIC/HEIF.' };
  }
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { valid: true, format: 'jpeg', ext: '.jpg' };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { valid: true, format: 'png', ext: '.png' };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { valid: true, format: 'webp', ext: '.webp' };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 4, 8) === 'ftyp' &&
    /heic|heix|hevc|mif1|msf1|heif/i.test(buffer.toString('ascii', 8, 12))
  ) {
    return { valid: true, format: 'heic', ext: '.jpg', convertedFromHeic: true };
  }
  return {
    valid: false,
    status: 415,
    message: `Format file tidak didukung (${filename || mimeType || 'unknown'}). Gunakan format .jpg, .jpeg, .png, .webp, atau .heic/.heif.`
  };
}

// Safe JPEG APP1 (EXIF/GPS) segment parser without corrupting scan data after SOS (0xFFDA)
function stripExifAndNormalizeBuffer(buffer, format) {
  if (format === 'heic') {
    return Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9
    ]);
  }
  if (format !== 'jpeg') {
    return buffer;
  }
  const chunks = [Buffer.from([0xFF, 0xD8])];
  let i = 2;
  while (i < buffer.length) {
    if (buffer[i] !== 0xFF) {
      chunks.push(buffer.subarray(i));
      break;
    }
    const marker = buffer[i + 1];
    if (marker === 0xDA || marker === 0xD9) {
      chunks.push(buffer.subarray(i));
      break;
    }
    if (i + 3 >= buffer.length) {
      chunks.push(buffer.subarray(i));
      break;
    }
    const segLen = buffer.readUInt16BE(i + 2);
    if (segLen < 2 || i + 2 + segLen > buffer.length) {
      chunks.push(buffer.subarray(i));
      break;
    }
    // Strip APP1 (0xE1 - EXIF/GPS/XMP) and COM (0xFE) metadata segments only
    if (marker !== 0xE1 && marker !== 0xFE) {
      chunks.push(buffer.subarray(i, i + 2 + segLen));
    }
    i += 2 + segLen;
  }
  return Buffer.concat(chunks);
}

// -----------------------------------------------------------------------------
// AI Recognition Simulator (SRS FR-05, FR-06, TC-01, TC-06, TC-07)
// -----------------------------------------------------------------------------
function runAiClothingRecognition(filename = '', hintText = '') {
  const combined = `${filename} ${hintText}`.toLowerCase();

  if (combined.includes('timeout') || combined.includes('simulate_timeout')) {
    const err = new Error('Layanan AI pengenalan pakaian melewati batas waktu (timeout 10 detik). Silakan coba ulang.');
    err.status = 504;
    err.code = 'AI_TIMEOUT';
    throw err;
  }

  if (
    combined.includes('kucing') ||
    combined.includes('anjing') ||
    combined.includes('hewan') ||
    combined.includes('animal') ||
    combined.includes('cat') ||
    combined.includes('dog') ||
    combined.includes('mobil') ||
    combined.includes('makanan') ||
    combined.includes('non_clothing') ||
    combined.includes('bukan_pakaian')
  ) {
    const err = new Error('Gambar terdeteksi bukan pakaian. Mohon unggah foto yang memuat satu item pakaian dengan jelas.');
    err.status = 422;
    err.code = 'NOT_CLOTHING';
    throw err;
  }

  if (combined.includes('gelap') || combined.includes('buram') || combined.includes('blur') || combined.includes('dark')) {
    const err = new Error('Foto terlalu gelap atau buram untuk dikenali. Mohon ambil foto ulang dengan pencahayaan memadai.');
    err.status = 422;
    err.code = 'LOW_IMAGE_QUALITY';
    throw err;
  }

  const isLowConfidence = combined.includes('low_conf') || combined.includes('ragu') || combined.includes('samar');

  let category = 'top';
  let subCategory = 'Kemeja';
  let primaryColor = 'Putih';
  let pattern = 'Polos';
  let fit = 'Regular fit';
  let material = 'Katun';
  let formality = 'smart_casual';
  let previewAsset = '/assets/item-1.png';

  if (combined.includes('flanel') || combined.includes('kotak')) {
    category = 'top';
    subCategory = 'Kemeja Flanel';
    primaryColor = combined.includes('merah') ? 'Merah' : combined.includes('biru') ? 'Navy' : 'Olive';
    pattern = 'Kotak-kotak';
    fit = 'Relaxed fit';
    material = 'Flanel Katun';
    formality = 'casual';
    previewAsset = '/assets/item-1.png';
  } else if (combined.includes('celana') || combined.includes('cargo') || combined.includes('jeans') || combined.includes('denim') || combined.includes('rok') || combined.includes('bawahan')) {
    category = 'bottom';
    subCategory = combined.includes('rok') ? 'Rok Midi' : combined.includes('jeans') || combined.includes('denim') ? 'Celana Denim' : combined.includes('cargo') ? 'Cargo Pants' : 'Celana Tailored';
    primaryColor = combined.includes('hitam') ? 'Hitam' : combined.includes('biru') || combined.includes('navy') ? 'Navy' : 'Olive';
    material = combined.includes('denim') ? 'Denim' : 'Katun Twill';
    formality = combined.includes('cargo') ? 'casual' : 'smart_casual';
    previewAsset = '/assets/item-2.png';
  } else if (combined.includes('sepatu') || combined.includes('loafer') || combined.includes('sneaker') || combined.includes('flat')) {
    category = 'footwear';
    subCategory = combined.includes('sneaker') ? 'Sneakers Kulit' : 'Loafers Kulit';
    primaryColor = combined.includes('putih') ? 'Putih' : combined.includes('hitam') ? 'Hitam' : 'Cokelat';
    material = 'Kulit';
    formality = combined.includes('sneaker') ? 'casual' : 'smart_casual';
    previewAsset = '/assets/item-3.png';
  } else if (combined.includes('tas') || combined.includes('tote') || combined.includes('jam') || combined.includes('aksesori') || combined.includes('topi')) {
    category = 'accessory';
    subCategory = 'Tote Bag Kulit';
    primaryColor = combined.includes('hitam') ? 'Hitam' : 'Tan';
    material = 'Kulit';
    formality = 'smart_casual';
    previewAsset = '/assets/item-4.png';
  } else if (combined.includes('blazer') || combined.includes('jaket') || combined.includes('cardigan') || combined.includes('hoodie') || combined.includes('outer') || combined.includes('luaran')) {
    category = 'outerwear';
    subCategory = combined.includes('hoodie') ? 'Hoodie' : 'Blazer Tailored';
    primaryColor = combined.includes('hitam') ? 'Hitam' : 'Navy';
    material = combined.includes('hoodie') ? 'Fleece Katun' : 'Wol Ringan';
    formality = combined.includes('hoodie') ? 'casual' : 'formal';
    previewAsset = '/assets/mockup-outerwear.svg';
  } else if (combined.includes('dress') || combined.includes('jumpsuit') || combined.includes('terusan') || combined.includes('gaun')) {
    category = 'one_piece';
    subCategory = combined.includes('jumpsuit') ? 'Jumpsuit Linen' : 'Midi Dress Linen';
    primaryColor = combined.includes('hitam') ? 'Hitam' : 'Olive';
    material = 'Linen';
    formality = 'smart_casual';
    previewAsset = '/assets/mockup-one_piece.svg';
  } else {
    for (const c of STANDARD_COLORS) {
      if (combined.includes(c.toLowerCase())) {
        primaryColor = c;
        break;
      }
    }
    if (combined.includes('linen')) {
      subCategory = 'Kemeja Linen';
      material = 'Linen';
    } else if (combined.includes('kaus') || combined.includes('kaos') || combined.includes('t-shirt')) {
      subCategory = 'Kaus Katun';
      formality = 'casual';
    }
  }

  const fieldConfidences = isLowConfidence
    ? {
        category: 0.88,
        sub_category: 0.52,
        primary_color: 0.48,
        pattern: 0.55,
        fit: 0.72,
        material: 0.51,
        formality: 0.76
      }
    : {
        category: 0.96,
        sub_category: 0.91,
        primary_color: 0.94,
        pattern: 0.92,
        fit: 0.87,
        material: 0.89,
        formality: 0.93
      };

  const overallConfidence = Number(
    (
      Object.values(fieldConfidences).reduce((a, b) => a + b, 0) /
      Object.values(fieldConfidences).length
    ).toFixed(2)
  );

  const lowConfidenceFields = Object.entries(fieldConfidences)
    .filter(([, score]) => score < 0.6)
    .map(([field]) => field);

  const bgRemovedSuccess = !combined.includes('bg_fail');

  return {
    name: `${subCategory} ${primaryColor.toLowerCase()}`,
    category,
    category_label: CATEGORY_LABELS[category],
    sub_category: subCategory,
    primary_color: primaryColor,
    characteristics: {
      pattern,
      fit,
      material,
      formality
    },
    confidence_per_field: fieldConfidences,
    ai_confidence: overallConfidence,
    needs_review: lowConfidenceFields.length > 0,
    low_confidence_fields: lowConfidenceFields,
    box_2d: [80, 100, 920, 900],
    crop_box: { ymin: 80, xmin: 100, ymax: 920, xmax: 900 },
    background_removed: bgRemovedSuccess,
    preprocessing_notice: bgRemovedSuccess
      ? 'Latar belakang berhasil dihapus dan ukuran gambar dinormalkan.'
      : 'Penghapusan latar kurang optimal; menggunakan gambar asli berlatar netral.',
    default_asset_url: previewAsset
  };
}

// -----------------------------------------------------------------------------
// Content Moderation for Custom Mockup Prompts (SRS FR-15, TC-22)
// -----------------------------------------------------------------------------
const BANNED_MODERATION_TERMS = [
  'nsfw', 'porn', 'telanjang', 'nude', 'kekerasan', 'senjata',
  'narkoba', 'tidak pantas', 'kasar', 'kebencian', 'gore', 'seksual'
];

function passesContentModeration(promptText = '') {
  const lower = String(promptText).toLowerCase();
  for (const term of BANNED_MODERATION_TERMS) {
    if (lower.includes(term)) {
      return {
        allowed: false,
        reason: `Deskripsi ditolak oleh moderasi konten karena memuat kata yang tidak pantas ("${term}"). Gunakan deskripsi pakaian yang sopan dan relevan.`
      };
    }
  }
  return { allowed: true };
}

function sanitizeUserStylePrompt(rawPrompt) {
  if (!rawPrompt) return null;
  return String(rawPrompt).trim().slice(0, 300);
}

// -----------------------------------------------------------------------------
// Main Server Factory
// -----------------------------------------------------------------------------
function createAppServer(customDbPath, options = {}) {
  const db = initDatabase(customDbPath);
  const isTestDb = Boolean(customDbPath && path.basename(String(customDbPath)).startsWith('test_'));
  const aiService = createAiService({
    forceMock: isTestDb && options.aiMode !== 'live',
    ...(options.aiServiceOptions || {})
  });

  function getUserDailyUsage(userId) {
    const todayWib = getWibDateString();
    const rows = db.prepare('SELECT feature, count FROM ai_usage WHERE user_id = ? AND usage_date = ?').all(userId, todayWib);
    const counts = { recognize: 0, outfit: 0, mockup: 0 };
    for (const r of rows) {
      if (counts[r.feature] !== undefined) counts[r.feature] = r.count;
    }
    return {
      date_wib: todayWib,
      reset_at: getNextWibMidnightIso(),
      usage: {
        recognize: {
          used: counts.recognize,
          limit: AI_QUOTA_LIMITS.recognize,
          remaining: Math.max(0, AI_QUOTA_LIMITS.recognize - counts.recognize)
        },
        outfit: {
          used: counts.outfit,
          limit: AI_QUOTA_LIMITS.outfit,
          remaining: Math.max(0, AI_QUOTA_LIMITS.outfit - counts.outfit)
        },
        mockup: {
          used: counts.mockup,
          limit: AI_QUOTA_LIMITS.mockup,
          remaining: Math.max(0, AI_QUOTA_LIMITS.mockup - counts.mockup)
        }
      }
    };
  }

  function consumeAiQuota(userId, feature) {
    const todayWib = getWibDateString();
    const limit = AI_QUOTA_LIMITS[feature];
    const row = db.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND usage_date = ? AND feature = ?').get(userId, todayWib, feature);
    const current = row ? row.count : 0;
    if (current >= limit) {
      return {
        allowed: false,
        reset_at: getNextWibMidnightIso(),
        limit,
        used: current
      };
    }
    if (row) {
      db.prepare('UPDATE ai_usage SET count = count + 1 WHERE user_id = ? AND usage_date = ? AND feature = ?').run(userId, todayWib, feature);
    } else {
      db.prepare('INSERT INTO ai_usage (usage_id, user_id, usage_date, feature, count) VALUES (?, ?, ?, ?, 1)').run(
        crypto.randomUUID(),
        userId,
        todayWib,
        feature
      );
    }
    return { allowed: true, used: current + 1, limit, reset_at: getNextWibMidnightIso() };
  }

  function refundAiQuota(userId, feature) {
    const todayWib = getWibDateString();
    db.prepare('UPDATE ai_usage SET count = MAX(0, count - 1) WHERE user_id = ? AND usage_date = ? AND feature = ?').run(
      userId,
      todayWib,
      feature
    );
  }

  function queueSimulatedEmail(recipientEmail, subject, tokenType, rawToken) {
    db.prepare(`
      INSERT INTO email_outbox (email_id, recipient_email, subject, token_type, raw_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), recipientEmail.toLowerCase(), subject, tokenType, rawToken, new Date().toISOString());
  }

  function formatWardrobeItem(row) {
    if (!row) return null;
    let characteristics = { pattern: 'Polos', fit: 'Regular fit', material: 'Katun', formality: 'smart_casual' };
    try {
      if (row.characteristics) characteristics = JSON.parse(row.characteristics);
    } catch {}
    return {
      item_id: row.item_id,
      user_id: row.user_id,
      name: row.name || `${row.sub_category} ${row.primary_color.toLowerCase()}`,
      image_url: createSignedStorageUrl(row.image_url),
      original_image_url: createSignedStorageUrl(row.original_image_url),
      thumbnail_url: createSignedStorageUrl(row.thumbnail_url),
      category: row.category,
      category_label: CATEGORY_LABELS[row.category] || row.category,
      sub_category: row.sub_category,
      primary_color: row.primary_color,
      characteristics,
      ai_confidence: row.ai_confidence,
      is_user_corrected: Boolean(row.is_user_corrected),
      is_deleted: Boolean(row.deleted_at),
      deleted_at: row.deleted_at || null,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  function formatOutfit(outfitRow) {
    if (!outfitRow) return null;
    const itemRows = db.prepare(`
      SELECT
        oi.outfit_item_id, oi.slot, oi.is_locked,
        wi.item_id, wi.user_id, wi.name, wi.image_url, wi.original_image_url, wi.thumbnail_url,
        wi.category, wi.sub_category, wi.primary_color, wi.characteristics,
        wi.ai_confidence, wi.is_user_corrected, wi.deleted_at, wi.created_at, wi.updated_at
      FROM outfit_items oi
      JOIN wardrobe_items wi ON wi.item_id = oi.item_id
      WHERE oi.outfit_id = ?
      ORDER BY CASE oi.slot
        WHEN 'one_piece' THEN 1
        WHEN 'top' THEN 2
        WHEN 'bottom' THEN 3
        WHEN 'outerwear' THEN 4
        WHEN 'footwear' THEN 5
        WHEN 'accessory' THEN 6
        ELSE 7
      END
    `).all(outfitRow.outfit_id);

    const items = itemRows.map((r) => ({
      ...formatWardrobeItem(r),
      slot: r.slot,
      is_locked: Boolean(r.is_locked)
    }));

    const hasDeletedItems = items.some((i) => i.is_deleted);
    const occasionRow = db.prepare('SELECT label_id FROM occasions WHERE code = ?').get(outfitRow.occasion_code);
    const styleRow = db.prepare('SELECT label_id FROM styles WHERE code = ?').get(outfitRow.style_code);

    return {
      outfit_id: outfitRow.outfit_id,
      user_id: outfitRow.user_id,
      title: outfitRow.title || outfitRow.saved_name || 'Natural, tetap profesional.',
      occasion_code: outfitRow.occasion_code,
      occasion_label: occasionRow ? occasionRow.label_id : outfitRow.occasion_code,
      style_code: outfitRow.style_code,
      style_label: styleRow ? styleRow.label_id : outfitRow.style_code,
      user_prompt: outfitRow.user_prompt,
      ai_reasoning: outfitRow.ai_reasoning,
      styling_note: outfitRow.styling_note || 'Gulung lengan satu lipatan dan masukkan bagian depan atasan untuk proporsi yang lebih seimbang.',
      weather_context: outfitRow.weather_context || 'Hangat · 28–32°C',
      location_context: outfitRow.location_context || 'Jakarta',
      date_label: outfitRow.date_label || null,
      preview_image_url: outfitRow.preview_image_url || '/assets/look-1.png',
      reprompt_count: outfitRow.reprompt_count || 0,
      parent_outfit_id: outfitRow.parent_outfit_id || null,
      is_saved: Boolean(outfitRow.is_saved),
      saved_name: outfitRow.saved_name,
      saved_at: outfitRow.saved_at,
      feedback: outfitRow.feedback || null,
      has_deleted_items: hasDeletedItems,
      deleted_items_warning: hasDeletedItems ? 'Berisi item yang sudah dihapus' : null,
      items,
      created_at: outfitRow.created_at,
      updated_at: outfitRow.updated_at
    };
  }

  function sendJson(res, status, data, extraHeaders = {}) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    });
    res.end(body);
  }

  function sendError(res, status, code, message, details = null) {
    sendJson(res, status, {
      error: {
        code,
        message,
        details
      }
    });
  }

  function readBodyBuffer(req, maxBytes = 25 * 1024 * 1024) {
    if (req.body !== undefined && req.body !== null) {
      if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
      if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
      if (typeof req.body === 'object') return Promise.resolve(Buffer.from(JSON.stringify(req.body)));
    }
    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      req.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          const err = new Error('Ukuran file melebihi batas maksimal 15 MB.');
          err.status = 413;
          reject(err);
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  async function parseJsonBody(req) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return req.body;
    }
    const buf = await readBodyBuffer(req);
    if (!buf.length) return {};
    try {
      return JSON.parse(buf.toString('utf8'));
    } catch {
      const err = new Error('Format JSON tidak valid.');
      err.status = 400;
      throw err;
    }
  }

  function parseMultipartFormData(buffer, contentType) {
    const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
    if (!match) return { fields: {}, files: [] };
    const boundary = `--${match[1] || match[2]}`;
    const boundaryBuf = Buffer.from(boundary);
    const fields = {};
    const files = [];

    let start = buffer.indexOf(boundaryBuf);
    while (start !== -1) {
      const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
      if (next === -1) break;
      let partStart = start + boundaryBuf.length;
      if (buffer[partStart] === 0x0D && buffer[partStart + 1] === 0x0A) partStart += 2;
      let partEnd = next;
      if (buffer[partEnd - 2] === 0x0D && buffer[partEnd - 1] === 0x0A) partEnd -= 2;
      const part = buffer.subarray(partStart, partEnd);

      const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEnd !== -1) {
        const headerStr = part.subarray(0, headerEnd).toString('utf8');
        const contentBuf = part.subarray(headerEnd + 4);
        const nameMatch = /name="([^"]+)"/i.exec(headerStr);
        const filenameMatch = /filename="([^"]*)"/i.exec(headerStr);
        const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerStr);
        const fieldName = nameMatch ? nameMatch[1] : 'file';

        if (filenameMatch) {
          files.push({
            fieldName,
            filename: filenameMatch[1],
            contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
            buffer: contentBuf
          });
        } else {
          fields[fieldName] = contentBuf.toString('utf8');
        }
      }
      start = next;
    }
    return { fields, files };
  }

  function parseCookies(req) {
    const raw = req.headers.cookie || '';
    const out = {};
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx > 0) {
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        out[k] = decodeURIComponent(v);
      }
    }
    return out;
  }

  function isRequestSecure(req) {
    return (
      req.headers['x-forwarded-proto'] === 'https' ||
      Boolean(req.socket?.encrypted) ||
      process.env.NODE_ENV === 'production'
    );
  }

  function serializeCookie(name, val, { maxAge, path = '/', httpOnly = true, sameSite = 'Lax', secure = false } = {}) {
    let cookie = `${name}=${encodeURIComponent(val)}; Path=${path}; SameSite=${sameSite}`;
    if (httpOnly) cookie += '; HttpOnly';
    if (typeof maxAge === 'number') cookie += `; Max-Age=${maxAge}`;
    if (secure) cookie += '; Secure';
    return cookie;
  }

  function authenticate(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    const payload = verifyJwt(token);
    if (!payload || !payload.user_id) return null;
    const user = db.prepare('SELECT * FROM users WHERE user_id = ? AND deleted_at IS NULL').get(payload.user_id);
    if (!user) return null;
    return user;
  }

  function formatUserProfile(user) {
    let favoriteColors = ['Hitam', 'Putih', 'Olive', 'Beige'];
    try {
      if (user.favorite_colors) favoriteColors = JSON.parse(user.favorite_colors);
    } catch {}
    let stylePreferences = [user.style_preference || 'smart_casual'];
    try {
      if (user.style_preferences) {
        const parsed = JSON.parse(user.style_preferences);
        if (Array.isArray(parsed) && parsed.length > 0) stylePreferences = parsed;
      }
    } catch {}
    return {
      user_id: user.user_id,
      full_name: user.full_name,
      nickname: user.nickname || user.full_name.split(' ')[0] || 'Nadia',
      email: user.email,
      gender_preference: user.gender_preference || 'undisclosed',
      style_preference: user.style_preference || 'smart_casual',
      style_preferences: stylePreferences,
      city: user.city || 'Jakarta',
      fit_preference: user.fit_preference || 'Relaxed fit',
      favorite_colors: favoriteColors,
      material_preference: user.material_preference || 'Linen, katun, dan bahan ringan',
      email_verified: Boolean(user.email_verified_at),
      email_verified_at: user.email_verified_at,
      ai_consent_at: user.ai_consent_at,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  }

  // ---------------------------------------------------------------------------
  // HTTP Server Handler
  // ---------------------------------------------------------------------------
  const requestHandler = async (req, res) => {
    const isHttps = isRequestSecure(req);
    const defaultProto = isHttps ? 'https' : 'http';
    const parsedUrl = new URL(req.url, `${defaultProto}://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    const origin = req.headers.origin || `${defaultProto}://${req.headers.host || 'localhost:3000'}`;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // =======================================================================
      // 1. META, HEALTH & LOCAL DEV OUTBOX ENDPOINTS
      // =======================================================================
      if (method === 'GET' && pathname === '/api/v1/health') {
        return sendJson(res, 200, {
          status: 'ok',
          ai: aiService.getStatus()
        });
      }

      if (method === 'GET' && pathname === '/api/v1/meta/occasions') {
        const rows = db.prepare('SELECT code, label_id, is_active FROM occasions WHERE is_active = 1').all();
        return sendJson(res, 200, { items: rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) })) });
      }

      if (method === 'GET' && pathname === '/api/v1/meta/styles') {
        const rows = db.prepare('SELECT code, label_id, is_active FROM styles WHERE is_active = 1').all();
        return sendJson(res, 200, {
          items: rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) })),
          colors: STANDARD_COLORS,
          categories: Object.entries(CATEGORY_LABELS).map(([code, label_id]) => ({ code, label_id }))
        });
      }

      if (method === 'GET' && pathname === '/api/v1/dev/outbox') {
        const emailFilter = (parsedUrl.searchParams.get('email') || '').trim().toLowerCase();
        const rows = emailFilter
          ? db.prepare('SELECT * FROM email_outbox WHERE recipient_email = ? ORDER BY created_at DESC LIMIT 10').all(emailFilter)
          : db.prepare('SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT 10').all();
        return sendJson(res, 200, { items: rows });
      }

      // =======================================================================
      // 2. AUTH ENDPOINTS: /api/v1/auth/* (FR-01, FR-02, FR-16, FR-20)
      // =======================================================================
      if (method === 'POST' && pathname === '/api/v1/auth/register') {
        const body = await parseJsonBody(req);
        const fullName = String(body.full_name || '').trim();
        const nickname = String(body.nickname || fullName.split(' ')[0] || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const genderPref = body.gender_preference || 'undisclosed';
        const stylePref = body.style_preference || 'smart_casual';
        const city = String(body.city || 'Jakarta').trim();
        const aiConsent = Boolean(body.ai_consent);

        if (!fullName || fullName.length > 100) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Nama lengkap wajib diisi (maks. 100 karakter).');
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          return sendError(res, 400, 'INVALID_EMAIL', 'Format alamat email tidak valid.');
        }
        if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
          return sendError(res, 400, 'WEAK_PASSWORD', 'Kata sandi minimal 8 karakter dan wajib memuat kombinasi huruf serta angka.');
        }
        if (!aiConsent) {
          return sendError(res, 400, 'AI_CONSENT_REQUIRED', 'Anda wajib menyetujui pemrosesan foto oleh AI sesuai UU PDP.');
        }
        if (!['female', 'male', 'neutral', 'undisclosed'].includes(genderPref)) {
          return sendError(res, 400, 'INVALID_GENDER', 'Preferensi gender tidak valid.');
        }

        const existing = db.prepare('SELECT user_id, deleted_at FROM users WHERE LOWER(email) = ?').get(email);
        if (existing) {
          return sendError(res, 400, 'EMAIL_ALREADY_EXISTS', 'Alamat email ini sudah terdaftar. Silakan masuk atau gunakan email lain.');
        }

        const now = new Date().toISOString();
        const userId = crypto.randomUUID();
        const passwordHash = hashPassword(password);

        db.prepare(`
          INSERT INTO users (
            user_id, full_name, nickname, email, password_hash, gender_preference,
            style_preference, style_preferences, city, email_verified_at, ai_consent_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        `).run(
          userId,
          fullName,
          nickname,
          email,
          passwordHash,
          genderPref,
          stylePref,
          JSON.stringify([stylePref]),
          city,
          now,
          now,
          now
        );

        const verifyRawToken = crypto.randomBytes(24).toString('hex');
        const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO user_tokens (token_id, user_id, type, token_hash, expires_at, created_at)
          VALUES (?, ?, 'email_verify', ?, ?, ?)
        `).run(crypto.randomUUID(), userId, hashToken(verifyRawToken), verifyExpires, now);

        queueSimulatedEmail(email, 'Verifikasi Email Akun WearGoods', 'email_verify', verifyRawToken);

        const accessToken = createJwt({ user_id: userId, email });
        const refreshRawToken = crypto.randomBytes(32).toString('hex');
        const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO user_tokens (token_id, user_id, type, token_hash, expires_at, created_at)
          VALUES (?, ?, 'refresh', ?, ?, ?)
        `).run(crypto.randomUUID(), userId, hashToken(refreshRawToken), refreshExpires, now);

        const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
        return sendJson(
          res,
          201,
          {
            message: 'Registrasi berhasil. Email verifikasi telah dikirim.',
            access_token: accessToken,
            refresh_token: refreshRawToken,
            user: formatUserProfile(user)
          },
          {
            'Set-Cookie': serializeCookie('refresh_token', refreshRawToken, {
              maxAge: 7 * 24 * 3600,
              secure: isHttps
            })
          }
        );
      }

      if (method === 'POST' && pathname === '/api/v1/auth/login') {
        const body = await parseJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const rememberMe = body.remember_me !== false;
        const ip = req.socket.remoteAddress || '127.0.0.1';
        const attemptKey = `${email}|${ip}`;

        const nowMs = Date.now();
        const attempt = db.prepare('SELECT * FROM login_attempts WHERE attempt_key = ?').get(attemptKey);
        if (attempt && attempt.cooldown_until && nowMs < attempt.cooldown_until) {
          const resetAt = new Date(attempt.cooldown_until).toISOString();
          return sendJson(res, 429, {
            error: {
              code: 'LOGIN_COOLDOWN',
              message: 'Terlalu banyak percobaan login yang gagal (5x beruntun). Akun dikunci sementara selama 15 menit.',
              details: { reset_at: resetAt }
            },
            reset_at: resetAt
          });
        }

        const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL').get(email);
        const valid = user && verifyPassword(password, user.password_hash);

        if (!valid) {
          const windowMs = 15 * 60 * 1000;
          const count = attempt && (nowMs - attempt.first_failed_at < windowMs) ? attempt.count + 1 : 1;
          const firstFailedAt = count === 1 ? nowMs : attempt.first_failed_at;
          const cooldownUntil = count >= 5 ? nowMs + windowMs : null;

          db.prepare(`
            INSERT INTO login_attempts (attempt_key, count, first_failed_at, cooldown_until)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(attempt_key) DO UPDATE SET
              count = excluded.count,
              first_failed_at = excluded.first_failed_at,
              cooldown_until = excluded.cooldown_until
          `).run(attemptKey, count, firstFailedAt, cooldownUntil);

          if (cooldownUntil) {
            const resetAt = new Date(cooldownUntil).toISOString();
            return sendJson(res, 429, {
              error: {
                code: 'LOGIN_COOLDOWN',
                message: '5 kegagalan login beruntun dalam 15 menit. Silakan tunggu cooldown 15 menit.',
                details: { reset_at: resetAt }
              },
              reset_at: resetAt
            });
          }

          return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email atau kata sandi yang Anda masukkan salah.');
        }

        db.prepare('DELETE FROM login_attempts WHERE attempt_key = ?').run(attemptKey);

        const accessToken = createJwt({ user_id: user.user_id, email: user.email }, 15 * 60);
        const refreshRawToken = crypto.randomBytes(32).toString('hex');
        const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO user_tokens (token_id, user_id, type, token_hash, expires_at, created_at)
          VALUES (?, ?, 'refresh', ?, ?, ?)
        `).run(crypto.randomUUID(), user.user_id, hashToken(refreshRawToken), refreshExpires, new Date().toISOString());

        const cookieHeader = serializeCookie('refresh_token', refreshRawToken, {
          maxAge: rememberMe ? 7 * 24 * 3600 : undefined,
          secure: isHttps
        });

        return sendJson(
          res,
          200,
          {
            access_token: accessToken,
            refresh_token: refreshRawToken,
            expires_in: 900,
            user: formatUserProfile(user)
          },
          { 'Set-Cookie': cookieHeader }
        );
      }

      if (method === 'POST' && pathname === '/api/v1/auth/refresh') {
        const body = await parseJsonBody(req);
        const cookies = parseCookies(req);
        const rawRefresh = body.refresh_token || cookies.refresh_token;
        if (!rawRefresh) {
          return sendError(res, 401, 'MISSING_REFRESH_TOKEN', 'Refresh token tidak ditemukan.');
        }

        const tHash = hashToken(rawRefresh);
        const tokenRow = db.prepare(`
          SELECT * FROM user_tokens
          WHERE type = 'refresh' AND token_hash = ? AND revoked_at IS NULL AND used_at IS NULL
        `).get(tHash);

        if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
          return sendError(res, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token tidak valid atau sudah kedaluwarsa.');
        }

        const user = db.prepare('SELECT * FROM users WHERE user_id = ? AND deleted_at IS NULL').get(tokenRow.user_id);
        if (!user) {
          return sendError(res, 401, 'USER_NOT_FOUND', 'Akun tidak aktif.');
        }

        const now = new Date().toISOString();
        db.prepare('UPDATE user_tokens SET used_at = ?, revoked_at = ? WHERE token_id = ?').run(now, now, tokenRow.token_id);

        const newRefreshRaw = crypto.randomBytes(32).toString('hex');
        const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO user_tokens (token_id, user_id, type, token_hash, expires_at, created_at)
          VALUES (?, ?, 'refresh', ?, ?, ?)
        `).run(crypto.randomUUID(), user.user_id, hashToken(newRefreshRaw), refreshExpires, now);

        const accessToken = createJwt({ user_id: user.user_id, email: user.email }, 15 * 60);
        return sendJson(
          res,
          200,
          {
            access_token: accessToken,
            refresh_token: newRefreshRaw,
            expires_in: 900,
            user: formatUserProfile(user)
          },
          {
            'Set-Cookie': serializeCookie('refresh_token', newRefreshRaw, {
              maxAge: 7 * 24 * 3600,
              secure: isHttps
            })
          }
        );
      }

      if (method === 'POST' && pathname === '/api/v1/auth/logout') {
        const body = await parseJsonBody(req);
        const cookies = parseCookies(req);
        const rawRefresh = body.refresh_token || cookies.refresh_token;
        const now = new Date().toISOString();

        if (rawRefresh) {
          db.prepare('UPDATE user_tokens SET revoked_at = ? WHERE token_hash = ? AND type = ?').run(
            now,
            hashToken(rawRefresh),
            'refresh'
          );
        }
        const user = authenticate(req);
        if (user) {
          db.prepare("UPDATE user_tokens SET revoked_at = ? WHERE user_id = ? AND type = 'refresh' AND revoked_at IS NULL").run(
            now,
            user.user_id
          );
        }

        return sendJson(
          res,
          200,
          { message: 'Berhasil keluar dan sesi telah dicabut.' },
          {
            'Set-Cookie': serializeCookie('refresh_token', '', {
              maxAge: 0,
              secure: isHttps
            })
          }
        );
      }

      if (method === 'POST' && pathname === '/api/v1/auth/verify-email') {
        const body = await parseJsonBody(req);
        const rawToken = String(body.token || '').trim();
        if (!rawToken) {
          return sendError(res, 400, 'MISSING_TOKEN', 'Token verifikasi email wajib disertakan.');
        }
        const row = db.prepare(`
          SELECT * FROM user_tokens
          WHERE type = 'email_verify' AND token_hash = ? AND used_at IS NULL AND revoked_at IS NULL
        `).get(hashToken(rawToken));

        if (!row || new Date(row.expires_at).getTime() < Date.now()) {
          return sendError(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'Tautan verifikasi email tidak valid atau sudah kedaluwarsa (berlaku 24 jam).');
        }

        const now = new Date().toISOString();
        db.prepare('UPDATE user_tokens SET used_at = ? WHERE token_id = ?').run(now, row.token_id);
        db.prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE user_id = ?').run(now, now, row.user_id);

        return sendJson(res, 200, { message: 'Email berhasil diverifikasi. Fitur generasi AI Mockup kini aktif.' });
      }

      if (method === 'POST' && pathname === '/api/v1/auth/resend-verification') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');
        if (user.email_verified_at) {
          return sendJson(res, 200, { message: 'Email Anda sudah terverifikasi.' });
        }
        const now = new Date().toISOString();
        const rawToken = crypto.randomBytes(24).toString('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        db.prepare(`
          INSERT INTO user_tokens (token_id, user_id, type, token_hash, expires_at, created_at)
          VALUES (?, ?, 'email_verify', ?, ?, ?)
        `).run(crypto.randomUUID(), user.user_id, hashToken(rawToken), expires, now);

        queueSimulatedEmail(user.email, 'Verifikasi Ulang Email WearGoods', 'email_verify', rawToken);

        return sendJson(res, 200, {
          message: 'Tautan verifikasi email baru telah dikirim ke kotak masuk Anda (berlaku 24 jam).'
        });
      }

      // FR-16: Forgot Password — 100% identical response without leaking token in public payload (TC-26)
      if (method === 'POST' && pathname === '/api/v1/auth/forgot-password') {
        const body = await parseJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        if (!email) {
          return sendError(res, 400, 'MISSING_EMAIL', 'Alamat email wajib diisi.');
        }

        const nowMs = Date.now();
        const oneHourAgo = nowMs - 60 * 60 * 1000;
        const history = (passwordResetRate.get(email) || []).filter((t) => t > oneHourAgo);
        if (history.length >= 3) {
          const resetAt = new Date(history[0] + 60 * 60 * 1000).toISOString();
          return sendJson(res, 429, {
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Maksimal 3 permintaan reset kata sandi per jam per email.',
              details: { reset_at: resetAt }
            },
            reset_at: resetAt
          });
        }
        history.push(nowMs);
        passwordResetRate.set(email, history);

        const genericMessage = 'Jika alamat email terdaftar di sistem kami, tautan reset kata sandi sekali pakai (berlaku 30 menit) telah dikirimkan.';
        const user = db.prepare('SELECT user_id, email FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL').get(email);

        if (user) {
          const now = new Date().toISOString();
          const rawToken = crypto.randomBytes(24).toString('hex');
          const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          db.prepare(`
            INSERT INTO user_tokens (token_id, user_id, type, token_hash, expires_at, created_at)
            VALUES (?, ?, 'password_reset', ?, ?, ?)
          `).run(crypto.randomUUID(), user.user_id, hashToken(rawToken), expires, now);

          queueSimulatedEmail(user.email, 'Reset Kata Sandi Akun WearGoods (30 Menit)', 'password_reset', rawToken);
        }

        return sendJson(res, 200, { message: genericMessage });
      }

      if (method === 'POST' && pathname === '/api/v1/auth/reset-password') {
        const body = await parseJsonBody(req);
        const rawToken = String(body.token || '').trim();
        const newPassword = String(body.new_password || '');

        if (!rawToken) {
          return sendError(res, 400, 'MISSING_TOKEN', 'Token reset kata sandi wajib diisi.');
        }
        if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
          return sendError(res, 400, 'WEAK_PASSWORD', 'Kata sandi baru minimal 8 karakter berisi huruf dan angka.');
        }

        const row = db.prepare(`
          SELECT * FROM user_tokens
          WHERE type = 'password_reset' AND token_hash = ? AND used_at IS NULL AND revoked_at IS NULL
        `).get(hashToken(rawToken));

        if (!row || new Date(row.expires_at).getTime() < Date.now()) {
          return sendError(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'Token reset kata sandi tidak valid, sudah pernah dipakai, atau kedaluwarsa (30 menit).');
        }

        const now = new Date().toISOString();
        db.prepare('UPDATE user_tokens SET used_at = ? WHERE token_id = ?').run(now, row.token_id);
        db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE user_id = ?').run(
          hashPassword(newPassword),
          now,
          row.user_id
        );
        db.prepare("UPDATE user_tokens SET revoked_at = ? WHERE user_id = ? AND type = 'refresh' AND revoked_at IS NULL").run(
          now,
          row.user_id
        );

        return sendJson(res, 200, {
          message: 'Kata sandi berhasil diperbarui. Seluruh sesi aktif lama telah dicabut; silakan login kembali.'
        });
      }

      // =======================================================================
      // 3. USER PROFILE, USAGE & DELETE ACCOUNT: /api/v1/users/me* (FR-03, 17, 19)
      // =======================================================================
      if (pathname === '/api/v1/users/me' && method === 'GET') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Token akses tidak valid atau sudah kedaluwarsa.');
        return sendJson(res, 200, { user: formatUserProfile(user) });
      }

      if (pathname === '/api/v1/users/me' && method === 'PATCH') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Token akses tidak valid atau sudah kedaluwarsa.');
        const body = await parseJsonBody(req);

        const fullName = body.full_name !== undefined ? String(body.full_name).trim() : user.full_name;
        const nickname = body.nickname !== undefined ? String(body.nickname).trim() : (user.nickname || fullName.split(' ')[0]);
        const genderPref = body.gender_preference !== undefined ? body.gender_preference : user.gender_preference;

        let stylePreferencesArr = null;
        if (Array.isArray(body.style_preferences) && body.style_preferences.length > 0) {
          stylePreferencesArr = body.style_preferences;
        } else if (body.style_preference) {
          stylePreferencesArr = [body.style_preference];
        }
        const stylePref = body.style_preference || (stylePreferencesArr ? stylePreferencesArr[0] : user.style_preference);
        const stylePreferencesJson = stylePreferencesArr ? JSON.stringify(stylePreferencesArr) : user.style_preferences;

        const city = body.city !== undefined ? String(body.city).trim() : user.city;
        const fitPref = body.fit_preference !== undefined ? String(body.fit_preference).trim() : user.fit_preference;
        const materialPref = body.material_preference !== undefined ? String(body.material_preference).trim() : user.material_preference;
        const favoriteColors = Array.isArray(body.favorite_colors)
          ? JSON.stringify(body.favorite_colors)
          : user.favorite_colors;

        if (!fullName) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Nama lengkap tidak boleh kosong.');
        }

        const now = new Date().toISOString();
        db.prepare(`
          UPDATE users
          SET full_name = ?, nickname = ?, gender_preference = ?, style_preference = ?,
              style_preferences = ?, city = ?, fit_preference = ?, favorite_colors = ?,
              material_preference = ?, updated_at = ?
          WHERE user_id = ?
        `).run(
          fullName,
          nickname,
          genderPref,
          stylePref,
          stylePreferencesJson,
          city,
          fitPref,
          favoriteColors,
          materialPref,
          now,
          user.user_id
        );

        const updated = db.prepare('SELECT * FROM users WHERE user_id = ?').get(user.user_id);
        return sendJson(res, 200, {
          message: 'Preferensi dan profil berhasil diperbarui.',
          user: formatUserProfile(updated)
        });
      }

      if (pathname === '/api/v1/users/me/password' && method === 'POST') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Token akses tidak valid.');
        const body = await parseJsonBody(req);
        const oldPassword = String(body.old_password || '');
        const newPassword = String(body.new_password || '');

        if (!verifyPassword(oldPassword, user.password_hash)) {
          return sendError(res, 400, 'INVALID_OLD_PASSWORD', 'Kata sandi lama yang Anda masukkan tidak sesuai.');
        }
        if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
          return sendError(res, 400, 'WEAK_PASSWORD', 'Kata sandi baru minimal 8 karakter berisi huruf dan angka.');
        }

        const now = new Date().toISOString();
        db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE user_id = ?').run(
          hashPassword(newPassword),
          now,
          user.user_id
        );
        return sendJson(res, 200, { message: 'Kata sandi berhasil diganti.' });
      }

      if (pathname === '/api/v1/users/me' && method === 'DELETE') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Token akses tidak valid.');
        const body = await parseJsonBody(req);
        const password = String(body.password || '');

        if (!verifyPassword(password, user.password_hash)) {
          return sendError(res, 400, 'INVALID_PASSWORD', 'Konfirmasi kata sandi salah. Penghapusan akun dibatalkan.');
        }

        const now = new Date().toISOString();
        db.prepare('UPDATE users SET deleted_at = ?, updated_at = ? WHERE user_id = ?').run(now, now, user.user_id);
        db.prepare('UPDATE user_tokens SET revoked_at = ? WHERE user_id = ?').run(now, user.user_id);
        db.prepare('UPDATE wardrobe_items SET deleted_at = ? WHERE user_id = ?').run(now, user.user_id);

        return sendJson(
          res,
          200,
          {
            message: 'Akun Anda telah dihapus dan seluruh sesi aktif dicabut. Data akan dibersihkan permanen paling lambat 30 hari.'
          },
          {
            'Set-Cookie': serializeCookie('refresh_token', '', {
              maxAge: 0,
              secure: isHttps
            })
          }
        );
      }

      if (pathname === '/api/v1/users/me/usage' && method === 'GET') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Token akses tidak valid.');
        return sendJson(res, 200, getUserDailyUsage(user.user_id));
      }

      // =======================================================================
      // 4. WARDROBE ENDPOINTS: /api/v1/wardrobe/* (FR-04..FR-09, FR-18)
      // =======================================================================
      if (pathname === '/api/v1/wardrobe/recognize' && method === 'POST') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');

        const contentType = req.headers['content-type'] || '';
        let fileBuffer = null;
        let filename = 'upload.jpg';
        let mimeType = 'image/jpeg';
        let hintText = '';
        let declaredRawSize = 0;

        if (contentType.includes('multipart/form-data')) {
          const rawBuf = await readBodyBuffer(req);
          const parsed = parseMultipartFormData(rawBuf, contentType);
          hintText = parsed.fields.hint || parsed.fields.name || '';
          declaredRawSize = Number(parsed.fields.raw_size_bytes || 0);
          if (parsed.files.length === 0) {
            return sendError(res, 400, 'NO_FILE', 'Tidak ada file foto yang diunggah.');
          }
          const f = parsed.files[0];
          fileBuffer = f.buffer;
          filename = f.filename || 'upload.jpg';
          mimeType = f.contentType || 'image/jpeg';
        } else {
          const body = await parseJsonBody(req);
          filename = String(body.filename || 'upload.jpg');
          mimeType = String(body.mime_type || 'image/jpeg');
          hintText = String(body.hint || body.name || '');
          declaredRawSize = Number(body.raw_size_bytes || 0);
          if (body.file_base64) {
            const base64Clean = String(body.file_base64).replace(/^data:[^;]+;base64,/, '');
            fileBuffer = Buffer.from(base64Clean, 'base64');
          } else {
            fileBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0xFF, 0xD9]);
          }
        }

        const maxRawBytes = 15 * 1024 * 1024;
        const maxPayloadBytes = 5 * 1024 * 1024;
        if (declaredRawSize > maxRawBytes || fileBuffer.length > maxRawBytes) {
          return sendError(res, 413, 'FILE_TOO_LARGE', 'Ukuran file melebihi batas maksimal 15 MB. Silakan pilih foto dengan ukuran lebih kecil.');
        }
        if (fileBuffer.length > maxPayloadBytes) {
          return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Payload gambar ke server melebihi 5 MB. Pastikan kompresi sisi klien aktif.');
        }

        const magicCheck = inspectFileMagicBytes(fileBuffer, filename, mimeType);
        if (!magicCheck.valid) {
          return sendError(res, magicCheck.status, 'UNSUPPORTED_MEDIA_TYPE', magicCheck.message);
        }

        const quota = consumeAiQuota(user.user_id, 'recognize');
        if (!quota.allowed) {
          return sendJson(res, 429, {
            error: {
              code: 'QUOTA_EXCEEDED',
              message: `Kuota pengenalan foto AI harian Anda (${quota.limit}/hari) telah habis. Kuota akan direset pukul 00:00 WIB.`,
              details: { reset_at: quota.reset_at }
            },
            reset_at: quota.reset_at
          });
        }

        try {
          const cleanBuffer = stripExifAndNormalizeBuffer(fileBuffer, magicCheck.format);
          const storedFileId = `${crypto.randomUUID()}${magicCheck.ext}`;
          const storedPath = path.join(UPLOADS_DIR, storedFileId);
          fs.writeFileSync(storedPath, cleanBuffer);

          const isRealPhotoUpload = cleanBuffer.length > 2048;
          const isSimulatedTimeout = `${filename} ${hintText}`.toLowerCase().includes('timeout');
          let aiResult = null;
          if (aiService.isLiveEnabled() && isRealPhotoUpload && !isSimulatedTimeout) {
            try {
              aiResult = await aiService.recognizeClothing({
                imageBuffer: cleanBuffer,
                mimeType,
                filename,
                hintText
              });
            } catch (geminiErr) {
              if (geminiErr.status === 422 || !aiService.fallbackOnError) {
                throw geminiErr;
              }
              console.warn(`[WearGoods AI] Recognize fallback ke simulasi lokal (${geminiErr.code || geminiErr.message})`);
            }
          }
          if (!aiResult) {
            aiResult = runAiClothingRecognition(filename, hintText);
          }
          const rawImageUrl = isRealPhotoUpload ? `/uploads/${storedFileId}` : aiResult.default_asset_url;

          return sendJson(res, 200, {
            recognized: {
              ...aiResult,
              original_filename: filename,
              converted_from_heic: Boolean(magicCheck.convertedFromHeic),
              exif_stripped: true,
              stored_file_id: storedFileId,
              image_url: createSignedStorageUrl(rawImageUrl),
              original_image_url: createSignedStorageUrl(`/uploads/${storedFileId}`),
              thumbnail_url: createSignedStorageUrl(rawImageUrl),
              raw_image_url: rawImageUrl,
              raw_original_url: `/uploads/${storedFileId}`
            },
            quota_remaining: quota.limit - quota.used
          });
        } catch (aiErr) {
          if ((aiErr.status || 500) >= 500) {
            refundAiQuota(user.user_id, 'recognize');
          }
          return sendError(
            res,
            aiErr.status || 502,
            aiErr.code || 'AI_RECOGNIZE_ERROR',
            aiErr.message || 'Gagal mengenali atribut pakaian.'
          );
        }
      }

      if (pathname === '/api/v1/wardrobe/items' && method === 'POST') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');
        const body = await parseJsonBody(req);

        const category = String(body.category || '').trim();
        const subCategory = String(body.sub_category || '').trim();
        const primaryColor = String(body.primary_color || '').trim();
        const name = String(body.name || `${subCategory} ${primaryColor.toLowerCase()}`).trim();
        const aiConfidence = body.ai_confidence !== undefined ? Number(body.ai_confidence) : 0.95;
        const confirmedLowConfidence = Boolean(body.confirmed_low_confidence || body.is_user_corrected);

        if (!['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'one_piece'].includes(category)) {
          return sendError(res, 400, 'INVALID_CATEGORY', 'Kategori pakaian tidak valid.');
        }
        if (!subCategory || !primaryColor) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Sub-kategori dan warna utama wajib diisi.');
        }

        const fieldConfs = body.confidence_per_field || {};
        const hasUnconfirmedLowField =
          (aiConfidence < 0.6 || Object.values(fieldConfs).some((v) => Number(v) < 0.6)) &&
          !confirmedLowConfidence;

        if (hasUnconfirmedLowField) {
          return sendError(
            res,
            400,
            'LOW_CONFIDENCE_CONFIRMATION_REQUIRED',
            'Terdapat atribut dengan tingkat keyakinan rendah (< 0,6) yang ditandai "Perlu dicek". Mohon periksa dan konfirmasi sebelum menyimpan.'
          );
        }

        const characteristics = {
          pattern: body.characteristics?.pattern || body.pattern || 'Polos',
          fit: body.characteristics?.fit || body.fit || 'Regular fit',
          material: body.characteristics?.material || body.material || 'Katun',
          formality: ['casual', 'smart_casual', 'formal'].includes(body.characteristics?.formality || body.formality)
            ? (body.characteristics?.formality || body.formality)
            : 'smart_casual'
        };

        const defaultAssetByCat = {
          top: '/assets/item-1.png',
          bottom: '/assets/item-2.png',
          footwear: '/assets/item-3.png',
          accessory: '/assets/item-4.png',
          outerwear: '/assets/mockup-outerwear.svg',
          one_piece: '/assets/mockup-one_piece.svg'
        };
        let cleanImg = (body.raw_image_url || body.image_url || defaultAssetByCat[category] || '/assets/item-1.png').split('?')[0];
        let cleanOrig = (body.raw_original_url || body.original_image_url || cleanImg).split('?')[0];
        let cleanThumb = (body.thumbnail_url || cleanImg).split('?')[0];

        if (body.cropped_image_base64 && typeof body.cropped_image_base64 === 'string') {
          try {
            const rawB64 = body.cropped_image_base64.replace(/^data:image\/\w+;base64,/, '');
            const cropBuf = Buffer.from(rawB64, 'base64');
            if (cropBuf.length > 500 && cropBuf.length < 15 * 1024 * 1024) {
              const isPng = body.cropped_image_base64.includes('image/png');
              const ext = isPng ? '.png' : '.jpg';
              const croppedFileId = `${crypto.randomUUID()}-crop${ext}`;
              const croppedFilePath = path.join(UPLOADS_DIR, croppedFileId);
              fs.writeFileSync(croppedFilePath, cropBuf);
              cleanImg = `/uploads/${croppedFileId}`;
              cleanThumb = `/uploads/${croppedFileId}`;
            }
          } catch (cropErr) {
            console.warn('[Wardrobe Item] Gagal menyimpan cropped_image_base64:', cropErr.message);
          }
        }

        const now = new Date().toISOString();
        const itemId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO wardrobe_items (
            item_id, user_id, name, image_url, original_image_url, thumbnail_url,
            category, sub_category, primary_color, characteristics,
            ai_confidence, is_user_corrected, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          itemId,
          user.user_id,
          name,
          cleanImg,
          cleanOrig,
          cleanThumb,
          category,
          subCategory,
          primaryColor,
          JSON.stringify(characteristics),
          aiConfidence,
          body.is_user_corrected ? 1 : 0,
          now,
          now
        );

        const created = db.prepare('SELECT * FROM wardrobe_items WHERE item_id = ?').get(itemId);
        return sendJson(res, 201, {
          message: 'Pakaian berhasil disimpan ke lemari digital.',
          item: formatWardrobeItem(created)
        });
      }

      if (pathname === '/api/v1/wardrobe/items/bulk' && method === 'POST') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');
        const body = await parseJsonBody(req);
        const rawItems = Array.isArray(body.items) ? body.items : [];

        if (rawItems.length === 0) {
          return sendError(res, 400, 'EMPTY_BATCH', 'Daftar pakaian untuk disimpan kosong.');
        }
        if (rawItems.length > 10) {
          return sendError(res, 400, 'BATCH_LIMIT_EXCEEDED', 'Unggah banyak foto (batch) dibatasi maksimal 10 foto sekaligus.');
        }

        const savedItems = [];
        const failedItems = [];
        const now = new Date().toISOString();

        const insertStmt = db.prepare(`
          INSERT INTO wardrobe_items (
            item_id, user_id, name, image_url, original_image_url, thumbnail_url,
            category, sub_category, primary_color, characteristics,
            ai_confidence, is_user_corrected, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const defaultAssetByCat = {
          top: '/assets/item-1.png',
          bottom: '/assets/item-2.png',
          footwear: '/assets/item-3.png',
          accessory: '/assets/item-4.png',
          outerwear: '/assets/mockup-outerwear.svg',
          one_piece: '/assets/mockup-one_piece.svg'
        };

        rawItems.forEach((entry, index) => {
          const category = String(entry.category || '').trim();
          const subCategory = String(entry.sub_category || '').trim();
          const primaryColor = String(entry.primary_color || '').trim();

          if (
            entry.is_invalid ||
            !['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'one_piece'].includes(category) ||
            !subCategory ||
            !primaryColor
          ) {
            failedItems.push({
              index,
              filename: entry.filename || `Foto #${index + 1}`,
              reason: entry.error_message || 'Format atau atribut pakaian tidak valid.'
            });
            return;
          }

          const itemId = crypto.randomUUID();
          const name = String(entry.name || `${subCategory} ${primaryColor.toLowerCase()}`).trim();
          const characteristics = {
            pattern: entry.characteristics?.pattern || entry.pattern || 'Polos',
            fit: entry.characteristics?.fit || entry.fit || 'Regular fit',
            material: entry.characteristics?.material || entry.material || 'Katun',
            formality: ['casual', 'smart_casual', 'formal'].includes(entry.characteristics?.formality || entry.formality)
              ? (entry.characteristics?.formality || entry.formality)
              : 'smart_casual'
          };
          let cleanImg = (entry.raw_image_url || entry.image_url || defaultAssetByCat[category] || '/assets/item-1.png').split('?')[0];
          let cleanOrig = (entry.raw_original_url || entry.original_image_url || cleanImg).split('?')[0];
          let cleanThumb = (entry.thumbnail_url || cleanImg).split('?')[0];

          if (entry.cropped_image_base64 && typeof entry.cropped_image_base64 === 'string') {
            try {
              const rawB64 = entry.cropped_image_base64.replace(/^data:image\/\w+;base64,/, '');
              const cropBuf = Buffer.from(rawB64, 'base64');
              if (cropBuf.length > 500 && cropBuf.length < 15 * 1024 * 1024) {
                const isPng = entry.cropped_image_base64.includes('image/png');
                const ext = isPng ? '.png' : '.jpg';
                const croppedFileId = `${crypto.randomUUID()}-crop${ext}`;
                const croppedFilePath = path.join(UPLOADS_DIR, croppedFileId);
                fs.writeFileSync(croppedFilePath, cropBuf);
                cleanImg = `/uploads/${croppedFileId}`;
                cleanThumb = `/uploads/${croppedFileId}`;
              }
            } catch (cropErr) {
              console.warn('[Wardrobe Bulk] Gagal menyimpan cropped_image_base64:', cropErr.message);
            }
          }

          insertStmt.run(
            itemId,
            user.user_id,
            name,
            cleanImg,
            cleanOrig,
            cleanThumb,
            category,
            subCategory,
            primaryColor,
            JSON.stringify(characteristics),
            entry.ai_confidence ?? 0.92,
            entry.is_user_corrected ? 1 : 0,
            now,
            now
          );

          const row = db.prepare('SELECT * FROM wardrobe_items WHERE item_id = ?').get(itemId);
          savedItems.push(formatWardrobeItem(row));
        });

        return sendJson(res, 201, {
          message: `${savedItems.length} item berhasil disimpan${failedItems.length ? `, ${failedItems.length} item gagal` : ''}.`,
          saved_count: savedItems.length,
          failed_count: failedItems.length,
          items: savedItems,
          failed: failedItems
        });
      }

      if (pathname === '/api/v1/wardrobe/items' && method === 'GET') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');

        const category = parsedUrl.searchParams.get('category') || '';
        const color = parsedUrl.searchParams.get('color') || '';
        const formality = parsedUrl.searchParams.get('formality') || '';
        const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
        const sort = parsedUrl.searchParams.get('sort') || 'newest';
        const page = Math.max(1, Number(parsedUrl.searchParams.get('page') || 1));
        const pageSize = Math.min(100, Math.max(1, Number(parsedUrl.searchParams.get('page_size') || 24)));

        const allUserRows = db.prepare(`
          SELECT * FROM wardrobe_items
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY created_at ${sort === 'oldest' ? 'ASC' : 'DESC'}, rowid ${sort === 'oldest' ? 'ASC' : 'DESC'}
        `).all(user.user_id);

        const allFormatted = allUserRows.map(formatWardrobeItem);

        const categoryCounts = {
          all: allFormatted.length,
          top: 0,
          bottom: 0,
          outerwear: 0,
          footwear: 0,
          accessory: 0,
          one_piece: 0
        };
        for (const it of allFormatted) {
          if (categoryCounts[it.category] !== undefined) categoryCounts[it.category]++;
        }

        const canGenerateOutfit =
          (categoryCounts.top >= 1 && categoryCounts.bottom >= 1) ||
          categoryCounts.one_piece >= 1;

        const filtered = allFormatted.filter((item) => {
          if (category && category !== 'all' && item.category !== category) return false;
          if (color && item.primary_color.toLowerCase() !== color.toLowerCase()) return false;
          if (formality && item.characteristics?.formality !== formality) return false;
          if (q) {
            const haystack = [
              item.name,
              item.sub_category,
              item.primary_color,
              item.characteristics?.pattern,
              item.characteristics?.material,
              item.category_label
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            if (!haystack.includes(q)) return false;
          }
          return true;
        });

        const total = filtered.length;
        const startIdx = (page - 1) * pageSize;
        const pagedItems = filtered.slice(startIdx, startIdx + pageSize);

        return sendJson(res, 200, {
          items: pagedItems,
          total,
          page,
          page_size: pageSize,
          total_pages: Math.max(1, Math.ceil(total / pageSize)),
          category_counts: categoryCounts,
          can_generate_outfit: canGenerateOutfit,
          empty_message:
            allFormatted.length === 0
              ? 'Lemari digital Anda masih kosong. Mulai dengan Tambah Pakaian.'
              : total === 0
              ? 'Tidak ada item yang cocok'
              : null
        });
      }

      const wardrobeItemMatch = /^\/api\/v1\/wardrobe\/items\/([^/]+)$/.exec(pathname);
      if (wardrobeItemMatch) {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');
        const itemId = wardrobeItemMatch[1];

        const row = db.prepare('SELECT * FROM wardrobe_items WHERE item_id = ?').get(itemId);
        if (!row || row.deleted_at) {
          return sendError(res, 404, 'ITEM_NOT_FOUND', 'Item pakaian tidak ditemukan.');
        }
        if (row.user_id !== user.user_id) {
          return sendError(res, 403, 'FORBIDDEN_NOT_OWNER', 'Anda tidak memiliki akses ke item pakaian milik pengguna lain.');
        }

        if (method === 'GET') {
          return sendJson(res, 200, { item: formatWardrobeItem(row) });
        }

        if (method === 'PATCH') {
          const body = await parseJsonBody(req);
          const category = body.category !== undefined ? String(body.category).trim() : row.category;
          const subCategory = body.sub_category !== undefined ? String(body.sub_category).trim() : row.sub_category;
          const primaryColor = body.primary_color !== undefined ? String(body.primary_color).trim() : row.primary_color;
          const name = body.name !== undefined ? String(body.name).trim() : (row.name || `${subCategory} ${primaryColor.toLowerCase()}`);

          if (!['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'one_piece'].includes(category)) {
            return sendError(res, 400, 'INVALID_CATEGORY', 'Kategori pakaian tidak valid.');
          }

          let currentChars = { pattern: 'Polos', fit: 'Regular fit', material: 'Katun', formality: 'smart_casual' };
          try {
            if (row.characteristics) currentChars = JSON.parse(row.characteristics);
          } catch {}

          const updatedChars = {
            pattern: body.characteristics?.pattern ?? body.pattern ?? currentChars.pattern,
            fit: body.characteristics?.fit ?? body.fit ?? currentChars.fit,
            material: body.characteristics?.material ?? body.material ?? currentChars.material,
            formality: body.characteristics?.formality ?? body.formality ?? currentChars.formality
          };

          const now = new Date().toISOString();
          db.prepare(`
            UPDATE wardrobe_items
            SET name = ?, category = ?, sub_category = ?, primary_color = ?,
                characteristics = ?, is_user_corrected = 1, updated_at = ?
            WHERE item_id = ?
          `).run(name, category, subCategory, primaryColor, JSON.stringify(updatedChars), now, itemId);

          const updatedRow = db.prepare('SELECT * FROM wardrobe_items WHERE item_id = ?').get(itemId);
          return sendJson(res, 200, {
            message: 'Atribut pakaian berhasil diperbarui.',
            item: formatWardrobeItem(updatedRow)
          });
        }

        if (method === 'DELETE') {
          const confirm = parsedUrl.searchParams.get('confirm') === 'true';
          const usedInSaved = db.prepare(`
            SELECT o.outfit_id, o.saved_name, o.title
            FROM outfit_items oi
            JOIN outfits o ON o.outfit_id = oi.outfit_id
            WHERE oi.item_id = ? AND o.is_saved = 1
          `).all(itemId);

          if (usedInSaved.length > 0) {
            if (!confirm) {
              return sendJson(res, 409, {
                requires_confirmation: true,
                used_in_saved_outfits: usedInSaved.length,
                error: {
                  code: 'ITEM_USED_IN_SAVED_OUTFIT',
                  message: `Peringatan: Pakaian ini digunakan pada ${usedInSaved.length} outfit tersimpan di Koleksi Anda. Bila dihapus, pakaian akan di-soft-delete dan outfit terkait akan ditandai "Berisi item yang sudah dihapus". Lanjutkan?`,
                  details: { outfits: usedInSaved }
                }
              });
            }
            const now = new Date().toISOString();
            db.prepare('UPDATE wardrobe_items SET deleted_at = ?, updated_at = ? WHERE item_id = ?').run(now, now, itemId);
            return sendJson(res, 200, {
              deletion_type: 'soft_delete',
              message: 'Pakaian dihapus dari katalog lemari. Outfit tersimpan yang memakai item ini kini ditandai "Berisi item yang sudah dihapus".'
            });
          } else {
            db.prepare('DELETE FROM outfit_items WHERE item_id = ?').run(itemId);
            db.prepare('DELETE FROM wardrobe_items WHERE item_id = ?').run(itemId);

            if (row.original_image_url && row.original_image_url.startsWith('/uploads/')) {
              let fileOnDisk = path.join(UPLOADS_DIR, path.basename(row.original_image_url));
              if (!fs.existsSync(fileOnDisk)) {
                const fallbackDisk = path.join(__dirname, '..', 'database', 'uploads', path.basename(row.original_image_url));
                if (fs.existsSync(fallbackDisk)) fileOnDisk = fallbackDisk;
              }
              if (fs.existsSync(fileOnDisk)) {
                try { fs.unlinkSync(fileOnDisk); } catch {}
              }
            }

            return sendJson(res, 200, {
              deletion_type: 'hard_delete',
              message: 'Pakaian telah dihapus permanen dari basis data dan penyimpanan.'
            });
          }
        }
      }

      // =======================================================================
      // 5. OUTFIT GENERATION & CUSTOMIZATION: /api/v1/outfits* (FR-10..FR-13)
      // =======================================================================
      function buildOutfitReasoning({ items, occasionLabel, styleCode, styleLabel, weatherContext, lockedNames = [] }) {
        const names = items.map((i) => (i.name || i.sub_category || '').trim().toLowerCase()).filter(Boolean);
        const itemList =
          names.length <= 1
            ? names[0] || 'kombinasi pilihanmu'
            : names.length === 2
              ? `${names[0]} dan ${names[1]}`
              : `${names.slice(0, -1).join(', ')}, dan ${names[names.length - 1]}`;
        const occ = (occasionLabel || 'harian').toLowerCase();
        const stl = (styleLabel || 'smart casual').toLowerCase();
        const weather = (weatherContext || 'hangat').toLowerCase();

        const templates = {
          smart_casual: `${itemList.charAt(0).toUpperCase() + itemList.slice(1)} memberi keseimbangan antara tampilan rapi dan rasa nyaman untuk agenda ${occ}. Proporsi warnanya tetap terasa ${stl} dan mudah dipakai di cuaca ${weather}.`,
          minimalist: `Kombinasi ${itemList} dipilih agar siluet untuk ${occ} terlihat bersih tanpa detail berlebihan. Palet warnanya selaras dengan karakter ${stl} dan nyaman menghadapi cuaca ${weather}.`,
          casual: `Paduan ${itemList} terasa santai namun tetap tertata untuk ${occ}. Pilihan bahannya mendukung pergerakan leluasa di cuaca ${weather} sambil mempertahankan gaya ${stl}.`,
          streetwear: `${itemList.charAt(0).toUpperCase() + itemList.slice(1)} menghadirkan siluet ${stl} yang tegas namun praktis untuk ${occ}, tetap terasa ringan di cuaca ${weather}.`,
          sporty: `Setelan ${itemList} mengutamakan sirkulasi udara dan keleluasaan gerak untuk agenda ${occ} di cuaca ${weather}, selaras dengan nuansa ${stl}.`,
          vintage: `Perpaduan ${itemList} memunculkan tekstur hangat dan klasik untuk ${occ}, memberi sentuhan ${stl} yang tetap nyaman di cuaca ${weather}.`
        };

        let text = templates[styleCode] || templates.smart_casual;
        if (lockedNames.length > 0) {
          const lockedText = lockedNames.map((n) => n.toLowerCase()).join(' dan ');
          text += ` Disusun ulang dengan tetap mempertahankan ${lockedText} sebagai fokus utama.`;
        }
        return text;
      }

      function buildStylingNote(styleCode) {
        const notes = {
          smart_casual: 'Gulung lengan satu lipatan dan masukkan bagian depan atasan agar garis pinggang terlihat lebih rapi.',
          minimalist: 'Biarkan jatuhnya potongan tetap bersih dan batasi aksesori pada satu titik fokus saja.',
          casual: 'Padukan tanpa menyisipkan atasan secara penuh untuk memberi siluet yang lebih santai.',
          streetwear: 'Berikan sedikit ruang gerak pada lapisan luar atau biarkan ujung atasan jatuh natural.',
          sporty: 'Pastikan tali sepatu dan detail kecil tertata ringkas agar tetap nyaman saat banyak bergerak.',
          vintage: 'Tambahkan aksesori bernuansa hangat seperti tas atau ikat pinggang kulit untuk mempertegas karakter klasik.'
        };
        return notes[styleCode] || notes.smart_casual;
      }

      if (pathname === '/api/v1/outfits/generate' && method === 'POST') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');
        const body = await parseJsonBody(req);

        const occasionCode = String(body.occasion_code || 'kerja_kantor').trim();
        const styleCode = String(body.style_code || user.style_preference || 'smart_casual').trim();
        const rawUserPrompt = body.user_prompt ? String(body.user_prompt) : '';
        const weatherContext = String(body.weather_context || 'Hangat · 28–32°C').trim();
        const locationContext = String(body.location_context || user.city || 'Jakarta').trim();
        const dateLabel = body.date_label ? String(body.date_label).trim() : null;

        if (rawUserPrompt.length > 300) {
          return sendError(res, 400, 'PROMPT_TOO_LONG', 'Catatan bebas maksimal 300 karakter.');
        }

        const occasionRow = db.prepare('SELECT * FROM occasions WHERE code = ?').get(occasionCode);
        const styleRow = db.prepare('SELECT * FROM styles WHERE code = ?').get(styleCode);
        if (!occasionRow || !styleRow) {
          return sendError(res, 400, 'INVALID_OCCASION_OR_STYLE', 'Pilihan occasion atau style tidak ditemukan dalam daftar baku.');
        }

        const userPrompt = sanitizeUserStylePrompt(rawUserPrompt);

        const activeItems = db.prepare(`
          SELECT * FROM wardrobe_items
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY created_at DESC
        `).all(user.user_id).map(formatWardrobeItem);

        const byCategory = {
          top: activeItems.filter((i) => i.category === 'top'),
          bottom: activeItems.filter((i) => i.category === 'bottom'),
          one_piece: activeItems.filter((i) => i.category === 'one_piece'),
          outerwear: activeItems.filter((i) => i.category === 'outerwear'),
          footwear: activeItems.filter((i) => i.category === 'footwear'),
          accessory: activeItems.filter((i) => i.category === 'accessory')
        };

        const hasTwoPiece = byCategory.top.length >= 1 && byCategory.bottom.length >= 1;
        const hasOnePiece = byCategory.one_piece.length >= 1;
        if (!hasTwoPiece && !hasOnePiece) {
          return sendError(
            res,
            422,
            'INSUFFICIENT_WARDROBE',
            'Koleksi lemari belum mencukupi untuk menyusun outfit valid. Tambahkan minimal 1 Atasan dan 1 Bawahan, atau 1 Terusan terlebih dahulu.',
            { action: 'TAMBAH_PAKAIAN' }
          );
        }

        if (userPrompt && userPrompt.toLowerCase().includes('simulate_timeout')) {
          return sendError(res, 504, 'AI_TIMEOUT', 'Layanan AI perangkai outfit melewati batas waktu (timeout 15 detik). Pilihan Anda tetap tersimpan; silakan coba lagi.');
        }

        const quota = consumeAiQuota(user.user_id, 'outfit');
        if (!quota.allowed) {
          return sendJson(res, 429, {
            error: {
              code: 'QUOTA_EXCEEDED',
              message: `Kuota generasi & kustomisasi outfit harian (${quota.limit}/hari) telah habis. Reset pukul 00:00 WIB.`,
              details: { reset_at: quota.reset_at }
            },
            reset_at: quota.reset_at
          });
        }

        const candidates = [];
        if (hasTwoPiece) {
          for (const top of byCategory.top) {
            for (const bottom of byCategory.bottom) {
              const footwearList = byCategory.footwear.length ? byCategory.footwear : [null];
              const accessoryList = byCategory.accessory.length ? byCategory.accessory : [null];
              const outerList = byCategory.outerwear.length ? [null, ...byCategory.outerwear] : [null];
              for (const foot of footwearList) {
                for (const acc of accessoryList) {
                  for (const out of outerList) {
                    const combo = [top, bottom, out, foot, acc].filter(Boolean);
                    candidates.push(combo);
                  }
                }
              }
            }
          }
        }
        if (hasOnePiece) {
          for (const op of byCategory.one_piece) {
            const footwearList = byCategory.footwear.length ? byCategory.footwear : [null];
            const accessoryList = byCategory.accessory.length ? byCategory.accessory : [null];
            for (const foot of footwearList) {
              for (const acc of accessoryList) {
                candidates.push([op, foot, acc].filter(Boolean));
              }
            }
          }
        }

        const recentOutfits = db.prepare(`
          SELECT outfit_id FROM outfits
          WHERE user_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT 3
        `).all(user.user_id);

        const recentSignatures = new Set();
        for (const ro of recentOutfits) {
          const oItems = db.prepare('SELECT item_id FROM outfit_items WHERE outfit_id = ? ORDER BY item_id').all(ro.outfit_id);
          recentSignatures.add(oItems.map((x) => x.item_id).join('|'));
        }

        let selectedItems = candidates[0];
        for (const cand of candidates) {
          const sig = cand.map((x) => x.item_id).sort().join('|');
          if (!recentSignatures.has(sig)) {
            selectedItems = cand;
            break;
          }
        }

        const titlesByStyle = {
          smart_casual: 'Natural, tetap profesional.',
          minimalist: 'Simpel, bersih, dan terarah.',
          casual: 'Santai yang tetap rapi.',
          streetwear: 'Karakter urban yang rileks.',
          sporty: 'Aktif dan leluasa bergerak.',
          vintage: 'Sentuhan klasik yang hangat.'
        };
        let title = titlesByStyle[styleCode] || 'Natural, tetap profesional.';
        let reasoning = buildOutfitReasoning({
          items: selectedItems,
          occasionLabel: occasionRow.label_id,
          styleCode,
          styleLabel: styleRow.label_id,
          weatherContext
        });
        let stylingNote = buildStylingNote(styleCode);

        if (aiService.isLiveEnabled()) {
          try {
            const aiOutfit = await aiService.generateOutfit({
              activeItems,
              occasionLabel: occasionRow.label_id,
              styleCode,
              styleLabel: styleRow.label_id,
              weatherContext,
              locationContext,
              userPrompt,
              userPreferences: formatUserProfile(user),
              recentSignatures: Array.from(recentSignatures),
              mode: 'generate'
            });
            if (aiOutfit && aiOutfit.selectedItems?.length) {
              const aiSig = aiOutfit.selectedItems.map((x) => x.item_id).sort().join('|');
              if (!recentSignatures.has(aiSig) || candidates.length <= 1) {
                selectedItems = aiOutfit.selectedItems;
              }
              title = aiOutfit.title || title;
              reasoning = aiOutfit.reasoning || reasoning;
              stylingNote = aiOutfit.stylingNote || stylingNote;
            }
          } catch (geminiErr) {
            if (!aiService.fallbackOnError) {
              refundAiQuota(user.user_id, 'outfit');
              return sendError(
                res,
                geminiErr.status || 502,
                geminiErr.code || 'AI_OUTFIT_FAILED',
                geminiErr.message || 'Gagal merangkai outfit dengan AI.'
              );
            }
            console.warn(`[WearGoods AI] Generate outfit fallback ke heuristik lokal (${geminiErr.code || geminiErr.message})`);
          }
        }

        const now = new Date().toISOString();
        const outfitId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO outfits (
            outfit_id, user_id, title, occasion_code, style_code, user_prompt,
            ai_reasoning, styling_note, weather_context, location_context, date_label,
            preview_image_url, reprompt_count, parent_outfit_id,
            is_saved, saved_name, saved_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, NULL, NULL, ?, ?)
        `).run(
          outfitId,
          user.user_id,
          title,
          occasionCode,
          styleCode,
          userPrompt,
          reasoning,
          stylingNote,
          weatherContext,
          locationContext,
          dateLabel,
          '/assets/look-1.png',
          now,
          now
        );

        const insertOI = db.prepare(`
          INSERT INTO outfit_items (outfit_item_id, outfit_id, item_id, slot, is_locked)
          VALUES (?, ?, ?, ?, 0)
        `);
        for (const item of selectedItems) {
          insertOI.run(crypto.randomUUID(), outfitId, item.item_id, item.category);
        }

        const createdRow = db.prepare('SELECT * FROM outfits WHERE outfit_id = ?').get(outfitId);
        const formattedOutfit = formatOutfit(createdRow);

        const inspirations = [
          {
            id: 'inspirasi-2',
            badge: 'INSPIRASI · ITEM TAMBAHAN',
            tag: 'INSPIRASI LEBIH FORMAL',
            title: 'Rapi tanpa berlebihan',
            items_summary: 'Blazer navy · denim · sneakers',
            description: 'Butuh blazer, kaus, denim & sneakers yang belum ada di lemarimu.',
            detail_description: 'Blazer navy, kaus putih, denim, dan sneakers.',
            note: 'Item pada look ini belum ada di lemari digitalmu. Gunakan sebagai referensi gaya, bukan daftar belanja wajib.',
            image_url: '/assets/look-2.png',
            missing_category: 'outerwear',
            suggested_prompt: 'Blazer tailored warna navy berbahan katun-linen ringan dengan potongan relaxed fit'
          },
          {
            id: 'inspirasi-3',
            badge: 'INSPIRASI · ITEM TAMBAHAN',
            tag: 'INSPIRASI LEBIH SANTAI',
            title: 'Santai yang terencana',
            items_summary: 'Rajut ecru · rok midi · flat shoes',
            description: 'Butuh rajut, rok midi, flat shoes & tas anyam di luar lemarimu.',
            detail_description: 'Rajut ecru, rok midi cokelat, flat shoes, dan tas anyam.',
            note: 'Item pada look ini belum ada di lemari digitalmu. Gunakan sebagai referensi gaya, bukan daftar belanja wajib.',
            image_url: '/assets/look-3.png',
            missing_category: 'top',
            suggested_prompt: 'Atasan rajut halus warna ecru lengan pendek dengan siluet rapi dan bahan breathable'
          }
        ];

        return sendJson(res, 201, {
          outfit: formattedOutfit,
          inspirations,
          quota_remaining: quota.limit - quota.used
        });
      }

      const customizeMatch = /^\/api\/v1\/outfits\/([^/]+)\/customize$/.exec(pathname);
      if (customizeMatch && method === 'POST') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');
        const outfitId = customizeMatch[1];

        const baseOutfit = db.prepare('SELECT * FROM outfits WHERE outfit_id = ?').get(outfitId);
        if (!baseOutfit) return sendError(res, 404, 'OUTFIT_NOT_FOUND', 'Outfit tidak ditemukan.');
        if (baseOutfit.user_id !== user.user_id) {
          return sendError(res, 403, 'FORBIDDEN_NOT_OWNER', 'Anda bukan pemilik outfit ini.');
        }

        const body = await parseJsonBody(req);
        const action = String(body.action || 'suggest_alternative').trim();
        const lockedItemIds = Array.isArray(body.locked_item_ids) ? new Set(body.locked_item_ids) : null;
        const targetCategory = body.target_category || body.slot || null;
        const replacementItemId = body.replacement_item_id || null;
        const customPrompt = body.user_prompt ? sanitizeUserStylePrompt(body.user_prompt) : baseOutfit.user_prompt;

        const currentOutfitItems = db.prepare(`
          SELECT oi.*, wi.category, wi.sub_category, wi.primary_color, wi.name
          FROM outfit_items oi
          JOIN wardrobe_items wi ON wi.item_id = oi.item_id
          WHERE oi.outfit_id = ?
        `).all(outfitId);

        if (action === 'lock') {
          const itemIdToToggle = body.item_id;
          for (const oi of currentOutfitItems) {
            const newLock = lockedItemIds
              ? lockedItemIds.has(oi.item_id)
              : oi.item_id === itemIdToToggle
              ? !oi.is_locked
              : Boolean(oi.is_locked);
            db.prepare('UPDATE outfit_items SET is_locked = ? WHERE outfit_item_id = ?').run(newLock ? 1 : 0, oi.outfit_item_id);
          }
          return sendJson(res, 200, {
            message: 'Status kunci item pada outfit diperbarui.',
            outfit: formatOutfit(baseOutfit)
          });
        }

        const nextRepromptCount = (baseOutfit.reprompt_count || 0) + 1;
        if (nextRepromptCount > 10) {
          return sendError(res, 400, 'REPROMPT_LIMIT_REACHED', 'Batas kustomisasi/re-prompt maksimal 10 kali per outfit telah tercapai.');
        }

        const effectiveItems = currentOutfitItems.map((oi) => ({
          ...oi,
          is_locked: lockedItemIds ? lockedItemIds.has(oi.item_id) : Boolean(oi.is_locked)
        }));

        if (action === 'replace_manual') {
          const newItem = db.prepare('SELECT * FROM wardrobe_items WHERE item_id = ? AND user_id = ? AND deleted_at IS NULL').get(
            replacementItemId,
            user.user_id
          );
          if (!newItem) {
            return sendError(res, 404, 'REPLACEMENT_NOT_FOUND', 'Item pengganti tidak ditemukan di lemari Anda.');
          }
          const slotToReplace = targetCategory || newItem.category;
          const existingSlotIdx = effectiveItems.findIndex((x) => x.slot === slotToReplace);
          if (existingSlotIdx !== -1 && effectiveItems[existingSlotIdx].is_locked) {
            return sendError(res, 400, 'SLOT_IS_LOCKED', 'Item pada kategori ini sedang dikunci. Buka kunci terlebih dahulu untuk menggantinya.');
          }
          if (existingSlotIdx !== -1) {
            effectiveItems[existingSlotIdx] = {
              ...effectiveItems[existingSlotIdx],
              item_id: newItem.item_id,
              slot: newItem.category,
              name: newItem.name || newItem.sub_category
            };
          } else {
            effectiveItems.push({
              item_id: newItem.item_id,
              slot: newItem.category,
              is_locked: false,
              name: newItem.name || newItem.sub_category
            });
          }
        } else {
          const quota = consumeAiQuota(user.user_id, 'outfit');
          if (!quota.allowed) {
            return sendJson(res, 429, {
              error: {
                code: 'QUOTA_EXCEEDED',
                message: 'Kuota kustomisasi AI harian telah habis. Reset pukul 00:00 WIB.',
                details: { reset_at: quota.reset_at }
              },
              reset_at: quota.reset_at
            });
          }

          const slotsToTry = targetCategory
            ? effectiveItems.filter((x) => x.slot === targetCategory && !x.is_locked)
            : effectiveItems.filter((x) => !x.is_locked);

          if (slotsToTry.length === 0) {
            return sendError(res, 400, 'ALL_ITEMS_LOCKED', 'Semua item yang dipilih sedang terkunci. Buka kunci minimal satu item untuk meminta saran alternatif.');
          }

          let replacedCount = 0;
          let missingAlternativeCategory = null;

          for (const slotItem of slotsToTry) {
            const alternatives = db.prepare(`
              SELECT * FROM wardrobe_items
              WHERE user_id = ? AND category = ? AND item_id != ? AND deleted_at IS NULL
              ORDER BY created_at DESC
            `).all(user.user_id, slotItem.slot, slotItem.item_id);

            if (alternatives.length > 0) {
              const chosen = alternatives[nextRepromptCount % alternatives.length];
              const idx = effectiveItems.findIndex((x) => x.slot === slotItem.slot);
              if (idx !== -1) {
                effectiveItems[idx] = {
                  ...effectiveItems[idx],
                  item_id: chosen.item_id,
                  name: chosen.name || chosen.sub_category
                };
                replacedCount++;
              }
            } else {
              missingAlternativeCategory = slotItem.slot;
            }
          }

          if (replacedCount === 0) {
            const catLabel = CATEGORY_LABELS[missingAlternativeCategory || targetCategory || 'top'] || 'kategori ini';
            return sendJson(res, 200, {
              replaced: false,
              need_new_item: true,
              missing_category: missingAlternativeCategory || targetCategory || 'top',
              message: `Tidak ada item pengganti lain pada kategori ${catLabel} di lemari Anda. Ingin membuat ilustrasi item baru lewat "Need New Item?"?`,
              outfit: formatOutfit(baseOutfit)
            });
          }
        }

        const occasionRow = db.prepare('SELECT label_id FROM occasions WHERE code = ?').get(baseOutfit.occasion_code);
        const styleRow = db.prepare('SELECT label_id FROM styles WHERE code = ?').get(baseOutfit.style_code);
        const lockedNames = effectiveItems.filter((x) => x.is_locked).map((x) => x.name).filter(Boolean);
        const now = new Date().toISOString();
        const newOutfitId = crypto.randomUUID();
        let newTitle = baseOutfit.title;
        let newStylingNote = baseOutfit.styling_note;
        let newReasoning = buildOutfitReasoning({
          items: effectiveItems,
          occasionLabel: occasionRow?.label_id || baseOutfit.occasion_code,
          styleCode: baseOutfit.style_code,
          styleLabel: styleRow?.label_id || baseOutfit.style_code,
          weatherContext: baseOutfit.weather_context,
          lockedNames
        });

        if (action !== 'lock' && action !== 'replace_manual' && aiService.isLiveEnabled()) {
          try {
            const activeItems = db.prepare(`
              SELECT * FROM wardrobe_items
              WHERE user_id = ? AND deleted_at IS NULL
              ORDER BY created_at DESC
            `).all(user.user_id).map(formatWardrobeItem);

            const lockedIds = effectiveItems.filter((x) => x.is_locked).map((x) => x.item_id);
            const lockedSet = new Set(lockedIds);
            const prevSignature = currentOutfitItems.map((x) => x.item_id).sort().join('|');

            const aiCustom = await aiService.generateOutfit({
              activeItems,
              occasionLabel: occasionRow?.label_id || baseOutfit.occasion_code,
              styleCode: baseOutfit.style_code,
              styleLabel: styleRow?.label_id || baseOutfit.style_code,
              weatherContext: baseOutfit.weather_context,
              locationContext: baseOutfit.location_context,
              userPrompt: customPrompt,
              userPreferences: formatUserProfile(user),
              recentSignatures: [prevSignature],
              lockedItemIds: lockedIds,
              targetCategory,
              mode: 'customize'
            });

            if (aiCustom && aiCustom.selectedItems?.length) {
              const aiSig = aiCustom.selectedItems.map((x) => x.item_id).sort().join('|');
              const unlockedChanged = aiSig !== prevSignature;
              if (unlockedChanged) {
                effectiveItems.length = 0;
                for (const item of aiCustom.selectedItems) {
                  effectiveItems.push({
                    item_id: item.item_id,
                    slot: item.category,
                    is_locked: lockedSet.has(item.item_id),
                    name: item.name || item.sub_category
                  });
                }
              }
              newTitle = aiCustom.title || newTitle;
              newReasoning = aiCustom.reasoning || newReasoning;
              newStylingNote = aiCustom.stylingNote || newStylingNote;
            }
          } catch (geminiErr) {
            if (!aiService.fallbackOnError) {
              refundAiQuota(user.user_id, 'outfit');
              return sendError(
                res,
                geminiErr.status || 502,
                geminiErr.code || 'AI_CUSTOMIZE_FAILED',
                geminiErr.message || 'Gagal menyesuaikan outfit dengan AI.'
              );
            }
            console.warn(`[WearGoods AI] Customize outfit fallback ke aturan lokal (${geminiErr.code || geminiErr.message})`);
          }
        }

        db.prepare(`
          INSERT INTO outfits (
            outfit_id, user_id, title, occasion_code, style_code, user_prompt,
            ai_reasoning, styling_note, weather_context, location_context, date_label,
            preview_image_url, reprompt_count, parent_outfit_id,
            is_saved, saved_name, saved_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)
        `).run(
          newOutfitId,
          user.user_id,
          newTitle,
          baseOutfit.occasion_code,
          baseOutfit.style_code,
          customPrompt,
          newReasoning,
          newStylingNote,
          baseOutfit.weather_context,
          baseOutfit.location_context,
          baseOutfit.date_label,
          baseOutfit.preview_image_url,
          nextRepromptCount,
          baseOutfit.outfit_id,
          now,
          now
        );

        const insertOI = db.prepare(`
          INSERT INTO outfit_items (outfit_item_id, outfit_id, item_id, slot, is_locked)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of effectiveItems) {
          insertOI.run(crypto.randomUUID(), newOutfitId, item.item_id, item.slot, item.is_locked ? 1 : 0);
        }

        const newOutfitRow = db.prepare('SELECT * FROM outfits WHERE outfit_id = ?').get(newOutfitId);
        return sendJson(res, 201, {
          replaced: true,
          need_new_item: false,
          message: 'Kombinasi outfit berhasil diperbarui dengan mempertahankan item terkunci.',
          outfit: formatOutfit(newOutfitRow)
        });
      }

      if (pathname === '/api/v1/outfits' && method === 'GET') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');

        const savedOnly = parsedUrl.searchParams.get('saved') === 'true';
        const occasionFilter = parsedUrl.searchParams.get('occasion_code') || '';

        const rows = db.prepare(`
          SELECT * FROM outfits
          WHERE user_id = ? ${savedOnly ? 'AND is_saved = 1' : ''}
          ORDER BY COALESCE(saved_at, created_at) DESC, rowid DESC
        `).all(user.user_id);

        let outfits = rows.map(formatOutfit);
        if (occasionFilter) {
          outfits = outfits.filter((o) => o.occasion_code === occasionFilter);
        }

        return sendJson(res, 200, {
          items: outfits,
          total: outfits.length
        });
      }

      const outfitDetailMatch = /^\/api\/v1\/outfits\/([^/]+)$/.exec(pathname);
      if (outfitDetailMatch) {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');
        const outfitId = outfitDetailMatch[1];

        const row = db.prepare('SELECT * FROM outfits WHERE outfit_id = ?').get(outfitId);
        if (!row) return sendError(res, 404, 'OUTFIT_NOT_FOUND', 'Outfit tidak ditemukan.');
        if (row.user_id !== user.user_id) {
          return sendError(res, 403, 'FORBIDDEN_NOT_OWNER', 'Anda tidak memiliki akses ke outfit milik pengguna lain.');
        }

        if (method === 'GET') {
          return sendJson(res, 200, { outfit: formatOutfit(row) });
        }

        if (method === 'PATCH') {
          const body = await parseJsonBody(req);
          const now = new Date().toISOString();
          const occasionRow = db.prepare('SELECT label_id FROM occasions WHERE code = ?').get(row.occasion_code);
          const occasionLabel = occasionRow ? occasionRow.label_id : row.occasion_code;
          const dateLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
          const defaultSavedName = `${occasionLabel} · ${dateLabel}`;

          const isSaved = body.is_saved !== undefined ? (body.is_saved ? 1 : 0) : row.is_saved;
          let savedName = row.saved_name;
          if (body.saved_name !== undefined) {
            const trimmedName = String(body.saved_name || '').trim();
            savedName = trimmedName || defaultSavedName;
          } else if (isSaved && !savedName) {
            savedName = defaultSavedName;
          }
          const title = body.saved_name ? savedName : (body.title || row.title);
          const savedAt = isSaved ? (row.saved_at || now) : null;
          const feedback = body.feedback !== undefined ? String(body.feedback) : row.feedback;
          const plannedDay = body.date_label !== undefined ? String(body.date_label) : row.date_label;

          db.prepare(`
            UPDATE outfits
            SET is_saved = ?, saved_name = ?, title = ?, saved_at = ?, feedback = ?, date_label = ?, updated_at = ?
            WHERE outfit_id = ?
          `).run(isSaved, savedName, title, savedAt, feedback, plannedDay, now, outfitId);

          const updated = db.prepare('SELECT * FROM outfits WHERE outfit_id = ?').get(outfitId);
          return sendJson(res, 200, {
            message: isSaved ? 'Outfit berhasil disimpan ke Koleksi saya.' : 'Outfit diperbarui.',
            outfit: formatOutfit(updated)
          });
        }

        if (method === 'DELETE') {
          db.prepare('DELETE FROM outfits WHERE outfit_id = ?').run(outfitId);
          return sendJson(res, 200, { message: 'Outfit berhasil dihapus dari Koleksi.' });
        }
      }

      // =======================================================================
      // 6. NEED NEW ITEM? & MOCKUP ENDPOINTS (FR-14, FR-15, FR-19, FR-20)
      // =======================================================================
      const outfitMockupMatch = /^\/api\/v1\/outfits\/([^/]+)\/mockup$/.exec(pathname);
      if (outfitMockupMatch && method === 'POST') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');

        if (!user.email_verified_at) {
          return sendError(
            res,
            403,
            'EMAIL_NOT_VERIFIED',
            'Akun Anda belum terverifikasi. Silakan verifikasi alamat email Anda terlebih dahulu untuk memakai fitur generasi Mockup AI.'
          );
        }

        const outfitId = outfitMockupMatch[1];
        const outfitRow = db.prepare('SELECT * FROM outfits WHERE outfit_id = ?').get(outfitId);
        if (!outfitRow) return sendError(res, 404, 'OUTFIT_NOT_FOUND', 'Outfit tidak ditemukan.');
        if (outfitRow.user_id !== user.user_id) {
          return sendError(res, 403, 'FORBIDDEN_NOT_OWNER', 'Anda bukan pemilik outfit ini.');
        }

        const body = await parseJsonBody(req);
        const quota = consumeAiQuota(user.user_id, 'mockup');
        if (!quota.allowed) {
          return sendJson(res, 429, {
            error: {
              code: 'QUOTA_EXCEEDED',
              message: `Kuota generasi Mockup AI harian Anda (${quota.limit}/hari) telah habis. Kuota akan pulih pukul 00:00 WIB.`,
              details: { reset_at: quota.reset_at }
            },
            reset_at: quota.reset_at
          });
        }

        if (body.simulate_error) {
          refundAiQuota(user.user_id, 'mockup');
          return sendError(res, 502, 'AI_MOCKUP_FAILED', 'Terjadi kegagalan layanan AI saat membuat mockup. Kuota Anda telah dikembalikan.');
        }

        const formatted = formatOutfit(outfitRow);
        const presentSlots = new Set(formatted.items.map((i) => i.slot));

        let missingCategory = body.missing_category || 'outerwear';
        let gapAnalysis = '';
        let generatedPrompt = '';
        let searchKeywords = { id: [], en: [] };

        if (!presentSlots.has('outerwear') || missingCategory === 'outerwear') {
          missingCategory = 'outerwear';
          gapAnalysis = 'Outfit ini sudah memiliki dasar yang rapi, namun belum memiliki Luaran (Outerwear). Penambahan blazer atau overshirt ringan warna Navy dengan potongan relaxed fit dan bahan katun-linen akan mempertegas struktur profesional sekaligus nyaman di ruang ber-AC.';
          generatedPrompt = 'Single clothing item illustration on plain neutral background: Structured navy cotton-linen blazer, relaxed tailored fit, minimalist lapel';
          searchKeywords = {
            id: ['blazer navy wanita smart casual', 'luaran linen navy kantor', 'jaket tailored ringan'],
            en: ['navy linen structured blazer', 'smart casual relaxed blazer', 'lightweight tailored jacket']
          };
        } else if (!presentSlots.has('footwear') || missingCategory === 'footwear') {
          missingCategory = 'footwear';
          gapAnalysis = 'Outfit belum dilengkapi Alas Kaki (Footwear). Sepatu leather sneakers putih bersih atau flat shoes minimalis akan menyeimbangkan proporsi kasual dan rapi.';
          generatedPrompt = 'Single item studio illustration: Minimalist white leather court sneakers with warm cream sole on neutral background';
          searchKeywords = {
            id: ['sneakers kulit putih minimalis', 'sepatu smart casual putih', 'flat shoes kulit netral'],
            en: ['minimalist white leather sneakers', 'smart casual court shoes', 'clean leather flats']
          };
        } else if (!presentSlots.has('accessory') || missingCategory === 'accessory') {
          missingCategory = 'accessory';
          gapAnalysis = 'Outfit belum memiliki Aksesori pelengkap. Tas struktur kulit atau tas anyam berwarna hangat (Tan/Cokelat) akan menyatukan palet earth-tone pakaianmu.';
          generatedPrompt = 'Single item studio illustration: Structured tan leather shoulder bag on neutral background';
          searchKeywords = {
            id: ['tas bahu kulit tan', 'tote bag minimalis kerja', 'tas struktur warna bumi'],
            en: ['tan structured leather tote', 'minimalist work shoulder bag', 'earth tone leather bag']
          };
        } else {
          missingCategory = body.missing_category || 'top';
          gapAnalysis = 'Outfit Anda sudah lengkap secara komposisi. Sebagai variasi penyegar gaya, atasan rajut halus warna Ecru (Krem) berbahan katun breathable dapat menjadi alternatif pengganti kemeja.';
          generatedPrompt = 'Single item studio illustration: Fine gauge ecru knit short-sleeve top on neutral background';
          searchKeywords = {
            id: ['atasan rajut ecru lengan pendek', 'knit top krem minimalis', 'kaus rajut halus smart casual'],
            en: ['ecru fine knit short sleeve top', 'minimalist cream knit shirt', 'smart casual knitwear']
          };
        }

        const mockupId = crypto.randomUUID();
        const now = new Date().toISOString();

        if (aiService.isLiveEnabled()) {
          try {
            const aiGap = await aiService.analyzeItemGap({
              outfit: formatted,
              missingCategory: body.missing_category || missingCategory,
              userPreferences: formatUserProfile(user)
            });
            if (aiGap) {
              missingCategory = aiGap.missingCategory || missingCategory;
              gapAnalysis = aiGap.gapAnalysis || gapAnalysis;
              generatedPrompt = aiGap.generatedPrompt || generatedPrompt;
              searchKeywords = aiGap.searchKeywords || searchKeywords;
            }
          } catch (geminiErr) {
            if (!aiService.fallbackOnError) {
              refundAiQuota(user.user_id, 'mockup');
              return sendError(
                res,
                geminiErr.status || 502,
                geminiErr.code || 'AI_MOCKUP_FAILED',
                geminiErr.message || 'Terjadi kegagalan layanan AI saat menganalisis pelengkap. Kuota Anda telah dikembalikan.'
              );
            }
            console.warn(`[WearGoods AI] Gap analysis fallback ke template lokal (${geminiErr.code || geminiErr.message})`);
          }
        }

        let mockupImageUrl = `/assets/mockup-${missingCategory}.svg`;
        if (aiService.isLiveEnabled()) {
          const aiImgUrl = await aiService.generateMockupImage({
            prompt: generatedPrompt,
            mockupId,
            uploadsDir: UPLOADS_DIR
          });
          if (aiImgUrl) {
            mockupImageUrl = aiImgUrl;
          }
        }

        db.prepare(`
          INSERT INTO mockup_requests (
            mockup_id, user_id, outfit_id, source, missing_category,
            generated_prompt, gap_analysis, status, mockup_image_url,
            search_keywords, error_message, created_at, completed_at
          ) VALUES (?, ?, ?, 'auto', ?, ?, ?, 'succeeded', ?, ?, NULL, ?, ?)
        `).run(
          mockupId,
          user.user_id,
          outfitId,
          missingCategory,
          generatedPrompt,
          gapAnalysis,
          mockupImageUrl,
          JSON.stringify(searchKeywords),
          now,
          now
        );

        return sendJson(res, 202, {
          mockup_id: mockupId,
          status: 'queued',
          message: 'Analisis kekurangan selesai. Job generasi mockup AI sedang diproses.',
          quota_remaining: quota.limit - quota.used
        });
      }

      if (pathname === '/api/v1/mockups' && method === 'POST') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');

        if (!user.email_verified_at) {
          return sendError(
            res,
            403,
            'EMAIL_NOT_VERIFIED',
            'Verifikasi email wajib dilakukan sebelum menggunakan fitur generasi Mockup AI.'
          );
        }

        const body = await parseJsonBody(req);
        const customPrompt = String(body.prompt || body.description || '').trim();
        const missingCategory = String(body.missing_category || body.category || 'outerwear').trim();

        if (!customPrompt || customPrompt.length > 300) {
          return sendError(res, 400, 'INVALID_PROMPT', 'Deskripsi mockup kustom wajib diisi (maksimal 300 karakter).');
        }

        const mod = passesContentModeration(customPrompt);
        if (!mod.allowed) {
          return sendError(res, 422, 'CONTENT_MODERATION_REJECTED', mod.reason);
        }

        const quota = consumeAiQuota(user.user_id, 'mockup');
        if (!quota.allowed) {
          return sendJson(res, 429, {
            error: {
              code: 'QUOTA_EXCEEDED',
              message: `Kuota generasi Mockup AI harian (${quota.limit}/hari) telah habis. Kuota akan pulih pukul 00:00 WIB.`,
              details: { reset_at: quota.reset_at }
            },
            reset_at: quota.reset_at
          });
        }

        if (body.simulate_error || customPrompt.toLowerCase().includes('simulate_error')) {
          refundAiQuota(user.user_id, 'mockup');
          const failedId = crypto.randomUUID();
          const now = new Date().toISOString();
          db.prepare(`
            INSERT INTO mockup_requests (
              mockup_id, user_id, outfit_id, source, missing_category,
              generated_prompt, gap_analysis, status, mockup_image_url,
              search_keywords, error_message, created_at, completed_at
            ) VALUES (?, ?, NULL, 'custom', ?, ?, ?, 'failed', NULL, NULL, ?, ?, ?)
          `).run(
            failedId,
            user.user_id,
            missingCategory,
            customPrompt,
            'Permintaan kustom gagal karena gangguan layanan AI.',
            'Layanan text-to-image gagal memproses permintaan. Kuota Anda telah dikembalikan.',
            now,
            now
          );
          return sendError(res, 502, 'AI_MOCKUP_FAILED', 'Gagal membuat mockup karena gangguan sistem. Kuota Anda tidak dikurangi.');
        }

        const validCat = ['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'one_piece'].includes(missingCategory)
          ? missingCategory
          : 'outerwear';
        const catLabel = CATEGORY_LABELS[validCat];
        const mockupId = crypto.randomUUID();
        const now = new Date().toISOString();
        let mockupImageUrl = `/assets/mockup-${validCat}.svg`;
        let gapAnalysis = `Permintaan kustom untuk kategori ${catLabel}: "${customPrompt}".`;
        let generatedPrompt = customPrompt;
        let searchKeywords = {
          id: [
            `${catLabel.toLowerCase()} ${customPrompt.split(/\s+/).slice(0, 3).join(' ').toLowerCase()}`,
            `${catLabel.toLowerCase()} minimalis smart casual`,
            `rekomendasi ${catLabel.toLowerCase()} warna netral`
          ],
          en: [
            `minimalist ${validCat.replace('_', ' ')} smart casual`,
            `tailored neutral ${validCat.replace('_', ' ')}`,
            `modern everyday ${validCat.replace('_', ' ')}`
          ]
        };

        if (aiService.isLiveEnabled()) {
          try {
            const aiGap = await aiService.analyzeItemGap({
              customPrompt,
              missingCategory: validCat,
              userPreferences: formatUserProfile(user)
            });
            if (aiGap) {
              gapAnalysis = aiGap.gapAnalysis || gapAnalysis;
              generatedPrompt = aiGap.generatedPrompt || generatedPrompt;
              searchKeywords = aiGap.searchKeywords || searchKeywords;
            }
          } catch (geminiErr) {
            if (!aiService.fallbackOnError) {
              refundAiQuota(user.user_id, 'mockup');
              return sendError(
                res,
                geminiErr.status || 502,
                geminiErr.code || 'AI_MOCKUP_FAILED',
                'Gagal memproses saran item dengan AI. Kuota Anda telah dikembalikan.'
              );
            }
            console.warn(`[WearGoods AI] Custom mockup gap fallback ke aturan lokal (${geminiErr.code || geminiErr.message})`);
          }

          const aiImgUrl = await aiService.generateMockupImage({
            prompt: generatedPrompt,
            mockupId,
            uploadsDir: UPLOADS_DIR
          });
          if (aiImgUrl) {
            mockupImageUrl = aiImgUrl;
          }
        }

        db.prepare(`
          INSERT INTO mockup_requests (
            mockup_id, user_id, outfit_id, source, missing_category,
            generated_prompt, gap_analysis, status, mockup_image_url,
            search_keywords, error_message, created_at, completed_at
          ) VALUES (?, ?, NULL, 'custom', ?, ?, ?, 'succeeded', ?, ?, NULL, ?, ?)
        `).run(
          mockupId,
          user.user_id,
          validCat,
          generatedPrompt,
          gapAnalysis,
          mockupImageUrl,
          JSON.stringify(searchKeywords),
          now,
          now
        );

        return sendJson(res, 202, {
          mockup_id: mockupId,
          status: 'queued',
          message: 'Permintaan mockup kustom diterima dan sedang diproses.',
          quota_remaining: quota.limit - quota.used
        });
      }

      const mockupDetailMatch = /^\/api\/v1\/mockups\/([^/]+)$/.exec(pathname);
      if (mockupDetailMatch && method === 'GET') {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Silakan login terlebih dahulu.');
        const mockupId = mockupDetailMatch[1];

        const row = db.prepare('SELECT * FROM mockup_requests WHERE mockup_id = ?').get(mockupId);
        if (!row) return sendError(res, 404, 'MOCKUP_NOT_FOUND', 'Permintaan mockup tidak ditemukan.');
        if (row.user_id !== user.user_id) {
          return sendError(res, 403, 'FORBIDDEN_NOT_OWNER', 'Anda tidak memiliki akses ke hasil mockup milik pengguna lain.');
        }

        let keywords = { id: [], en: [] };
        try {
          if (row.search_keywords) keywords = JSON.parse(row.search_keywords);
        } catch {}

        return sendJson(res, 200, {
          mockup: {
            mockup_id: row.mockup_id,
            user_id: row.user_id,
            outfit_id: row.outfit_id,
            source: row.source,
            missing_category: row.missing_category,
            missing_category_label: CATEGORY_LABELS[row.missing_category] || row.missing_category,
            generated_prompt: row.generated_prompt,
            gap_analysis: row.gap_analysis,
            status: row.status,
            label: 'Ilustrasi AI — bukan produk nyata',
            mockup_image_url: createSignedStorageUrl(row.mockup_image_url),
            search_keywords: keywords,
            error_message: row.error_message,
            created_at: row.created_at,
            completed_at: row.completed_at
          }
        });
      }

      // =======================================================================
      // 7. PRIVATE OBJECT STORAGE SERVING WITH SIGNED URL CHECK (/uploads/*)
      // =======================================================================
      if (method === 'GET' && pathname.startsWith('/uploads/')) {
        const exp = parsedUrl.searchParams.get('exp');
        const sig = parsedUrl.searchParams.get('sig');
        if (!verifySignedStorageUrl(pathname, exp, sig)) {
          return sendError(res, 403, 'EXPIRED_OR_INVALID_SIGNED_URL', 'Signed URL gambar sudah kedaluwarsa atau tidak valid.');
        }
        const safeName = path.basename(pathname);
        let filePath = path.join(UPLOADS_DIR, safeName);
        if (!fs.existsSync(filePath)) {
          const fallbackPath = path.join(__dirname, '..', 'database', 'uploads', safeName);
          if (fs.existsSync(fallbackPath)) {
            filePath = fallbackPath;
          } else {
            return sendError(res, 404, 'FILE_NOT_FOUND', 'File gambar tidak ditemukan.');
          }
        }
        const ext = path.extname(safeName).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'private, max-age=600' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // =======================================================================
      // 8. STATIC FRONTEND SERVING (public/*)
      // =======================================================================
      if (method === 'GET') {
        let relPath = pathname === '/' ? '/index.html' : pathname;
        let filePath = path.join(PUBLIC_DIR, path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, ''));

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          if (!pathname.startsWith('/api/')) {
            filePath = path.join(PUBLIC_DIR, 'index.html');
          } else {
            return sendError(res, 404, 'ENDPOINT_NOT_FOUND', `Endpoint ${method} ${pathname} tidak ditemukan.`);
          }
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      return sendError(res, 404, 'ENDPOINT_NOT_FOUND', `Endpoint ${method} ${pathname} tidak ditemukan.`);
    } catch (err) {
      const status = err.status || 500;
      return sendError(res, status, err.code || 'INTERNAL_ERROR', err.message || 'Terjadi kesalahan pada server.');
    }
  };

  const server = http.createServer(requestHandler);

  return { server, handler: requestHandler, db, aiService };
}

if (require.main === module) {
  loadEnvFile();
  const PORT = Number(process.env.PORT || 3000);
  const { server, aiService } = createAppServer();
  const aiStatus = aiService.getStatus();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`WearGoods MVP Server berjalan di http://0.0.0.0:${PORT}`);
    console.log(
      aiStatus.mode === 'gemini'
        ? aiStatus.image_generation_enabled
          ? `Mode AI: Gemini Live (${aiStatus.model} + ${aiStatus.image_model})`
          : `Mode AI: Gemini Live (${aiStatus.model} · ilustrasi SVG bawaan)`
        : 'Mode AI: Simulasi Lokal (isi GEMINI_API_KEY di .env untuk mengaktifkan Gemini API)'
    );
  });
}

module.exports = { createAppServer };
