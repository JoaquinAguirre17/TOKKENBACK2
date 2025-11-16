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
  createWebOrderMP,
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
router.post("/orders", createOrder);               // POS / admin
router.post("/orders/web", createWebOrderMP);     // Web + Mercado Pago
router.post("/orders/confirm", confirmOrder);     // Confirmación POS
router.get("/orders", listOrders);
router.get("/orders/cierre-caja", obtenerVentasCierreCaja);
router.post("/orders/export-excel", exportarVentasExcel);
router.get("/orders/:id/pdf", downloadOrderPDF);
router.get("/orders/:id", getOrderById);

export default router;
