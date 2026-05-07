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
  importarExcel, // 👈 AGREGAR
} from "../controllers/MongoController.js";

const router = express.Router();

// Multer
const storage = multer.memoryStorage();

const upload = multer({
  storage,
});

// Productos
router.get("/products", getProducts);
router.get("/products/:id", getProductDetails);
router.get("/products/search", searchProducts);

// Importar productos Excel
router.post(
  "/products/import-excel",
  upload.single("archivo"),
  importarExcel
);

// Exportar productos Excel
router.get("/products/export-excel", exportarProductosExcel);

// Órdenes
router.post("/orders", createOrder);
router.post("/orders/confirm", confirmOrder);
router.get("/orders/cierre-mes", obtenerVentasPorMes);

// Reportes
router.get("/orders/cierre-caja", obtenerVentasCierreCaja);
router.post("/orders/export-excel", exportarVentasExcel);

export default router;