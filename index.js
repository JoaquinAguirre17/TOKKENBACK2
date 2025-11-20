// index.js / server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import mongoRoutes from "./routes/mongoRoutes.js";

dotenv.config();
const app = express();

/* ----------------------------------------------------
   🔥 FIX DEFINITIVO DE CORS (Render + OPTIONS)
---------------------------------------------------- */
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://tokkencba.com",
    "http://localhost:5173"
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);   // ⭐ Evita 404 en Render
  }

  next();
});

/* ----------------------------------------------------
   CORS NORMAL (pero ya protegido por el FIX)
---------------------------------------------------- */
app.use(cors({
  origin: ["https://tokkencba.com", "http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Body parser
app.use(express.json({ limit: "5mb" }));

/* ----------------------------------------------------
   HEALTH CHECK (IMPORTANTE)
---------------------------------------------------- */
app.get("/health", (_, res) => res.send("ok"));

/* ----------------------------------------------------
   MONGO + SERVER
---------------------------------------------------- */
const { MONGO_URI, PORT = 10000 } = process.env;

// Log seguro
console.log("MONGO_URI (masked):", (MONGO_URI || "").replace(/:(.*?)@/, "://***@"));

(async () => {
  try {
    if (!MONGO_URI) throw new Error("MONGO_URI no está definida");

    await mongoose.connect(MONGO_URI, {
      dbName: "TOKKENBD",
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    });

    console.log("✅ Conectado a MongoDB");

    // Montar rutas API
    app.use("/api", mongoRoutes);

    app.listen(PORT, () => {
      console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error("❌ Error conectando Mongo:", err.message);
    process.exit(1);
  }
})();

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
  process.exit(1);
});
