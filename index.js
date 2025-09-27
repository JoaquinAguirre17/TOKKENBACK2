import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import productRoutes from "./routes/mongoRoutes.js";

dotenv.config();
const app = express();

// Middleware para leer JSON
app.use(express.json());

// Conexión a Mongo Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error de conexión:", err));

// Rutas
app.use("/api/products", productRoutes);

// Servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
