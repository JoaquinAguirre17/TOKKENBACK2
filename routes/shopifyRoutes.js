const express = require('express');
const router = express.Router();
const shopifyController = require('../controllers/shopifyController');

// Ruta para obtener todos los productos
router.get('/products', shopifyController.getProducts);

module.exports = router;
