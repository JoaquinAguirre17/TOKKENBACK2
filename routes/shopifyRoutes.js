const express = require('express');
const router = express.Router();
const shopifyController = require('../controllers/shopifyController');

// Obtener todos los productos
router.get('/products', shopifyController.getProducts);

// Obtener detalle de un producto específico
router.get('/products/:id', shopifyController.getProductDetails);

// Crear una orden borrador (draft order)
router.post('/draft-order', shopifyController.createDraftOrder);

// Confirmar o cancelar la orden según acción del staff
router.post('/confirm-order', shopifyController.confirmOrder);

// Vista HTML para el staff con los botones "Se vendió / No se vendiooó"
router.get('/staff/order/:draftOrderId', shopifyController.getStaffOrderView);

router.get('/products/search', searchProducts);
module.exports = router;
