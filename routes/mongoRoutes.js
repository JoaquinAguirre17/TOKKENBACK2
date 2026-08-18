// routes/mongoRoutes.js

import express from "express";
import multer from "multer";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
});

import {
  /* =====================================================
     PRODUCTOS
  ===================================================== */

  getProducts,
  getProductById,
  getProductBySlug,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductImage,

  /* =====================================================
     ÓRDENES
  ===================================================== */

  createOrder,
  createWebOrderMP,
  confirmOrder,
  listOrders,
  getOrderById,
  downloadOrderPDF,
  downloadWebOrderPDF,
  deleteOrder,
  obtenerWebOrder,
  obtenerWebOrderByReference,

  /* =====================================================
     MERCADO PAGO
  ===================================================== */

  mercadoPagoWebhook,

  /* =====================================================
     CAJA
  ===================================================== */

  obtenerVentasCierreCaja,
  exportarVentasExcel,
  obtenerVentasPorMes,
  crearIngreso,

  /* =====================================================
     EXCEL
  ===================================================== */

  exportarProductosExcel,
  importarExcel,

  /* =====================================================
     AUTH
  ===================================================== */

  login,
  logout,
  checkSession,

  /* =====================================================
     CASH CLOSURE
  ===================================================== */

  getCashClosureModal,
  createCashClosure,

  /* =====================================================
     PERSONAL
  ===================================================== */

  getPersonalReport,
  getPersonalDetail,
  cerrarSesionesAbandonadas,

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
   CREAR ORDEN WEB + MERCADO PAGO
===================================================== */

router.post(
  "/orders/web-mp",
  createWebOrderMP
);


/* =====================================================
   WEBHOOK MERCADO PAGO
===================================================== */

router.post(
  "/orders/web-mp/webhook",
  mercadoPagoWebhook
);


/* =====================================================
   ORDEN WEB POR ID
===================================================== */

router.get(
  "/orders/web/:id",
  obtenerWebOrder
);


/* =====================================================
   ORDEN WEB POR EXTERNAL REFERENCE
===================================================== */

router.get(
  "/orders/web/reference/:externalReference",
  obtenerWebOrderByReference
);


/* =====================================================
   PDF ORDEN WEB
===================================================== */

router.get(
  "/orders/web/:id/pdf",
  downloadWebOrderPDF
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
   ÓRDENES POS - CONSULTAS
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
   PERSONAL
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


/* =====================================================
   EXPORTAR
===================================================== */

export default router;