// routes/mongoRoutesExtra.js
import express from "express";
import {
  getProducts,          // ya lo tenés, pero lo reexportamos acá si querés /api/products también
  getProductDetails,
  searchProducts,
  createOrder,
  confirmOrder,
  obtenerVentasCierreCaja,
  exportarVentasExcel,
} from "../controllers/MongoController.js";

const router = express.Router();

// Productos (duplicado “cómodo”: /api/products y /api/products/:id)
router.get("/products", getProducts);
router.get("/products/:id", getProductDetails);
router.get("/products/search", searchProducts);

// Órdenes
router.post("/orders", createOrder);
router.post("/orders/confirm", confirmOrder);

// Reportes
router.get("/orders/cierre-caja", obtenerVentasCierreCaja);
router.post("/orders/export-excel", exportarVentasExcel);

export default router;
