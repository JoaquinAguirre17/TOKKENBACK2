// routes/appRoutes.js
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
  createOrder,
  createWebOrderMP,
  confirmOrder,
  listOrders,
  getOrderById,
  downloadOrderPDF,
  obtenerVentasCierreCaja,
  exportarVentasExcel,
  obtenerVentasPorMes,
  crearIngreso,
  exportarProductosExcel,
  importarExcel,
  deleteOrder,
  login,
  logout,
  checkSession,
  getCashClosure,
  createCashClosure,
} from "../controllers/MongoController.js";

const router = express.Router(); 

/* -------------------- AUTH -------------------- */

router.post("/auth/login",login);
router.post("/auth/logout", logout);

router.post("/auth/check-session", checkSession);

/* -------------------- PRODUCTOS -------------------- */
router.get("/products", getProducts);
router.get("/products/search", searchProducts);
router.get("/products/slug/:slug", getProductBySlug);
router.get(
  "/products/export-excel",
  exportarProductosExcel
);
router.get("/products/:id", getProductById);
router.post("/products", createProduct);
router.put("/products/:id", updateProduct);
router.delete("/products/:id", deleteProduct);

/* -------------------- ÓRDENES -------------------- */
// Rutas fijas primero
router.post("/orders/web-mp", createWebOrderMP);
    // Web + Mercado Pago
router.post("/orders/confirm", confirmOrder);     // Confirmación POS
router.get("/orders/cierre-caja", obtenerVentasCierreCaja);
router.post("/orders/export-excel", exportarVentasExcel);
router.get("/orders/cierre-mes", obtenerVentasPorMes);
router.post("/ingresos", crearIngreso);


// POS / admin
router.post("/orders", createOrder);               

// Rutas dinámicas con :id al final
router.get("/orders/:id/pdf", downloadOrderPDF);
router.get("/orders/:id", getOrderById);
router.delete("/orders/:id", deleteOrder);

// Listado general
router.get("/orders", listOrders);

//Importar productos Excel
router.post(
  "/products/import-excel",
  upload.single("archivo"),
  importarExcel
);

/* =========================
   CASH CLOSURE
========================= */
router.post("/cash-closure", createCashClosure);
router.get("/orders/cash-closure", getCashClosure);
export default router;
