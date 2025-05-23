const axios = require('axios');
const dayjs = require('dayjs');
const ExcelJS = require('exceljs');
// IMPORTANTE: Necesitas configurar e inicializar el cliente de Shopify Admin API.
// Aquí asumo que tienes una instancia llamada `shopify` que maneja esa conexión
// Por ejemplo con @shopify/shopify-api o un cliente custom, esto debe estar definido antes o importado.
const shopify = require('./shopifyClient'); // <-- Ajusta esto según tu configuración real

const HEADERS = {
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
  'Content-Type': 'application/json',
};

// Obtener todos los productos
const getProducts = async (req, res) => {
  try {
    const response = await axios.get(`${process.env.SHOPIFY_STORE_URL}/products.json?limit=250`, {
      headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN },
    });
    res.status(200).json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener productos', error: error.message || error });
  }
};

// Obtener detalles de un producto por ID
const getProductDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const response = await axios.get(`${SHOPIFY_STORE_URL}/products/${id}.json`, {
      headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN },
    });
    res.status(200).json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener los detalles del producto', error: error.message || error });
  }
};

// Crear orden (draft order y completar si es venta local)
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
        throw new Error(`Producto sin variant_id válido: ${p.title}`);
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

    // Crear la orden borrador
    const draftOrderResponse = await axios.post(`${SHOPIFY_STORE_URL}/draft_orders.json`, draftOrderData, {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    const draftOrder = draftOrderResponse.data.draft_order;
    const isVentaLocal = Array.isArray(tags) ? tags.includes('local') : tags.toString().includes('local');

    // Si es venta local, completar la orden automáticamente
    if (isVentaLocal) {
      const completeResponse = await axios.put(
        `${SHOPIFY_STORE_URL}/draft_orders/${draftOrder.id}/complete.json`,
        {},
        {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );

      return res.status(201).json({
        message: "Venta local registrada y completada.",
        order: completeResponse.data.order
      });
    }

    // Venta web: devolver la draft order
    const staff_control_url = `https://tokkencba.com/orden-control/${draftOrder.id}`;

    return res.status(201).json({
      message: "Orden borrador creada (venta web)",
      draftOrderId: draftOrder.id,
      invoice_url: draftOrder.invoice_url,
      staff_control_url,
      draftOrder
    });
  } catch (error) {
    console.error('Error al crear orden:', error.response?.data || error.message || error);
    res.status(500).json({
      message: 'Error al crear la orden',
      error: error.response?.data || error.message || error.toString()
    });
  }
};

// Confirmar o cancelar orden
const confirmOrder = async (req, res) => {
  const { draftOrderId, action } = req.body;

  if (!draftOrderId || !action) {
    return res.status(400).json({ message: 'Faltan draftOrderId o action' });
  }

  try {
    if (action === 'vendido') {
      await axios.put(`${SHOPIFY_STORE_URL}/draft_orders/${draftOrderId}/complete.json`, {}, {
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN },
      });
      return res.status(200).json({ message: 'Orden confirmada y completada' });
    } else if (action === 'no-vendido') {
      await axios.delete(`${SHOPIFY_STORE_URL}/draft_orders/${draftOrderId}.json`, {
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN },
      });
      return res.status(200).json({ message: 'Orden cancelada' });
    } else {
      return res.status(400).json({ message: 'Acción inválida' });
    }
  } catch (error) {
    console.error('Error al confirmar la orden:', error.response?.data || error.message || error);
    res.status(500).json({ message: 'Error al confirmar la orden', error: error.response?.data || error.message || error });
  }
};

// Buscar productos por query en el título
const searchProducts = async (req, res) => {
  const { query } = req.query;
  if (!query || query.trim() === "") {
    return res.status(400).json({ message: 'La consulta de búsqueda no puede estar vacía.' });
  }
  try {
    const response = await axios.get(`${SHOPIFY_STORE_URL}/products.json`, {
      headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN },
      params: { limit: 250 },
    });
    const allProducts = response.data.products;
    const filtered = allProducts.filter(p => p.title.toLowerCase().includes(query.toLowerCase()));
    if (filtered.length === 0) {
      return res.status(404).json({ message: 'No se encontraron productos que coincidan con la búsqueda.' });
    }
    return res.status(200).json(filtered.slice(0, 10));
  } catch (error) {
    console.error('Error al buscar productos:', error.message || error.response?.data || error);
    res.status(500).json({ message: 'Error al realizar la búsqueda de productos', error: error.message });
  }
};

function extraerDatoDesdeNote(note, campo) {
  const match = new RegExp(`${campo}\\s*:\\s*([^;\\n]+)`, 'i').exec(note || '');
  return match ? match[1].trim() : 'N/A';
}

// Obtener ventas para cierre de caja (GraphQL)
const obtenerVentasCierreCaja = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta el parámetro fecha' });

    const fechaInicio = dayjs(fecha).startOf('day');
    const fechaFin = dayjs(fecha).add(1, 'day').startOf('day');

    const query = `
      query GetOrders {
  orders(first: 10, query: "tag:'local'") {
    edges {
      node {
        id
        name
        tags
        noteAttributes {
          name
          value
        }
        lineItems(first: 5) {
          edges {
            node {
              title
              quantity
              variant {
                id
                price
              }
            }
          }
        }
        createdAt
      }
    }
  }
}
    `;
    const variables = {
      query: "tag:local",
    };

    const response = await axios.post(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/graphql.json`,
      { query, variables },
      { headers: HEADERS }
    );

    if (response.data.errors) {
      console.error('Errores GraphQL:', response.data.errors);
      return res.status(500).json({ error: 'Error en consulta GraphQL', details: response.data.errors });
    }

    if (!response.data?.data?.orders) {
      return res.status(500).json({ error: 'Datos inválidos recibidos de Shopify' });
    }

    const orders = response.data.data.orders.edges.map(edge => edge.node);

    // Filtrar por hora en backend
    const ventas = orders
      .filter(order => {
        const hora = dayjs(order.createdAt);
        return hora.isAfter(fechaInicio.hour(8).minute(59)) && hora.isBefore(fechaFin.hour(21));
      })
      .map(order => {
        const monto = parseFloat(order.totalPriceSet.shopMoney.amount);
        const comision = monto * 0.02;

        // Extraemos vendedor y método de pago desde la nota (opcional)
        const vendedor = extraerDatoDesdeNote(order.note, 'vendedor');
        const medioPago = extraerDatoDesdeNote(order.note, 'medio_pago');

        return {
          id: order.id,
          orden: order.name,
          fecha: dayjs(order.createdAt).format('YYYY-MM-DD HH:mm'),
          hora: dayjs(order.createdAt).format('HH:mm'),
          vendedor: vendedor || 'N/A',
          medioPago: medioPago || 'N/A',
          monto,
          comision: comision.toFixed(2),
        };
      });

    res.json({ ventas });
  } catch (error) {
    console.error('Error al obtener ventas para cierre de caja:', error);
    if (error.response) {
      console.error('Respuesta de error:', error.response.data);
    }
    res.status(500).json({ error: 'Error al obtener ventas' });
  }
};

// Función auxiliar para extraer datos desde una nota (formato "clave: valor")
function extraerDatoDesdeNote(note, clave) {
  if (!note) return null;
  const lineas = note.split('\n');
  const linea = lineas.find(l => l.toLowerCase().startsWith(clave.toLowerCase()));
  if (!linea) return null;
  return linea.split(':')[1]?.trim() || null;
}



// Generar y descargar Excel para cierre de caja
const cierreCaja = async (req, res) => {
  try {
    const fecha = req.query.fecha;
    if (!fecha) {
      return res.status(400).json({ error: 'Falta el parámetro fecha' });
    }

    const fechaInicio = new Date(`${fecha}T00:00:00Z`);
    const fechaFin = new Date(`${fecha}T23:59:59Z`);

    if (isNaN(fechaInicio) || isNaN(fechaFin)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }

    const params = {
      status: 'any',
      limit: 250,
      created_at_min: fechaInicio.toISOString(),
      created_at_max: fechaFin.toISOString(),
      financial_status: 'paid',
      fields: 'id,name,created_at,total_price,tags,note_attributes,line_items'
    };

    console.log('Parámetros para shopify.order.list:', params);

    const orders = await shopify.order.list(params);

    console.log('Órdenes recibidas:', orders.length);

    if (!orders || orders.length === 0) {
      return res.json({ message: 'No hay órdenes para la fecha indicada', orders: [] });
    }

    const ordersLocal = orders.filter(order => order.tags && order.tags.includes('local'));

    if (ordersLocal.length === 0) {
      return res.json({ message: 'No hay órdenes con tag "local" para la fecha indicada', orders: [] });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ventas Cierre Caja');

    worksheet.columns = [
      { header: 'Orden', key: 'orden', width: 20 },
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'Vendedor', key: 'vendedor', width: 20 },
      { header: 'Medio de pago', key: 'medio_pago', width: 20 },
      { header: 'Monto', key: 'monto', width: 15 },
      { header: 'Comisión (2%)', key: 'comision', width: 15 },
      { header: 'Hora', key: 'hora', width: 10 },
    ];

    ordersLocal.forEach(order => {
      const vendedorAttr = order.note_attributes?.find(attr => attr.name.toLowerCase() === 'vendedor');
      const medioPagoAttr = order.note_attributes?.find(attr =>
        ['método de pago', 'medio_pago'].includes(attr.name.toLowerCase())
      );
      const fechaOrder = dayjs(order.created_at).format('YYYY-MM-DD HH:mm');
      const horaOrder = dayjs(order.created_at).format('HH:mm');
      const monto = parseFloat(order.total_price);
      const comision = monto * 0.02;

      worksheet.addRow({
        orden: order.name,
        fecha: fechaOrder,
        vendedor: vendedorAttr?.value || 'N/A',
        medio_pago: medioPagoAttr?.value || 'N/A',
        monto: monto.toFixed(2),
        comision: comision.toFixed(2),
        hora: horaOrder
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cierre_caja_${fecha}.xlsx`);
    res.send(buffer);

  } catch (error) {
    console.error('Error en cierre-caja:', error);
    res.status(500).json({ error: 'Error interno en cierre caja' });
  }
};


module.exports = {
  getProducts,
  getProductDetails,
  createOrder,
  confirmOrder,
  searchProducts,
  obtenerVentasCierreCaja,
  cierreCaja,
};
