// routes/appRoutes.js
import express from "express";
import {
  // Productos
  getProducts,
  getProductById,
  getProductBySlug,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  // Órdenes
  createOrder,
  confirmOrder,
  listOrders,
  getOrderById,
  // Reportes
  obtenerVentasCierreCaja,
  exportarVentasExcel,
} from "../controllers/appController.js";

const router = express.Router();

// Productos
router.get("/products", getProducts);
router.get("/products/search", searchProducts);
router.get("/products/slug/:slug", getProductBySlug);
router.get("/products/:id", getProductById);
router.post("/products", createProduct);
router.put("/products/:id", updateProduct);
router.delete("/products/:id", deleteProduct);

// Órdenes
router.post("/orders", createOrder);
router.post("/orders/confirm", confirmOrder);
router.get("/orders", listOrders);
router.get("/orders/:id", getOrderById);

// Reportes
router.get("/orders/cierre-caja", obtenerVentasCierreCaja);
router.post("/orders/export-excel", exportarVentasExcel);

export default router;
