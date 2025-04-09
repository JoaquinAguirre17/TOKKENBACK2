// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const productRoutes = require('./routes/shopifyRoutes');


const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Configurar CORS (permite solicitudes del frontend en Hostinger)
app.use(cors({
    origin: 'https://tokkencba.com',  // Reemplazar con el dominio correcto
    methods: ['GET'],
}));

// Rutas
app.use('/api/shopify', productRoutes);

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor Shopify corriendo en http://localhost:${port}`);
});
