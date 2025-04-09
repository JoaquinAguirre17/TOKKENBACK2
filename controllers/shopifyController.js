const axios = require('axios');

// Función para obtener todos los productos
const getProducts = async (req, res) => {
  try {
    const response = await axios({
      method: 'get',
      url: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/products.json?limit=250`, // Máximo permitido por la API
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

// Función para obtener los detalles de un producto específico
const getProductDetails = async (req, res) => {
  const { id } = req.params; // Obtenemos el id del producto desde los parámetros de la URL
  try {
    const response = await axios({
      method: 'get',
      url: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/products/${id}.json`,
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
    });

    res.status(200).json(response.data); // Devolvemos los detalles del producto
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener los detalles del producto', error });
  }
};
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
const confirmOrder = async (req, res) => {
  const { draftOrderId, action } = req.body;

  try {
    if (action === 'vendido') {
      // Marcar la orden como completada
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
      // Cancelar o dejarla sin pagar
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
const createDraftOrder = async (req, res) => {
  const { products, customerNote } = req.body;

  try {
    const line_items = products.map(p => ({
      title: p.title,
      variant_id: p.variants[0].id,
      quantity: p.count
    }));

    const draftOrderData = {
      draft_order: {
        line_items,
        note: customerNote || 'Pedido desde WhatsApp',
        tags: 'whatsapp'
      }
    };

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

    // Generamos un link personalizado para el staff
    const controlPanelLink = `${process.env.FRONTEND_URL}/orden-control/${draftOrder.id}`;

    res.status(201).json({
      draftOrderId: draftOrder.id,
      invoice_url: draftOrder.invoice_url,
      staff_control_url: controlPanelLink
    });

  } catch (error) {
    console.error('Error al crear draft order:', error.response?.data || error);
    res.status(500).json({ message: 'Error al crear la orden borrador', error });
  }
};

module.exports = {
  getProducts,
  getProductDetails,
  createDraftOrder,
  confirmOrder,
  getStaffOrderView
};
