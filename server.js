// =========================================================================
// Midtrans Snap Integration - Express Server
// =========================================================================
// Endpoints:
//   GET  /                       -> halaman checkout demo
//   POST /api/create-transaction -> bikin transaksi & dapet snap_token
//   POST /api/notification       -> webhook handler dari Midtrans
//   GET  /api/status/:orderId    -> cek status transaksi
// =========================================================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const midtransClient = require('midtrans-client');

const app = express();
const PORT = process.env.PORT || 3000;

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
// Halaman utama -> kirim client key ke frontend lewat template sederhana
// =========================================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/config', (req, res) => {
  res.json({
    clientKey: CLIENT_KEY,
    isProduction: IS_PRODUCTION,
  });
});

// =========================================================================
// POST /api/create-transaction
// Body: { amount, customer: { first_name, email, phone }, items: [...] }
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
      credit_card: {
        secure: true,
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
              id: 'ITEM-1',
              price: Number(amount),
              quantity: 1,
              name: 'Default Item',
            },
          ],
    };

    const transaction = await snap.createTransaction(parameter);

    // Simpan order utk tracking
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
// POST /api/notification (Webhook dari Midtrans)
// Wajib diset di Midtrans Dashboard -> Settings -> Configuration
//   Payment Notification URL: https://yourdomain.com/api/notification
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

    // ----- 1. Verifikasi signature_key (WAJIB demi keamanan) -----
    const expectedSignature = crypto
      .createHash('sha512')
      .update(`${order_id}${status_code}${gross_amount}${SERVER_KEY}`)
      .digest('hex');

    if (signature_key !== expectedSignature) {
      console.warn(`⚠️  Invalid signature for ${order_id}`);
      return res.status(403).json({ error: 'Invalid signature' });
    }

    // ----- 2. Re-fetch status ke Midtrans (best practice) -----
    const statusResp = await coreApi.transaction.notification(notification);
    const txStatus = statusResp.transaction_status;
    const fraud = statusResp.fraud_status;

    // ----- 3. Tentukan status final -----
    let finalStatus = 'pending';

    if (txStatus === 'capture') {
      finalStatus = fraud === 'challenge' ? 'challenge' : 'paid';
    } else if (txStatus === 'settlement') {
      finalStatus = 'paid';
    } else if (
      txStatus === 'cancel' ||
      txStatus === 'deny' ||
      txStatus === 'expire'
    ) {
      finalStatus = 'failed';
    } else if (txStatus === 'pending') {
      finalStatus = 'pending';
    } else if (txStatus === 'refund' || txStatus === 'partial_refund') {
      finalStatus = 'refunded';
    }

    // ----- 4. Update order di "DB" -----
    const order = orders.get(order_id) || { orderId: order_id };
    order.status = finalStatus;
    order.paymentType = payment_type;
    order.transactionStatus = txStatus;
    order.fraudStatus = fraud;
    order.updatedAt = new Date().toISOString();
    orders.set(order_id, order);

    console.log(
      `🔔 Webhook: ${order_id} -> ${txStatus}/${fraud} -> ${finalStatus}`
    );

    // Midtrans cuma butuh response 200 OK
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('❌ notification error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// GET /api/status/:orderId -> cek status (utk polling dari frontend)
// =========================================================================
app.get('/api/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Coba ambil dari memory dulu
    const local = orders.get(orderId);

    // Refresh dari Midtrans jika masih pending
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
      } catch (e) {
        // kalau Midtrans 404 -> belum ada transaksi
      }
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
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`   Midtrans mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX'}`);
  console.log('=========================================');
});
