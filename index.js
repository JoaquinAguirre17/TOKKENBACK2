// index.js (o server.js)
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import mongoRoutes from "./routes/mongoRoutes.js";  // 👈 usa el nombre real de tu archivo

dotenv.config();
const app = express();

app.use(cors({
  origin: ["https://tokkencba.com", "http://localhost:5173"],
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));
app.options("*", cors());

// Para recibir JSON
app.use(express.json({ limit: "5mb" }));

// Health check
app.get("/api/health", (_, res) => res.json({ status: "ok" }));


const { MONGO_URI, PORT = 10000 } = process.env;

// Log seguro para ver si llega bien la URI
console.log("MONGO_URI (masked):", (MONGO_URI || "").replace(/:(.*?)@/, "://***@"));

(async () => {
  try {
    if (!MONGO_URI) throw new Error("MONGO_URI no está definida en Render");

    await mongoose.connect(MONGO_URI, {
      dbName: "TOKKENBD",
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    });
    console.log("✅ Conectado a MongoDB Atlas");

    // 👇 Monta todas las rutas
    app.use("/api", mongoRoutes);

    app.listen(PORT, () => {
      console.log(`🚀 Servidor en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error de conexión:", err?.message || err);
    process.exit(1);
  }
})();

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
  process.exit(1);
});
