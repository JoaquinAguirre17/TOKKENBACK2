// controllers/mongoController.js
import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import Product from '../Models/Product.js';
import Order from '../Models/Order.js';       // <- ver modelo al final si no lo tenés
import Counter from '../Models/Counter.js';   // <- opcional (para numeración legible)

// =============== helpers ===============

// Genera número de orden legible (TOK-000123). Si no tenés Counter, podemos fallback a timestamp.
async function nextOrderNumber(prefix = 'TOK') {
  if (!Counter) {
    const ts = dayjs().format('YYYYMMDDHHmmss');
    return `${prefix}-${ts}`;
  }
  const doc = await Counter.findOneAndUpdate(
    { key: prefix },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  const padded = String(doc.seq).padStart(6, '0');
  return `${prefix}-${padded}`;
}

// Redondear hacia abajo a múltiplos de 100 (tal como tenías en Shopify)
const redondear100Abajo = (valor) => Math.floor(Number(valor || 0) / 100) * 100;

// Lee JSON “seguro”
const toNumber = (v, d = 0) => (isNaN(Number(v)) ? d : Number(v));

// Detección de canal: si vienen tags e incluyen 'local' -> 'pos' (local), sino 'online'
function resolveChannel(tags) {
  if (!tags) return 'online';
  const asStr = Array.isArray(tags) ? tags.join(',') : String(tags);
  return asStr.toLowerCase().includes('local') ? 'pos' : 'online';
}

// =============== controladores ===============

// Obtener todos los productos (Mongo)
export const getProducts = async (req, res) => {
  try {
    const items = await Product.find().lean();
    res.status(200).json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener productos', error: error.message || error });
  }
};

// Obtener detalles de un producto por ID (Mongo)
export const getProductDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const item = await Product.findById(id).lean();
    if (!item) return res.status(404).json({ message: 'Producto no encontrado' });
    res.status(200).json(item);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener los detalles del producto', error: error.message || error });
  }
};

// Crear orden (reemplazo de createOrder Shopify)
// Acepta payloads “viejos” (variant_id, precio, cantidad) y nuevos (productId, price, qty)
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      productos,           // array requerido
      metodoPago,          // string
      vendedor,            // string
      total,               // total declarado por el front (se valida)
      tags = [],           // para detectar local/online
      fecha,               // opcional
      descuentoPorcentaje, // opcional (num)
      customer,            // opcional: { name, email, phone, docId, shippingAddress }
      notes                // opcional
    } = req.body;

    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ message: 'El array de productos es obligatorio y no puede estar vacío.' });
    }
    if (!metodoPago || !vendedor || !total) {
      return res.status(400).json({ message: 'Faltan datos obligatorios: metodoPago, vendedor o total.' });
    }

    const porcentaje = descuentoPorcentaje && !isNaN(descuentoPorcentaje) ? Number(descuentoPorcentaje) : 0;

    // Normalizar items (aceptamos ambos formatos de payload)
    //  - Formato viejo: { variant_id, precio, cantidad, title }
    //  - Formato nuevo: { productId, price, qty, title, sku, variant: { sku, color } }
    const ids = productos
      .map(p => p.productId)
      .filter(Boolean);

    const productosDb = ids.length
      ? await Product.find({ _id: { $in: ids } }).lean()
      : [];

    const mapProd = new Map(productosDb.map(p => [String(p._id), p]));

    const normItems = productos.map((p) => {
      // Si vino productId buscamos en Mongo; si no, usamos lo que vino en el payload
      const pdb = p.productId ? mapProd.get(String(p.productId)) : null;

      // precio original (del payload o de la DB)
      const precioOriginal = toNumber(p.precio ?? p.price ?? pdb?.pricing?.sale ?? pdb?.pricing?.list, 0);
      const precioRedondeado = redondear100Abajo(precioOriginal);

      const qty = toNumber(p.cantidad ?? p.quantity ?? p.qty, 1);

      // descuento fijo (en pesos) redondeado hacia abajo
      const descuentoValor = porcentaje > 0 ? redondear100Abajo(precioOriginal * (porcentaje / 100)) : 0;

      // elegimos precio final unitario restando el descuento fijo
      const unit = Math.max(0, precioRedondeado - descuentoValor);

      // SKU/Variant
      const variantSku = p?.variant?.sku || p?.sku || pdb?.variants?.[0]?.sku || null;
      const color = p?.variant?.color || pdb?.variants?.[0]?.options?.color || null;

      return {
        productId: p.productId || pdb?._id,       // si no llega productId, intentamos con pdb
        title: p.title || pdb?.title || '',
        sku: variantSku || pdb?.sku || null,
        price: unit,
        qty,
        variant: variantSku || color ? { sku: variantSku, color } : undefined,
        subtotal: unit * qty
      };
    });

    // Validar products
    if (normItems.some(i => !i.productId)) {
      throw new Error('Uno o más items no tienen productId válido.');
    }

    // Totales del server
    const itemsSum = normItems.reduce((a, b) => a + b.subtotal, 0);
    // shipping/tax/discount pueden venir del front, si no, 0
    const shipping = toNumber(req.body.shipping ?? 0);
    const tax      = toNumber(req.body.tax ?? 0);
    const discount = toNumber(req.body.discount ?? 0);

    const grand = itemsSum + shipping + tax - discount;

    if (Math.round(grand) !== Math.round(toNumber(total))) {
      throw new Error('Total inconsistente (no coincide con el calculado en servidor).');
    }

    const channel = resolveChannel(tags);
    const orderNumber = await nextOrderNumber('TOK');

    // Crear orden
    const [order] = await Order.create([{
      orderNumber,
      channel,                            // 'pos' si tags incluye 'local', sino 'online'
      status: 'created',
      items: normItems,
      totals: {
        items: itemsSum,
        discount,
        shipping,
        tax,
        grand,
        currency: 'ARS'
      },
      customer: customer || {},
      payment: {
        method: String(metodoPago || 'other'),
        status: 'pending',
        amount: grand
      },
      notes: notes || `Venta - Vendedor: ${vendedor} - Método de pago: ${metodoPago} - Total: ${grand} - Fecha: ${fecha || new Date().toISOString()}`,
      createdBy: vendedor || null
    }], { session });

    // Descontar stock (si tu política es descontar al crear)
    for (const it of normItems) {
      await Product.updateOne(
        { _id: it.productId, ...(it.variant?.sku ? { 'variants.sku': it.variant.sku } : {}) },
        it.variant?.sku
          ? { $inc: { 'variants.$.stock': -it.qty } }
          : { $inc: { 'variants.0.stock': -it.qty } },
        { session }
      );
    }

    await session.commitTransaction();

    // Si es venta local (antes completabas el borrador), acá marcamos "paid" directo
    if (channel === 'pos') {
      order.status = 'paid';
      order.payment.status = 'approved';
      await order.save();
    }

    return res.status(201).json({
      message: channel === 'pos' ? 'Venta local registrada.' : 'Orden creada (venta web)',
      order
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error al crear orden:', error);
    res.status(500).json({
      message: 'Error al crear la orden',
      error: error.message || error.toString()
    });
  } finally {
    session.endSession();
  }
};

// Confirmar o cancelar orden (reemplazo de confirmOrder Shopify)
// action: 'vendido' -> status 'paid' ; 'no-vendido' -> 'cancelled'
export const confirmOrder = async (req, res) => {
  const { draftOrderId, action } = req.body;

  if (!draftOrderId || !action) {
    return res.status(400).json({ message: 'Faltan draftOrderId o action' });
  }

  try {
    const order = await Order.findById(draftOrderId);
    if (!order) return res.status(404).json({ message: 'Orden no encontrada' });

    if (action === 'vendido') {
      order.status = 'paid';
      order.payment.status = 'approved';
      order.payment.paidAt = new Date();
      await order.save();
      return res.status(200).json({ message: 'Orden confirmada (paid).', order });
    }

    if (action === 'no-vendido') {
      order.status = 'cancelled';
      await order.save();
      return res.status(200).json({ message: 'Orden cancelada.', order });
    }

    return res.status(400).json({ message: 'Acción inválida' });
  } catch (error) {
    console.error('Error al confirmar la orden:', error);
    res.status(500).json({ message: 'Error al confirmar la orden', error: error.message || error });
  }
};

// Buscar productos por query (Mongo)
export const searchProducts = async (req, res) => {
  const { query } = req.query;
  if (!query || query.trim() === '') {
    return res.status(400).json({ message: 'La consulta de búsqueda no puede estar vacía.' });
  }
  try {
    const regex = new RegExp(query.trim(), 'i');
    const items = await Product.find({
      $or: [{ title: regex }, { sku: regex }, { brand: regex }]
    })
      .limit(10)
      .lean();

    if (!items.length) {
      return res.status(404).json({ message: 'No se encontraron productos que coincidan con la búsqueda.' });
    }
    return res.status(200).json(items);
  } catch (error) {
    console.error('Error al buscar productos:', error);
    res.status(500).json({ message: 'Error al realizar la búsqueda de productos', error: error.message });
  }
};

// Ventas para cierre de caja (Mongo)
// Mantengo output similar al viejo: { ventas: [{ id, nombre, monto, comision, vendedor, medioPago, hora }] }
export const obtenerVentasCierreCaja = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta el parámetro fecha' });

    const inicio = dayjs(fecha).startOf('day').toDate();
    const fin    = dayjs(fecha).endOf('day').toDate();

    // Tomamos solo POS/local y estados "paid" o "fulfilled"
    const orders = await Order.find({
      channel: 'pos',
      status: { $in: ['paid', 'fulfilled'] },
      createdAt: { $gte: inicio, $lte: fin }
    }).lean();

    const ventas = orders.map(o => {
      const monto = Number(o?.totals?.grand || 0);
      const comision = monto * 0.02; // misma comisión que usabas
      const vendedor = o?.createdBy || o?.customer?.name || 'No especificado';
      const medioPago = o?.payment?.method || 'No especificado';
      return {
        id: String(o._id),
        nombre: o.orderNumber || 'Sin número',
        monto,
        comision,
        vendedor,
        medioPago,
        hora: dayjs(o.createdAt).format('HH:mm')
      };
    });

    return res.status(200).json({ ventas });
  } catch (error) {
    console.error('Error al obtener ventas para cierre de caja:', error);
    res.status(500).json({ error: 'Error al obtener ventas', message: error.message || error.toString() });
  }
};

// Exportar ventas a Excel (igual firma: recibe req.body.ventas)
export const exportarVentasExcel = async (req, res) => {
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
      { header: 'Comisión (2%)', key: 'comision', width: 18 },
      { header: 'Vendedor', key: 'vendedor', width: 20 },
      { header: 'Método de Pago', key: 'metodoPago', width: 20 },
      { header: 'Fecha/Hora', key: 'fecha', width: 22 },
    ];

    ventas.forEach(v => {
      sheet.addRow({
        id: v.id,
        nombre: v.nombre,
        monto: v.monto,
        comision: v.comision,
        vendedor: v.vendedor,
        metodoPago: v.metodoPago || v.medioPago,
        fecha: v.fecha || v.hora || ''
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
