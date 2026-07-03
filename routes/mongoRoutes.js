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

  getCashClosureModal,
  createCashClosure,
  getPersonalReport,
  getPersonalDetail,
  cerrarSesionesAbandonadas,
  createWebOrderMP,
  mercadoPagoWebhook,
  getProductImage
} from "../controllers/MongoController.js";

const router = express.Router();

/* -------------------- AUTH -------------------- */

router.post("/auth/login", login);

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
router.post(
  "/products",
  upload.array("images"),
  createProduct
);
router.put("/products/:id", updateProduct);
router.delete("/products/:id", deleteProduct);
router.get(
  "/products/:id/image/:index",
  getProductImage
);
/* -------------------- ÓRDENES -------------------- */
// Rutas fijas primero
router.post("/orders/web-mp", createWebOrderMP); // Web + Mercado Pago
router.post("/orders/web-mp/webhook", mercadoPagoWebhook); // Webhook Mercado Pago
// Web + Mercado Pago
router.post("/orders/confirm", confirmOrder);     // Confirmación POS
router.get("/orders/cierre-caja", obtenerVentasCierreCaja);
router.post("/orders/export-excel", exportarVentasExcel);
router.get("/orders/cierre-mes", obtenerVentasPorMes);
router.post("/ingresos", crearIngreso);


/* =========================
   CASH CLOSURE
========================= */
router.get(
  "/orders/cash-closure",
  getCashClosureModal
);

router.post(
  "/cash-closure",
  createCashClosure
);

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
/*****************************
 * CONTROL PERSONAL
 *****************************/
/* =========================
   CONTROL PERSONAL
========================= */
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
/* =========================
   CASH CLOSURE
========================= */

router.post("/auth/logout", logout);

export default router;
