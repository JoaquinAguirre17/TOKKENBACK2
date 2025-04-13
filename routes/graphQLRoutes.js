// routes/graphQLRoutes.js
const express = require('express');
const router = express.Router();
const graphQLController = require('../controllers/graphQLController');

// Ruta para buscar productos usando GraphQL
router.get('/products/search', graphQLController.searchProducts);

module.exports = router;
