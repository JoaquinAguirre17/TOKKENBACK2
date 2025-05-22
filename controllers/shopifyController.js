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

const createOrder = async (req, res) => {
  const { productos, metodoPago, vendedor, total, tags = [], fecha } = req.body;

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
        quantity: p.cantidad || p.quantity || 1,
        price: p.precio || p.price,
        title: p.title
      };
    });

    const draftOrderData = {
      draft_order: {
        line_items,
        note: `Venta - Vendedor: ${vendedor}`,
        tags: Array.isArray(tags) ? tags.join(', ') : tags,
        note_attributes: [
          { name: 'Vendedor', value: vendedor },
          { name: 'Método de pago', value: metodoPago },
          { name: 'Total', value: total },
          { name: 'Fecha', value: fecha ? new Date(fecha).toLocaleString() : new Date().toLocaleString() }
        ]
      }
    };

    // 1. Crear la orden borrador
    const draftOrderResponse = await axios.post(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders.json`,
      draftOrderData,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    const draftOrder = draftOrderResponse.data.draft_order;
    const isVentaLocal = tags.includes('local');

    // 2. Si es venta local, completar la orden automáticamente
    if (isVentaLocal) {
      const completeResponse = await axios.put(
        `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders/${draftOrder.id}/complete.json`,
        {},
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );

      return res.status(201).json({
        message: "✅ Venta local registrada y completada.",
        order: completeResponse.data.order
      });
    }

    // 3. Si es venta web (ej: whatsapp), devolver la draft order
    const staff_control_url = `https://tokkencba.com/orden-control/${draftOrder.id}`;

    return res.status(201).json({
      message: "✅ Orden borrador creada (venta web)",
      draftOrderId: draftOrder.id,
      invoice_url: draftOrder.invoice_url,
      staff_control_url,
      draftOrder
    });

  } catch (error) {
    console.error('❌ Error al crear orden:', error.response?.data || error.message || error);
    res.status(500).json({
      message: 'Error al crear la orden',
      error: error.response?.data || error.message || error
    });
  }
};


const confirmOrder = async (req, res) => {
  console.log('REQ.BODY recibido:', req.body);  // Qué llega en el body

  const { draftOrderId, action } = req.body;

  if (!draftOrderId || !action) {
    console.log('Falta draftOrderId o action en la petición');
    return res.status(400).json({ message: 'Faltan draftOrderId o action' });
  }

  console.log('draftOrderId:', draftOrderId);
  console.log('action:', action);

  try {
    if (action === 'vendido') {
      console.log('Ejecutando confirmación de orden (vendido)');
      await axios.put(
        `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders/${draftOrderId}/complete.json`,
        {},
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          },
        }
      );
      console.log('Orden confirmada y completada correctamente');
      return res.status(200).json({ message: 'Orden confirmada y completada' });
    } else if (action === 'no-vendido') {
      console.log('Ejecutando cancelación de orden (no-vendido)');
      await axios.delete(
        `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders/${draftOrderId}.json`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          },
        }
      );
      console.log('Orden cancelada correctamente');
      return res.status(200).json({ message: 'Orden cancelada' });
    } else {
      console.log('Acción inválida recibida:', action);
      return res.status(400).json({ message: 'Acción inválida' });
    }
  } catch (error) {
    console.error('Error al confirmar la orden:', error.response?.data || error);
    res.status(500).json({ message: 'Error al confirmar la orden', error });
  }
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
  createOrder,
  confirmOrder,
  searchProducts,
};
