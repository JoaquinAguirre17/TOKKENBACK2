// index.js / server.js

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcryptjs";

import mongoRoutes from "./routes/mongoRoutes.js";
import User from "./models/User.js";

dotenv.config();

const app = express();

/* ----------------------------------------------------
   SEED USUARIOS
---------------------------------------------------- */

const seedUsers = async () => {

  try {

    const users = [

      {
        username: "andrea",
        password: "1234",
        nombre: "Andrea",
        rol: "owner",
      },

      {
        username: "joaquin",
        password: "1234",
        nombre: "Joaquin",
        rol: "admin",
      },

      {
        username: "thiago",
        password: "1234",
        nombre: "Thiago",
        rol: "vendedor",
      },

      {
        username: "victoria",
        password: "1234",
        nombre: "Victoria",
        rol: "vendedor",
      },

    ];

    for (const user of users) {

      const exists = await User.findOne({
        username: user.username,
      });

      if (!exists) {

        const hashedPassword =
          await bcrypt.hash(
            user.password,
            10
          );

        await User.create({

          username: user.username,

          password: hashedPassword,

          nombre: user.nombre,

          rol: user.rol,

        });

        console.log(
          `✅ Usuario creado: ${user.username}`
        );

      }

    }

  } catch (error) {

    console.error(
      "❌ Error creando usuarios:",
      error
    );

  }

};

/* ----------------------------------------------------
   ✅ CORS
---------------------------------------------------- */

const allowedOrigins = [

  "https://tokkencba.com",

  "https://www.tokkencba.com",

  "http://localhost:5173"

];

app.use(cors({

  origin: function(origin, callback) {

    if (
      !origin ||
      allowedOrigins.includes(origin)
    ) {

      callback(null, true);

    } else {

      console.log(
        "❌ CORS bloqueado para origen:",
        origin
      );

      callback(
        new Error("CORS bloqueado")
      );

    }

  },

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ],

  credentials: true,

}));

// OPTIONS Render
app.options("*", cors());

/* ----------------------------------------------------
   BODY PARSER
---------------------------------------------------- */

app.use(
  express.json({
    limit: "5mb"
  })
);

/* ----------------------------------------------------
   HEALTH CHECK
---------------------------------------------------- */

app.get(
  "/health",
  (_, res) => res.send("ok")
);

/* ----------------------------------------------------
   MONGO
---------------------------------------------------- */

const {
  MONGO_URI,
  PORT = 10000
} = process.env;

console.log(
  "MONGO_URI (masked):",
  (MONGO_URI || "")
    .replace(/:(.*?)@/, "://***@")
);

/* ----------------------------------------------------
   START SERVER
---------------------------------------------------- */

(async () => {

  try {

    if (!MONGO_URI) {

      throw new Error(
        "MONGO_URI no está definida"
      );

    }

    await mongoose.connect(
      MONGO_URI,
      {

        dbName: "TOKKENBD",

        serverSelectionTimeoutMS: 20000,

        socketTimeoutMS: 45000,

        retryWrites: true,

      }
    );

    console.log(
      "✅ Conectado a MongoDB"
    );

    // ✅ CREAR USUARIOS
    await seedUsers();

    // ✅ RUTAS
    app.use("/api", mongoRoutes);

    // ✅ SERVER
    app.listen(PORT, () => {

      console.log(
        `🚀 Servidor listo en http://localhost:${PORT}`
      );

    });

  } catch (err) {

    console.error(
      "❌ Error conectando Mongo:",
      err.message
    );

    process.exit(1);

  }

})();

/* ----------------------------------------------------
   ERRORES GLOBALES
---------------------------------------------------- */

process.on(
  "unhandledRejection",
  (reason) => {

    console.error(
      "UNHANDLED REJECTION:",
      reason
    );

    process.exit(1);

  }
);