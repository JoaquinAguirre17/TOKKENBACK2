// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const productRoutes = require('./routes/shopifyRoutes');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Configurar CORS para permitir GET y POST
app.use(cors({
    origin: 'https://tokkencba.com',  // Cambiar si el dominio cambia
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rutas
app.use('/api/shopify', productRoutes);

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor Shopify corriendo en http://localhost:${port}`);
});
