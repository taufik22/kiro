// =========================================================================
// env.js - Tiny .env loader (zero dependency)
// =========================================================================
// Membaca file .env dari root project dan menyuntikkannya ke process.env.
// Dipakai supaya CLI tidak butuh package "dotenv".
// =========================================================================

const fs = require('fs');
const path = require('path');

/**
 * Load .env file kalau ada. Nilai yang sudah ada di process.env TIDAK ditimpa
 * (env asli OS menang), jadi kamu bisa override lewat command line.
 *
 * @param {string} [envPath] - path ke file .env (default: <root project>/.env)
 */
function loadEnv(envPath) {
  const target = envPath || path.join(__dirname, '..', '..', '.env');

  if (!fs.existsSync(target)) return;

  const raw = fs.readFileSync(target, 'utf8');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Buang quote di awal/akhir kalau ada
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

module.exports = { loadEnv };
