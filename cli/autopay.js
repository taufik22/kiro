#!/usr/bin/env node
// =========================================================================
// autopay.js - Autopay ChatGPT via CMD
// =========================================================================
// Program command-line untuk jualan akses ChatGPT (access token) dengan
// pembayaran GoPay/QRIS lewat Midtrans. Cuma butuh ACCESS TOKEN (Server Key).
//
// Alur "autopay":
//   1. Pilih paket -> bikin transaksi QRIS (acquirer gopay) di Midtrans
//   2. QRIS tampil di terminal -> pembeli scan pakai GoPay / e-wallet
//   3. Program AUTO-CEK status tiap beberapa detik sampai lunas
//   4. Begitu lunas -> access token otomatis dikirim & dihapus dari stok
//
// Cara pakai:
//   node cli/autopay.js                 (mode interaktif)
//   node cli/autopay.js list            (lihat daftar paket)
//   node cli/autopay.js pay --plan plus-1bulan
//   node cli/autopay.js status <orderId>
//   node cli/autopay.js --help
// =========================================================================

const readline = require('readline');
const crypto = require('crypto');

const { loadEnv } = require('./lib/env');
const { MidtransClient, MidtransError, normalizeStatus } = require('./lib/midtrans');
const { showQris } = require('./lib/qr');
const store = require('./lib/store');

loadEnv();

// ----------------------------- helpers ----------------------------------

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function color(c, s) {
  return `${C[c] || ''}${s}${C.reset}`;
}

function rupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function genOrderId(planKey) {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(3).toString('hex');
  return `CGPT-${(planKey || 'ord').toUpperCase()}-${ts}-${rnd}`;
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

/** Parse argv -> { command, _: [positional], flags: {} } */
function parseArgs(argv) {
  const out = { command: null, _: [], flags: {} };
  const rest = argv.slice(2);
  let i = 0;

  if (rest[0] && !rest[0].startsWith('-')) {
    out.command = rest[0];
    i = 1;
  }

  for (; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i++;
      }
    } else if (a.startsWith('-')) {
      out.flags[a.slice(1)] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function getClient() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    console.error(
      color('red', '\n[!] MIDTRANS_SERVER_KEY (access token) belum di-set.')
    );
    console.error(
      '    Set di file .env  ->  MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx'
    );
    console.error('    atau lewat environment variable sebelum menjalankan.\n');
    process.exit(1);
  }
  const isProduction =
    String(process.env.MIDTRANS_IS_PRODUCTION || 'false').toLowerCase() ===
    'true';
  return new MidtransClient({ serverKey, isProduction });
}

// ----------------------------- commands ----------------------------------

function printBanner() {
  console.log(
    color('cyan', '\n=== AUTOPAY CHATGPT (CMD) — GoPay / QRIS via Midtrans ===')
  );
  const mode =
    String(process.env.MIDTRANS_IS_PRODUCTION || 'false').toLowerCase() ===
    'true'
      ? color('green', 'PRODUCTION')
      : color('yellow', 'SANDBOX');
  console.log(color('dim', `Mode: ${mode}\n`));
}

function cmdList() {
  const plans = store.listPlans();
  console.log(color('bold', '\nDaftar Paket ChatGPT:\n'));
  for (const p of plans) {
    const stockTxt =
      p.stock > 0
        ? color('green', `stok: ${p.stock}`)
        : color('red', 'stok: HABIS');
    console.log(
      `  ${color('cyan', p.key)}  -  ${p.name}  ${color(
        'bold',
        rupiah(p.price)
      )}  [${stockTxt}]`
    );
    if (p.description) console.log(color('dim', `      ${p.description}`));
  }
  console.log('');
}

function printHelp() {
  console.log(`
${color('bold', 'AUTOPAY CHATGPT (CMD)')} — jualan akses ChatGPT via GoPay/QRIS (Midtrans)

${color('bold', 'Penggunaan:')}
  node cli/autopay.js                      Mode interaktif (pilih paket -> bayar)
  node cli/autopay.js list                 Tampilkan daftar paket + stok
  node cli/autopay.js pay [opsi]           Buat transaksi & autopay
  node cli/autopay.js status <orderId>     Cek status 1 transaksi
  node cli/autopay.js --help               Bantuan ini

${color('bold', 'Opsi untuk "pay":')}
  --plan <key>        Key paket (lihat "list"), mis. plus-1bulan
  --amount <angka>    Override harga (IDR). Default = harga paket
  --name <nama>       Nama pembeli (opsional)
  --email <email>     Email pembeli (opsional)
  --phone <hp>        No HP pembeli (opsional)
  --interval <detik>  Jeda auto-cek status (default 5)
  --timeout <detik>   Batas waktu autopay (default 300)
  --no-deliver        Jangan kirim token walau lunas (hanya tandai paid)

${color('bold', 'Konfigurasi (.env):')}
  MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx   (WAJIB - access token)
  MIDTRANS_IS_PRODUCTION=false             (true untuk live)
`);
}

/**
 * Loop autopay: cek status berulang sampai lunas / gagal / timeout.
 * @returns {Promise<'paid'|'failed'|'timeout'>}
 */
async function autopayLoop(client, orderId, { intervalSec, timeoutSec }) {
  const deadline = Date.now() + timeoutSec * 1000;
  let attempt = 0;

  process.stdout.write(
    color('dim', `\nMenunggu pembayaran (auto-cek tiap ${intervalSec}s)...\n`)
  );

  while (Date.now() < deadline) {
    attempt++;
    let status = 'unknown';
    try {
      const res = await client.getStatus(orderId);
      status = normalizeStatus(res);
    } catch (e) {
      // 404 = transaksi belum terbaca / belum ada -> anggap pending
      if (!(e instanceof MidtransError && e.statusCode === 404)) {
        process.stdout.write(
          color('yellow', `  [cek #${attempt}] error: ${e.message}\n`)
        );
      }
    }

    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    process.stdout.write(
      `  [cek #${attempt}] status: ${color(
        status === 'paid' ? 'green' : status === 'failed' ? 'red' : 'yellow',
        status
      )}  ${color('dim', `(sisa ${remaining}s)`)}\n`
    );

    if (status === 'paid') return 'paid';
    if (status === 'failed') return 'failed';
    if (status === 'refunded') return 'failed';

    await sleep(intervalSec * 1000);
  }
  return 'timeout';
}

function deliverToken(planKey, orderId) {
  const token = store.popToken(planKey);
  if (!token) {
    console.log(
      color(
        'red',
        '\n[!] Pembayaran LUNAS tapi STOK TOKEN HABIS untuk paket ini.'
      )
    );
    console.log('    Segera isi token di cli/products.json untuk pembeli ini.');
    store.saveOrder({ orderId, deliveredToken: null, deliverError: 'out_of_stock' });
    return null;
  }

  store.saveOrder({ orderId, deliveredToken: token, deliveredAt: new Date().toISOString() });

  console.log(color('green', '\n==================== TOKEN DIKIRIM ===================='));
  console.log(color('bold', '  Access Token ChatGPT:'));
  console.log('  ' + color('cyan', token));
  console.log(color('green', '=======================================================\n'));
  return token;
}

async function cmdPay(flags, { interactive }) {
  printBanner();

  // --- tentukan paket ---
  let planKey = flags.plan;

  if (!planKey && interactive) {
    const plans = store.listPlans();
    console.log(color('bold', 'Pilih paket:\n'));
    plans.forEach((p, idx) => {
      const stockTxt =
        p.stock > 0 ? color('green', `stok ${p.stock}`) : color('red', 'HABIS');
      console.log(
        `  ${idx + 1}) ${color('cyan', p.key)} - ${p.name} ${color(
          'bold',
          rupiah(p.price)
        )} [${stockTxt}]`
      );
    });
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const choice = await ask(rl, '\nNomor / key paket: ');
    rl.close();

    const byIndex = plans[parseInt(choice, 10) - 1];
    planKey = byIndex ? byIndex.key : choice;
  }

  if (!planKey) {
    console.error(color('red', '[!] Paket belum dipilih. Pakai --plan <key> atau jalankan tanpa argumen untuk mode interaktif.'));
    process.exit(1);
  }

  const plan = store.getPlan(planKey);
  if (!plan) {
    console.error(color('red', `[!] Paket "${planKey}" tidak ditemukan. Lihat "node cli/autopay.js list".`));
    process.exit(1);
  }

  if (plan.stock <= 0) {
    console.log(color('yellow', `[!] Peringatan: stok token untuk "${planKey}" HABIS. Transaksi tetap bisa dibuat, tapi token tidak akan terkirim otomatis.`));
  }

  const amount = flags.amount ? Math.round(Number(flags.amount)) : plan.price;
  if (!amount || amount <= 0) {
    console.error(color('red', '[!] Amount tidak valid.'));
    process.exit(1);
  }

  const intervalSec = Math.max(1, Number(flags.interval) || 5);
  const timeoutSec = Math.max(10, Number(flags.timeout) || 300);

  const customer = {};
  if (flags.name) customer.first_name = String(flags.name);
  if (flags.email) customer.email = String(flags.email);
  if (flags.phone) customer.phone = String(flags.phone);

  const orderId = genOrderId(planKey);
  const client = getClient();

  console.log('');
  console.log(`  Paket   : ${color('bold', plan.name)}`);
  console.log(`  Harga   : ${color('bold', rupiah(amount))}`);
  console.log(`  OrderID : ${orderId}`);

  // --- buat transaksi QRIS ---
  let charge;
  try {
    charge = await client.chargeQris({
      orderId,
      amount,
      customer: Object.keys(customer).length ? customer : undefined,
      items: [
        {
          id: planKey,
          price: amount,
          quantity: 1,
          name: plan.name.slice(0, 50),
        },
      ],
    });
  } catch (e) {
    console.error(color('red', `\n[!] Gagal membuat transaksi QRIS: ${e.message}`));
    if (e.body) console.error(color('dim', JSON.stringify(e.body)));
    process.exit(1);
  }

  store.saveOrder({
    orderId,
    planKey,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString(),
    qrString: charge.qr_string || null,
    expiry: charge.expiry_time || null,
  });

  if (charge.expiry_time) {
    console.log(`  Expired : ${color('yellow', charge.expiry_time)}`);
  }

  // --- tampilkan QRIS ---
  showQris(charge);

  // --- autopay loop ---
  const result = await autopayLoop(client, orderId, { intervalSec, timeoutSec });

  if (result === 'paid') {
    store.saveOrder({ orderId, status: 'paid', paidAt: new Date().toISOString() });
    console.log(color('green', '\n[OK] Pembayaran LUNAS!'));

    if (flags.deliver === false || flags['no-deliver']) {
      console.log(color('dim', '    (pengiriman token dilewati karena --no-deliver)'));
    } else {
      deliverToken(planKey, orderId);
    }
  } else if (result === 'failed') {
    store.saveOrder({ orderId, status: 'failed' });
    console.log(color('red', '\n[X] Transaksi gagal / dibatalkan / kedaluwarsa.'));
  } else {
    store.saveOrder({ orderId, status: 'timeout' });
    console.log(color('yellow', `\n[~] Timeout: belum lunas dalam ${timeoutSec}s.`));
    console.log(`    Cek lagi nanti: ${color('cyan', `node cli/autopay.js status ${orderId}`)}`);
  }
}

async function cmdStatus(orderId) {
  if (!orderId) {
    console.error(color('red', '[!] Order ID wajib. Contoh: node cli/autopay.js status CGPT-...'));
    process.exit(1);
  }
  const client = getClient();
  try {
    const res = await client.getStatus(orderId);
    const status = normalizeStatus(res);
    console.log('');
    console.log(`  OrderID           : ${orderId}`);
    console.log(`  transaction_status: ${res.transaction_status}`);
    console.log(`  status (internal) : ${color(status === 'paid' ? 'green' : status === 'failed' ? 'red' : 'yellow', status)}`);
    console.log(`  gross_amount      : ${res.gross_amount}`);
    if (res.settlement_time) console.log(`  settlement_time   : ${res.settlement_time}`);

    const local = store.getOrder(orderId);
    if (status === 'paid' && local && local.planKey && !local.deliveredToken) {
      console.log(color('green', '\n  Pembayaran lunas & token belum terkirim -> mengirim sekarang...'));
      deliverToken(local.planKey, orderId);
    } else if (local && local.deliveredToken) {
      console.log(color('dim', `\n  Token sudah pernah dikirim: ${local.deliveredToken}`));
    }
    console.log('');
  } catch (e) {
    console.error(color('red', `[!] Gagal cek status: ${e.message}`));
    process.exit(1);
  }
}

// ----------------------------- main ----------------------------------

async function main() {
  const { command, _, flags } = parseArgs(process.argv);

  if (flags.help || flags.h || command === 'help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'list':
      cmdList();
      break;
    case 'status':
      await cmdStatus(_[0]);
      break;
    case 'pay':
      await cmdPay(flags, { interactive: false });
      break;
    case null:
      // tanpa command -> interaktif
      await cmdPay(flags, { interactive: true });
      break;
    default:
      console.error(color('red', `[!] Perintah tidak dikenal: ${command}`));
      printHelp();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(color('red', `\n[FATAL] ${e.message}`));
  process.exit(1);
});
