// index.js (o server.js)
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import productRoutes from "./routes/mongoRoutes.js";
import mongoRoutesExtra from "./routes/mongoRoutesExtra.js";

dotenv.config();
const app = express();

// CORS antes de rutas
app.use(cors({
  origin: ["https://tokkencba.com", "http://localhost:5173"],
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));
app.options("*", cors());

 // (opcional) si subís imágenes base64 o payloads grandes
 app.use(express.json({ limit: "5mb" }));

// Health (no depende de DB)
app.get("/health", (_,res)=>res.send("ok"));

const { MONGO_URI, PORT = 10000 } = process.env;

console.log('MONGO_URI (masked):', (MONGO_URI || '').replace(/:(.*?)@/,'://***@'));

(async () => {
  try {
    if (!MONGO_URI) throw new Error("MONGO_URI no está definida en Render");

    await mongoose.connect(MONGO_URI, {
      dbName: 'TOKKENBD',
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    });
    console.log("✅ Conectado a MongoDB Atlas");

    // Rutas después de conectar
    app.use("/api/products", productRoutes);       // CRUD productos (tu router actual)
   app.use("/api", mongoRoutesExtra);             // Órdenes + búsquedas + reportes

    app.listen(PORT, () => {
      console.log(`🚀 Servidor en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error de conexión:", err?.message || err);
    process.exit(1);
  }
})();

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});
