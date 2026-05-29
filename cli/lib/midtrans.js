// =========================================================================
// midtrans.js - Minimal Midtrans Core API client (zero dependency)
// =========================================================================
// Pakai modul bawaan Node "https" saja. Auth cuma butuh SERVER KEY (access
// token) -> Basic Auth: base64(SERVER_KEY + ":").
//
// Yang dipakai CLI:
//   - chargeQris()   : bikin transaksi QRIS (acquirer gopay) -> dapat qr_string
//   - getStatus()    : cek status transaksi by order_id
// =========================================================================

const https = require('https');

const SANDBOX_BASE = 'api.sandbox.midtrans.com';
const PRODUCTION_BASE = 'api.midtrans.com';

class MidtransError extends Error {
  constructor(message, { statusCode, body } = {}) {
    super(message);
    this.name = 'MidtransError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

class MidtransClient {
  /**
   * @param {object} opts
   * @param {string} opts.serverKey   - Midtrans Server Key (access token)
   * @param {boolean} [opts.isProduction=false]
   */
  constructor({ serverKey, isProduction = false } = {}) {
    if (!serverKey) {
      throw new MidtransError('serverKey (access token) wajib diisi');
    }
    this.serverKey = serverKey;
    this.isProduction = Boolean(isProduction);
    this.host = isProduction ? PRODUCTION_BASE : SANDBOX_BASE;
    this.authHeader =
      'Basic ' + Buffer.from(`${serverKey}:`).toString('base64');
  }

  /**
   * Low-level HTTPS request -> resolve JSON.
   * @private
   */
  _request(method, pathname, payload) {
    const data = payload ? JSON.stringify(payload) : null;

    const options = {
      host: this.host,
      path: pathname,
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
    };

    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = body ? JSON.parse(body) : {};
          } catch (e) {
            return reject(
              new MidtransError('Gagal parse response JSON dari Midtrans', {
                statusCode: res.statusCode,
                body,
              })
            );
          }

          // Midtrans pakai status_code di body (string). 2xx & "201"/"200" = ok.
          const sc = String(parsed.status_code || res.statusCode || '');
          const httpOk = res.statusCode >= 200 && res.statusCode < 300;
          const apiOk = sc.startsWith('2');

          if (httpOk && apiOk) {
            resolve(parsed);
          } else {
            reject(
              new MidtransError(
                parsed.status_message ||
                  `Midtrans error (HTTP ${res.statusCode}, status_code ${sc})`,
                { statusCode: res.statusCode, body: parsed }
              )
            );
          }
        });
      });

      req.on('error', (err) =>
        reject(new MidtransError(`Koneksi ke Midtrans gagal: ${err.message}`))
      );

      if (data) req.write(data);
      req.end();
    });
  }

  /**
   * Buat transaksi QRIS lewat acquirer GoPay.
   *
   * @param {object} params
   * @param {string} params.orderId
   * @param {number} params.amount       - gross_amount (IDR, integer)
   * @param {object} [params.customer]   - { first_name, email, phone }
   * @param {Array}  [params.items]      - item_details
   * @returns {Promise<object>} raw charge response (qr_string, actions, dst)
   */
  async chargeQris({ orderId, amount, customer, items }) {
    const payload = {
      payment_type: 'qris',
      transaction_details: {
        order_id: orderId,
        gross_amount: Math.round(Number(amount)),
      },
      qris: { acquirer: 'gopay' },
    };

    if (customer) payload.customer_details = customer;
    if (items && items.length) payload.item_details = items;

    return this._request('POST', '/v2/charge', payload);
  }

  /**
   * Cek status transaksi.
   * @param {string} orderId
   * @returns {Promise<object>}
   */
  async getStatus(orderId) {
    return this._request('GET', `/v2/${encodeURIComponent(orderId)}/status`);
  }
}

/**
 * Normalisasi transaction_status Midtrans -> status internal yang gampang dibaca.
 * @param {object} res - response status/charge dari Midtrans
 * @returns {'paid'|'pending'|'failed'|'challenge'|'refunded'|'unknown'}
 */
function normalizeStatus(res) {
  const tx = res && res.transaction_status;
  const fraud = res && res.fraud_status;

  switch (tx) {
    case 'capture':
      return fraud === 'challenge' ? 'challenge' : 'paid';
    case 'settlement':
      return 'paid';
    case 'pending':
      return 'pending';
    case 'deny':
    case 'cancel':
    case 'expire':
    case 'failure':
      return 'failed';
    case 'refund':
    case 'partial_refund':
      return 'refunded';
    default:
      return 'unknown';
  }
}

module.exports = { MidtransClient, MidtransError, normalizeStatus };
