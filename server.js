// =========================================================================
// Midtrans Snap Redirect + GoPay Tokenization - Express Server
// =========================================================================
// Endpoints:
//   GET  /                            -> halaman utama (pilih metode)
//   GET  /gopay                       -> halaman checkout GoPay redirect
//   POST /api/create-gopay-redirect   -> bikin transaksi Snap khusus GoPay
//                                        & return redirect_url ke Midtrans
//   POST /api/create-transaction      -> bikin transaksi Snap (semua metode)
//   POST /api/charge-gopay            -> direct charge GoPay (QR code)
//   POST /api/notification            -> webhook handler dari Midtrans
//   GET  /api/status/:orderId         -> cek status transaksi
//   GET  /payment/finish              -> redirect setelah bayar sukses
//   GET  /payment/unfinish            -> redirect jika belum selesai
//   GET  /payment/error               -> redirect jika error
// =========================================================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const midtransClient = require('midtrans-client');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ---------- Validasi env ----------
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY;
const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true';

if (!SERVER_KEY || !CLIENT_KEY) {
  console.error('❌ MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY belum di-set di .env');
  process.exit(1);
}

// ---------- Midtrans Snap Client ----------
const snap = new midtransClient.Snap({
  isProduction: IS_PRODUCTION,
  serverKey: SERVER_KEY,
  clientKey: CLIENT_KEY,
});

const coreApi = new midtransClient.CoreApi({
  isProduction: IS_PRODUCTION,
  serverKey: SERVER_KEY,
  clientKey: CLIENT_KEY,
});

// ---------- In-memory order store (ganti pake DB di production) ----------
const orders = new Map();

// ---------- Middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// Halaman utama
// =========================================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Halaman GoPay Redirect (Snap v4 style)
app.get('/gopay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gopay.html'));
});

app.get('/api/config', (req, res) => {
  res.json({
    clientKey: CLIENT_KEY,
    isProduction: IS_PRODUCTION,
  });
});

// =========================================================================
// POST /api/create-gopay-redirect
// Buat transaksi Snap KHUSUS GoPay & return redirect_url
// User akan di-redirect ke halaman Midtrans:
//   https://app.midtrans.com/snap/v4/redirection/{token}#/gopay-tokenization/pay
// =========================================================================
app.post('/api/create-gopay-redirect', async (req, res) => {
  try {
    const { amount, customer, items } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'amount wajib diisi & > 0' });
    }

    const orderId = `GOPAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: Number(amount),
      },
      customer_details: {
        first_name: customer?.first_name || 'Guest',
        email: customer?.email || 'guest@example.com',
        phone: customer?.phone || '08111222333',
      },
      item_details: items?.length
        ? items
        : [
            {
              id: 'GOPAY-ITEM',
              price: Number(amount),
              quantity: 1,
              name: 'Pembayaran GoPay',
            },
          ],
      // === KUNCI: Hanya aktifkan GoPay ===
      enabled_payments: ['gopay'],
      // === Redirect URLs setelah pembayaran ===
      callbacks: {
        finish: `${BASE_URL}/payment/finish?order_id=${orderId}`,
        unfinish: `${BASE_URL}/payment/unfinish?order_id=${orderId}`,
        error: `${BASE_URL}/payment/error?order_id=${orderId}`,
      },
      // GoPay specific config
      gopay: {
        enable_callback: true,
        callback_url: `${BASE_URL}/payment/finish?order_id=${orderId}`,
      },
    };

    const transaction = await snap.createTransaction(parameter);

    // Simpan order
    orders.set(orderId, {
      orderId,
      amount: Number(amount),
      status: 'pending',
      paymentType: 'gopay',
      snapToken: transaction.token,
      redirectUrl: transaction.redirect_url,
      createdAt: new Date().toISOString(),
    });

    console.log(`✅ GoPay Redirect created: ${orderId} | Rp${amount}`);
    console.log(`   Redirect URL: ${transaction.redirect_url}`);

    res.json({
      orderId,
      token: transaction.token,
      // INI URL yang seperti contoh kamu:
      // https://app.midtrans.com/snap/v4/redirection/{token}#/gopay-tokenization/pay
      redirectUrl: transaction.redirect_url,
    });
  } catch (err) {
    console.error('❌ create-gopay-redirect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// Redirect pages setelah user bayar di halaman Midtrans
// =========================================================================
app.get('/payment/finish', (req, res) => {
  const { order_id, transaction_status, status_code } = req.query;
  res.sendFile(path.join(__dirname, 'public', 'payment-finish.html'));
});

app.get('/payment/unfinish', (req, res) => {
  const { order_id } = req.query;
  res.sendFile(path.join(__dirname, 'public', 'payment-unfinish.html'));
});

app.get('/payment/error', (req, res) => {
  const { order_id } = req.query;
  res.sendFile(path.join(__dirname, 'public', 'payment-error.html'));
});

// =========================================================================
// POST /api/create-transaction (Snap semua metode - tetap ada)
// =========================================================================
app.post('/api/create-transaction', async (req, res) => {
  try {
    const { amount, customer, items } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'amount wajib diisi & > 0' });
    }

    const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: Number(amount),
      },
      credit_card: { secure: true },
      customer_details: {
        first_name: customer?.first_name || 'Guest',
        email: customer?.email || 'guest@example.com',
        phone: customer?.phone || '08111222333',
      },
      item_details: items?.length
        ? items
        : [{ id: 'ITEM-1', price: Number(amount), quantity: 1, name: 'Default Item' }],
    };

    const transaction = await snap.createTransaction(parameter);

    orders.set(orderId, {
      orderId,
      amount: Number(amount),
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    console.log(`✅ Transaction created: ${orderId} | Rp${amount}`);

    res.json({
      orderId,
      token: transaction.token,
      redirectUrl: transaction.redirect_url,
    });
  } catch (err) {
    console.error('❌ create-transaction error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// POST /api/charge-gopay -> Direct charge GoPay (QR code)
// =========================================================================
app.post('/api/charge-gopay', async (req, res) => {
  try {
    const { amount, customer } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'amount wajib diisi & > 0' });
    }

    const orderId = `GOPAY-QR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const parameter = {
      payment_type: 'gopay',
      transaction_details: {
        order_id: orderId,
        gross_amount: Number(amount),
      },
      customer_details: {
        first_name: customer?.first_name || 'Guest',
        email: customer?.email || 'guest@example.com',
        phone: customer?.phone || '08111222333',
      },
      gopay: {
        enable_callback: true,
        callback_url: `${BASE_URL}/payment/finish?order_id=${orderId}`,
      },
    };

    const chargeResponse = await coreApi.charge(parameter);

    const actions = chargeResponse.actions || [];
    const qrCodeUrl = actions.find((a) => a.name === 'generate-qr-code')?.url || null;
    const deeplinkUrl = actions.find((a) => a.name === 'deeplink-redirect')?.url || null;

    orders.set(orderId, {
      orderId,
      amount: Number(amount),
      status: 'pending',
      paymentType: 'gopay',
      qrCodeUrl,
      deeplinkUrl,
      createdAt: new Date().toISOString(),
    });

    console.log(`✅ GoPay QR charge created: ${orderId} | Rp${amount}`);

    res.json({
      orderId,
      status: chargeResponse.transaction_status,
      qrCodeUrl,
      deeplinkUrl,
      expiryTime: chargeResponse.expiry_time,
    });
  } catch (err) {
    console.error('❌ charge-gopay error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// POST /api/notification (Webhook dari Midtrans)
// =========================================================================
app.post('/api/notification', async (req, res) => {
  try {
    const notification = req.body;
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
      payment_type,
    } = notification;

    // Verifikasi signature_key
    const expectedSignature = crypto
      .createHash('sha512')
      .update(`${order_id}${status_code}${gross_amount}${SERVER_KEY}`)
      .digest('hex');

    if (signature_key !== expectedSignature) {
      console.warn(`⚠️  Invalid signature for ${order_id}`);
      return res.status(403).json({ error: 'Invalid signature' });
    }

    // Re-fetch status
    const statusResp = await coreApi.transaction.notification(notification);
    const txStatus = statusResp.transaction_status;
    const fraud = statusResp.fraud_status;

    // Tentukan status final
    let finalStatus = 'pending';
    if (txStatus === 'capture') {
      finalStatus = fraud === 'challenge' ? 'challenge' : 'paid';
    } else if (txStatus === 'settlement') {
      finalStatus = 'paid';
    } else if (['cancel', 'deny', 'expire'].includes(txStatus)) {
      finalStatus = 'failed';
    } else if (txStatus === 'pending') {
      finalStatus = 'pending';
    } else if (txStatus === 'refund' || txStatus === 'partial_refund') {
      finalStatus = 'refunded';
    }

    // Update order
    const order = orders.get(order_id) || { orderId: order_id };
    order.status = finalStatus;
    order.paymentType = payment_type;
    order.transactionStatus = txStatus;
    order.fraudStatus = fraud;
    order.updatedAt = new Date().toISOString();
    orders.set(order_id, order);

    console.log(`🔔 Webhook: ${order_id} -> ${txStatus}/${fraud} -> ${finalStatus}`);

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('❌ notification error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// GET /api/status/:orderId
// =========================================================================
app.get('/api/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const local = orders.get(orderId);

    if (!local || local.status === 'pending') {
      try {
        const remote = await coreApi.transaction.status(orderId);
        return res.json({
          orderId,
          status: remote.transaction_status,
          fraudStatus: remote.fraud_status,
          paymentType: remote.payment_type,
          grossAmount: remote.gross_amount,
        });
      } catch (e) { /* not found */ }
    }

    if (!local) return res.status(404).json({ error: 'Order tidak ditemukan' });
    res.json(local);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// Start server
// =========================================================================
app.listen(PORT, () => {
  console.log('=========================================');
  console.log(`🚀 Server running at ${BASE_URL}`);
  console.log(`   Midtrans mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX'}`);
  console.log(`   GoPay Redirect: ${BASE_URL}/gopay`);
  console.log('=========================================');
});
