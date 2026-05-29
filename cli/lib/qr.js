// =========================================================================
// qr.js - Render QRIS di terminal (CMD)
// =========================================================================
// Strategi:
//   1. Kalau package "qrcode-terminal" terpasang -> render QR ASCII di CMD
//      (paling enak, tinggal scan dari layar).
//   2. Kalau tidak ada -> fallback: tampilkan URL gambar QR resmi dari
//      Midtrans (action "generate-qr-code") + qr_string mentah.
//
// Jadi program tetap jalan walau tanpa dependency apa pun.
// =========================================================================

/**
 * Coba render QR ASCII pakai qrcode-terminal (optional).
 * @param {string} text
 * @returns {boolean} true kalau berhasil dirender ke terminal
 */
function tryRenderAscii(text) {
  let qrcode;
  try {
    // optional dependency - require dibungkus try/catch
    qrcode = require('qrcode-terminal');
  } catch (e) {
    return false;
  }

  try {
    qrcode.generate(text, { small: true });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Ambil URL gambar QR dari response charge Midtrans.
 * @param {object} chargeResponse
 * @returns {string|null}
 */
function getQrImageUrl(chargeResponse) {
  const actions = (chargeResponse && chargeResponse.actions) || [];
  const action = actions.find((a) => a.name === 'generate-qr-code');
  return action ? action.url : null;
}

/**
 * Tampilkan QRIS ke terminal. Pakai ASCII kalau bisa, fallback ke URL + string.
 *
 * @param {object} chargeResponse - response dari chargeQris()
 */
function showQris(chargeResponse) {
  const qrString = chargeResponse && chargeResponse.qr_string;
  const imageUrl = getQrImageUrl(chargeResponse);

  console.log('');
  console.log('  ┌───────────────────────────────────────────────┐');
  console.log('  │   SCAN QRIS DI BAWAH PAKAI GOPAY / E-WALLET     │');
  console.log('  └───────────────────────────────────────────────┘');
  console.log('');

  let rendered = false;
  if (qrString) {
    rendered = tryRenderAscii(qrString);
  }

  if (!rendered) {
    console.log('  (QR ASCII tidak tersedia - install "qrcode-terminal" untuk');
    console.log('   tampil di CMD:  npm install qrcode-terminal )');
    console.log('');
    if (imageUrl) {
      console.log('  Buka link gambar QRIS ini di browser lalu scan:');
      console.log('  ' + imageUrl);
      console.log('');
    }
    if (qrString) {
      console.log('  QR String (QRIS payload mentah):');
      console.log('  ' + qrString);
      console.log('');
    }
  } else if (imageUrl) {
    console.log('');
    console.log('  Backup link gambar QRIS: ' + imageUrl);
    console.log('');
  }
}

module.exports = { showQris, getQrImageUrl, tryRenderAscii };
