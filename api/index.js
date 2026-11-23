const path = require('node:path');
const fs = require('node:fs');
const { createAppServer } = require('../src/server');

let cachedHandler = null;

function getHandler() {
  if (cachedHandler) return cachedHandler;

  // Di Vercel serverless, direktori proyek bersifat read-only (/var/task).
  // Direktori yang bisa ditulisi hanyalah /tmp.
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  let dbPath;

  if (isServerless) {
    const tmpDir = path.join('/tmp', 'weargoods');
    const tmpUploadsDir = path.join(tmpDir, 'uploads');
    try {
      fs.mkdirSync(tmpUploadsDir, { recursive: true });
    } catch (_) {}

    process.env.UPLOADS_DIR = tmpUploadsDir;

    const tmpDb = path.join(tmpDir, 'weargoods.sqlite');
    const candidateOriginals = [
      path.join(__dirname, '..', 'database', 'weargoods.sqlite'),
      path.join(process.cwd(), 'database', 'weargoods.sqlite')
    ];
    const originalDb = candidateOriginals.find((p) => fs.existsSync(p));

    // Salin basis data awal ke /tmp saat cold-start jika belum ada
    if (!fs.existsSync(tmpDb) && originalDb) {
      try {
        fs.copyFileSync(originalDb, tmpDb);
      } catch (err) {
        console.warn('[Vercel Adapter] Gagal menyalin weargoods.sqlite ke /tmp:', err.message);
      }
    }

    // Selalu gunakan jalur /tmp pada serverless agar aman ditulis
    dbPath = tmpDb;
  }

  const { handler, server } = createAppServer(dbPath);
  cachedHandler = handler || ((req, res) => server.emit('request', req, res));
  return cachedHandler;
}

module.exports = async (req, res) => {
  const handler = getHandler();
  return handler(req, res);
};
