// controllers/shopifyController.js
const axios = require('axios');
const dayjs = require('dayjs');
const ExcelJS = require('exceljs');

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL; // Ej: 'mi-tienda.myshopify.com'
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_STORE_URL || !ACCESS_TOKEN) {
  throw new Error("Faltan las variables de entorno SHOPIFY_STORE_URL o SHOPIFY_ACCESS_TOKEN");
}

const HEADERS = {
  'X-Shopify-Access-Token': ACCESS_TOKEN,
  'Content-Type': 'application/json',
};

// Obtener todos los productos (REST)
const getProducts = async (req, res) => {
  try {
    const response = await axios.get(`https://${SHOPIFY_STORE_URL}/admin/api/2025-01/products.json?limit=250`, {
      headers: HEADERS,
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
    const response = await axios.get(`https://${SHOPIFY_STORE_URL}/admin/api/2025-01/products/${id}.json`, {
      headers: HEADERS,
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
        note: `Venta - Vendedor: ${vendedor} - Método de pago: ${metodoPago} - Total: ${total} - Fecha: ${fecha || new Date().toISOString()}`,
        tags: Array.isArray(tags) ? tags.join(', ') : tags,
      }
    };

    // Crear la orden borrador
    const draftOrderResponse = await axios.post(`https://${SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders.json`, draftOrderData, {
      headers: HEADERS,
    });

    const draftOrder = draftOrderResponse.data.draft_order;
    const isVentaLocal = Array.isArray(tags) ? tags.includes('local') : tags.toString().includes('local');

    // Si es venta local, completar la orden automáticamente
    if (isVentaLocal) {
      const completeResponse = await axios.put(
        `https://${SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders/${draftOrder.id}/complete.json`,
        {},
        { headers: HEADERS }
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
      await axios.put(`https://${SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders/${draftOrderId}/complete.json`, {}, {
        headers: HEADERS,
      });
      return res.status(200).json({ message: 'Orden confirmada y completada' });
    } else if (action === 'no-vendido') {
      await axios.delete(`https://${SHOPIFY_STORE_URL}/admin/api/2025-01/draft_orders/${draftOrderId}.json`, {
        headers: HEADERS,
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
    const response = await axios.get(`https://${SHOPIFY_STORE_URL}/admin/api/2025-01/products.json`, {
      headers: HEADERS,
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
  // Extrae "campo: valor" dentro de note (insensible a mayúsculas)
  const regex = new RegExp(`${campo}\\s*:\\s*([^\\-]+)`, 'i');
  const match = regex.exec(note || '');
  return match ? match[1].trim() : null;
}

// Obtener ventas para cierre de caja (GraphQL)
const obtenerVentasCierreCaja = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta el parámetro fecha' });

    const fechaInicio = dayjs(fecha).hour(0).minute(0).second(0);
    const fechaFin = dayjs(fecha).hour(23).minute(5).second(9);

    const query = `
      query GetOrders {
        orders(first: 100, query: "tag:local status:closed created_at:>=${fechaInicio.toISOString()} created_at:<=${fechaFin.toISOString()}") {
          edges {
            node {
              id
              name
              tags
              note
              totalPriceSet {
                shopMoney {
                  amount
                }
              }
              createdAt
            }
          }
        }
      }
    `;

    const response = await axios.post(
      `https://${SHOPIFY_STORE_URL}/admin/api/2025-01/graphql.json`,
      { query },
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

    const ventas = orders.map(order => {
      const monto = parseFloat(order.totalPriceSet.shopMoney.amount);
      const comision = monto * 0.02;

      const vendedor = extraerDatoDesdeNote(order.note, 'Vendedor') || 'No especificado';
      const metodoPago = extraerDatoDesdeNote(order.note, 'Método de pago') || 'No especificado';

      return {
        id: order.id,
        nombre: order.name,
        monto,
        comision,
        vendedor,
        medioPago: metodoPago,
        hora: dayjs(order.createdAt).format('HH:mm'),
      };
    });

    // 👇 Aquí está el cambio importante
    res.status(200).json({ ventas });

  } catch (error) {
    console.error('Error al obtener ventas para cierre de caja:', error.response?.data || error.message || error);
    res.status(500).json({ error: 'Error al obtener ventas', message: error.message || error.toString() });
  }
};


// Exportar ventas a Excel
const exportarVentasExcel = async (req, res) => {
  const { ventas } = req.body;
  if (!ventas || !Array.isArray(ventas) || ventas.length === 0) {
    return res.status(400).json({ message: 'No hay ventas para exportar' });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ventas');

    sheet.columns = [
      { header: 'ID Orden', key: 'id', width: 30 },
      { header: 'Nombre', key: 'nombre', width: 20 },
      { header: 'Monto', key: 'monto', width: 15 },
      { header: 'Comisión (2%)', key: 'comision', width: 15 },
      { header: 'Vendedor', key: 'vendedor', width: 20 },
      { header: 'Método de Pago', key: 'metodoPago', width: 20 },
      { header: 'Fecha', key: 'fecha', width: 25 },
    ];

    ventas.forEach(v => {
      sheet.addRow({
        id: v.id,
        nombre: v.nombre,
        monto: v.monto,
        comision: v.comision,
        vendedor: v.vendedor,
        metodoPago: v.metodoPago,
        fecha: v.fecha,
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ventas_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error al exportar Excel:', error);
    res.status(500).json({ message: 'Error al exportar Excel', error: error.message || error });
  }
};

module.exports = {
  getProducts,
  getProductDetails,
  createOrder,
  confirmOrder,
  searchProducts,
  obtenerVentasCierreCaja,
  exportarVentasExcel,
};
