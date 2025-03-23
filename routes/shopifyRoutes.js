const express = require('express');
const router = express.Router();
const shopifyController = require('../controllers/shopifyController');

// Ruta para obtener todos los productos
router.get('/products', shopifyController.getProducts);

// Ruta para obtener el detalle de un producto específico
router.get('/products/:id', shopifyController.getProductDetails);

module.exports = router;
