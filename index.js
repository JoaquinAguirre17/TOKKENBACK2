// index.js (o server.js)
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import productRoutes from "./routes/mongoRoutes.js";

dotenv.config();
const app = express();

// CORS antes de rutas
app.use(cors({
  origin: ["https://tokkencba.com", "http://localhost:5173"],
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));
app.options("*", cors());

app.use(express.json());

// Health (no depende de DB)
app.get("/health", (_,res)=>res.send("ok"));

const { MONGO_URI, PORT = 10000 } = process.env;

(async () => {
  try {
    if (!MONGO_URI) throw new Error("MONGO_URI no está definida en Render");

    // 👇 Conectar ANTES de montar rutas y de escuchar puerto
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    });
    console.log("✅ Conectado a MongoDB Atlas");

    // 👇 Montar rutas después de conectar
    app.use("/api/products", productRoutes);

    app.listen(PORT, () => {
      console.log(`🚀 Servidor en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error de conexión:", err?.message || err);
    // Opcional: process.exit(1); en Render se reintenta sa
  }
})();
