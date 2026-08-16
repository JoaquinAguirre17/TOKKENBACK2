// routes/mongoRoutes.js

import express from "express";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

import {
  getProducts,
  getProductById,
  getProductBySlug,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,

  // =========================
  // ÓRDENES
  // =========================
  createOrder,
  createWebOrderMP,
  confirmOrder,
  listOrders,
  getOrderById,
  downloadOrderPDF,
  deleteOrder,

  // =========================
  // MERCADO PAGO
  // =========================
  mercadoPagoWebhook,

  // =========================
  // CAJA
  // =========================
  obtenerVentasCierreCaja,
  exportarVentasExcel,
  obtenerVentasPorMes,
  crearIngreso,

  // =========================
  // PRODUCTOS / EXCEL
  // =========================
  exportarProductosExcel,
  importarExcel,
  getProductImage,

  // =========================
  // AUTH
  // =========================
  login,
  logout,
  checkSession,

  // =========================
  // CASH CLOSURE
  // =========================
  getCashClosureModal,
  createCashClosure,

  // =========================
  // PERSONAL
  // =========================
  getPersonalReport,
  getPersonalDetail,
  cerrarSesionesAbandonadas

} from "../controllers/MongoController.js";

const router = express.Router();


/* =====================================================
   AUTH
===================================================== */

router.post(
  "/auth/login",
  login
);

router.post(
  "/auth/check-session",
  checkSession
);

router.post(
  "/auth/logout",
  logout
);


/* =====================================================
   PRODUCTOS
===================================================== */

router.get(
  "/products",
  getProducts
);

router.get(
  "/products/search",
  searchProducts
);

router.get(
  "/products/slug/:slug",
  getProductBySlug
);

router.get(
  "/products/export-excel",
  exportarProductosExcel
);

router.get(
  "/products/:id",
  getProductById
);

router.post(
  "/products",
  upload.array("images"),
  createProduct
);

router.put(
  "/products/:id",
  upload.array("images"),
  updateProduct
);

router.delete(
  "/products/:id",
  deleteProduct
);

router.get(
  "/products/:id/image/:index",
  getProductImage
);


/* =====================================================
   ÓRDENES WEB + MERCADO PAGO
===================================================== */

/*
   Checkout web.

   Esta ruta crea la orden y,
   si existe MP_ACCESS_TOKEN,
   también crea la preferencia de Mercado Pago.

   Si NO existe el token,
   funciona en modo simulación.
*/

router.post(
  "/orders/web-mp",
  createWebOrderMP
);


/*
   Webhook de Mercado Pago.
*/

router.post(
  "/orders/web-mp/webhook",
  mercadoPagoWebhook
);


/* =====================================================
   ÓRDENES POS
===================================================== */

router.post(
  "/orders/confirm",
  confirmOrder
);

router.post(
  "/orders",
  createOrder
);


/* =====================================================
   CAJA
===================================================== */

router.get(
  "/orders/cierre-caja",
  obtenerVentasCierreCaja
);

router.post(
  "/orders/export-excel",
  exportarVentasExcel
);

router.get(
  "/orders/cierre-mes",
  obtenerVentasPorMes
);

router.post(
  "/ingresos",
  crearIngreso
);


/* =====================================================
   CASH CLOSURE
===================================================== */

router.get(
  "/orders/cash-closure",
  getCashClosureModal
);

router.post(
  "/cash-closure",
  createCashClosure
);


/* =====================================================
   ÓRDENES - CONSULTAS
===================================================== */

router.get(
  "/orders/:id/pdf",
  downloadOrderPDF
);

router.get(
  "/orders/:id",
  getOrderById
);

router.delete(
  "/orders/:id",
  deleteOrder
);

router.get(
  "/orders",
  listOrders
);


/* =====================================================
   IMPORTAR PRODUCTOS EXCEL
===================================================== */

router.post(
  "/products/import-excel",
  upload.single("archivo"),
  importarExcel
);


/* =====================================================
   CONTROL PERSONAL
===================================================== */

router.post(
  "/personal/cerrar-abandonadas",
  cerrarSesionesAbandonadas
);

router.get(
  "/personal/report",
  getPersonalReport
);

router.get(
  "/personal/detail/:username",
  getPersonalDetail
);


export default router;