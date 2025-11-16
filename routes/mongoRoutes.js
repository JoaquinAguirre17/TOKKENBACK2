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
  downloadOrderPDF,

  // Reportes
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
router.get("/orders/:id", getOrderById);

// Descargar PDF
router.get("/orders/:id/pdf", downloadOrderPDF);

/* -------------------- CIERRE DE CAJA -------------------- */
// Que coincida con el front:
router.get("/shopify/cierre-caja", obtenerVentasCierreCaja);

// Exportar excel
router.post("/orders/export-excel", exportarVentasExcel);

export default router;
