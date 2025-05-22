const express = require('express');
const router = express.Router();
const shopifyController = require('../controllers/shopifyController');

// Obtener todos los productos
router.get('/products', shopifyController.getProducts);

// Obtener detalle de un producto específico
router.get('/products/:id', shopifyController.getProductDetails);

// Crear orden borrador (draft order) desde WhatsApp o web
router.post('/createOrder', shopifyController.createOrder);


// Confirmar o cancelar la orden según acción del staff
router.post('/confirm-order', shopifyController.confirmOrder);



// Buscar productos
router.get('/products/search', shopifyController.searchProducts);

module.exports = router;