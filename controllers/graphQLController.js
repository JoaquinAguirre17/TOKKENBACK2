const axios = require('axios');

const searchProducts = async (req, res) => {
    const { query } = req.query;

    if (!query || query.trim() === "") {
        return res.status(400).json({ message: 'La consulta de búsqueda no puede estar vacía.' });
    }

    try {
        const response = await axios({
            url: `https://${process.env.SHOPIFY_STORE_URL}/api/2024-10/graphql.json`,
            method: 'post',
            headers: {
                'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json',
            },
            data: {
                query: `
                    query {
                        products(first: 10, query: "${query}") {
                            edges {
                                node {
                                    id
                                    title
                                }
                            }
                        }
                    }
                `
            }
        });

        const products = response.data.data.products.edges.map(edge => edge.node);

        if (products.length === 0) {
            return res.status(404).json({ message: 'No se encontraron productos que coincidan con la búsqueda.' });
        }

        return res.status(200).json(products);
    } catch (error) {
        console.error('Error al realizar la búsqueda de productos via GraphQL:', error?.response?.data || error.message || error);
        return res.status(500).json({ message: 'Error al realizar la búsqueda de productos', error: error.message });
    }
};

module.exports = { searchProducts };
