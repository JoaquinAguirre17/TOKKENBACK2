// index.js / server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import mongoRoutes from "./routes/mongoRoutes.js";

dotenv.config();
const app = express();

/* ----------------------------------------------------
   ✅ CORS ÚNICO Y DEFINITIVO (Render + navegador)
---------------------------------------------------- */
const allowedOrigins = [
  "https://tokkencba.com",
  "https://www.tokkencba.com",   // ⭐ FALTABA
  "http://localhost:5173"
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("❌ CORS bloqueado para origen:", origin);
      callback(new Error("CORS bloqueado"));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Handler para OPTIONS (necesario en Render)
app.options("*", cors());

/* ----------------------------------------------------
   Body parser
---------------------------------------------------- */
app.use(express.json({ limit: "5mb" }));

/* ----------------------------------------------------
   Health Check (Render)
---------------------------------------------------- */
app.get("/health", (_, res) => res.send("ok"));

/* ----------------------------------------------------
   Mongo + Rutas
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

    // Montar rutas
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
