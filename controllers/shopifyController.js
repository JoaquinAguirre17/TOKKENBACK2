const axios = require('axios');

// Obtener todos los productos
const getProducts = async (req, res) => {
  try {
    const response = await axios({
      method: 'get',
      url: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/products.json?limit=250`,
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener productos', error });
  }
};

// Obtener los detalles de un producto
const getProductDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const response = await axios({
      method: 'get',
      url: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/products/${id}.json`,
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener los detalles del producto', error });
  }
};

// Mostrar vista HTML con botones para el staff
const getStaffOrderView = async (req, res) => {
  const { draftOrderId } = req.params;

  const html = `
    <html>
      <head>
        <title>Confirmar Orden</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            margin-top: 100px;
          }
          button {
            padding: 12px 24px;
            margin: 10px;
            font-size: 16px;
            border-radius: 8px;
            border: none;
            cursor: pointer;
          }
          .confirmar {
            background-color: #4caf50;
            color: white;
          }
          .cancelar {
            background-color: #f44336;
            color: white;
          }
        </style>
      </head>
      <body>
        <h2>¿Se concretó la venta?</h2>
        <form method="POST" action="/api/shopify/confirm-order">
          <input type="hidden" name="draftOrderId" value="${draftOrderId}" />
          <button class="confirmar" name="action" value="vendido">✅ Se vendió</button>
          <button class="cancelar" name="action" value="no-vendido">❌ No se vendió</button>
        </form>
      </body>
    </html>
  `;

  res.send(html);
};

// Confirmar o cancelar la orden
const confirmOrder = async (req, res) => {
  const { draftOrderId, action } = req.body;

  try {
    if (action === 'vendido') {
      await axios.put(
        `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders/${draftOrderId}/complete.json`,
        {},
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          },
        }
      );

      return res.status(200).json({ message: 'Orden confirmada y completada' });
    } else if (action === 'no-vendido') {
      await axios.delete(
        `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders/${draftOrderId}.json`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          },
        }
      );

      return res.status(200).json({ message: 'Orden cancelada' });
    } else {
      return res.status(400).json({ message: 'Acción inválida' });
    }

  } catch (error) {
    console.error('Error al confirmar la orden:', error.response?.data || error);
    res.status(500).json({ message: 'Error al confirmar la orden', error });
  }
};

// Crear orden borrador
const createDraftOrder = async (req, res) => {
  const { products, customerNote } = req.body;

  try {
    // Validar y construir los line_items
    const line_items = products.map(p => {
      const variantId = p?.variants?.[0]?.id;
      if (!variantId) {
        throw new Error(`❌ Producto sin variant_id válido: ${p.title}`);
      }

      return {
        title: p.title,
        variant_id: variantId,
        quantity: p.count
      };
    });

    const draftOrderData = {
      draft_order: {
        line_items,
        note: customerNote || 'Pedido desde WhatsApp',
        tags: 'whatsapp'
      }
    };

    // 🔍 Log para verificar lo que se está enviando a Shopify
    console.log('📦 Enviando draft order a Shopify:', JSON.stringify(draftOrderData, null, 2));

    // Petición a la API de Shopify
    const response = await axios.post(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders.json`,
      draftOrderData,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    const draftOrder = response.data.draft_order;

    const controlPanelLink = `https://tokkencba.com/orden-control/${draftOrder.id}`;

    res.status(201).json({
      draftOrderId: draftOrder.id,
      invoice_url: draftOrder.invoice_url,
      staff_control_url: controlPanelLink
    });

  } catch (error) {
    console.error('❌ Error al crear draft order:');
    console.error('👉 Detalles:', error.message || error.response?.data || error);
    res.status(500).json({ message: 'Error al crear la orden borrador', error });
  }
};

const searchProducts = async (req, res) => {
  const { query } = req.query;  // Obtener la búsqueda desde el query string
  if (!query || query.trim() === "") {
    return res.status(400).json({ message: 'La consulta de búsqueda no puede estar vacía.' });
  }

  try {
    // Llamada a la API de Shopify para buscar productos usando el parámetro query
    const response = await axios({
      method: 'get',
      url: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/products.json`,
      params: {
        title: query,  // Filtra productos por título
        limit: 10,      // Limita la cantidad de resultados
      },
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
    });

    // Responder con los productos filtrados
    res.status(200).json(response.data.products);
  } catch (error) {
    console.error('Error al buscar productos:', error);
    res.status(500).json({ message: 'Error al realizar la búsqueda de productos', error });
  }
};


module.exports = {
  getProducts,
  getProductDetails,
  createDraftOrder,
  confirmOrder,
  getStaffOrderView,
  searchProducts, 
};
