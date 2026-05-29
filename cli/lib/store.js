// =========================================================================
// store.js - Penyimpanan sederhana berbasis file JSON (zero dependency)
// =========================================================================
// Menyimpan riwayat order + mengelola stok "access token" ChatGPT.
// Untuk produksi nyata sebaiknya pakai database; ini cukup untuk CLI.
//
// File:
//   cli/products.json -> definisi paket + stok token (dibaca/ditulis)
//   cli/orders.json   -> riwayat transaksi (dibuat otomatis)
// =========================================================================

const fs = require('fs');
const path = require('path');

const PRODUCTS_PATH = path.join(__dirname, '..', 'products.json');
const PRODUCTS_EXAMPLE_PATH = path.join(__dirname, '..', 'products.example.json');
const ORDERS_PATH = path.join(__dirname, '..', 'orders.json');

// Pada run pertama, kalau products.json belum ada tapi template ada,
// salin otomatis supaya program langsung bisa jalan.
function ensureProducts() {
  if (!fs.existsSync(PRODUCTS_PATH) && fs.existsSync(PRODUCTS_EXAMPLE_PATH)) {
    fs.copyFileSync(PRODUCTS_EXAMPLE_PATH, PRODUCTS_PATH);
  }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ---------- Products / Plans ----------

function loadProducts() {
  ensureProducts();
  const data = readJson(PRODUCTS_PATH, null);
  if (!data || !data.plans) {
    throw new Error(
      `products.json tidak valid atau tidak ditemukan di ${PRODUCTS_PATH}`
    );
  }
  return data;
}

function getPlan(planKey) {
  const data = loadProducts();
  const plan = data.plans[planKey];
  if (!plan) return null;
  const stock = (data.tokens && data.tokens[planKey]) || [];
  return { key: planKey, ...plan, stock: stock.length };
}

function listPlans() {
  const data = loadProducts();
  return Object.entries(data.plans).map(([key, plan]) => {
    const stock = (data.tokens && data.tokens[key]) || [];
    return { key, ...plan, stock: stock.length };
  });
}

/**
 * Ambil 1 access token dari stok untuk plan tertentu lalu hapus dari stok
 * (supaya tidak terjual dua kali). Return null kalau stok habis.
 *
 * @param {string} planKey
 * @returns {string|null}
 */
function popToken(planKey) {
  const data = loadProducts();
  if (!data.tokens || !Array.isArray(data.tokens[planKey])) return null;
  if (data.tokens[planKey].length === 0) return null;

  const token = data.tokens[planKey].shift();
  writeJson(PRODUCTS_PATH, data);
  return token;
}

// ---------- Orders ----------

function loadOrders() {
  return readJson(ORDERS_PATH, {});
}

function saveOrder(order) {
  const orders = loadOrders();
  orders[order.orderId] = { ...orders[order.orderId], ...order };
  writeJson(ORDERS_PATH, orders);
  return orders[order.orderId];
}

function getOrder(orderId) {
  const orders = loadOrders();
  return orders[orderId] || null;
}

module.exports = {
  loadProducts,
  getPlan,
  listPlans,
  popToken,
  loadOrders,
  saveOrder,
  getOrder,
  PRODUCTS_PATH,
  ORDERS_PATH,
};
