const express = require('express');
const router = express.Router();
const shopifyController = require('../controllers/shopifyController');

// Obtener todos los productos
router.get('/products', shopifyController.getProducts);

// Obtener detalle de un producto específico
router.get('/products/:id', shopifyController.getProductDetails);

// Crear orden borrador (draft order) desde WhatsApp o web
router.post('/draft-order', shopifyController.createDraftOrder);

// Crear orden borrador desde POS (con tag POS y atributos personalizados)
router.post('/ventas-pos', shopifyController.createDraftOrderPOS);

// Confirmar o cancelar la orden según acción del staff
router.post('/confirm-order', shopifyController.confirmOrder);

// Vista HTML para el staff con los botones "Se vendió" o "No se vendió"
router.get('/staff/order/:draftOrderId', shopifyController.getStaffOrderView);

// Buscar productos
router.get('/products/search', shopifyController.searchProducts);

module.exports = router;