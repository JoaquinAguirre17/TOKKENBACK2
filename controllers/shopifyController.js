const axios = require('axios');
const dayjs = require('dayjs');
const ExcelJS = require('exceljs');

const SHOPIFY_STORE_URL = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01`;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const HEADERS = {
  'X-Shopify-Access-Token': ACCESS_TOKEN,
  'Content-Type': 'application/json',
};

// Obtener todos los productos
const getProducts = async (req, res) => {
  try {
    const response = await axios.get(`${SHOPIFY_STORE_URL}/products.json?limit=250`, {
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

// Obtener ventas para cierre de caja (GraphQL)
const obtenerVentasCierreCaja = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta el parámetro fecha' });

    const fechaInicio = dayjs(`${fecha}T09:00:00Z`).toISOString();
    const fechaFin = dayjs(`${fecha}T21:00:00Z`).toISOString();

    const query = `
      query GetOrders($query: String!) {
        orders(first: 100, query: $query) {
          edges {
            node {
              id
              name
              createdAt
              totalPriceSet { shopMoney { amount } }
              tags
              noteAttributes { name value }
              financialStatus
            }
          }
        }
      }
    `;

    const variables = {
      query: `tag:local financial_status:paid created_at:>=${fechaInicio} created_at:<=${fechaFin}`,
    };

    const response = await axios.post(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/graphql.json`,
      { query, variables },
      { headers: HEADERS }
    );

    const orders = response.data.data.orders.edges.map(edge => edge.node);

    const ventas = orders.map(order => {
      const vendedorAttr = order.noteAttributes.find(attr => attr.name.toLowerCase() === 'vendedor');
      const medioAttr = order.noteAttributes.find(attr => attr.name.toLowerCase() === 'método de pago' || attr.name.toLowerCase() === 'medio_pago');

      const monto = parseFloat(order.totalPriceSet.shopMoney.amount);
      const comision = monto * 0.02;

      return {
        id: order.id,
        orden: order.name,
        fecha: dayjs(order.createdAt).format('YYYY-MM-DD HH:mm'),
        vendedor: vendedorAttr?.value || 'N/A',
        medioPago: medioAttr?.value || 'N/A',
        monto,
        comision: comision.toFixed(2),
        hora: dayjs(order.createdAt).format('HH:mm'),
      };
    });

    res.json({ ventas });
  } catch (error) {
    console.error('Error al obtener ventas para cierre de caja:', error);
    res.status(500).json({ error: 'Error al obtener ventas' });
  }
};

// Generar y descargar Excel para cierre de caja
const cierreCaja = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta el parámetro fecha' });

    const fechaInicio = dayjs(`${fecha}T09:00:00Z`).toISOString();
    const fechaFin = dayjs(`${fecha}T21:00:00Z`).toISOString();

    const query = `
      query GetOrders($query: String!) {
        orders(first: 100, query: $query) {
          edges {
            node {
              name
              createdAt
              totalPriceSet { shopMoney { amount } }
              tags
              noteAttributes { name value }
              financialStatus
            }
          }
        }
      }
    `;

    const variables = {
      query: `tag:local financial_status:paid created_at:>=${fechaInicio} created_at:<=${fechaFin}`,
    };

    const response = await axios.post(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2025-01/graphql.json`,
      { query, variables },
      { headers: HEADERS }
    );

    const orders = response.data.data.orders.edges.map(edge => edge.node);

    const ventas = orders.map(order => {
      const vendedorAttr = order.noteAttributes.find(attr => attr.name.toLowerCase() === 'vendedor');
      const medioAttr = order.noteAttributes.find(attr => attr.name.toLowerCase() === 'método de pago' || attr.name.toLowerCase() === 'medio_pago');

      const monto = parseFloat(order.totalPriceSet.shopMoney.amount);
      const comision = monto * 0.02;

      return {
        orden: order.name,
        fecha: dayjs(order.createdAt).format('YYYY-MM-DD'),
        hora: dayjs(order.createdAt).format('HH:mm'),
        vendedor: vendedorAttr?.value || 'N/A',
        medioPago: medioAttr?.value || 'N/A',
        monto,
        comision: comision.toFixed(2),
      };
    });

    // Crear Excel con ExcelJS
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cierre de Caja');

    sheet.columns = [
      { header: 'Orden', key: 'orden', width: 20 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Hora', key: 'hora', width: 10 },
      { header: 'Vendedor', key: 'vendedor', width: 20 },
      { header: 'Medio de Pago', key: 'medioPago', width: 20 },
      { header: 'Monto', key: 'monto', width: 15 },
      { header: 'Comisión (2%)', key: 'comision', width: 15 },
    ];

    ventas.forEach(v => {
      sheet.addRow(v);
    });

    // Set header bold
    sheet.getRow(1).font = { bold: true };

    // Generar buffer Excel
    const buffer = await workbook.xlsx.writeBuffer();

    // Enviar archivo
    res.setHeader('Content-Disposition', `attachment; filename="cierre_caja_${fecha}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Error en cierre de caja:', error);
    res.status(500).json({ error: 'Error al generar el reporte de cierre de caja' });
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
