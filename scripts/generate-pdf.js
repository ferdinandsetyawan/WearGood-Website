const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Panduan Pengujian AI WearGoods</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@1,500;1,600&family=JetBrains+Mono:wght@400;500&display=swap');

    @page {
      size: A4;
      margin: 15mm 15mm 15mm 15mm;
      @bottom-right {
        content: counter(page);
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1e293b;
      background: #ffffff;
      line-height: 1.55;
      font-size: 10pt;
    }

    .page-break {
      page-break-before: always;
    }

    /* HEADER & COVER */
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 2px solid #0f172a;
      margin-bottom: 20px;
    }

    .brand {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 26pt;
      font-style: italic;
      font-weight: 600;
      letter-spacing: -0.5px;
      color: #0f172a;
    }

    .doc-badge {
      display: inline-block;
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 8.5pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .doc-title-block {
      margin-bottom: 24px;
    }

    h1.doc-title {
      font-size: 19pt;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.25;
      margin-bottom: 6px;
    }

    .doc-subtitle {
      font-size: 10.5pt;
      color: #64748b;
      font-weight: 500;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 24px;
    }

    .meta-item .meta-label {
      font-size: 7.5pt;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }

    .meta-item .meta-val {
      font-size: 9.5pt;
      color: #0f172a;
      font-weight: 600;
    }

    /* TYPOGRAPHY */
    h2.section-title {
      font-size: 13pt;
      font-weight: 700;
      color: #0f172a;
      border-left: 4px solid #0f172a;
      padding-left: 10px;
      margin-top: 22px;
      margin-bottom: 12px;
      line-height: 1.3;
    }

    h3.sub-title {
      font-size: 10.5pt;
      font-weight: 700;
      color: #1e293b;
      margin-top: 14px;
      margin-bottom: 6px;
    }

    p {
      margin-bottom: 8px;
      color: #334155;
    }

    ul, ol {
      margin-left: 18px;
      margin-bottom: 10px;
      color: #334155;
    }

    li {
      margin-bottom: 4px;
    }

    code {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      color: #0f172a;
      padding: 1px 5px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }

    pre {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 8.5pt;
      background: #0f172a;
      color: #f8fafc;
      padding: 10px 14px;
      border-radius: 6px;
      margin: 8px 0 12px 0;
      overflow-x: auto;
      line-height: 1.45;
    }

    /* CARDS & BOXES */
    .feature-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 12px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }

    .feature-card.highlight {
      border-left: 4px solid #2563eb;
      background: #f8fafc;
    }

    .card-title {
      font-weight: 700;
      color: #0f172a;
      font-size: 10pt;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .pill {
      font-size: 7.5pt;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 600;
    }

    .pill-blue { background: #dbeafe; color: #1e40af; }
    .pill-green { background: #dcfce7; color: #15803d; }
    .pill-amber { background: #fef3c7; color: #b45309; }

    /* TABLES */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 16px 0;
      font-size: 8.5pt;
    }

    table.data-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1.5px solid #cbd5e1;
      border-top: 1px solid #e2e8f0;
    }

    table.data-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
      vertical-align: top;
    }

    table.data-table tr:nth-child(even) td {
      background: #fbfcfd;
    }

    .badge-pass {
      display: inline-block;
      background: #dcfce7;
      color: #15803d;
      font-weight: 700;
      font-size: 7.5pt;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #bbf7d0;
    }

    .badge-api {
      display: inline-block;
      background: #eff6ff;
      color: #1d4ed8;
      font-weight: 600;
      font-size: 7.5pt;
      padding: 1px 5px;
      border-radius: 4px;
      border: 1px solid #bfdbfe;
    }

    .alert-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-left: 4px solid #16a34a;
      padding: 10px 14px;
      border-radius: 6px;
      margin: 12px 0;
      font-size: 9pt;
      color: #166534;
    }

    .alert-box strong {
      color: #14532d;
    }

    .footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #94a3b8;
    }
  </style>
</head>
<body>

  <!-- HEADER / COVER SECTION -->
  <div class="header-bar">
    <div class="brand">WearGoods</div>
    <div class="doc-badge">Dokumen Panduan & Verifikasi AI</div>
  </div>

  <div class="doc-title-block">
    <h1 class="doc-title">Panduan Pengujian Fitur Kecerdasan Buatan (AI)</h1>
    <div class="doc-subtitle">Tata Cara Verifikasi Multimodal Vision, Rekomendasi Outfit LLM, Re-Styling, dan Gap Analysis</div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <div class="meta-label">Aplikasi</div>
      <div class="meta-val">WearGoods (Laras MVP)</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Model AI Utama</div>
      <div class="meta-val">Gemini 3.5 Flash Lite</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">SDK & Versi</div>
      <div class="meta-val">@google/genai ^3.6.1</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Status Integrasi</div>
      <div class="meta-val" style="color: #15803d;">Aktif & Terverifikasi</div>
    </div>
  </div>

  <!-- SECTION 1 -->
  <h2 class="section-title">1. Ringkasan Arsitektur & Kemampuan AI WearGoods</h2>
  <p>
    WearGoods mengintegrasikan Google Gemini API melalui arsitektur <em>Interactions API v1 GA</em> untuk memberikan pengalaman asisten penata gaya digital yang cerdas, kontekstual, dan aman. Sistem mencakup 4 pilar kemampuan AI utama:
  </p>

  <div class="feature-card highlight">
    <div class="card-title">
      <span>1. Pengenalan Pakaian Multimodal (Vision AI)</span>
      <span class="pill pill-blue">Vision & Klasifikasi</span>
    </div>
    <p>Menganalisis foto pakaian yang diunggah pengguna untuk mengekstrak atribut secara otomatis: nama pakaian, kategori (top/bottom/outerwear/footwear/accessory), warna dominan, jenis bahan (katun/linen/denim/dsb.), tingkat formalitas, dan skor keyakinan deteksi (confidence score 0.0 - 1.0).</p>
  </div>

  <div class="feature-card highlight">
    <div class="card-title">
      <span>2. Generator Kombinasi Outfit (LLM Stylist)</span>
      <span class="pill pill-green">LLM Reasoning</span>
    </div>
    <p>Menyusun padu-padan terbaik dari koleksi pakaian nyata yang dimiliki pengguna berdasarkan acara (kantor/santai/formal), gaya pilihan, kondisi cuaca, dan instruksi teks khusus pengguna. Menghasilkan judul outfit kreatif, narasi alasan padu-padan (reasoning), dan panduan penataan (styling note) dalam Bahasa Indonesia.</p>
  </div>

  <div class="feature-card highlight">
    <div class="card-title">
      <span>3. Kustomisasi & Ganti Komponen (Dynamic Re-Styling)</span>
      <span class="pill pill-amber">Constraint Solving</span>
    </div>
    <p>Memungkinkan pengguna mengunci (lock) pakaian favorit yang ingin dipertahankan dan meminta penggantian pakaian lain (misal: "ganti celananya dengan yang lebih santai"). AI meregenerasi kombinasi dengan tetap mematuhi batasan pakaian yang dikunci.</p>
  </div>

  <div class="feature-card highlight">
    <div class="card-title">
      <span>4. Analisis Kebutuhan Lemari & Kata Kunci Belanja (Gap Analysis)</span>
      <span class="pill pill-blue">Wardrobe Intelligence</span>
    </div>
    <p>Mendeteksi kelengkapan pakaian yang belum ada di lemari untuk menyempurnakan suatu gaya (misal: butuh blazer netral atau ikat pinggang kulit), serta membuat kata kunci pencarian siap pakai untuk toko online lokal (Tokopedia/Shopee/Uniqlo) dan internasional.</p>
  </div>

  <!-- SECTION 2 -->
  <h2 class="section-title">2. Metode 1: Pengujian Otomatis via Terminal (Automated CLI Test)</h2>
  <p>Pengujian otomatis disediakan melalui script pengujian terisolasi yang menguji validitas logika, penanganan error, dan integrasi HTTP end-to-end tanpa merusak database produksi.</p>

  <p><strong>Langkah Eksekusi:</strong></p>
  <pre># Jalankan pengujian khusus rangkaian AI
npm run test:ai

# Jalankan seluruh 31 kasus uji verifikasi sistem SRS
npm test</pre>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 14%;">Kode Uji</th>
        <th style="width: 32%;">Fokus Pengujian</th>
        <th style="width: 40%;">Ekspektasi & Validasi</th>
        <th style="width: 14%;">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>AI-TEST-01</code></td>
        <td>Normalisasi Data Atribut</td>
        <td>Standarisasi warna, kategori, dan formalitas ke kamus resmi sistem WearGoods.</td>
        <td><span class="badge-pass">PASS</span></td>
      </tr>
      <tr>
        <td><code>AI-TEST-02</code></td>
        <td>Environment & Health Toggle</td>
        <td>Verifikasi pembacaan file <code>.env</code> dan status endpoint <code>/api/v1/health</code>.</td>
        <td><span class="badge-pass">PASS</span></td>
      </tr>
      <tr>
        <td><code>AI-TEST-03</code></td>
        <td>Vision Recognition & Edge Cases</td>
        <td>Mendeteksi pakaian valid, menolak gambar non-baju (HTTP 422), gambar buram (HTTP 422), & timeout fallback.</td>
        <td><span class="badge-pass">PASS</span></td>
      </tr>
      <tr>
        <td><code>AI-TEST-04</code></td>
        <td>Outfit Logic & Anti-Halusinasi</td>
        <td>Memastikan item berasal dari lemari pengguna, menghormati item yang di-lock, dan menolak item palsu.</td>
        <td><span class="badge-pass">PASS</span></td>
      </tr>
      <tr>
        <td><code>AI-TEST-05</code></td>
        <td>Gap Analysis & Search Keywords</td>
        <td>Menghasilkan analisis celah pakaian dan minimal 3 kata kunci pencarian belanja (ID & EN).</td>
        <td><span class="badge-pass">PASS</span></td>
      </tr>
      <tr>
        <td><code>AI-TEST-06</code></td>
        <td>E2E HTTP Server Integration</td>
        <td>Alur penuh endpoint API: health, recognize, generate outfit, customize, dan mockup recommendation.</td>
        <td><span class="badge-pass">PASS</span></td>
      </tr>
    </tbody>
  </table>

  <div class="page-break"></div>

  <!-- SECTION 3 (PAGE 2) -->
  <div class="header-bar">
    <div class="brand">WearGoods</div>
    <div class="doc-badge">Panduan Praktis Pengujian Manual</div>
  </div>

  <h2 class="section-title">3. Metode 2: Panduan Pengujian Manual Interaktif (Live Web UI)</h2>
  <p>Pengujian ini dilakukan langsung pada peramban web (browser) untuk memverifikasi respon visual dan interaksi pengguna.</p>

  <div class="alert-box">
    <strong>Prasyarat Pengujian:</strong> Pastikan server Node.js aktif di port 3000 (<code>npm start</code>) dan file <code>.env</code> telah terisi API Key Gemini. Buka <code>http://localhost:3000</code> dan login dengan akun testing <code>nadia.putri@email.com</code> / <code>Password123</code>.
  </div>

  <h3 class="sub-title">Skenario Uji A: Deteksi Pakaian Otomatis (Vision AI)</h3>
  <ol>
    <li>Navigasi ke menu <strong>Lemari</strong> (atau <em>Lemari saya</em>) pada menu utama.</li>
    <li>Klik tombol <strong>+ Tambah Pakaian</strong> di pojok kanan atas lemari.</li>
    <li>Klik area dropzone gambar atau pilih berkas foto pakaian dari komputer Anda (dapat menggunakan berkas contoh di folder <code>database/uploads/</code>).</li>
    <li><strong>Hasil Pengujian:</strong>
      <ul>
        <li>Dalam durasi 1.5 - 3 detik, formulir pakaian terisi secara otomatis tanpa pengetikan manual:
          Nama pakaian, Kategori (Atasan/Bawahan/Outerwear/Alas kaki/Aksesori), Warna dominan, Bahan, dan Gaya.</li>
        <li>Muncul indikator skor kepercayaan AI (misal: <em>Tingkat Keyakinan 94%</em>).</li>
      </ul>
    </li>
  </ol>

  <h3 class="sub-title">Skenario Uji B: Rekomendasi Outfit Kontekstual (Outfit Generation AI)</h3>
  <ol>
    <li>Klik menu <strong>Cari outfit</strong> pada navigasi atas.</li>
    <li>Tentukan parameter pengujian pada formulir:
      <ul>
        <li><strong>Tujuan Acara:</strong> Pilih <em>Bekerja di kantor</em>.</li>
        <li><strong>Preferensi Gaya:</strong> Pilih <em>Smart Casual</em>.</li>
        <li><strong>Kondisi Cuaca:</strong> Pilih <em>Ber-AC</em> atau <em>Hujan</em>.</li>
      </ul>
    </li>
    <li>Pada kolom <strong>Instruksi Khusus (Prompt Bebas)</strong>, ketik instruksi spesifik, misalnya:
      <pre>"Gaya rapi bernuansa earth-tone untuk rapat dengan pimpinan, nyaman untuk mobilitas tinggi"</pre>
    </li>
    <li>Klik tombol <strong>Temukan outfit</strong>.</li>
    <li><strong>Hasil Pengujian:</strong>
      <ul>
        <li>Sistem menyajikan 3 kartu rekomendasi outfit kombinasi pakaian asli lemari Nadia.</li>
        <li>Setiap kartu menampilkan judul kreatif khas stylist, narasi <strong>Alasan Padu-Padan</strong> yang relevan dengan instruksi prompt, dan <strong>Tips Styling</strong> praktis.</li>
      </ul>
    </li>
  </ol>

  <h3 class="sub-title">Skenario Uji C: Kustomisasi & Ganti Baju Tertentu (Dynamic Re-Styling)</h3>
  <ol>
    <li>Pada salah satu kartu hasil rekomendasi di atas, klik <strong>Lihat detail</strong>.</li>
    <li>Layar akan membuka tampilan <strong>Susunan Pakaian</strong> (tata letak moodboard pakaian).</li>
    <li>Klik ikon <strong>Gembok (Lock)</strong> pada atasan (misal kemeja putih) agar pakaian tersebut terkunci.</li>
    <li>Di bagian bawah pada kolom instruksi kustomisasi, ketik:
      <pre>"Ganti bawahannya dengan celana yang lebih santai dan kasual"</pre>
    </li>
    <li>Klik tombol <strong>Sesuaikan ulang</strong>.</li>
    <li><strong>Hasil Pengujian:</strong>
      <ul>
        <li>Pakaian yang digembok tetap tidak berubah.</li>
        <li>Bawahan (celana) diganti oleh AI dengan opsi yang lebih kasual dari lemari.</li>
        <li>Judul dan narasi styling disesuaikan secara instan sesuai perubahan.</li>
      </ul>
    </li>
  </ol>

  <h3 class="sub-title">Skenario Uji D: Saran Item Pelengkap & Ide Belanja (Gap Analysis)</h3>
  <ol>
    <li>Pada halaman detail outfit atau pada kartu di menu <strong>Koleksi</strong>, klik tombol <strong>+ Saran Item Pelengkap</strong>.</li>
    <li><strong>Hasil Pengujian:</strong>
      <ul>
        <li>AI mendeteksi kategori yang belum dimiliki untuk menyempurnakan outfit (misal: <em>Outerwear</em> blazer atau <em>Aksesori</em> belt).</li>
        <li>Menyajikan penjelasan objektif mengapa item tersebut dibutuhkan (analisis celah).</li>
        <li>Menyediakan kata kunci pencarian spesifik untuk marketplace (Bahasa Indonesia & Bahasa Inggris).</li>
      </ul>
    </li>
  </ol>

  <div class="page-break"></div>

  <!-- SECTION 4 (PAGE 3) -->
  <div class="header-bar">
    <div class="brand">WearGoods</div>
    <div class="doc-badge">Ketahanan & Lembar Checklist</div>
  </div>

  <h2 class="section-title">4. Pengujian Kasus Batas & Ketahanan Sistem (Edge Cases)</h2>
  <p>Untuk memastikan aplikasi siap digunakan dan tangguh di lingkungan nyata, pengujian kasus batas berikut telah dirancang dan diuji:</p>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Skenario Kasus Batas</th>
        <th style="width: 38%;">Tindakan Pengujian</th>
        <th style="width: 37%;">Respon Sistem (Safety Guardrail)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Upload Gambar Non-Pakaian</strong></td>
        <td>Unggah foto pemandangan, mobil, atau hewan peliharaan pada form Tambah Pakaian.</td>
        <td>AI mengembalikan error <code>NOT_CLOTHING</code> (HTTP 422). Sistem menampilkan peringatan ramah tanpa crash.</td>
      </tr>
      <tr>
        <td><strong>Upload Gambar Buram / Gelap</strong></td>
        <td>Unggah foto pakaian dengan resolusi sangat rendah atau pencahayaan gelap.</td>
        <td>AI mendeteksi <code>LOW_IMAGE_QUALITY</code> (HTTP 422) dan meminta pengguna mengunggah ulang dengan pencahayaan cukup.</td>
      </tr>
      <tr>
        <td><strong>Ketiadaan Internet / Kuota Habis</strong></td>
        <td>Putuskan koneksi internet atau kosongkan <code>GEMINI_API_KEY</code> pada file <code>.env</code>.</td>
        <td>Sistem secara otomatis beralih ke <strong>Local Rule-based Simulation Fallback</strong>. Pengguna tetap dapat memakai seluruh fitur secara mulus.</td>
      </tr>
      <tr>
        <td><strong>Proteksi Halusinasi Item</strong></td>
        <td>Memaksa AI menyarankan pakaian yang tidak ada di lemari user.</td>
        <td>Sistem memfilter ID pakaian terhadap basis data user. Jika terdapat ID asing, sistem otomatis menolaknya dan memilih item sah milik user.</td>
      </tr>
    </tbody>
  </table>

  <h2 class="section-title">5. Lembar Evaluasi & Checklist Pengujian (Testing Sign-off Matrix)</h2>
  <p>Tabel checklist berikut dapat digunakan sebagai bukti verifikasi kelayakan sistem:</p>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 6%;">No</th>
        <th style="width: 28%;">Fitur yang Diuji</th>
        <th style="width: 38%;">Kriteria Sukses</th>
        <th style="width: 14%;">Metode</th>
        <th style="width: 14%;">Hasil</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>Health Check Endpoint</td>
        <td>Mengembalikan status <code>mode: gemini</code> & nama model</td>
        <td>HTTP GET</td>
        <td><span class="badge-pass">TERPENUHI</span></td>
      </tr>
      <tr>
        <td>2</td>
        <td>Deteksi Foto Pakaian</td>
        <td>Ekstraksi otomatis kategori, warna, dan bahan</td>
        <td>Vision API</td>
        <td><span class="badge-pass">TERPENUHI</span></td>
      </tr>
      <tr>
        <td>3</td>
        <td>Filter Non-Pakaian</td>
        <td>Menolak foto non-pakaian secara akurat</td>
        <td>Guardrail</td>
        <td><span class="badge-pass">TERPENUHI</span></td>
      </tr>
      <tr>
        <td>4</td>
        <td>Rekomendasi Outfit</td>
        <td>Kombinasi harmonis, reasoning, dan styling note</td>
        <td>LLM Stylist</td>
        <td><span class="badge-pass">TERPENUHI</span></td>
      </tr>
      <tr>
        <td>5</td>
        <td>Locking & Re-styling</td>
        <td>Item terkunci tidak berubah saat regenerasi</td>
        <td>Constraint</td>
        <td><span class="badge-pass">TERPENUHI</span></td>
      </tr>
      <tr>
        <td>6</td>
        <td>Item Gap Analysis</td>
        <td>Rekomendasi item pelengkap & kata kunci belanja</td>
        <td>LLM Analytics</td>
        <td><span class="badge-pass">TERPENUHI</span></td>
      </tr>
      <tr>
        <td>7</td>
        <td>Local Fallback Graceful</td>
        <td>Aplikasi tetap berfungsi penuh saat offline</td>
        <td>Resilience</td>
        <td><span class="badge-pass">TERPENUHI</span></td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <div>WearGoods MVP — Fashion Styling Assistant System</div>
    <div>Dokumen Pengujian & Evaluasi Resmi · Halaman 3 dari 3</div>
  </div>

</body>
</html>
`;

const projectRoot = path.resolve(__dirname, '..');
const htmlPath = path.join(projectRoot, 'panduan_temp.html');
const pdfPath = path.join(projectRoot, 'Panduan_Testing_AI_WearGoods.pdf');

fs.writeFileSync(htmlPath, HTML_CONTENT, 'utf8');

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

let browserPath = chromeCandidates.find(p => fs.existsSync(p));
if (!browserPath) {
  console.error('Tidak menemukan Chrome atau Edge pada sistem.');
  process.exit(1);
}

console.log(`Menggunakan browser: ${browserPath}`);
console.log(`Membuat PDF di: ${pdfPath}`);

const args = [
  '--headless',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${pdfPath}`,
  htmlPath
];

try {
  execFileSync(browserPath, args, { stdio: 'inherit' });
  if (fs.existsSync(pdfPath)) {
    const stats = fs.statSync(pdfPath);
    console.log(`✅ Berhasil membuat PDF: ${pdfPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  } else {
    console.error('Gagal membuat PDF: Berkas tidak ditemukan.');
  }
} catch (err) {
  console.error('Terjadi kesalahan saat mencetak PDF:', err.message);
} finally {
  if (fs.existsSync(htmlPath)) {
    fs.unlinkSync(htmlPath);
  }
}
