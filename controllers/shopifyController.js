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

// Crear orden borrador desde POS
const createDraftOrder = async (req, res) => {
  const { productos, metodoPago, vendedor, total } = req.body;

  try {
    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ message: 'El array de productos es obligatorio y no puede estar vacío.' });
    }
    if (!metodoPago || !vendedor || !total) {
      return res.status(400).json({ message: 'Faltan datos obligatorios: metodoPago, vendedor o total.' });
    }

    const line_items = productos.map(p => {
      if (!p.variant_id) {
        throw new Error(`❌ Producto sin variant_id válido: ${p.title}`);
      }

      return {
        variant_id: Number(p.variant_id),
        quantity: p.cantidad || 1,
        price: p.precio,
        title: p.title
      };
    });

    const draftOrderData = {
      draft_order: {
        line_items,
        note: `Venta POS - Vendedor: ${vendedor}`,
        tags: 'POS',
        note_attributes: [
          { name: 'Vendedor', value: vendedor },
          { name: 'Método de pago', value: metodoPago },
          { name: 'Total', value: total }
        ]
      }
    };

    console.log('DraftOrderData:', JSON.stringify(draftOrderData, null, 2));

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

    // 🔧 Agregado: Generamos la URL de control para el staff
    const staff_control_url = `https://tokkenback2.onrender.com/api/shopify/staff/order/${draftOrder.id}`;

    // 🔧 Agregado: devolvemos también la URL de control al frontend
    res.status(201).json({
      draftOrderId: draftOrder.id,
      invoice_url: draftOrder.invoice_url,
      staff_control_url, // 🔧 agregado
      draftOrder
    });

  } catch (error) {
    console.error('❌ Error al crear draft order:', error.response?.data || error.message || error);
    res.status(500).json({
      message: 'Error al crear la orden borrador',
      error: error.response?.data || error.message || error
    });
  }
};

// Confirmar o cancelar la orden borrador
const confirmOrder = async (req, res) => {
  const { draftOrderId, action } = req.body;
  console.log('req.body:', req.body);  // <- esto ayuda a debuggear

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

// Vista HTML para staff
const getStaffOrderView = async (req, res) => {
  const { draftOrderId } = req.params;
  const html = `
    <html>
      <head>
        <title>Confirmar Orden</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
          button { padding: 12px 24px; margin: 10px; font-size: 16px; border-radius: 8px; border: none; cursor: pointer; }
          .confirmar { background-color: #4caf50; color: white; }
          .cancelar { background-color: #f44336; color: white; }
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

// Buscar productos
const searchProducts = async (req, res) => {
  const { query } = req.query;
  if (!query || query.trim() === "") {
    return res.status(400).json({ message: 'La consulta de búsqueda no puede estar vacía.' });
  }
  try {
    const response = await axios({
      method: 'get',
      url: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/products.json`,
      params: { limit: 250 },
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      },
    });
    const allProducts = response.data.products;
    const filtered = allProducts.filter(p =>
      p.title.toLowerCase().includes(query.toLowerCase())
    );
    if (filtered.length === 0) {
      return res.status(404).json({ message: 'No se encontraron productos que coincidan con la búsqueda.' });
    }
    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error('Error al buscar productos:', error.message || error.response?.data || error);
    res.status(500).json({ message: 'Error al realizar la búsqueda de productos', error: error.message });
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
