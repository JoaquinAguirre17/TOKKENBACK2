// src/shopifyClient.js

const axios = require('axios');

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL; // ej: 'mi-tienda.myshopify.com'
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  throw new Error('Faltan variables de entorno para Shopify');
}

const shopifyClient = axios.create({
  baseURL: `https://${SHOPIFY_STORE_URL}/admin/api/2023-04`,
  headers: {
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

module.exports = shopifyClient;
