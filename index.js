import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";                           // ✅ NUEVO
import productRoutes from "./routes/mongoRoutes.js";

dotenv.config();
const app = express();

// ✅ CORS SIEMPRE ANTES DE LAS RUTAS
app.use(cors({
  origin: ["https://tokkencba.com", "http://localhost:5173"], // tu front en prod y dev
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  // credentials: true, // déjalo comentado a menos que uses cookies/sesión
}));

// ✅ (opcional) responder explícitamente preflight
app.options("*", cors());                          // ✅ NUEVO

// Middleware para leer JSON
app.use(express.json());

// Conexión a Mongo Atlas
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 })
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error de conexión:", err));

// Rutas
app.use("/api/products", productRoutes);

// Health check (útil para Render)
app.get("/health", (_, res) => res.send("ok"));

// Servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
