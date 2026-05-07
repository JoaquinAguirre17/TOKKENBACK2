// routes/mongoRoutesExtra.js

import express from "express";
import multer from "multer";

import {
  getProducts,
  getProductDetails,
  searchProducts,
  createOrder,
  confirmOrder,
  obtenerVentasCierreCaja,
  exportarVentasExcel,
  obtenerVentasPorMes,
  importarExcel,
  exportarProductosExcel,
} from "../controllers/MongoController.js";

const router = express.Router();

// Multer
const storage = multer.memoryStorage();

const upload = multer({
  storage,
});

// =========================
// PRODUCTOS
// =========================

// Obtener todos los productos
router.get(
  "/products",
  getProducts
);

// Exportar Excel
router.get(
  "/products/export-excel",
  exportarProductosExcel
);

// Buscar productos
router.get(
  "/products/search",
  searchProducts
);

// Obtener producto por ID
// ⚠️ SIEMPRE AL FINAL
router.get(
  "/products/:id",
  getProductDetails
);

// Importar productos Excel
router.post(
  "/products/import-excel",
  upload.single("archivo"),
  importarExcel
);

// =========================
// ÓRDENES
// =========================

// Crear orden
router.post(
  "/orders",
  createOrder
);

// Confirmar orden
router.post(
  "/orders/confirm",
  confirmOrder
);

// Ventas por mes
router.get(
  "/orders/cierre-mes",
  obtenerVentasPorMes
);

// =========================
// REPORTES
// =========================

// Cierre de caja
router.get(
  "/orders/cierre-caja",
  obtenerVentasCierreCaja
);

// Exportar ventas Excel
router.post(
  "/orders/export-excel",
  exportarVentasExcel
);

export default router;