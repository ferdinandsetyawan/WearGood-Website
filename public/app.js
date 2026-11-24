/* ==========================================================================
   WearGoods (laras.) — Interactive Frontend Client Application (Versi 1.1 MVP)
   Full Interactive UI across all pages + Security & Accessibility Polish
   ========================================================================== */

const state = {
  token: sessionStorage.getItem('weargoods_access_token') || null,
  user: null,
  usage: null,
  currentPage: 'beranda',
  cariSubView: 'brief', // 'brief' | 'hasil' | 'detail'
  detailCanvasMode: 'moodboard', // 'moodboard' (default) | 'editorial'
  wardrobe: {
    items: [],
    total: 0,
    page: 1,
    totalPages: 1,
    categoryCounts: { all: 0, top: 0, bottom: 0, outerwear: 0, footwear: 0, accessory: 0, one_piece: 0 },
    canGenerateOutfit: true,
    filters: {
      category: 'all',
      color: '',
      formality: '',
      q: '',
      sort: 'newest'
    }
  },
  brief: {
    occasion_code: 'kerja_kantor',
    style_code: 'smart_casual',
    date_label: '',
    location: 'Jakarta',
    weather: 'Hangat · 28–32°C',
    user_prompt: ''
  },
  activeOutfit: null,
  inspirations: [],
  activeInspiration: null,
  savedOutfits: [],
  koleksiFilter: 'all',
  koleksiSearch: '',
  batchQueue: [],
  activeBatchIndex: 0,
  cameraStream: null,
  berandaShuffleOffset: 0,
  pendingDeleteTimer: null,
  confirmModalCallback: null
};

const CATEGORY_NAMES = {
  top: 'ATASAN',
  bottom: 'BAWAHAN',
  outerwear: 'LUARAN',
  footwear: 'ALAS KAKI / SEPATU',
  accessory: 'AKSESORI',
  one_piece: 'TERUSAN'
};

const ICONS = {
  lock: '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  unlock: '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
  refresh: '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>'
};

const LOOKBOOK_PRESETS = [
  {
    eyebrow: 'PILIHAN HARI INI / 01',
    title: 'Rapi, tanpa banyak usaha.',
    desc: 'Linen ringan dan warna bumi untuk hari kerja yang bergerak bersamamu.',
    img: '/assets/look-1.png',
    caption: 'Pakai yang kamu punya. Temukan kemungkinan baru.',
    weather: 'Nyaman untuk cuaca hangat',
    occasion: 'kerja_kantor',
    style: 'smart_casual',
    usesWardrobeSlots: true,
    pins: [
      { top: '32%', left: '48%', slot: 'top', label: 'Kemeja linen putih · Atasan' },
      { top: '58%', left: '45%', slot: 'bottom', label: 'Celana tailored olive · Bawahan' },
      { top: '88%', left: '44%', slot: 'footwear', label: 'Loafers kulit · Sepatu' },
      { top: '65%', left: '62%', slot: 'accessory', label: 'Tote kulit tan · Aksesori' }
    ]
  },
  {
    eyebrow: 'PILIHAN HARI INI / 02',
    title: 'Rapi tanpa berlebihan.',
    desc: 'Sentuhan blazer navy terstruktur yang dipadukan dengan siluet santai untuk rapat maupun sore hari.',
    img: '/assets/look-2.png',
    caption: 'Eksplorasi siluet smart casual yang fleksibel sepanjang hari.',
    weather: 'Ideal untuk ruangan ber-AC & sore sejuk',
    occasion: 'presentasi_kampus',
    style: 'smart_casual',
    count: 'Smart casual · Referensi tambahan',
    usesWardrobeSlots: false,
    pins: [
      { top: '30%', left: '48%', label: 'Blazer navy · Referensi luaran' },
      { top: '44%', left: '49%', label: 'Kaus katun putih · Atasan dasar' },
      { top: '64%', left: '47%', label: 'Denim lurus · Referensi bawahan' }
    ]
  },
  {
    eyebrow: 'PILIHAN HARI INI / 03',
    title: 'Santai yang terencana.',
    desc: 'Rajut ecru yang lembut dan rok midi berwarna hangat untuk agenda santai maupun akhir pekan.',
    img: '/assets/look-3.png',
    caption: 'Kombinasi warna netral yang tenang dan mudah diulang.',
    weather: 'Adem untuk jalan santai & hangout',
    occasion: 'hangout',
    style: 'minimalist',
    count: 'Santai · Referensi akhir pekan',
    usesWardrobeSlots: false,
    pins: [
      { top: '35%', left: '48%', label: 'Rajut ecru · Referensi atasan' },
      { top: '62%', left: '46%', label: 'Rok midi krem · Referensi bawahan' },
      { top: '66%', left: '62%', label: 'Tas anyam · Referensi aksesori' }
    ]
  }
];

function renderOutfitCollageCellsHtml(items = []) {
  const validItems = (items || []).filter((it) => it && !it.is_deleted && it.image_url);
  if (validItems.length === 0) return '';
  const slice = validItems.slice(0, 4);
  const fullFirst = slice.length === 3 || slice.length === 1;
  return slice
    .map(
      (it, idx) => `
        <div class="outfit-collage-cell${fullFirst && idx === 0 ? ' outfit-collage-cell--full' : ''}">
          <img src="${it.image_url}" alt="${escapeHtml(it.name)}" />
          <span class="outfit-collage-tag">${escapeHtml(it.name)}</span>
        </div>`
    )
    .join('');
}

function renderOutfitCollageHtml(items = [], extraClass = '') {
  const cells = renderOutfitCollageCellsHtml(items);
  if (!cells) return '';
  return `<div class="outfit-collage-grid ${extraClass}">${cells}</div>`;
}

const LARAS_NOTES_QUOTES = [
  'Gaya yang baik dimulai dari mengenal apa yang sudah kamu punya.',
  'Warna netral dan potongan yang nyaman selalu relevan di setiap musim.',
  'Kunci satu item favoritmu, lalu biarkan bagian lainnya berganti mengikuti suasana.',
  'Lemari yang rapi bukan soal banyaknya pakaian, melainkan mudahnya dipadupadankan.'
];

// --------------------------------------------------------------------------
// Dynamic Indonesian Date & Time-of-Day Helpers (WIB / Asia/Jakarta)
// --------------------------------------------------------------------------
function formatIndonesianDate(dateInput = new Date(), includeWeekday = true) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return 'Jumat, 20 November 2026';
  const options = includeWeekday
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }
    : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' };
  return d.toLocaleDateString('id-ID', options);
}

function getTimeOfDayGreeting() {
  const nowWib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const hour = nowWib.getHours();
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function populateDynamicDates() {
  const todayStr = formatIndonesianDate(new Date(), true);
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const tomorrowStr = formatIndonesianDate(tomorrow, true);
  const nextWeek = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  const nextWeekStr = formatIndonesianDate(nextWeek, true);

  const topbarDate = document.getElementById('topbar-current-date');
  if (topbarDate) topbarDate.textContent = todayStr;

  const briefDateSelect = document.getElementById('brief-date');
  if (briefDateSelect) {
    briefDateSelect.innerHTML = `
      <option value="${escapeHtml(todayStr)}" selected>Hari ini · ${escapeHtml(todayStr)}</option>
      <option value="${escapeHtml(tomorrowStr)}">Besok · ${escapeHtml(tomorrowStr)}</option>
      <option value="${escapeHtml(nextWeekStr)}">${escapeHtml(nextWeekStr)}</option>
    `;
    state.brief.date_label = todayStr;
  }
}

// --------------------------------------------------------------------------
// API Client with httpOnly Cookie Refresh (FR-02)
// --------------------------------------------------------------------------
async function apiFetch(endpoint, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  let res = await fetch(endpoint, { ...options, headers, credentials: 'same-origin' });

  // Automatic token refresh via httpOnly cookie on 401
  if (res.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    const refreshRes = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({})
    });
    if (refreshRes.ok) {
      const refreshData = await refreshRes.json();
      setAuthTokens(refreshData.access_token);
      headers['Authorization'] = `Bearer ${state.token}`;
      res = await fetch(endpoint, { ...options, headers, credentials: 'same-origin' });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Permintaan gagal (${res.status})`);
    err.status = res.status;
    err.code = data.error?.code;
    err.details = data.error?.details;
    err.raw = data;
    throw err;
  }
  return data;
}

function setAuthTokens(accessToken) {
  state.token = accessToken;
  if (accessToken) {
    sessionStorage.setItem('weargoods_access_token', accessToken);
    sessionStorage.removeItem('weargoods_logged_out');
    localStorage.setItem('weargoods_has_session', 'true');
  } else {
    sessionStorage.removeItem('weargoods_access_token');
    localStorage.removeItem('weargoods_has_session');
  }
}

// --------------------------------------------------------------------------
// Non-Blocking Floating Toast Notification (+ 5-Second Undo Support)
// --------------------------------------------------------------------------
function showFloatingToast(message, options = {}) {
  const container = document.getElementById('floating-toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'floating-toast';

  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  if (options.undoText && typeof options.onUndo === 'function') {
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'toast-undo-btn';
    undoBtn.textContent = options.undoText;
    undoBtn.addEventListener('click', () => {
      options.onUndo();
      toast.remove();
    });
    toast.appendChild(undoBtn);
  }

  container.appendChild(toast);
  const duration = options.duration || 4500;
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, duration);
}

// --------------------------------------------------------------------------
// Initialization & Sticky Logout Handling
// --------------------------------------------------------------------------
async function initApp() {
  populateDynamicDates();
  bindNavigationEvents();
  bindAuthEvents();
  bindBerandaEvents();
  bindCariOutfitEvents();
  bindWardrobeEvents();
  bindKoleksiEvents();
  bindPreferensiEvents();
  bindModalCloseEvents();

  const explicitlyLoggedOut = sessionStorage.getItem('weargoods_logged_out') === 'true';
  const hasSessionHint = localStorage.getItem('weargoods_has_session') === 'true';

  if (window.location.hash === '#masuk' || explicitlyLoggedOut || (!state.token && !hasSessionHint)) {
    showAuthView('login');
    return;
  }

  try {
    if (state.token) {
      const meData = await apiFetch('/api/v1/users/me');
      state.user = meData.user;
    } else {
      // Try httpOnly cookie refresh; if absent/expired show clean login screen
      const refreshRes = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({})
      });
      if (refreshRes.ok) {
        const rData = await refreshRes.json();
        setAuthTokens(rData.access_token);
        state.user = rData.user;
      } else {
        showAuthView('login');
        return;
      }
    }
    await loadAllAppData();
    showAppShell();
  } catch {
    setAuthTokens(null);
    showAuthView('login');
  }
}

async function loadAllAppData() {
  const [meRes, usageRes, wardrobeRes, savedRes] = await Promise.all([
    apiFetch('/api/v1/users/me'),
    apiFetch('/api/v1/users/me/usage'),
    apiFetch(`/api/v1/wardrobe/items?page=${state.wardrobe.page}&page_size=24`),
    apiFetch('/api/v1/outfits?saved=true')
  ]);

  state.user = meRes.user;
  state.usage = usageRes;
  state.wardrobe.items = wardrobeRes.items;
  state.wardrobe.total = wardrobeRes.total;
  state.wardrobe.page = wardrobeRes.page;
  state.wardrobe.totalPages = wardrobeRes.total_pages;
  state.wardrobe.categoryCounts = wardrobeRes.category_counts;
  state.wardrobe.canGenerateOutfit = wardrobeRes.can_generate_outfit;
  state.savedOutfits = savedRes.items;

  if (state.savedOutfits.length > 0 && !state.activeOutfit) {
    state.activeOutfit = state.savedOutfits[0];
  }

  renderUserHeaderAndQuota();
  renderBeranda();
  renderWardrobe();
  renderKoleksi();
  renderPreferensi();
  updateBriefWardrobeValidation();
}

// --------------------------------------------------------------------------
// Navigation & View Switching
// --------------------------------------------------------------------------
function showAuthView(subMode = 'login') {
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('auth-view').classList.remove('hidden');

  ['auth-login-box', 'auth-register-box', 'auth-onboarding-box', 'auth-forgot-box'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });

  if (subMode === 'register') {
    document.getElementById('auth-register-box').classList.remove('hidden');
  } else if (subMode === 'onboarding') {
    document.getElementById('auth-onboarding-box').classList.remove('hidden');
  } else if (subMode === 'forgot') {
    document.getElementById('auth-forgot-box').classList.remove('hidden');
  } else {
    document.getElementById('auth-login-box').classList.remove('hidden');
  }
}

function showAppShell() {
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  navigateTo(state.currentPage);
}

function navigateTo(pageName) {
  state.currentPage = pageName;
  const pageMap = {
    'beranda': { id: 'page-beranda', label: 'Beranda' },
    'cari-outfit': { id: 'page-cari-outfit', label: 'Cari outfit' },
    'lemari': { id: 'page-lemari', label: 'Lemari saya' },
    'koleksi': { id: 'page-koleksi', label: 'Koleksi' },
    'preferensi': { id: 'page-preferensi', label: 'Preferensi gaya' }
  };

  Object.values(pageMap).forEach((p) => {
    const el = document.getElementById(p.id);
    if (el) el.classList.add('hidden');
  });

  const target = pageMap[pageName] || pageMap['beranda'];
  const targetEl = document.getElementById(target.id);
  targetEl.classList.remove('hidden');
  document.getElementById('breadcrumb-current').textContent = target.label;

  document.querySelectorAll('.nav-item, .tablet-nav-link, .mobile-nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === pageName);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setCariSubView(subView) {
  state.cariSubView = subView;
  document.getElementById('rekomendasi-brief-view').classList.toggle('hidden', subView !== 'brief');
  document.getElementById('rekomendasi-hasil-view').classList.toggle('hidden', subView !== 'hasil');
  document.getElementById('rekomendasi-detail-view').classList.toggle('hidden', subView !== 'detail');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindNavigationEvents() {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const target = el.dataset.nav;
      if (target === 'cari-outfit') {
        setCariSubView('brief');
      }
      navigateTo(target);
    });
  });

  document.getElementById('btn-mobile-menu').addEventListener('click', () => {
    openModal('modal-mobile-menu');
  });

  document.querySelectorAll('[data-mobile-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeModal('modal-mobile-menu');
      const target = btn.dataset.mobileNav;
      if (target === 'cari-outfit') setCariSubView('brief');
      navigateTo(target);
    });
  });

  document.getElementById('btn-help-info').addEventListener('click', () => {
    showToastModal(
      'Panduan Penggunaan WearGoods',
      'Alur 5 Langkah: (1) Buka Lemari & klik Tambah Pakaian, (2) Pilih 1–10 foto pakaian, (3) Simpan Semua, (4) Buka Cari Outfit & pilih aktivitas serta gaya, (5) Klik Buat Rekomendasi Outfit.'
    );
  });
}

// --------------------------------------------------------------------------
// User Header & Daily Quota Rendering
// --------------------------------------------------------------------------
function renderUserHeaderAndQuota() {
  if (!state.user) return;
  const displayName = state.user.nickname || state.user.full_name.split(' ')[0] || 'Nadia';
  const greeting = getTimeOfDayGreeting();

  document.getElementById('sidebar-user-name').textContent = state.user.full_name;
  document.getElementById('mobile-menu-username').textContent = state.user.full_name;
  document.getElementById('beranda-greeting').textContent = `${greeting}, ${displayName}.`;

  if (state.usage && state.usage.usage) {
    const u = state.usage.usage;
    document.getElementById('topbar-quota-pill').textContent =
      `Sisa Kuota: ${u.recognize.remaining} Foto · ${u.outfit.remaining} Look · ${u.mockup.remaining} Ide Item`;

    document.getElementById('quota-recognize-text').textContent = `${u.recognize.remaining} / ${u.recognize.limit} tersisa`;
    document.getElementById('quota-recognize-bar').style.width = `${(u.recognize.remaining / u.recognize.limit) * 100}%`;

    document.getElementById('quota-outfit-text').textContent = `${u.outfit.remaining} / ${u.outfit.limit} tersisa`;
    document.getElementById('quota-outfit-bar').style.width = `${(u.outfit.remaining / u.outfit.limit) * 100}%`;

    document.getElementById('quota-mockup-text').textContent = `${u.mockup.remaining} / ${u.mockup.limit} tersisa`;
    document.getElementById('quota-mockup-bar').style.width = `${(u.mockup.remaining / u.mockup.limit) * 100}%`;
  }
}

async function refreshUsageQuota() {
  try {
    state.usage = await apiFetch('/api/v1/users/me/usage');
    renderUserHeaderAndQuota();
  } catch {}
}

// --------------------------------------------------------------------------
// 1. Auth & Onboarding Interactive Flows (FR-01, FR-02, FR-16, FR-20)
// --------------------------------------------------------------------------
function bindAuthEvents() {
  document.getElementById('btn-show-register').addEventListener('click', () => showAuthView('register'));
  document.getElementById('btn-back-to-login').addEventListener('click', () => showAuthView('login'));
  document.getElementById('btn-show-forgot').addEventListener('click', () => showAuthView('forgot'));
  document.getElementById('btn-forgot-back').addEventListener('click', () => showAuthView('login'));

  // Interactive Lookbook Tabs & Hotspots on Auth Hero Panel
  function renderAuthPins(preset) {
    const pinsContainer = document.getElementById('auth-hero-pins');
    const tooltip = document.getElementById('auth-hotspot-tooltip');
    if (!pinsContainer) return;
    const pins = preset.pins || [];
    pinsContainer.innerHTML = pins
      .map(
        (pin, i) => `
        <button type="button" class="hotspot-pin${i === 0 ? ' active' : ''}" style="top:${pin.top};left:${pin.left}" data-auth-pin="${escapeHtml(pin.label)}" aria-label="Lihat detail item">+</button>`
      )
      .join('');
    if (tooltip && pins[0]) {
      tooltip.textContent = pins[0].label;
    }
    pinsContainer.querySelectorAll('[data-auth-pin]').forEach((pin) => {
      pin.addEventListener('click', () => {
        pinsContainer.querySelectorAll('[data-auth-pin]').forEach((p) => p.classList.remove('active'));
        pin.classList.add('active');
        if (tooltip) tooltip.textContent = pin.dataset.authPin;
      });
    });
  }

  renderAuthPins(LOOKBOOK_PRESETS[0]);

  document.querySelectorAll('[data-lookbook-idx]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const idx = Number(tab.dataset.lookbookIdx);
      const preset = LOOKBOOK_PRESETS[idx] || LOOKBOOK_PRESETS[0];
      document.querySelectorAll('[data-lookbook-idx]').forEach((t) => t.classList.toggle('active', t === tab));
      document.getElementById('auth-lookbook-img').src = preset.img;
      document.getElementById('auth-lookbook-caption').textContent = preset.caption;
      renderAuthPins(preset);
    });
  });

  // Show/Hide Password Toggles
  document.querySelectorAll('[data-toggle-pass]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePass);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.textContent = isPass ? 'Tutup' : 'Lihat';
    });
  });

  // Live Password Strength Meter on Registration
  const regPassInput = document.getElementById('reg-password');
  regPassInput.addEventListener('input', () => {
    const val = regPassInput.value;
    const hasLen = val.length >= 8;
    const hasAlpha = /[a-zA-Z]/.test(val);
    const hasNum = /[0-9]/.test(val);
    const score = [hasLen, hasAlpha, hasNum].filter(Boolean).length;

    document.getElementById('chk-len').classList.toggle('ok', hasLen);
    document.getElementById('chk-alpha').classList.toggle('ok', hasAlpha);
    document.getElementById('chk-num').classList.toggle('ok', hasNum);

    const cls = score === 3 ? 'active-good' : score >= 1 ? 'active-weak' : '';
    ['reg-str-1', 'reg-str-2', 'reg-str-3'].forEach((id, idx) => {
      const seg = document.getElementById(id);
      seg.className = `strength-seg ${idx < score ? cls : ''}`;
    });
  });

  // Login Submit
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('auth-login-error');
    errBox.classList.add('hidden');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const remember_me = document.getElementById('login-remember').checked;

    try {
      const data = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, remember_me })
      });
      setAuthTokens(data.access_token);
      state.user = data.user;
      await loadAllAppData();
      showAppShell();
      showFloatingToast(`Selamat datang kembali, ${state.user.nickname || state.user.full_name}!`);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });

  // Register Submit (FR-01)
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('auth-register-error');
    errBox.classList.add('hidden');

    const full_name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const gender_preference = document.getElementById('reg-gender').value;
    const style_preference = document.getElementById('reg-style').value;
    const ai_consent = document.getElementById('reg-consent').checked;

    try {
      const data = await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name,
          email,
          password,
          gender_preference,
          style_preference,
          ai_consent
        })
      });
      setAuthTokens(data.access_token);
      state.user = data.user;
      document.getElementById('onboard-nickname').value = full_name.split(' ')[0] || full_name;
      showAuthView('onboarding');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });

  // Onboarding style profile (Mulai · Profil gaya.png)
  document.querySelectorAll('#onboard-style-pills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('onboard-nickname').value.trim() || 'Nadia';
    const selectedStyles = Array.from(document.querySelectorAll('#onboard-style-pills .pill-btn.active')).map(
      (b) => b.dataset.style
    );
    const style_preferences = selectedStyles.length > 0 ? selectedStyles : ['smart_casual'];
    const city = document.getElementById('onboard-city').value.trim() || 'Jakarta';

    try {
      await apiFetch('/api/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          nickname,
          style_preference: style_preferences[0],
          style_preferences,
          city
        })
      });
    } catch {}
    await loadAllAppData();
    showAppShell();
    showFloatingToast(`Profil gayamu siap, ${nickname}!`);
  });

  document.getElementById('btn-skip-onboarding').addEventListener('click', async () => {
    await loadAllAppData();
    showAppShell();
  });

  // Forgot & Reset Password (FR-16)
  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgBox = document.getElementById('auth-forgot-msg');
    const email = document.getElementById('forgot-email').value.trim();

    try {
      const data = await apiFetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      msgBox.className = 'alert-box alert-success';
      msgBox.textContent = data.message;
      msgBox.classList.remove('hidden');

      document.getElementById('reset-confirm-form').classList.remove('hidden');
    } catch (err) {
      msgBox.className = 'alert-box alert-error';
      msgBox.textContent = err.message;
      msgBox.classList.remove('hidden');
    }
  });

  document.getElementById('reset-confirm-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgBox = document.getElementById('auth-forgot-msg');
    const token = document.getElementById('reset-token-input').value.trim();
    const new_password = document.getElementById('reset-new-password').value;

    try {
      const data = await apiFetch('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, new_password })
      });
      msgBox.className = 'alert-box alert-success';
      msgBox.textContent = data.message;
      msgBox.classList.remove('hidden');
      setTimeout(() => showAuthView('login'), 1400);
    } catch (err) {
      msgBox.className = 'alert-box alert-error';
      msgBox.textContent = err.message;
      msgBox.classList.remove('hidden');
    }
  });

  // Sticky Logout
  const handleLogout = async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {}
    setAuthTokens(null);
    sessionStorage.setItem('weargoods_logged_out', 'true');
    closeModal('modal-mobile-menu');
    showAuthView('login');
    showFloatingToast('Anda telah keluar dari sesi.');
  };

  document.getElementById('btn-sidebar-logout').addEventListener('click', handleLogout);
  document.getElementById('btn-mobile-logout').addEventListener('click', handleLogout);
}

// --------------------------------------------------------------------------
// 2. Beranda Interactive View (Hotspots, Look Switcher, Weather Chips, Shuffler)
// --------------------------------------------------------------------------
function renderBeranda() {
  const count = state.wardrobe.total || state.wardrobe.items.length;
  document.getElementById('beranda-hero-count').textContent = `Smart casual · ${count || 4} item milikmu`;

  const container = document.getElementById('beranda-items-summary');
  const items = state.wardrobe.items;

  if (items.length === 0) {
    container.innerHTML = `<p class="small-muted">Belum ada pakaian di lemarimu. Tambahkan foto pakaian pertamamu untuk mulai memadupadankan.</p>`;
    return;
  }

  // Rotate items based on berandaShuffleOffset for interactive shuffling
  const rotated = items.map((_, i) => items[(i + state.berandaShuffleOffset) % items.length]).slice(0, 4);

  container.innerHTML = rotated
    .map((item, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const catLabel = CATEGORY_NAMES[item.category] || 'PAKAIAN';
      return `
        <div class="numbered-item-col" data-beranda-item="${item.item_id}" title="Klik untuk melihat detail item">
          <img src="${item.thumbnail_url || item.image_url}" alt="${escapeHtml(item.name)}" class="numbered-item-thumb" />
          <div>
            <p class="num-cat">${num} / ${catLabel}</p>
            <p class="num-name">${escapeHtml(item.sub_category || item.name)}</p>
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('[data-beranda-item]').forEach((card) => {
    card.addEventListener('click', () => {
      openItemDetailModal(card.dataset.berandaItem);
    });
  });
}

function bindBerandaEvents() {
  let activeHeroIdx = 0;

  function renderHeroHotspots(preset) {
    const pinsEl = document.getElementById('beranda-hero-pins');
    const floatingCard = document.getElementById('beranda-hotspot-card');
    if (!pinsEl) return;
    const pins = preset.pins || [];
    pinsEl.innerHTML = pins
      .map(
        (pin, i) => `
        <button type="button" class="hotspot-pin" style="top:${pin.top};left:${pin.left}" data-pin-idx="${i}" aria-label="Lihat detail ${escapeHtml(pin.label)}">+</button>`
      )
      .join('');

    pinsEl.querySelectorAll('[data-pin-idx]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasActive = btn.classList.contains('active');
        pinsEl.querySelectorAll('[data-pin-idx]').forEach((p) => p.classList.remove('active'));
        if (wasActive) {
          if (floatingCard) floatingCard.classList.add('hidden');
          return;
        }
        btn.classList.add('active');
        const pin = pins[Number(btn.dataset.pinIdx)];
        if (!pin || !floatingCard) return;

        if (preset.usesWardrobeSlots && pin.slot) {
          const matched = state.wardrobe.items.find((i) => i.category === pin.slot) || state.wardrobe.items[0];
          if (!matched) {
            floatingCard.innerHTML = `<span class="small-muted">${escapeHtml(pin.label)}</span>`;
          } else {
            floatingCard.innerHTML = `
              <div>
                <p class="eyebrow">${escapeHtml(CATEGORY_NAMES[matched.category] || 'ITEM LEMARI')}</p>
                <p class="meta-bold">${escapeHtml(matched.name)}</p>
                <p class="tiny-muted">${escapeHtml(matched.characteristics?.material || 'Katun')} · ${escapeHtml(matched.primary_color)}</p>
              </div>
              <button type="button" class="btn btn-outline btn-xs" id="btn-hotspot-inspect">Detail</button>
            `;
            floatingCard.classList.remove('hidden');
            const inspectBtn = document.getElementById('btn-hotspot-inspect');
            if (inspectBtn) inspectBtn.addEventListener('click', () => openItemDetailModal(matched.item_id));
            return;
          }
        } else {
          const parts = pin.label.split('·');
          floatingCard.innerHTML = `
            <div>
              <p class="eyebrow-rust">${escapeHtml((parts[1] || 'REFERENSI').trim())}</p>
              <p class="meta-bold">${escapeHtml((parts[0] || pin.label).trim())}</p>
              <p class="tiny-muted">Inspirasi gaya (di luar lemari)</p>
            </div>
          `;
        }
        floatingCard.classList.remove('hidden');
      });
    });
  }

  function applyHeroPreset(idx, withFade = true) {
    activeHeroIdx = idx % LOOKBOOK_PRESETS.length;
    const preset = LOOKBOOK_PRESETS[activeHeroIdx] || LOOKBOOK_PRESETS[0];

    document.querySelectorAll('[data-hero-preset]').forEach((b, i) => {
      b.classList.toggle('active', i === activeHeroIdx);
    });

    const textWrap = document.getElementById('beranda-hero-text-wrap');
    const updateDom = () => {
      document.getElementById('beranda-hero-eyebrow').textContent = preset.eyebrow;
      document.getElementById('beranda-hero-title').textContent = preset.title;
      document.getElementById('beranda-hero-desc').textContent = preset.desc;
      document.getElementById('beranda-hero-img').src = preset.img;
      document.getElementById('beranda-hero-weather').textContent = preset.weather;
      const countEl = document.getElementById('beranda-hero-count');
      if (countEl && !preset.usesWardrobeSlots) {
        countEl.textContent = preset.count || 'Smart casual · Referensi';
      } else {
        renderBeranda();
      }
      document.getElementById('beranda-hotspot-card').classList.add('hidden');
      renderHeroHotspots(preset);
    };

    if (withFade && textWrap) {
      textWrap.classList.add('switching');
      setTimeout(() => {
        updateDom();
        textWrap.classList.remove('switching');
      }, 180);
    } else {
      updateDom();
    }
  }

  // Initial pins setup for Look 01
  renderHeroHotspots(LOOKBOOK_PRESETS[0]);

  // Interactive Hero Look Switcher (01, 02, 03) - User-triggered only
  document.querySelectorAll('[data-hero-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.heroPreset);
      applyHeroPreset(idx, true);
    });
  });

  // Interactive Weather Chips in "Ada rencana apa?"
  const weatherTips = {
    'Hangat · 28–32°C': 'Tips cuaca hangat: Prioritaskan bahan linen dan katun longgar yang menyerap keringat.',
    'Sejuk · 22–26°C': 'Tips cuaca sejuk: Padukan kemeja atau kaus dengan luaran ringan yang mudah dilepas.',
    'Hujan · Hindari warna cerah': 'Tips saat hujan: Pilih warna gelap/olive dan alas kaki kulit tertutup yang mudah dibersihkan.',
    'Indoor ber-AC sepanjang hari': 'Tips ruang ber-AC: Tambahkan blazer atau rajut halus agar tetap hangat saat rapat.'
  };

  document.querySelectorAll('#quick-weather-chips .weather-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#quick-weather-chips .weather-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const w = chip.dataset.weather;
      state.brief.weather = w;
      const cityPart = (document.getElementById('quick-location').value.split('·')[0] || 'Jakarta').trim();
      document.getElementById('quick-location').value = `${cityPart} · ${w.split('·')[0].trim()}`;
      document.getElementById('quick-plan-tip').textContent = weatherTips[w] || 'Rekomendasi dari pakaian milikmu.';
    });
  });

  // Shuffle Combination Button on Beranda
  document.getElementById('btn-shuffle-beranda-items').addEventListener('click', () => {
    state.berandaShuffleOffset = (state.berandaShuffleOffset + 1) % Math.max(1, state.wardrobe.items.length);
    const quote = LARAS_NOTES_QUOTES[state.berandaShuffleOffset % LARAS_NOTES_QUOTES.length];
    document.getElementById('beranda-laras-note').textContent = quote;
    renderBeranda();
    showFloatingToast('Kombinasi item lemari diperbarui.');
  });

  document.getElementById('btn-hero-detail').addEventListener('click', () => {
    if (state.activeOutfit) {
      renderOutfitDetail(state.activeOutfit);
      navigateTo('cari-outfit');
      setCariSubView('detail');
    } else {
      navigateTo('cari-outfit');
      setCariSubView('brief');
    }
  });

  document.getElementById('quick-plan-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const occ = document.getElementById('quick-occasion').value;
    const style = document.getElementById('quick-style').value;
    const locRaw = document.getElementById('quick-location').value.trim();
    const locParts = locRaw.split('·').map((s) => s.trim());

    state.brief.occasion_code = occ;
    state.brief.style_code = style;
    if (locParts[0]) state.brief.location = locParts[0];

    document.getElementById('brief-location').value = state.brief.location;
    document.getElementById('brief-weather').value = state.brief.weather;

    syncBriefPillsWithState();
    navigateTo('cari-outfit');
    await triggerGenerateOutfit();
  });
}

// --------------------------------------------------------------------------
// 3. Cari Outfit / Rekomendasi & Detail & Interactive Moodboard (FR-10..FR-15)
// --------------------------------------------------------------------------
function updateBriefWardrobeValidation() {
  const canGen = state.wardrobe.canGenerateOutfit;
  const counts = state.wardrobe.categoryCounts;
  const warnBox = document.getElementById('brief-wardrobe-warning');
  const submitBtn = document.getElementById('btn-submit-generate');
  const capPill = document.getElementById('brief-combination-capacity');

  const twoPieceCombos = Math.max(0, counts.top * counts.bottom * Math.max(1, counts.footwear));
  const totalCombos = twoPieceCombos + counts.one_piece * Math.max(1, counts.footwear);

  if (capPill) {
    capPill.textContent = canGen ? `${totalCombos} kombinasi siap dirangkai` : 'Belum cukup item';
  }

  warnBox.classList.toggle('hidden', canGen);
  submitBtn.disabled = !canGen;
}

function syncBriefPillsWithState() {
  document.querySelectorAll('#brief-occasion-pills .pill-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.occasion === state.brief.occasion_code);
  });
  document.querySelectorAll('#brief-style-pills .pill-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.style === state.brief.style_code);
  });
}

function bindCariOutfitEvents() {
  document.querySelectorAll('#brief-occasion-pills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.brief.occasion_code = btn.dataset.occasion;
      syncBriefPillsWithState();
    });
  });

  document.querySelectorAll('#brief-style-pills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.brief.style_code = btn.dataset.style;
      syncBriefPillsWithState();
    });
  });

  const promptInput = document.getElementById('brief-user-prompt');
  promptInput.addEventListener('input', () => {
    document.getElementById('brief-prompt-counter').textContent = `${promptInput.value.length} / 300`;
  });

  // Interactive Quick-Prompt Chips
  document.querySelectorAll('#brief-prompt-chips .prompt-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const text = chip.dataset.chip;
      const cur = promptInput.value.trim();
      if (cur.toLowerCase().includes(text.toLowerCase())) {
        chip.classList.remove('active');
        return;
      }
      const next = cur ? `${cur}, ${text.toLowerCase()}` : text;
      promptInput.value = next.slice(0, 300);
      chip.classList.add('active');
      document.getElementById('brief-prompt-counter').textContent = `${promptInput.value.length} / 300`;
    });
  });

  document.getElementById('btn-brief-add-clothing').addEventListener('click', openTambahPakaianModal);

  document.getElementById('brief-generate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    state.brief.date_label = document.getElementById('brief-date').value;
    state.brief.location = document.getElementById('brief-location').value.trim() || 'Jakarta';
    state.brief.weather = document.getElementById('brief-weather').value;
    state.brief.user_prompt = document.getElementById('brief-user-prompt').value.trim();
    await triggerGenerateOutfit();
  });

  document.getElementById('btn-cancel-loading').addEventListener('click', () => {
    closeModal('modal-memuat');
  });

  document.getElementById('btn-retry-generate').addEventListener('click', async () => {
    closeModal('modal-gagal');
    await triggerGenerateOutfit();
  });

  document.getElementById('btn-ubah-pencarian').addEventListener('click', () => {
    setCariSubView('brief');
  });

  document.getElementById('btn-lihat-outfit-1').addEventListener('click', () => {
    if (state.activeOutfit) {
      renderOutfitDetail(state.activeOutfit);
      setCariSubView('detail');
    }
  });

  document.getElementById('btn-lihat-outfit-2').addEventListener('click', () => openInspirationModal(0));
  document.getElementById('btn-lihat-outfit-3').addEventListener('click', () => openInspirationModal(1));

  document.getElementById('btn-coba-kombinasi-lain').addEventListener('click', async () => {
    await triggerGenerateOutfit();
  });

  document.getElementById('btn-hasil-need-new-item').addEventListener('click', () => {
    openModal('modal-custom-mockup');
  });

  document.getElementById('btn-back-to-results').addEventListener('click', () => {
    setCariSubView('hasil');
  });

  // Toggle between Editorial Look Photo and Interactive Moodboard Canvas
  document.querySelectorAll('[data-canvas-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.detailCanvasMode = tab.dataset.canvasMode;
      document.querySelectorAll('[data-canvas-mode]').forEach((t) => t.classList.toggle('active', t === tab));
      document.getElementById('detail-editorial-stage').classList.toggle('hidden', state.detailCanvasMode !== 'editorial');
      document.getElementById('detail-moodboard-stage').classList.toggle('hidden', state.detailCanvasMode !== 'moodboard');
    });
  });

  // Save outfit to Koleksi (FR-13)
  document.getElementById('btn-simpan-koleksi').addEventListener('click', async () => {
    if (!state.activeOutfit) return;
    try {
      const data = await apiFetch(`/api/v1/outfits/${state.activeOutfit.outfit_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_saved: true,
          saved_name: state.activeOutfit.title,
          date_label: state.brief.date_label
        })
      });
      state.activeOutfit = data.outfit;
      const savedRes = await apiFetch('/api/v1/outfits?saved=true');
      state.savedOutfits = savedRes.items;
      renderKoleksi(true);
      navigateTo('koleksi');
      showFloatingToast('Outfit disimpan ke Koleksi personalmu.');
    } catch (err) {
      showToastModal('Gagal Menyimpan', err.message);
    }
  });

  document.getElementById('btn-ganti-kombinasi').addEventListener('click', async () => {
    await customizeActiveOutfit({ action: 'suggest_alternative' });
  });

  document.getElementById('btn-detail-reprompt').addEventListener('click', async () => {
    const promptVal = document.getElementById('detail-reprompt-input').value.trim();
    await customizeActiveOutfit({
      action: 'reprompt',
      user_prompt: promptVal || 'Berikan variasi alternatif yang tetap serasi'
    });
  });

  document.getElementById('btn-trigger-need-new-from-slot').addEventListener('click', runNeedNewItemAnalysis);
  document.getElementById('btn-analyze-need-new-item').addEventListener('click', runNeedNewItemAnalysis);

  const submitFeedback = async (val) => {
    if (state.activeOutfit) {
      try {
        await apiFetch(`/api/v1/outfits/${state.activeOutfit.outfit_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ feedback: val })
        });
      } catch {}
    }
    showToastModal(
      'Terima kasih sudah berbagi.',
      'Masukanmu membantu menyempurnakan rekomendasi berikutnya.'
    );
  };
  document.getElementById('btn-feedback-cocok').addEventListener('click', () => submitFeedback('cocok'));
  document.getElementById('btn-feedback-kurang').addEventListener('click', () => submitFeedback('kurang_cocok'));

  document.getElementById('btn-insp-cari-lemari').addEventListener('click', () => {
    closeModal('modal-inspirasi');
    navigateTo('lemari');
  });

  document.getElementById('btn-insp-generate-mockup').addEventListener('click', async () => {
    if (!state.activeInspiration) return;
    const container = document.getElementById('insp-mockup-container');
    container.classList.remove('hidden');
    container.innerHTML = `<p class="small-muted">Sedang menyiapkan saran &amp; ilustrasi item...</p>`;
    try {
      const createRes = await apiFetch('/api/v1/mockups', {
        method: 'POST',
        body: JSON.stringify({
          missing_category: state.activeInspiration.missing_category || 'outerwear',
          prompt: state.activeInspiration.suggested_prompt || state.activeInspiration.detail_description
        })
      });
      const pollRes = await apiFetch(`/api/v1/mockups/${createRes.mockup_id}`);
      container.innerHTML = renderMockupCardHtml(pollRes.mockup);
      bindCopyableKeywords(container);
      await refreshUsageQuota();
    } catch (err) {
      container.innerHTML = `<div class="alert-box alert-error">${escapeHtml(err.message)}</div>`;
    }
  });
}

// Staged Animated Loading Modal for "Mencari yang selaras"
async function playStagedLoadingAnimation() {
  const fill = document.getElementById('loading-bar-fill-el');
  const pct = document.getElementById('loading-pct-text');
  const s1 = document.getElementById('load-step-1');
  const s2 = document.getElementById('load-step-2');
  const s3 = document.getElementById('load-step-3');

  const setStage = (widthPct, stepStates) => {
    if (fill) fill.style.width = `${widthPct}%`;
    if (pct) pct.textContent = `${widthPct}%`;
    [s1, s2, s3].forEach((el, i) => {
      if (!el) return;
      const done = stepStates[i] === 'done';
      const active = stepStates[i] === 'active';
      el.classList.toggle('active', done || active);
      const icon = el.querySelector('.step-icon');
      if (icon) icon.textContent = done ? '✓' : active ? '◉' : '○';
    });
  };

  setStage(28, ['done', 'active', 'pending']);
  await new Promise((r) => setTimeout(r, 220));
  setStage(68, ['done', 'done', 'active']);
  await new Promise((r) => setTimeout(r, 240));
  setStage(100, ['done', 'done', 'done']);
  await new Promise((r) => setTimeout(r, 120));
}

async function triggerGenerateOutfit() {
  openModal('modal-memuat');
  try {
    const [data] = await Promise.all([
      apiFetch('/api/v1/outfits/generate', {
        method: 'POST',
        body: JSON.stringify({
          occasion_code: state.brief.occasion_code,
          style_code: state.brief.style_code,
          user_prompt: state.brief.user_prompt,
          weather_context: state.brief.weather,
          location_context: state.brief.location,
          date_label: state.brief.date_label
        })
      }),
      playStagedLoadingAnimation()
    ]);

    closeModal('modal-memuat');
    state.activeOutfit = data.outfit;
    state.inspirations = data.inspirations || [];
    await refreshUsageQuota();

    renderHasilRekomendasi();
    setCariSubView('hasil');
  } catch (err) {
    closeModal('modal-memuat');
    document.getElementById('modal-gagal-message').textContent =
      err.message || 'Periksa koneksi internet, lalu coba lagi. Aktivitas dan preferensi yang kamu isi tetap tersimpan.';
    openModal('modal-gagal');
  }
}

function renderHasilRekomendasi() {
  const o = state.activeOutfit;
  if (!o) return;

  document.getElementById('hasil-eyebrow').textContent = `REKOMENDASI / ${o.occasion_label.toUpperCase()}`;
  document.getElementById('hasil-context-tags').innerHTML = `
    <span class="context-tag">${escapeHtml(o.occasion_label)}</span>
    <span class="context-tag">${escapeHtml(o.style_label)}</span>
    <span class="context-tag">${escapeHtml(o.location_context)} · ${escapeHtml(o.weather_context.replace('Hangat · ', ''))}</span>
    <span class="context-tag">Dari lemari saya</span>
  `;

  document.getElementById('hasil-look1-title').textContent = o.title.replace(/\.$/, '');
  document.getElementById('hasil-look1-items').textContent = o.items.map((i) => i.sub_category || i.name).join(' · ');
  document.getElementById('hasil-look1-reason').textContent = o.ai_reasoning;

  const collageEl = document.getElementById('hasil-look1-collage');
  const fallbackImg = document.getElementById('hasil-look1-img');
  const cellsHtml = renderOutfitCollageCellsHtml(o.items);
  if (collageEl && cellsHtml) {
    collageEl.innerHTML = cellsHtml;
    collageEl.classList.remove('hidden');
    if (fallbackImg) fallbackImg.classList.add('hidden');
  } else {
    if (collageEl) collageEl.classList.add('hidden');
    if (fallbackImg) fallbackImg.classList.remove('hidden');
  }

  // Mini item thumbnails right on the recommendation card
  const stripEl = document.getElementById('hasil-look1-mini-strip');
  if (stripEl) {
    stripEl.innerHTML = o.items
      .map(
        (it) => `<img src="${it.thumbnail_url || it.image_url}" alt="${escapeHtml(it.name)}" title="${escapeHtml(it.name)}" class="mini-strip-thumb" />`
      )
      .join('');
  }
}

function renderOutfitDetail(outfit) {
  state.activeOutfit = outfit;
  document.getElementById('detail-no-replacement-box').classList.add('hidden');
  document.getElementById('detail-mockup-result').classList.add('hidden');

  document.getElementById('detail-main-img').src = outfit.preview_image_url || '/assets/look-1.png';
  document.getElementById('detail-photo-caption').textContent = `LOOK 01 / ${(outfit.style_label || 'SMART CASUAL').toUpperCase()}`;
  document.getElementById('detail-item-count-badge').textContent = `DARI LEMARIMU · ${outfit.items.length} ITEM`;
  document.getElementById('detail-reprompt-counter').textContent = `Kustomisasi: ${outfit.reprompt_count || 0} / 10`;

  const delWarn = document.getElementById('detail-deleted-warning');
  delWarn.classList.toggle('hidden', !outfit.has_deleted_items);

  const dateDisplay = outfit.date_label || state.brief.date_label || formatIndonesianDate(new Date(), true);
  document.getElementById('detail-outfit-title').textContent = outfit.title;
  document.getElementById('detail-outfit-meta').textContent = `Untuk ${outfit.occasion_label.toLowerCase()} · ${dateDisplay}`;
  document.getElementById('detail-outfit-reasoning').textContent = outfit.ai_reasoning;
  document.getElementById('detail-styling-note').textContent = outfit.styling_note;

  // Render Interactive Flat-Lay Canvas
  const moodboardGrid = document.getElementById('detail-moodboard-grid');
  if (moodboardGrid) {
    moodboardGrid.innerHTML = outfit.items
      .map(
        (it) => `
        <div class="moodboard-tile ${it.is_locked ? 'is-locked' : ''}">
          <img src="${it.image_url}" alt="${escapeHtml(it.name)}" class="moodboard-tile-img" />
          <div class="moodboard-tile-footer">
            <div>
              <p class="eyebrow">${escapeHtml(it.category_label)}</p>
              <p class="moodboard-tile-title">${escapeHtml(it.name)}</p>
            </div>
            <div class="moodboard-mini-btns">
              <button type="button" class="moodboard-icon-btn" data-lock-item="${it.item_id}" title="${it.is_locked ? 'Buka Kunci' : 'Kunci Item'}">
                ${it.is_locked ? ICONS.lock : ICONS.unlock}
              </button>
              <button type="button" class="moodboard-icon-btn" data-suggest-slot="${it.slot}" ${it.is_locked ? 'disabled' : ''} title="Ganti alternatif dari lemari">
                ${ICONS.refresh}
              </button>
            </div>
          </div>
        </div>
      `
      )
      .join('');
  }

  // Render thumbnails strip
  const thumbsEl = document.getElementById('detail-item-thumbnails');
  thumbsEl.innerHTML = outfit.items
    .map(
      (it) => `
      <div class="detail-thumb-card" data-thumb-inspect="${it.item_id}" title="Klik untuk detail: ${escapeHtml(it.name)}">
        <img src="${it.thumbnail_url || it.image_url}" alt="${escapeHtml(it.name)}" />
      </div>
    `
    )
    .join('');

  thumbsEl.querySelectorAll('[data-thumb-inspect]').forEach((card) => {
    card.addEventListener('click', () => openItemDetailModal(card.dataset.thumbInspect));
  });

  // Render numbered items list with Lock & Swap controls
  const listEl = document.getElementById('detail-items-list');
  listEl.innerHTML = outfit.items
    .map((it, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const mat = it.characteristics?.material || 'Katun';
      const sameCategoryAlternatives = state.wardrobe.items.filter(
        (w) => w.category === it.slot && w.item_id !== it.item_id
      );

      return `
        <div class="detail-item-row">
          <div class="detail-item-left">
            <span class="num-index">${num}</span>
            <div>
              <p class="meta-bold">
                ${escapeHtml(it.name)}
                ${it.is_deleted ? '<span class="badge-warning ml-8">Sudah dihapus</span>' : ''}
              </p>
              <p class="tiny-muted">${escapeHtml(it.category_label)} · ${escapeHtml(mat)} · ${escapeHtml(it.primary_color)}</p>
            </div>
          </div>
          <div class="detail-item-actions">
            <button
              type="button"
              class="lock-btn ${it.is_locked ? 'locked' : ''}"
              data-lock-item="${it.item_id}"
              title="Kunci item ini agar tidak berubah saat penyesuaian"
            >
              ${it.is_locked ? `${ICONS.lock} Terkunci` : `${ICONS.unlock} Kunci`}
            </button>
            <button
              type="button"
              class="lock-btn"
              data-suggest-slot="${it.slot}"
              ${it.is_locked ? 'disabled' : ''}
              title="Pilih alternatif lain dari lemari untuk kategori ini"
            >
              ${ICONS.refresh} Ganti
            </button>
            ${
              sameCategoryAlternatives.length > 0
                ? `<select class="lock-btn" data-manual-slot="${it.slot}" ${it.is_locked ? 'disabled' : ''} aria-label="Ganti manual">
                    <option value="">Ganti manual...</option>
                    ${sameCategoryAlternatives
                      .map((alt) => `<option value="${alt.item_id}">${escapeHtml(alt.name)}</option>`)
                      .join('')}
                   </select>`
                : ''
            }
            <span class="tiny-muted">Milikmu</span>
          </div>
        </div>
      `;
    })
    .join('');

  // Bind lock toggle across both list and moodboard
  document.querySelectorAll('#rekomendasi-detail-view [data-lock-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.lockItem;
      try {
        const res = await apiFetch(`/api/v1/outfits/${state.activeOutfit.outfit_id}/customize`, {
          method: 'POST',
          body: JSON.stringify({ action: 'lock', item_id: itemId })
        });
        renderOutfitDetail(res.outfit);
      } catch (err) {
        showToastModal('Gagal Mengunci Item', err.message);
      }
    });
  });

  // Bind per-slot AI alternative suggestion across both list and moodboard
  document.querySelectorAll('#rekomendasi-detail-view [data-suggest-slot]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slot = btn.dataset.suggestSlot;
      await customizeActiveOutfit({ action: 'suggest_alternative', target_category: slot });
    });
  });

  // Bind manual replacement select
  listEl.querySelectorAll('[data-manual-slot]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      if (!sel.value) return;
      await customizeActiveOutfit({
        action: 'replace_manual',
        target_category: sel.dataset.manualSlot,
        replacement_item_id: sel.value
      });
    });
  });
}

async function customizeActiveOutfit(payload) {
  if (!state.activeOutfit) return;
  try {
    const res = await apiFetch(`/api/v1/outfits/${state.activeOutfit.outfit_id}/customize`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    await refreshUsageQuota();

    if (res.need_new_item) {
      const noRepBox = document.getElementById('detail-no-replacement-box');
      document.getElementById('detail-no-replacement-msg').textContent = res.message;
      noRepBox.dataset.missingCategory = res.missing_category || 'top';
      noRepBox.classList.remove('hidden');
      return;
    }

    renderOutfitDetail(res.outfit);
    showFloatingToast('Kombinasi outfit diperbarui.');
  } catch (err) {
    showToastModal('Kustomisasi Outfit', err.message);
  }
}

async function runNeedNewItemAnalysis() {
  if (!state.activeOutfit) return;
  const resultBox = document.getElementById('detail-mockup-result');
  const missingCat = document.getElementById('detail-no-replacement-box').dataset.missingCategory || undefined;

  resultBox.classList.remove('hidden');
  resultBox.innerHTML = `<p class="small-muted">Sedang menganalisis kekurangan outfit dan menyiapkan saran item...</p>`;

  try {
    const createRes = await apiFetch(`/api/v1/outfits/${state.activeOutfit.outfit_id}/mockup`, {
      method: 'POST',
      body: JSON.stringify({ missing_category: missingCat })
    });
    const pollRes = await apiFetch(`/api/v1/mockups/${createRes.mockup_id}`);
    resultBox.innerHTML = renderMockupCardHtml(pollRes.mockup);
    bindCopyableKeywords(resultBox);
    await refreshUsageQuota();
  } catch (err) {
    resultBox.innerHTML = `<div class="alert-box alert-error">${escapeHtml(err.message)}</div>`;
  }
}

function renderMockupCardHtml(m) {
  const idKeywords = (m.search_keywords?.id || [])
    .map((k) => `<button type="button" class="keyword-chip" data-copy-kw="${escapeHtml(k)}" title="Klik untuk menyalin kata kunci"><span class="lang-tag">ID</span><span>${escapeHtml(k)}</span></button>`)
    .join('');
  const enKeywords = (m.search_keywords?.en || [])
    .map((k) => `<button type="button" class="keyword-chip" data-copy-kw="${escapeHtml(k)}" title="Klik untuk menyalin kata kunci"><span class="lang-tag">EN</span><span>${escapeHtml(k)}</span></button>`)
    .join('');

  return `
    <div class="mockup-grid">
      <div>
        <img src="${m.mockup_image_url}" alt="${escapeHtml(m.label)}" class="mockup-preview-img" />
      </div>
      <div>
        <span class="ai-illustration-badge">${escapeHtml(m.label)}</span>
        <p class="meta-bold">Rekomendasi Kategori: ${escapeHtml(m.missing_category_label || m.missing_category)}</p>
        <p class="small-muted mt-4">${escapeHtml(m.gap_analysis || m.generated_prompt)}</p>
        <p class="tiny-muted mt-12"><strong>Kata kunci pencarian (Klik untuk salin):</strong></p>
        <div class="keyword-chips">${idKeywords}${enKeywords}</div>
      </div>
    </div>
  `;
}

function bindCopyableKeywords(container) {
  container.querySelectorAll('[data-copy-kw]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kw = btn.dataset.copyKw;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(kw).catch(() => {});
      }
      showFloatingToast(`Kata kunci disalin: "${kw}"`);
    });
  });
}

function openInspirationModal(index) {
  const defaults = [
    {
      badge: 'INSPIRASI · ITEM TAMBAHAN',
      title: 'Rapi tanpa berlebihan.',
      image_url: '/assets/look-2.png',
      detail_description: 'Blazer navy, kaus putih, denim, dan sneakers.',
      note: 'Item pada look ini belum ada di lemari digitalmu. Gunakan sebagai referensi gaya, bukan daftar belanja wajib.',
      missing_category: 'outerwear',
      suggested_prompt: 'Blazer tailored warna navy berbahan katun-linen ringan dengan potongan relaxed fit'
    },
    {
      badge: 'INSPIRASI · ITEM TAMBAHAN',
      title: 'Santai yang terencana.',
      image_url: '/assets/look-3.png',
      detail_description: 'Rajut ecru, rok midi cokelat, flat shoes, dan tas anyam.',
      note: 'Item pada look ini belum ada di lemari digitalmu. Gunakan sebagai referensi gaya, bukan daftar belanja wajib.',
      missing_category: 'top',
      suggested_prompt: 'Atasan rajut halus warna ecru lengan pendek dengan siluet rapi dan bahan breathable'
    }
  ];
  const insp = state.inspirations[index] || defaults[index] || defaults[0];
  state.activeInspiration = insp;

  document.getElementById('insp-modal-badge').textContent = insp.badge || 'INSPIRASI · ITEM TAMBAHAN';
  document.getElementById('insp-modal-title').textContent = insp.title.endsWith('.') ? insp.title : `${insp.title}.`;
  document.getElementById('insp-modal-img').src = insp.image_url;
  document.getElementById('insp-modal-items').textContent = insp.detail_description;
  document.getElementById('insp-modal-note').textContent = insp.note;
  document.getElementById('insp-mockup-container').classList.add('hidden');
  document.getElementById('insp-mockup-container').innerHTML = '';

  openModal('modal-inspirasi');
}

// --------------------------------------------------------------------------
// 4. Lemari Saya / Digital Wardrobe & Interactive Filters & Batch Upload
// --------------------------------------------------------------------------
async function fetchAndRenderWardrobe() {
  const f = state.wardrobe.filters;
  const params = new URLSearchParams();
  if (f.category && f.category !== 'all') params.set('category', f.category);
  if (f.color) params.set('color', f.color);
  if (f.formality) params.set('formality', f.formality);
  if (f.q) params.set('q', f.q);
  if (f.sort) params.set('sort', f.sort);
  params.set('page', String(state.wardrobe.page));
  params.set('page_size', '24');

  const data = await apiFetch(`/api/v1/wardrobe/items?${params.toString()}`);
  state.wardrobe.items = data.items;
  state.wardrobe.total = data.total;
  state.wardrobe.page = data.page;
  state.wardrobe.totalPages = data.total_pages;
  state.wardrobe.categoryCounts = data.category_counts;
  state.wardrobe.canGenerateOutfit = data.can_generate_outfit;

  renderWardrobe(data.empty_message);
  updateBriefWardrobeValidation();
}

function renderWardrobe(emptyMessage = null) {
  const counts = state.wardrobe.categoryCounts;
  document.getElementById('lemari-subtitle').textContent =
    `${counts.all} item, banyak kemungkinan. Mulai dari pakaian yang paling sering kamu pakai.`;

  // Update category pill labels and active state
  const pillLabels = {
    all: `Semua · ${counts.all}`,
    top: `Atasan · ${counts.top}`,
    bottom: `Bawahan · ${counts.bottom}`,
    outerwear: `Luaran · ${counts.outerwear}`,
    footwear: `Alas Kaki / Sepatu · ${counts.footwear}`,
    accessory: `Aksesori · ${counts.accessory}`,
    one_piece: `Terusan · ${counts.one_piece}`
  };

  document.querySelectorAll('#wardrobe-category-pills .pill-btn').forEach((btn) => {
    const cat = btn.dataset.category;
    if (pillLabels[cat]) btn.textContent = pillLabels[cat];
    btn.classList.toggle('active', state.wardrobe.filters.category === cat);
  });

  // Sync visual color dots
  document.querySelectorAll('#wardrobe-color-dots .color-dot-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.dotColor === state.wardrobe.filters.color);
  });

  const gridEl = document.getElementById('wardrobe-grid');
  const emptyEl = document.getElementById('wardrobe-empty-state');
  const pageBar = document.getElementById('wardrobe-pagination');

  if (state.wardrobe.items.length === 0) {
    gridEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    if (pageBar) pageBar.classList.add('hidden');
    document.getElementById('wardrobe-empty-title').textContent =
      emptyMessage || (counts.all === 0 ? 'Lemari digitalmu masih kosong' : 'Tidak ada item yang cocok');
    return;
  }

  emptyEl.classList.add('hidden');
  gridEl.innerHTML = state.wardrobe.items
    .map(
      (item) => `
      <article class="wardrobe-card">
        <div class="wardrobe-card-img-wrap">
          <img src="${item.thumbnail_url || item.image_url}" alt="${escapeHtml(item.name)}" loading="lazy" />
          <span class="wardrobe-card-badge">${escapeHtml(item.category_label)}</span>
        </div>
        <h3 class="wardrobe-card-title">${escapeHtml(item.name)}</h3>
        <p class="wardrobe-card-sub">Siap dipadukan · ${escapeHtml(item.primary_color)} · ${escapeHtml(item.characteristics?.material || 'Katun')}</p>
        <button type="button" class="btn btn-outline btn-block btn-sm" data-view-item="${item.item_id}">
          Lihat item
        </button>
      </article>
    `
    )
    .join('');

  gridEl.querySelectorAll('[data-view-item]').forEach((btn) => {
    btn.addEventListener('click', () => openItemDetailModal(btn.dataset.viewItem));
  });

  // Render Pagination Controls (FR-07)
  if (pageBar) {
    if (state.wardrobe.totalPages > 1) {
      pageBar.classList.remove('hidden');
      document.getElementById('wardrobe-page-info').textContent =
        `Halaman ${state.wardrobe.page} dari ${state.wardrobe.totalPages} (${state.wardrobe.total} item)`;
      document.getElementById('btn-wardrobe-prev').disabled = state.wardrobe.page <= 1;
      document.getElementById('btn-wardrobe-next').disabled = state.wardrobe.page >= state.wardrobe.totalPages;
    } else {
      pageBar.classList.add('hidden');
    }
  }
}

function bindWardrobeEvents() {
  document.getElementById('btn-open-tambah-pakaian').addEventListener('click', openTambahPakaianModal);
  document.getElementById('btn-empty-add-clothing').addEventListener('click', openTambahPakaianModal);

  document.getElementById('btn-reset-wardrobe-filters').addEventListener('click', async () => {
    state.wardrobe.filters = { category: 'all', color: '', formality: '', q: '', sort: 'newest' };
    state.wardrobe.page = 1;
    document.getElementById('wardrobe-search-input').value = '';
    document.getElementById('wardrobe-formality-filter').value = '';
    document.getElementById('wardrobe-sort-select').value = 'newest';
    document.querySelectorAll('#wardrobe-color-dots .color-dot-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.dotColor === '');
    });
    await fetchAndRenderWardrobe();
  });

  let searchTimer = null;
  document.getElementById('wardrobe-search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      state.wardrobe.filters.q = e.target.value.trim();
      state.wardrobe.page = 1;
      await fetchAndRenderWardrobe();
    }, 180);
  });

  // Visual Color Dot Filter Bar (Single Consolidated Color Filter)
  document.querySelectorAll('#wardrobe-color-dots .color-dot-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const color = btn.dataset.dotColor;
      state.wardrobe.filters.color = color;
      state.wardrobe.page = 1;
      document.querySelectorAll('#wardrobe-color-dots .color-dot-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      await fetchAndRenderWardrobe();
    });
  });

  document.getElementById('wardrobe-formality-filter').addEventListener('change', async (e) => {
    state.wardrobe.filters.formality = e.target.value;
    state.wardrobe.page = 1;
    await fetchAndRenderWardrobe();
  });

  document.getElementById('wardrobe-sort-select').addEventListener('change', async (e) => {
    state.wardrobe.filters.sort = e.target.value;
    state.wardrobe.page = 1;
    await fetchAndRenderWardrobe();
  });

  document.querySelectorAll('#wardrobe-category-pills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.wardrobe.filters.category = btn.dataset.category;
      state.wardrobe.page = 1;
      await fetchAndRenderWardrobe();
    });
  });

  // Pagination Buttons
  document.getElementById('btn-wardrobe-prev').addEventListener('click', async () => {
    if (state.wardrobe.page > 1) {
      state.wardrobe.page--;
      await fetchAndRenderWardrobe();
    }
  });
  document.getElementById('btn-wardrobe-next').addEventListener('click', async () => {
    if (state.wardrobe.page < state.wardrobe.totalPages) {
      state.wardrobe.page++;
      await fetchAndRenderWardrobe();
    }
  });

  // File Picker & Drag-and-Drop (FR-04, FR-18)
  const fileInput = document.getElementById('clothing-file-input');
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      await handleSelectedClothingFiles(files);
    }
  });

  const dropzone = document.getElementById('upload-dropzone');
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#304c3c';
    dropzone.style.backgroundColor = '#e7ede4';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = '#c9c7be';
    dropzone.style.backgroundColor = '#f7f6f2';
  });
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#c9c7be';
    dropzone.style.backgroundColor = '#f7f6f2';
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      await handleSelectedClothingFiles(files);
    }
  });

  // Camera Capture
  document.getElementById('btn-camera-capture').addEventListener('click', async () => {
    const alertBox = document.getElementById('upload-alert-box');
    alertBox.classList.add('hidden');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alertBox.textContent = 'Izin kamera tidak tersedia di browser ini. Silakan gunakan opsi "Pilih foto" dari galeri.';
      alertBox.classList.remove('hidden');
      return;
    }
    try {
      state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.getElementById('camera-video');
      video.srcObject = state.cameraStream;
      document.getElementById('camera-stream-box').classList.remove('hidden');
    } catch {
      alertBox.textContent = 'Izin kamera ditolak. Silakan pilih foto langsung dari galeri perangkat Anda.';
      alertBox.classList.remove('hidden');
    }
  });

  document.getElementById('btn-close-camera').addEventListener('click', stopCameraStream);

  document.getElementById('btn-take-snapshot').addEventListener('click', async () => {
    const video = document.getElementById('camera-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 800;
    canvas.height = video.videoHeight || 800;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCameraStream();
    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], 'kamera-pakaian.jpg', { type: 'image/jpeg' });
        await handleSelectedClothingFiles([file]);
      }
    }, 'image/jpeg', 0.85);
  });

  // Toggle AI Garment Cutout / Original Photo Preview
  document.getElementById('btn-toggle-crop-mode')?.addEventListener('click', () => {
    const entry = state.batchQueue[state.activeBatchIndex];
    if (!entry) return;
    entry.activePreviewMode = entry.activePreviewMode === 'cutout' ? 'original' : 'cutout';

    const previewImg = document.getElementById('upload-active-preview-img');
    const toggleBtn = document.getElementById('btn-toggle-crop-mode');
    const statusBadge = document.getElementById('crop-status-badge');
    const cropModeLabel = document.getElementById('btn-crop-mode-label');
    const cropModeIcon = document.getElementById('btn-crop-mode-icon');

    if (entry.activePreviewMode === 'cutout' && entry.croppedDataUrl) {
      previewImg.src = entry.croppedDataUrl;
      toggleBtn?.classList.add('active');
      if (statusBadge) statusBadge.textContent = 'Fokus Pakaian & Cutout Aktif';
      if (cropModeLabel) cropModeLabel.textContent = 'Mode: AI Cutout (Aktif)';
      if (cropModeIcon) cropModeIcon.textContent = '✂️';
      showFloatingToast('Mode: AI Cutout (Fokus pakaian aktif).');
    } else {
      previewImg.src = entry.localPreviewUrl || entry.recognized?.image_url || '/assets/item-1.png';
      toggleBtn?.classList.remove('active');
      if (statusBadge) statusBadge.textContent = 'Foto Asli (Tanpa Cutout)';
      if (cropModeLabel) cropModeLabel.textContent = 'Mode: Foto Asli';
      if (cropModeIcon) cropModeIcon.textContent = '📷';
      showFloatingToast('Mode: Foto Asli (Tanpa pemotongan).');
    }
    renderBatchQueueList();
  });

  document.getElementById('btn-toggle-bg-pattern')?.addEventListener('click', () => {
    const box = document.getElementById('upload-preview-img-box');
    box?.classList.toggle('bg-checker');
    const isChecker = box?.classList.contains('bg-checker');
    showFloatingToast(isChecker ? 'Latar kotak transparansi aktif (PNG Checker).' : 'Latar standar aktif.');
  });

  // Save Single Clothing Item Form (FR-07)
  document.getElementById('add-clothing-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById('upload-alert-box');
    alertBox.classList.add('hidden');

    const activeQueueEntry = state.batchQueue[state.activeBatchIndex] || null;
    const isLowConf = !document.getElementById('low-confidence-banner').classList.contains('hidden');
    const confirmedLow = document.getElementById('confirm-low-confidence-checkbox').checked;

    if (isLowConf && !confirmedLow) {
      alertBox.textContent = 'Mohon centang konfirmasi bahwa Anda sudah memeriksa atribut dengan keyakinan rendah (< 0,6).';
      alertBox.classList.remove('hidden');
      return;
    }

    const payload = {
      name: document.getElementById('item-name-input').value.trim(),
      category: document.getElementById('item-category-input').value,
      sub_category: document.getElementById('item-subcat-input').value.trim(),
      primary_color: document.getElementById('item-color-input').value,
      characteristics: {
        material: document.getElementById('item-material-input').value.trim() || 'Katun',
        pattern: document.getElementById('item-pattern-input').value.trim() || 'Polos',
        fit: document.getElementById('item-fit-input').value,
        formality: document.getElementById('item-formality-input').value
      },
      ai_confidence: activeQueueEntry?.recognized?.ai_confidence ?? 0.95,
      confirmed_low_confidence: confirmedLow,
      is_user_corrected: true,
      raw_image_url: activeQueueEntry?.recognized?.raw_image_url,
      cropped_image_base64: activeQueueEntry?.activePreviewMode === 'cutout' ? activeQueueEntry?.croppedDataUrl : null
    };

    try {
      await apiFetch('/api/v1/wardrobe/items', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (activeQueueEntry) activeQueueEntry.saved = true;

      await fetchAndRenderWardrobe();
      renderBeranda();
      showFloatingToast(`✓ "${payload.name}" disimpan ke lemari.`);

      const nextUnsavedIdx = state.batchQueue.findIndex((q, i) => i > state.activeBatchIndex && q.recognized && !q.saved);
      if (nextUnsavedIdx !== -1) {
        selectBatchQueueItem(nextUnsavedIdx);
      } else {
        closeModal('modal-tambah-pakaian');
      }
    } catch (err) {
      alertBox.textContent = err.message;
      alertBox.classList.remove('hidden');
    }
  });

  // Save All Valid in Batch Queue (FR-18 "Simpan Semua")
  document.getElementById('btn-save-all-batch').addEventListener('click', async () => {
    const alertBox = document.getElementById('upload-alert-box');
    alertBox.classList.add('hidden');

    const validEntries = state.batchQueue
      .filter((q) => q.recognized && !q.saved)
      .map((q) => ({
        name: q.recognized.name,
        category: q.recognized.category,
        sub_category: q.recognized.sub_category,
        primary_color: q.recognized.primary_color,
        characteristics: q.recognized.characteristics,
        ai_confidence: q.recognized.ai_confidence,
        raw_image_url: q.recognized.raw_image_url,
        cropped_image_base64: q.activePreviewMode === 'cutout' ? q.croppedDataUrl : null
      }));

    if (validEntries.length === 0) {
      alertBox.textContent = 'Tidak ada item valid di antrean untuk disimpan.';
      alertBox.classList.remove('hidden');
      return;
    }

    try {
      const res = await apiFetch('/api/v1/wardrobe/items/bulk', {
        method: 'POST',
        body: JSON.stringify({ items: validEntries })
      });
      await fetchAndRenderWardrobe();
      renderBeranda();
      closeModal('modal-tambah-pakaian');
      showFloatingToast(`✓ ${res.saved_count} pakaian berhasil disimpan ke lemari.`);
    } catch (err) {
      alertBox.textContent = err.message;
      alertBox.classList.remove('hidden');
    }
  });

  // Edit & Delete Item Modal (FR-09)
  document.getElementById('edit-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('edit-item-id').value;
    const payload = {
      name: document.getElementById('edit-item-name').value.trim(),
      category: document.getElementById('edit-item-category').value,
      sub_category: document.getElementById('edit-item-subcat').value.trim(),
      primary_color: document.getElementById('edit-item-color').value,
      characteristics: {
        formality: document.getElementById('edit-item-formality').value,
        material: document.getElementById('edit-item-material').value.trim() || 'Katun',
        pattern: document.getElementById('edit-item-pattern').value.trim() || 'Polos'
      }
    };

    try {
      await apiFetch(`/api/v1/wardrobe/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      closeModal('modal-detail-item');
      await fetchAndRenderWardrobe();
      renderBeranda();
      showFloatingToast('✓ Perubahan atribut pakaian disimpan.');
    } catch (err) {
      const warn = document.getElementById('edit-item-warning');
      warn.textContent = err.message;
      warn.classList.remove('hidden');
    }
  });

  document.getElementById('btn-delete-item').addEventListener('click', async () => {
    const itemId = document.getElementById('edit-item-id').value;
    const itemName = document.getElementById('edit-item-name').value;
    const warn = document.getElementById('edit-item-warning');
    const isConfirmStep = warn.dataset.awaitingConfirm === 'true';

    try {
      await apiFetch(`/api/v1/wardrobe/items/${itemId}${isConfirmStep ? '?confirm=true' : ''}`, {
        method: 'DELETE'
      });
      warn.dataset.awaitingConfirm = 'false';
      closeModal('modal-detail-item');
      await fetchAndRenderWardrobe();
      const savedRes = await apiFetch('/api/v1/outfits?saved=true');
      state.savedOutfits = savedRes.items;
      renderBeranda();
      renderKoleksi();
      showFloatingToast(`"${itemName}" telah dihapus dari lemari.`);
    } catch (err) {
      if (err.status === 409) {
        warn.textContent = err.message + ' Klik tombol "Hapus Item" sekali lagi untuk mengonfirmasi penghapusan (soft-delete).';
        warn.dataset.awaitingConfirm = 'true';
        warn.classList.remove('hidden');
      } else {
        warn.textContent = err.message;
        warn.classList.remove('hidden');
      }
    }
  });
}

function openTambahPakaianModal() {
  stopCameraStream();
  state.batchQueue = [];
  state.activeBatchIndex = 0;
  document.getElementById('upload-alert-box').classList.add('hidden');
  document.getElementById('batch-queue-section').classList.add('hidden');
  document.getElementById('upload-preview-stage').classList.add('hidden');
  document.getElementById('low-confidence-banner').classList.add('hidden');
  document.getElementById('add-clothing-form').reset();
  document.getElementById('badge-conf-cat').textContent = '';
  document.getElementById('badge-conf-color').textContent = '';
  document.getElementById('badge-conf-subcat').textContent = '';
  openModal('modal-tambah-pakaian');
}

function stopCameraStream() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((t) => t.stop());
    state.cameraStream = null;
  }
  document.getElementById('camera-stream-box').classList.add('hidden');
}

async function compressImageClientSide(file) {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error(`File "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal 15 MB.`);
  }
  if (/\.(pdf|exe|bat|zip|doc)$/i.test(file.name) || file.size < 64 * 1024) {
    const arrayBuf = await file.arrayBuffer();
    return {
      base64: arrayBufferToBase64(arrayBuf),
      rawSize: file.size
    };
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1600;
        let w = img.width;
        let h = img.height;
        if (w > maxSide || h > maxSide) {
          if (w >= h) {
            h = Math.round((h * maxSide) / w);
            w = maxSide;
          } else {
            w = Math.round((w * maxSide) / h);
            h = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
        resolve({ base64: dataUrl, rawSize: file.size });
      };
      img.onerror = () => {
        resolve({ base64: reader.result, rawSize: file.size });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// --------------------------------------------------------------------------
// AI Garment Extraction: Smart Bounding Box Crop & Background Cutout
// --------------------------------------------------------------------------
async function processAiGarmentCropAndCutout(imageSrc, box2d) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const nw = img.naturalWidth || img.width;
        const nh = img.naturalHeight || img.height;
        if (!nw || !nh) return resolve(null);

        // Normalize box_2d [ymin, xmin, ymax, xmax] (0..1000 scale)
        let [ymin, xmin, ymax, xmax] = Array.isArray(box2d) && box2d.length === 4
          ? box2d
          : [80, 100, 920, 900];

        ymin = Math.max(0, Math.min(1000, ymin));
        xmin = Math.max(0, Math.min(1000, xmin));
        ymax = Math.max(ymin + 50, Math.min(1000, ymax));
        xmax = Math.max(xmin + 50, Math.min(1000, xmax));

        // Add 3.5% padding around garment
        const boxH = ymax - ymin;
        const boxW = xmax - xmin;
        const padY = boxH * 0.035;
        const padX = boxW * 0.035;

        const cropY = Math.max(0, ((ymin - padY) / 1000) * nh);
        const cropX = Math.max(0, ((xmin - padX) / 1000) * nw);
        const cropH = Math.min(nh - cropY, ((boxH + padY * 2) / 1000) * nh);
        const cropW = Math.min(nw - cropX, ((boxW + padX * 2) / 1000) * nw);

        const targetSide = 720;
        const canvas = document.createElement('canvas');
        canvas.width = targetSide;
        canvas.height = targetSide;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const scale = Math.min((targetSide * 0.94) / cropW, (targetSide * 0.94) / cropH);
        const destW = Math.round(cropW * scale);
        const destH = Math.round(cropH * scale);
        const destX = Math.round((targetSide - destW) / 2);
        const destY = Math.round((targetSide - destH) / 2);

        ctx.clearRect(0, 0, targetSide, targetSide);
        ctx.drawImage(img, cropX, cropY, cropW, cropH, destX, destY, destW, destH);

        // Smart Edge-Aware Background Cutout
        const imgData = ctx.getImageData(0, 0, targetSide, targetSide);
        const data = imgData.data;

        const samplePoints = [
          [destX + 2, destY + 2],
          [destX + destW - 3, destY + 2],
          [destX + 2, destY + destH - 3],
          [destX + destW - 3, destY + destH - 3],
          [Math.round(targetSide / 2), destY + 2],
          [destX + 2, Math.round(targetSide / 2)],
          [destX + destW - 3, Math.round(targetSide / 2)]
        ];

        let totalR = 0, totalG = 0, totalB = 0, count = 0;
        samplePoints.forEach(([sx, sy]) => {
          if (sx >= 0 && sx < targetSide && sy >= 0 && sy < targetSide) {
            const idx = (sy * targetSide + sx) * 4;
            if (data[idx + 3] > 100) {
              totalR += data[idx];
              totalG += data[idx + 1];
              totalB += data[idx + 2];
              count++;
            }
          }
        });

        if (count > 0) {
          const bgR = totalR / count;
          const bgG = totalG / count;
          const bgB = totalB / count;

          const colorThreshold = 46;
          const featherRange = 26;

          for (let y = 0; y < targetSide; y++) {
            for (let x = 0; x < targetSide; x++) {
              const i = (y * targetSide + x) * 4;
              if (data[i + 3] === 0) continue;

              const dx = (x - targetSide / 2) / (targetSide / 2);
              const dy = (y - targetSide / 2) / (targetSide / 2);
              const distFromCenter = Math.sqrt(dx * dx + dy * dy);

              const dr = data[i] - bgR;
              const dg = data[i + 1] - bgG;
              const db = data[i + 2] - bgB;
              const colorDist = Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);

              if (colorDist < colorThreshold && distFromCenter > 0.42) {
                const alphaFactor = Math.max(0, (colorDist - (colorThreshold - featherRange)) / featherRange);
                data[i + 3] = Math.round(data[i + 3] * alphaFactor);
              }
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        const dataUrl = canvas.toDataURL('image/png', 0.92);
        resolve({ dataUrl, cropBox: { ymin, xmin, ymax, xmax } });
      } catch (err) {
        console.warn('[AI Garment Extraction] Gagal memproses canvas:', err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageSrc;
  });
}

async function handleSelectedClothingFiles(files) {
  const alertBox = document.getElementById('upload-alert-box');
  alertBox.classList.add('hidden');

  if (files.length > 10) {
    alertBox.textContent = 'Maksimal 10 foto yang dapat dipilih sekaligus dalam satu unggahan.';
    alertBox.classList.remove('hidden');
    return;
  }

  state.batchQueue = files.map((file) => ({
    file,
    filename: file.name,
    localPreviewUrl: URL.createObjectURL(file),
    status: 'queued',
    recognized: null,
    error: null,
    saved: false,
    croppedDataUrl: null,
    activePreviewMode: 'cutout'
  }));
  state.activeBatchIndex = 0;
  renderBatchQueueList();

  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < state.batchQueue.length) {
      const idx = cursor++;
      const entry = state.batchQueue[idx];
      entry.status = 'processing';
      renderBatchQueueList();

      try {
        const compressed = await compressImageClientSide(entry.file);
        const res = await apiFetch('/api/v1/wardrobe/recognize', {
          method: 'POST',
          body: JSON.stringify({
            filename: entry.filename,
            mime_type: entry.file.type,
            raw_size_bytes: compressed.rawSize,
            file_base64: compressed.base64,
            hint: entry.filename
          })
        });
        entry.status = 'succeeded';
        entry.recognized = res.recognized;
        if (entry.localPreviewUrl && res.recognized) {
          try {
            const extraction = await processAiGarmentCropAndCutout(entry.localPreviewUrl, res.recognized.box_2d);
            if (extraction) {
              entry.croppedDataUrl = extraction.dataUrl;
              entry.activePreviewMode = 'cutout';
            }
          } catch (cropErr) {
            console.warn('[AI Garment Extraction] Gagal ekstraksi:', cropErr);
          }
        }
      } catch (err) {
        entry.status = 'failed';
        entry.error = err.message;
      }
      renderBatchQueueList();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, state.batchQueue.length) }, () => worker());
  await Promise.all(workers);
  await refreshUsageQuota();

  const firstValid = state.batchQueue.findIndex((q) => q.recognized);
  if (firstValid !== -1) {
    selectBatchQueueItem(firstValid);
  } else if (state.batchQueue[0]?.error) {
    alertBox.textContent = state.batchQueue[0].error;
    alertBox.classList.remove('hidden');
  }
}

function renderBatchQueueList() {
  const sec = document.getElementById('batch-queue-section');
  const listEl = document.getElementById('batch-queue-items');
  if (state.batchQueue.length === 0) {
    sec.classList.add('hidden');
    return;
  }
  sec.classList.remove('hidden');
  const validCount = state.batchQueue.filter((q) => q.recognized && !q.saved).length;
  document.getElementById('batch-queue-status').textContent =
    `Antrean Foto Pakaian (${state.batchQueue.length} foto · ${validCount} siap disimpan)`;

  listEl.innerHTML = state.batchQueue
    .map((q, idx) => {
      const thumbSrc =
        (q.activePreviewMode === 'cutout' && q.croppedDataUrl) ||
        q.recognized?.image_url ||
        q.localPreviewUrl ||
        '/assets/item-1.png';
      const statusBadge =
        q.saved
          ? 'Tersimpan'
          : q.status === 'succeeded'
          ? `Siap (${Math.round((q.recognized?.ai_confidence || 0.9) * 100)}%)`
          : q.status === 'failed'
          ? `Gagal: ${escapeHtml(q.error || 'Format tidak didukung')}`
          : 'Memproses...';

      return `
        <div class="batch-queue-row ${idx === state.activeBatchIndex ? 'active' : ''}" data-batch-idx="${idx}">
          <div class="batch-queue-left">
            <img src="${thumbSrc}" alt="" class="batch-thumb-img" />
            <span><strong>#${idx + 1}</strong> ${escapeHtml(q.filename)}</span>
          </div>
          <span>${statusBadge}</span>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('[data-batch-idx]').forEach((row) => {
    row.addEventListener('click', () => {
      const i = Number(row.dataset.batchIdx);
      if (state.batchQueue[i]?.recognized) {
        selectBatchQueueItem(i);
      }
    });
  });
}

function selectBatchQueueItem(idx) {
  state.activeBatchIndex = idx;
  renderBatchQueueList();
  const entry = state.batchQueue[idx];
  if (!entry || !entry.recognized) return;

  const r = entry.recognized;
  const fieldIds = [
    'item-name-input',
    'item-category-input',
    'item-color-input',
    'item-subcat-input',
    'item-material-input',
    'item-pattern-input',
    'item-fit-input',
    'item-formality-input'
  ];

  document.getElementById('item-name-input').value = r.name || '';
  document.getElementById('item-category-input').value = r.category || 'top';
  document.getElementById('item-color-input').value = r.primary_color || 'Putih';
  document.getElementById('item-subcat-input').value = r.sub_category || 'Kemeja';
  document.getElementById('item-material-input').value = r.characteristics?.material || 'Katun';
  document.getElementById('item-pattern-input').value = r.characteristics?.pattern || 'Polos';
  document.getElementById('item-fit-input').value = r.characteristics?.fit || 'Regular fit';
  document.getElementById('item-formality-input').value = r.characteristics?.formality || 'smart_casual';

  // Trigger AI Auto-fill Pulse Animation on populated fields
  fieldIds.forEach((fid) => {
    const el = document.getElementById(fid);
    if (el) {
      el.classList.remove('ai-autofill-pulse');
      void el.offsetWidth;
      el.classList.add('ai-autofill-pulse');
    }
  });

  // Update upload thumbnail preview stage with AI Cutout support
  const stage = document.getElementById('upload-preview-stage');
  stage.classList.remove('hidden');

  const previewImg = document.getElementById('upload-active-preview-img');
  const toggleBtn = document.getElementById('btn-toggle-crop-mode');
  const statusBadge = document.getElementById('crop-status-badge');
  const cropModeLabel = document.getElementById('btn-crop-mode-label');
  const cropModeIcon = document.getElementById('btn-crop-mode-icon');

  function updateGarmentPreviewDisplay() {
    const isCutout = entry.activePreviewMode === 'cutout' && entry.croppedDataUrl;
    if (isCutout) {
      previewImg.src = entry.croppedDataUrl;
      toggleBtn?.classList.add('active');
      if (statusBadge) statusBadge.textContent = 'Fokus Pakaian & Cutout Aktif';
      if (cropModeLabel) cropModeLabel.textContent = 'Mode: AI Cutout (Aktif)';
      if (cropModeIcon) cropModeIcon.textContent = '✂️';
    } else {
      previewImg.src = entry.localPreviewUrl || r.image_url || '/assets/item-1.png';
      toggleBtn?.classList.remove('active');
      if (statusBadge) statusBadge.textContent = 'Foto Asli (Tanpa Cutout)';
      if (cropModeLabel) cropModeLabel.textContent = 'Mode: Foto Asli';
      if (cropModeIcon) cropModeIcon.textContent = '📷';
    }
  }

  if (!entry.croppedDataUrl && (entry.localPreviewUrl || r.image_url)) {
    processAiGarmentCropAndCutout(entry.localPreviewUrl || r.image_url, r.box_2d).then((res) => {
      if (res && res.dataUrl) {
        entry.croppedDataUrl = res.dataUrl;
        entry.activePreviewMode = 'cutout';
        updateGarmentPreviewDisplay();
        renderBatchQueueList();
      }
    });
  }

  updateGarmentPreviewDisplay();

  const conf = r.confidence_per_field || {};
  setConfidenceTag('badge-conf-cat', conf.category);
  setConfidenceTag('badge-conf-color', conf.primary_color);
  setConfidenceTag('badge-conf-subcat', conf.sub_category);

  const lowBanner = document.getElementById('low-confidence-banner');
  document.getElementById('confirm-low-confidence-checkbox').checked = false;
  lowBanner.classList.toggle('hidden', !r.needs_review);
}

function setConfidenceTag(elId, score) {
  const el = document.getElementById(elId);
  if (score === undefined) {
    el.textContent = '';
    el.className = 'conf-tag';
    return;
  }
  const pct = Math.round(score * 100);
  if (score < 0.6) {
    el.textContent = `Perlu dicek (${pct}%)`;
    el.className = 'conf-tag low';
  } else {
    el.textContent = `AI ${pct}%`;
    el.className = 'conf-tag high';
  }
}

function openItemDetailModal(itemId) {
  const item = state.wardrobe.items.find((i) => i.item_id === itemId);
  if (!item) return;

  document.getElementById('edit-item-id').value = item.item_id;
  document.getElementById('edit-item-img').src = item.image_url;
  document.getElementById('edit-item-name').value = item.name;
  document.getElementById('edit-item-category').value = item.category;
  document.getElementById('edit-item-subcat').value = item.sub_category;
  document.getElementById('edit-item-color').value = item.primary_color;
  document.getElementById('edit-item-formality').value = item.characteristics?.formality || 'smart_casual';
  document.getElementById('edit-item-material').value = item.characteristics?.material || 'Katun';
  document.getElementById('edit-item-pattern').value = item.characteristics?.pattern || 'Polos';

  const warn = document.getElementById('edit-item-warning');
  warn.classList.add('hidden');
  warn.dataset.awaitingConfirm = 'false';

  openModal('modal-detail-item');
}

// --------------------------------------------------------------------------
// 5. Koleksi / Saved Outfits & Schedule Planner & Custom Modals (FR-13, FR-15)
// --------------------------------------------------------------------------
function renderKoleksi(showSavedToast = false) {
  document.getElementById('koleksi-saved-toast').classList.toggle('hidden', !showSavedToast);

  const listEl = document.getElementById('koleksi-list');
  const emptyEl = document.getElementById('koleksi-empty-state');

  // Dynamic filter pill counts
  const totalSaved = state.savedOutfits.length;
  const kerjaSaved = state.savedOutfits.filter((o) => o.occasion_code === 'kerja_kantor').length;
  const allBtn = document.querySelector('#koleksi-filter-pills [data-occ="all"]');
  const kerjaBtn = document.querySelector('#koleksi-filter-pills [data-occ="kerja_kantor"]');
  if (allBtn) allBtn.textContent = `Semua look · ${totalSaved}`;
  if (kerjaBtn) kerjaBtn.textContent = `Kerja & meeting · ${kerjaSaved}`;

  const q = state.koleksiSearch.toLowerCase();
  const filtered = state.savedOutfits.filter((o) => {
    if (state.koleksiFilter !== 'all' && o.occasion_code !== state.koleksiFilter) return false;
    if (q) {
      const hay = [o.saved_name, o.title, o.occasion_label, o.style_label, ...o.items.map((i) => i.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.innerHTML = filtered
    .map((o, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const itemsText = o.items.map((i) => i.name.toLowerCase()).join(', ');
      const savedDateStr = o.saved_at ? formatIndonesianDate(o.saved_at, false) : formatIndonesianDate(new Date(), false);
      const activePlan = o.date_label || '';
      const collageHtml =
        renderOutfitCollageHtml(o.items, 'koleksi-collage') ||
        `<img src="${o.preview_image_url || '/assets/look-1.png'}" alt="${escapeHtml(o.saved_name || o.title)}" class="koleksi-card-img" />`;

      return `
        <article class="koleksi-card">
          <div>
            ${collageHtml}
          </div>
          <div>
            <div class="detail-eyebrow-row">
              <p class="eyebrow">KOLEKSI SAYA / ${num}</p>
              ${o.has_deleted_items ? '<span class="badge-warning">Berisi item yang sudah dihapus</span>' : ''}
            </div>
            <h2 class="serif-heading-lg mt-8">${escapeHtml(o.saved_name || o.title)}</h2>
            <p class="body-muted mt-8">${escapeHtml(o.occasion_label)} · ${escapeHtml(o.style_label)}</p>
            <p class="body-muted mt-12">
              ${escapeHtml(itemsText ? itemsText.charAt(0).toUpperCase() + itemsText.slice(1) : 'Kombinasi pakaian')}. Semua dari lemarimu.
            </p>

            <!-- Interactive Schedule Wear Planner -->
            <div class="schedule-wear-row">
              <span class="tiny-muted">Jadwalkan pakai:</span>
              <button type="button" class="schedule-pill ${activePlan === 'Hari Ini' ? 'active' : ''}" data-plan-outfit="${o.outfit_id}" data-plan-day="Hari Ini">Hari Ini</button>
              <button type="button" class="schedule-pill ${activePlan === 'Besok' ? 'active' : ''}" data-plan-outfit="${o.outfit_id}" data-plan-day="Besok">Besok</button>
              <button type="button" class="schedule-pill ${activePlan === 'Jumat Meeting' ? 'active' : ''}" data-plan-outfit="${o.outfit_id}" data-plan-day="Jumat Meeting">Jumat Meeting</button>
              <button type="button" class="schedule-pill ${activePlan === 'Akhir Pekan' ? 'active' : ''}" data-plan-outfit="${o.outfit_id}" data-plan-day="Akhir Pekan">Akhir Pekan</button>
            </div>

            <hr class="section-divider my-16" />
            <p class="small-muted">Disimpan · ${escapeHtml(savedDateStr)} ${activePlan ? `· Direncanakan: <strong>${escapeHtml(activePlan)}</strong>` : ''}</p>
            <div class="koleksi-card-actions">
              <button type="button" class="btn btn-primary" data-open-saved="${o.outfit_id}">Buka detail outfit</button>
              <button type="button" class="btn btn-outline" data-rename-saved="${o.outfit_id}">Ganti nama</button>
              <button type="button" class="btn btn-outline" data-delete-saved="${o.outfit_id}">Hapus dari koleksi</button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  listEl.querySelectorAll('[data-open-saved]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const found = state.savedOutfits.find((x) => x.outfit_id === btn.dataset.openSaved);
      if (found) {
        renderOutfitDetail(found);
        navigateTo('cari-outfit');
        setCariSubView('detail');
      }
    });
  });

  // Schedule wear tag click
  listEl.querySelectorAll('[data-plan-outfit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const outfitId = btn.dataset.planOutfit;
      const day = btn.dataset.planDay;
      try {
        await apiFetch(`/api/v1/outfits/${outfitId}`, {
          method: 'PATCH',
          body: JSON.stringify({ date_label: day })
        });
        const savedRes = await apiFetch('/api/v1/outfits?saved=true');
        state.savedOutfits = savedRes.items;
        renderKoleksi();
        showFloatingToast(`Outfit dijadwalkan untuk: ${day}`);
      } catch {}
    });
  });

  // Custom Editorial Rename Modal instead of window.prompt
  listEl.querySelectorAll('[data-rename-saved]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const found = state.savedOutfits.find((x) => x.outfit_id === btn.dataset.renameSaved);
      if (!found) return;
      document.getElementById('rename-outfit-id').value = found.outfit_id;
      document.getElementById('rename-outfit-input').value = found.saved_name || found.title;
      openModal('modal-rename-outfit');
    });
  });

  // Custom Editorial Delete Confirmation Modal instead of window.confirm
  listEl.querySelectorAll('[data-delete-saved]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const outfitId = btn.dataset.deleteSaved;
      const found = state.savedOutfits.find((x) => x.outfit_id === outfitId);
      openConfirmModal({
        eyebrow: 'HAPUS DARI KOLEKSI',
        title: `Hapus "${found?.saved_name || 'outfit ini'}"?`,
        desc: 'Outfit ini akan dihapus dari daftar Koleksi tersimpan Anda.',
        onConfirm: async () => {
          try {
            await apiFetch(`/api/v1/outfits/${outfitId}`, { method: 'DELETE' });
            const savedRes = await apiFetch('/api/v1/outfits?saved=true');
            state.savedOutfits = savedRes.items;
            renderKoleksi();
            showFloatingToast('Outfit dihapus dari Koleksi.');
          } catch (err) {
            showToastModal('Gagal Menghapus', err.message);
          }
        }
      });
    });
  });
}

function bindKoleksiEvents() {
  document.querySelectorAll('#koleksi-filter-pills [data-occ]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.koleksiFilter = btn.dataset.occ;
      document.querySelectorAll('#koleksi-filter-pills [data-occ]').forEach((b) => {
        b.classList.toggle('active', b.dataset.occ === state.koleksiFilter);
      });
      renderKoleksi();
    });
  });

  document.getElementById('koleksi-search-input').addEventListener('input', (e) => {
    state.koleksiSearch = e.target.value.trim();
    renderKoleksi();
  });

  // Custom Rename Modal Submit
  document.getElementById('rename-outfit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const outfitId = document.getElementById('rename-outfit-id').value;
    const newName = document.getElementById('rename-outfit-input').value.trim();
    try {
      await apiFetch(`/api/v1/outfits/${outfitId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_saved: true, saved_name: newName })
      });
      closeModal('modal-rename-outfit');
      const savedRes = await apiFetch('/api/v1/outfits?saved=true');
      state.savedOutfits = savedRes.items;
      renderKoleksi();
      showFloatingToast('Nama outfit berhasil diperbarui.');
    } catch (err) {
      showToastModal('Gagal Mengganti Nama', err.message);
    }
  });

  // Custom Confirm Modal Action
  document.getElementById('btn-confirm-modal-yes').addEventListener('click', async () => {
    closeModal('modal-confirm-action');
    if (typeof state.confirmModalCallback === 'function') {
      const fn = state.confirmModalCallback;
      state.confirmModalCallback = null;
      await fn();
    }
  });

  document.getElementById('btn-open-custom-mockup').addEventListener('click', () => {
    document.getElementById('custom-mockup-output').classList.add('hidden');
    openModal('modal-custom-mockup');
  });

  document.getElementById('custom-mockup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = document.getElementById('custom-mockup-output');
    out.classList.remove('hidden');
    out.innerHTML = `<p class="small-muted">Memeriksa deskripsi dan menyiapkan saran serta ilustrasi item...</p>`;

    const missing_category = document.getElementById('custom-mockup-category').value;
    const prompt = document.getElementById('custom-mockup-prompt').value.trim();

    try {
      const createRes = await apiFetch('/api/v1/mockups', {
        method: 'POST',
        body: JSON.stringify({ missing_category, prompt })
      });
      const pollRes = await apiFetch(`/api/v1/mockups/${createRes.mockup_id}`);
      out.innerHTML = renderMockupCardHtml(pollRes.mockup);
      bindCopyableKeywords(out);
      await refreshUsageQuota();
    } catch (err) {
      out.innerHTML = `<div class="alert-box alert-error">${escapeHtml(err.message)}</div>`;
    }
  });
}

function openConfirmModal({ eyebrow, title, desc, onConfirm }) {
  document.getElementById('confirm-modal-eyebrow').textContent = eyebrow || 'KONFIRMASI TINDAKAN';
  document.getElementById('confirm-modal-title').textContent = title || 'Lanjutkan tindakan ini?';
  document.getElementById('confirm-modal-desc').textContent = desc || '';
  state.confirmModalCallback = onConfirm;
  openModal('modal-confirm-action');
}

// --------------------------------------------------------------------------
// 6. Preferensi Gaya & Live Dynamic Persona Card (Preferensi gaya.png)
// --------------------------------------------------------------------------
function renderPreferensi() {
  if (!state.user) return;
  const u = state.user;
  document.getElementById('pref-fullname').value = u.full_name || 'Nadia Putri';
  document.getElementById('pref-gender').value = u.gender_preference || 'female';
  document.getElementById('pref-city').value = u.city || 'Jakarta';
  document.getElementById('pref-material').value = u.material_preference || 'Linen, katun, dan bahan ringan';

  const activeStyles = new Set(u.style_preferences || [u.style_preference || 'smart_casual']);
  document.querySelectorAll('#pref-style-pills .pill-btn').forEach((btn) => {
    btn.classList.toggle('active', activeStyles.has(btn.dataset.style));
  });

  document.querySelectorAll('#pref-fit-pills .pill-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.fit === (u.fit_preference || 'Relaxed fit'));
  });

  const favColors = new Set(u.favorite_colors || ['Hitam', 'Putih', 'Olive', 'Beige']);
  document.querySelectorAll('#pref-color-swatches .swatch-item').forEach((sw) => {
    const c = sw.dataset.color;
    const isAct = favColors.has(c);
    sw.classList.toggle('active', isAct);
    const label = sw.querySelector('.swatch-label');
    if (label) label.textContent = isAct ? `✓ ${c}` : c;
  });

  updateLiveStylePersonaPreview();

  const statusBadge = document.getElementById('account-email-status');
  const verifyBanner = document.getElementById('verify-email-banner');
  if (u.email_verified) {
    statusBadge.textContent = 'Email Terverifikasi';
    statusBadge.className = 'badge-verified';
    verifyBanner.classList.add('hidden');
  } else {
    statusBadge.textContent = 'Belum Terverifikasi';
    statusBadge.className = 'badge-warning';
    verifyBanner.classList.remove('hidden');
  }
}

function updateLiveStylePersonaPreview() {
  const styleBtnMap = {};
  document.querySelectorAll('#pref-style-pills .pill-btn').forEach((b) => {
    styleBtnMap[b.dataset.style] = b.textContent.trim();
  });
  const selectedStyles = Array.from(document.querySelectorAll('#pref-style-pills .pill-btn.active')).map(
    (b) => b.dataset.style
  );
  const selectedFit = document.querySelector('#pref-fit-pills .pill-btn.active')?.dataset.fit || 'Relaxed fit';
  const selectedSwatches = Array.from(document.querySelectorAll('#pref-color-swatches .swatch-item.active'));
  const selectedMaterial = (document.getElementById('pref-material')?.value || 'Linen & katun ringan').trim();

  const personaMap = {
    minimalist: {
      title: 'Simpel & terarah',
      desc: 'Netral, mudah dipadukan, dan nyaman untuk keseharian dengan siluet bersih.'
    },
    smart_casual: {
      title: 'Rapi tanpa berlebihan',
      desc: 'Terstruktur namun tetap rileks; siap berpindah dari ruang rapat ke agenda sore.'
    },
    streetwear: {
      title: 'Kasual urban yang ekspresif',
      desc: 'Karakter santai modern dengan permainan proporsi dan lapisan yang leluasa.'
    },
    casual: {
      title: 'Nyaman setiap hari',
      desc: 'Mengutamakan bahan adem dan gerak bebas tanpa terlihat terburu-buru.'
    },
    sporty: {
      title: 'Aktif & ringkas',
      desc: 'Fungsional, ringan, dan dinamis untuk mobilitas tinggi sepanjang hari.'
    },
    vintage: {
      title: 'Klasik & hangat',
      desc: 'Tekstural, tenang, dan berkarakter dengan palet warna hangat yang awet dipakai.'
    }
  };

  const primary = selectedStyles[0] || 'minimalist';
  const persona = personaMap[primary] || personaMap.minimalist;

  const titleEl = document.getElementById('persona-live-title');
  const descEl = document.getElementById('persona-live-desc');
  if (titleEl) titleEl.textContent = persona.title;
  if (descEl) descEl.textContent = `${persona.desc} (Potongan ${selectedFit.toLowerCase()}).`;

  const swatchesToUse =
    selectedSwatches.length > 0
      ? selectedSwatches.map((s) => ({
          color: s.dataset.color || 'Netral',
          hex: s.dataset.hex || '#304c3c'
        }))
      : [
          { color: 'Hitam', hex: '#1c1f1d' },
          { color: 'Putih', hex: '#ffffff' },
          { color: 'Olive', hex: '#4b5d44' },
          { color: 'Beige', hex: '#e3dac9' }
        ];

  const paletteEl = document.getElementById('persona-live-palette');
  if (paletteEl) {
    paletteEl.innerHTML = swatchesToUse
      .map((s) => `<span class="live-palette-seg" style="background:${s.hex}"></span>`)
      .join('');
  }

  // Sync Cari Outfit -> Brief sidebar card with user's actual preferences & color palette
  const briefTitleEl = document.getElementById('brief-persona-title');
  if (briefTitleEl) briefTitleEl.textContent = `${persona.title}.`;

  const briefPaletteEl = document.getElementById('brief-palette-preview');
  if (briefPaletteEl) {
    briefPaletteEl.innerHTML = swatchesToUse
      .slice(0, 6)
      .map(
        (s) => `
        <div class="brief-palette-chip">
          <span class="brief-palette-swatch" style="background:${s.hex}"></span>
          <span class="brief-palette-label">${escapeHtml(s.color)}</span>
        </div>`
      )
      .join('');
  }

  const briefSummaryEl = document.getElementById('brief-pref-summary');
  if (briefSummaryEl) {
    const styleNames = selectedStyles.map((st) => styleBtnMap[st] || st).join(', ') || 'Smart casual';
    const colorNames = swatchesToUse.map((s) => s.color).join(', ');
    briefSummaryEl.innerHTML = `
      <li>Gaya: ${escapeHtml(styleNames)}</li>
      <li>Warna: ${escapeHtml(colorNames)}</li>
      <li>Potongan: ${escapeHtml(selectedFit)}</li>
      <li>Bahan: ${escapeHtml(selectedMaterial)}</li>
    `;
  }
}

function bindPreferensiEvents() {
  document.querySelectorAll('#pref-style-pills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      updateLiveStylePersonaPreview();
    });
  });

  document.querySelectorAll('#pref-fit-pills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#pref-fit-pills .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateLiveStylePersonaPreview();
    });
  });

  document.querySelectorAll('#pref-color-swatches .swatch-item').forEach((sw) => {
    sw.addEventListener('click', () => {
      sw.classList.toggle('active');
      const label = sw.querySelector('.swatch-label');
      const color = sw.dataset.color;
      label.textContent = sw.classList.contains('active') ? `✓ ${color}` : color;
      updateLiveStylePersonaPreview();
    });
  });

  document.getElementById('preferensi-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const activeStyles = Array.from(document.querySelectorAll('#pref-style-pills .pill-btn.active')).map(
      (b) => b.dataset.style
    );
    const style_preferences = activeStyles.length > 0 ? activeStyles : ['smart_casual'];
    const activeFit = document.querySelector('#pref-fit-pills .pill-btn.active')?.dataset.fit || 'Relaxed fit';
    const activeColors = Array.from(document.querySelectorAll('#pref-color-swatches .swatch-item.active')).map(
      (el) => el.dataset.color
    );

    try {
      const res = await apiFetch('/api/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: document.getElementById('pref-fullname').value.trim(),
          gender_preference: document.getElementById('pref-gender').value,
          style_preference: style_preferences[0],
          style_preferences,
          fit_preference: activeFit,
          favorite_colors: activeColors,
          city: document.getElementById('pref-city').value.trim(),
          material_preference: document.getElementById('pref-material').value.trim()
        })
      });
      state.user = res.user;
      state.brief.style_code = res.user.style_preference;
      syncBriefPillsWithState();
      renderUserHeaderAndQuota();

      showToastModal(
        'Preferensi diperbarui.',
        'Pilihan berikutnya akan mempertimbangkan gaya dan kenyamananmu.'
      );
    } catch (err) {
      showToastModal('Gagal Menyimpan Preferensi', err.message);
    }
  });

  // Verify Email Button via simulated outbox (FR-20)
  document.getElementById('btn-verify-email-now').addEventListener('click', async () => {
    try {
      await apiFetch('/api/v1/auth/resend-verification', { method: 'POST' });
      const outboxRes = await apiFetch(`/api/v1/dev/outbox?email=${encodeURIComponent(state.user.email)}`);
      const verifyMail = (outboxRes.items || []).find((m) => m.token_type === 'email_verify');
      if (verifyMail) {
        await apiFetch('/api/v1/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token: verifyMail.raw_token })
        });
        const meData = await apiFetch('/api/v1/users/me');
        state.user = meData.user;
        renderPreferensi();
        showFloatingToast('Email Anda berhasil diverifikasi.');
      }
    } catch (err) {
      showToastModal('Gagal Verifikasi Email', err.message);
    }
  });

  // Change Password (FR-03)
  document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('password-change-msg');
    const old_password = document.getElementById('cp-old').value;
    const new_password = document.getElementById('cp-new').value;

    try {
      const res = await apiFetch('/api/v1/users/me/password', {
        method: 'POST',
        body: JSON.stringify({ old_password, new_password })
      });
      msg.className = 'alert-box alert-success mt-8';
      msg.textContent = res.message;
      msg.classList.remove('hidden');
      document.getElementById('change-password-form').reset();
    } catch (err) {
      msg.className = 'alert-box alert-error mt-8';
      msg.textContent = err.message;
      msg.classList.remove('hidden');
    }
  });

  // Delete Account with Custom Editorial Confirm Modal (FR-17)
  document.getElementById('btn-delete-account').addEventListener('click', () => {
    const errBox = document.getElementById('delete-acc-error');
    errBox.classList.add('hidden');
    const password = document.getElementById('delete-acc-password').value;

    if (!password) {
      errBox.textContent = 'Masukkan kata sandi Anda untuk mengonfirmasi penghapusan akun permanen.';
      errBox.classList.remove('hidden');
      return;
    }

    openConfirmModal({
      eyebrow: 'KONFIRMASI PERMANEN',
      title: 'Hapus akun secara permanen?',
      desc: 'Seluruh data profil, pakaian, outfit, dan saran item Anda langsung dicabut aksesnya dan dihapus permanen.',
      onConfirm: async () => {
        try {
          await apiFetch('/api/v1/users/me', {
            method: 'DELETE',
            body: JSON.stringify({ password })
          });
          setAuthTokens(null);
          sessionStorage.setItem('weargoods_logged_out', 'true');
          showAuthView('login');
        } catch (err) {
          errBox.textContent = err.message;
          errBox.classList.remove('hidden');
        }
      }
    });
  });
}

// --------------------------------------------------------------------------
// Modal Helpers & Keyboard Escape Accessibility (WCAG 2.1 AA - NFR-10)
// --------------------------------------------------------------------------
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  const firstFocusable = modal.querySelector('input, select, textarea, button');
  if (firstFocusable) {
    setTimeout(() => firstFocusable.focus(), 40);
  }
}

function closeModal(id) {
  if (id === 'modal-tambah-pakaian') stopCameraStream();
  document.getElementById(id)?.classList.add('hidden');
}

function showToastModal(title, desc, eyebrow = null, isError = null) {
  const isErr = isError !== null ? isError : (String(title).toLowerCase().startsWith('gagal') || String(title).toLowerCase().includes('error'));
  const eyebrowText = eyebrow || (isErr ? 'PERINGATAN' : 'BERHASIL');
  const eyebrowEl = document.getElementById('toast-modal-eyebrow');
  if (eyebrowEl) {
    eyebrowEl.textContent = eyebrowText;
    eyebrowEl.className = isErr ? 'eyebrow-red' : 'eyebrow-green';
  }
  document.getElementById('toast-modal-title').textContent = title;
  document.getElementById('toast-modal-desc').textContent = desc;
  openModal('modal-success-toast');
}

function bindModalCloseEvents() {
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Close topmost open modal on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openOverlays = Array.from(document.querySelectorAll('.modal-overlay:not(.hidden)'));
      if (openOverlays.length > 0) {
        const last = openOverlays[openOverlays.length - 1];
        closeModal(last.id);
      }
    }
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', initApp);
