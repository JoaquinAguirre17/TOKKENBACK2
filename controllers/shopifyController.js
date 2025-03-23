const axios = require('axios');
require('dotenv').config();

const getProducts = async (req, res) => {
  try {
    let allProducts = [];
    let nextPageUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/products.json?limit=250`;

    // Bucle para manejar la paginación
    while (nextPageUrl) {
      const response = await axios.get(nextPageUrl, {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        },
      });

      allProducts = allProducts.concat(response.data.products);

      // Extraer el enlace de la siguiente página si existe
      const linkHeader = response.headers['link'];
      nextPageUrl = null;
      if (linkHeader) {
        const nextLink = linkHeader.split(',').find(link => link.includes('rel="next"'));
        if (nextLink) {
          nextPageUrl = nextLink.split(';')[0].trim().replace(/<(.*)>/, '$1');
        }
      }
    }

    res.status(200).json({ products: allProducts });
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
};

module.exports = { getProducts };
