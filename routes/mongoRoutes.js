// routes/appRoutes.js
import express from "express";
import {
  getProducts,
  getProductById,
  getProductBySlug,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  createOrder,
  confirmOrder,
  listOrders,
  getOrderById,
  downloadOrderPDF,
  obtenerVentasCierreCaja,
  exportarVentasExcel,
} from "../controllers/MongoController.js";

const router = express.Router();

/* -------------------- PRODUCTOS -------------------- */
router.get("/products", getProducts);
router.get("/products/search", searchProducts);
router.get("/products/slug/:slug", getProductBySlug);
router.get("/products/:id", getProductById);
router.post("/products", createProduct);
router.put("/products/:id", updateProduct);
router.delete("/products/:id", deleteProduct);

/* -------------------- ÓRDENES -------------------- */
router.post("/orders", createOrder);
router.post("/orders/confirm", confirmOrder);
router.get("/orders", listOrders);

// ⚠️ ESTA RUTA DEBE IR **ANTES** DE /orders/:id
router.get("/orders/cierre-caja", obtenerVentasCierreCaja);

// Exportar excel
router.post("/orders/export-excel", exportarVentasExcel);

// Descargar PDF
router.get("/orders/:id/pdf", downloadOrderPDF);

// ESTA SIEMPRE AL FINAL
router.get("/orders/:id", getOrderById);

export default router;
