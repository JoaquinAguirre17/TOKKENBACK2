// controllers/graphQLController.js
const axios = require('axios');

const searchProducts = async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim() === "") {
    return res.status(400).json({ message: 'La consulta de búsqueda no puede estar vacía.' });
  }

  try {
    const response = await axios.post(
      `https://${process.env.SHOPIFY_STORE_URL}/api/2025-01/graphql.json`,
      {
        query: `
          query searchProducts($query: String!, $first: Int) {
            search(query: $query, first: $first, types: PRODUCT) {
              edges {
                node {
                  ... on Product {
                    id
                    title
                  }
                }
              }
            }
          }`,
        variables: { query, first: 10 }
      },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    const products = response.data.data.search.edges.map(edge => edge.node);

    if (products.length === 0) {
      return res.status(404).json({ message: 'No se encontraron productos que coincidan con la búsqueda.' });
    }

    return res.status(200).json(products);
  } catch (error) {
    console.error('Error al realizar la búsqueda de productos via GraphQL:', error.message || error.response?.data || error);
    res.status(500).json({ message: 'Error al realizar la búsqueda de productos', error: error.message });
  }
};

module.exports = { searchProducts };
