import dayjs from "dayjs";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";

import Product from "../Models/Product.js";
import Order from "../Models/Order.js";
import Counter from "../Models/Counter.js"; // opcional (numeración)
// import { generateSKU } from "../GeneradorSku/skuGenerator.js"; // si lo usás en otro lugar

// Mercado Pago (SDK moderno)



// -------------------------
// Helpers (implementaciones simples — adaptá a tu lógica real si hace falta)
// -------------------------

/**
 * Ajusta stock de los productos. Recibe la sesión de mongoose para operaciones transaccionales.
 * - items: [{ productId, qty }]
 * - delta: +1 o -1 multiplicador (por ejemplo -1 resta stock)
 */
export const adjustStock = async (session, items = [], multiplier = -1) => {
  if (!session) throw new Error("Se requiere sesión para adjustStock");
  if (!items || !items.length) return;

  for (const it of items) {
    if (!it.productId) continue;
    const qty = Number(it.qty || it.quantity || 1) * Math.abs(multiplier);
    await Product.updateOne(
      { _id: it.productId },
      { $inc: { "stock.available": -qty * Math.sign(multiplier) } },
      { session }
    );
  }
};

/**
 * Genera el siguiente número de orden. Implementación sencilla usando colección Counter.
 * name: prefijo (ej: 'WEB' o 'TOK')
 */
export const nextOrderNumber = async (name = "WEB") => {
  const doc = await Counter.findOneAndUpdate(
    { key: `order_${name}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = doc.seq || 1;
  const padded = String(seq).padStart(6, "0");
  return `${name}-${padded}`;
};

/**
 * Resolver canal a partir de tags u otra lógica.
 */
export const resolveChannel = (tags = []) => {
  if (!Array.isArray(tags)) return "online";
  if (tags.includes("pos")) return "pos";
  if (tags.includes("marketplace")) return "marketplace";
  return "online";
};

// -------------------------
// Productos
// -------------------------
export const getProducts = async (_req, res) => {
  try {
    const items = await Product.find().lean();
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const getProductById = async (req, res) => {
  try {
    const item = await Product.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const getProductBySlug = async (req, res) => {
  try {
    const item = await Product.findOne({ slug: req.params.slug }).lean();
    if (!item) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const searchProducts = async (req, res) => {
  const { query } = req.query;
  if (!query || !query.trim()) {
    return res.status(400).json({ message: "La consulta de búsqueda no puede estar vacía." });
  }
  try {
    const r = new RegExp(query.trim(), "i");
    const items = await Product.find({ $or: [{ title: r }, { sku: r }, { brand: r }] })
      .select("title pricing images _id")
      .limit(10)
      .lean();
    res.json(items);
  } catch (e) {
    res.status(500).json({ message: "Error al buscar productos", error: e.message });
  }
};

export const createProduct = async (req, res) => {
  try {
    const body = { ...req.body };
    if (!body.title) return res.status(400).json({ error: "title es requerido" });

    // if (!body.sku) body.sku = generateSKU(body.title, body.brand);

    const created = await Product.create(body);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Producto no encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// -------------------------
// Órdenes (POS / Web)
// -------------------------
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productos, metodoPago, vendedor, total, tags = [], fecha, descuentoPorcentaje, customer, notes, shipping = 0, tax = 0, discount = 0 } = req.body;

    if (!productos?.length) return res.status(400).json({ message: "Faltan productos" });
    if (!metodoPago || !vendedor || total == null) return res.status(400).json({ message: "Faltan metodoPago, vendedor o total" });

    const ids = productos.map(p => p.productId).filter(Boolean);
    const productosDb = ids.length ? await Product.find({ _id: { $in: ids } }).lean() : [];
    const mapProd = new Map(productosDb.map(p => [String(p._id), p]));

    const porcentaje = descuentoPorcentaje && !isNaN(descuentoPorcentaje) ? Number(descuentoPorcentaje) : 0;

    const normItems = productos.map((p) => {
      const pdb = p.productId ? mapProd.get(String(p.productId)) : null;
      const precioOriginal = Number(p.precio ?? p.price ?? pdb?.pricing?.sale ?? pdb?.pricing?.list ?? 0);
      const precioRedondeado = Math.floor(precioOriginal / 100) * 100;
      const dtoFijo = porcentaje > 0 ? Math.floor(precioOriginal * (porcentaje / 100) / 100) * 100 : 0;
      const unit = Math.max(0, precioRedondeado - dtoFijo);
      const qty = Number(p.cantidad ?? p.quantity ?? p.qty ?? 1);
      const variantSku = p?.variant?.sku || p?.sku || pdb?.variants?.[0]?.sku || null;
      const color = p?.variant?.color || pdb?.variants?.[0]?.options?.color || null;

      return {
        productId: p.productId || pdb?._id,
        title: p.title || pdb?.title || "",
        sku: variantSku || pdb?.sku || null,
        price: unit,
        qty,
        variant: (variantSku || color) ? { sku: variantSku, color } : undefined,
        subtotal: unit * qty
      };
    });

    if (normItems.some(i => !i.productId)) throw new Error("Uno o más items no tienen productId válido.");

    const itemsSum = normItems.reduce((a, b) => a + b.subtotal, 0);
    const grand = itemsSum + Number(shipping) + Number(tax) - Number(discount);

    if (Math.round(grand) !== Math.round(Number(total))) throw new Error("Total inconsistente (server vs client)");

    const channel = resolveChannel(tags);
    const orderNumber = await nextOrderNumber("TOK");

    const [order] = await Order.create([{
      orderNumber,
      channel,
      status: "created",
      items: normItems,
      totals: { items: itemsSum, discount: Number(discount), shipping: Number(shipping), tax: Number(tax), grand, currency: "ARS" },
      customer: customer || {},
      payment: { method: String(metodoPago || "otro"), status: "pending", amount: grand },
      notes: notes || `Venta - Vendedor: ${vendedor} - Método de pago: ${metodoPago} - Total: ${grand} - Fecha: ${fecha || new Date().toISOString()}`,
      createdBy: vendedor || null,
    }], { session });

    await adjustStock(session, normItems, -1);
    await session.commitTransaction();

    if (channel === "pos") {
      order.status = "paid";
      order.payment.status = "approved";
      order.payment.paidAt = new Date();
      await order.save();
    }

    res.status(201).json({ message: channel === "pos" ? "Venta local registrada." : "Orden creada (web).", order });

  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ message: "Error al crear la orden", error: e.message || e.toString() });
  } finally {
    session.endSession();
  }
};

import { MercadoPagoConfig, Preference } from "mercadopago";

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

export const createWebOrderMP = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      productos,
      metodoPago,
      customer,
      shipping = 0,
      tax = 0,
      discount = 0,
      notes,
    } = req.body;

    if (!productos?.length) return res.status(400).json({ message: "Carrito vacío" });
    if (!customer?.name || !customer?.email) return res.status(400).json({ message: "Faltan datos del cliente" });

    const ids = productos.map(p => p.productId).filter(Boolean);
    const productosDb = await Product.find({ _id: { $in: ids } }).lean();
    const mapProd = new Map(productosDb.map(p => [String(p._id), p]));

    const normItems = productos.map(p => {
      const pdb = p.productId ? mapProd.get(String(p.productId)) : null;
      const unit = Number(p.price ?? pdb?.pricing?.sale ?? pdb?.pricing?.list ?? 0);
      const qty = Number(p.qty ?? 1);
      return {
        productId: p.productId || pdb?._id,
        title: p.title || pdb?.title || '',
        price: unit,
        qty,
        subtotal: unit * qty,
      };
    });

    const itemsSum = normItems.reduce((a, b) => a + b.subtotal, 0);
    const grand = itemsSum + Number(shipping) + Number(tax) - Number(discount);

    const orderNumber = await nextOrderNumber("WEB");

    const orderData = {
      orderNumber,
      channel: 'online',
      status: 'created',
      items: normItems,
      totals: {
        items: itemsSum,
        discount,
        shipping,
        tax,
        grand,
        currency: 'ARS',
      },
      customer,
      payment: {
        method: metodoPago || 'otro',
        status: 'pending',
        amount: grand,
      },
      notes: notes || `Orden web - Método: ${metodoPago}`,
    };

    const [order] = await Order.create([orderData], { session });

    await adjustStock(session, normItems, -1);

    await session.commitTransaction();

    let mpInitPoint = null;

    if (metodoPago === 'mercadopago') {
      const preference = {
        items: normItems.map(i => ({
          title: i.title,
          quantity: i.qty,
          currency_id: 'ARS',
          unit_price: Number(i.price),
        })),
        external_reference: order._id.toString(),
        payer: {
          name: customer.name,
          email: customer.email,
        },
        back_urls: {
          success: `${process.env.FRONT_URL}/checkout/success`,
          failure: `${process.env.FRONT_URL}/checkout/failure`,
          pending: `${process.env.FRONT_URL}/checkout/pending`,
        },
        auto_return: 'approved',
      };

      const preferenceClient = new Preference(mpClient);

      const mpResp = await preferenceClient.create({ body: preference });

      mpInitPoint = mpResp.init_point || mpResp.body?.init_point || null;
    }

    res.status(201).json({ order, mpInitPoint });

  } catch (err) {
    await session.abortTransaction();
    console.error("Error createWebOrderMP:", err);
    res.status(500).json({ message: "Error al crear la orden web", error: err.message });
  } finally {
    session.endSession();
  }
};

export const confirmOrder = async (req, res) => {
  const { draftOrderId, action } = req.body;
  if (!draftOrderId || !action) return res.status(400).json({ message: "Faltan draftOrderId o action" });

  try {
    const order = await Order.findById(draftOrderId);
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    if (action === "vendido") {
      order.status = "paid";
      order.payment.status = "approved";
      order.payment.paidAt = new Date();
      await order.save();
      return res.json({ message: "Orden confirmada (paid).", order });
    }
    if (action === "no-vendido") {
      order.status = "cancelled";
      await order.save();
      return res.json({ message: "Orden cancelada.", order });
    }
    return res.status(400).json({ message: "Acción inválida" });
  } catch (e) {
    res.status(500).json({ message: "Error al confirmar la orden", error: e.message || e });
  }
};

export const listOrders = async (req, res) => {
  try {
    const { channel, status, q, from, to, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (channel) filter.channel = channel;
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    if (q) {
      const r = new RegExp(q, "i");
      filter.$or = [{ orderNumber: r }, { "customer.name": r }, { "customer.email": r }];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Order.countDocuments(filter),
    ]);
    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const obtenerVentasCierreCaja = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: "Falta el parámetro fecha" });

    const inicio = dayjs(fecha).startOf("day").toDate();
    const fin = dayjs(fecha).endOf("day").toDate();

    const orders = await Order.find({
      channel: "pos",
      status: { $in: ["paid", "fulfilled"] },
      "payment.paidAt": { $gte: inicio, $lte: fin },
    }).lean();

    const ventas = orders.map(o => {
      const monto = Number(o?.totals?.grand || 0);
      const comision = monto * 0.02;
      return {
        id: String(o._id),
        nombre: o.orderNumber || "Sin número",
        monto,
        comision,
        vendedor: o?.createdBy || o?.customer?.name || "No especificado",
        metodoPago: o?.payment?.method || "No especificado",
        fecha: dayjs(o.payment.paidAt).format("YYYY-MM-DD HH:mm"),
      };
    });

    res.json({ ventas });
  } catch (e) {
    res.status(500).json({ error: "Error al obtener ventas", message: e.message || e.toString() });
  }
};

export const exportarVentasExcel = async (req, res) => {
  try {
    const { ventas } = req.body;
    if (!ventas || !ventas.length) return res.status(400).json({ error: "No hay ventas para exportar" });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("ventas");

    sheet.columns = [
      { header: "ID", key: "id", width: 25 },
      { header: "Nombre", key: "nombre", width: 25 },
      { header: "Vendedor", key: "vendedor", width: 20 },
      { header: "Medio Pago", key: "medioPago", width: 20 },
      { header: "Monto", key: "monto", width: 15 },
      { header: "Comisión", key: "comision", width: 15 },
      { header: "Fecha", key: "fecha", width: 20 },
      { header: "Hora", key: "hora", width: 10 }
    ];

    ventas.forEach(v => {
      sheet.addRow({
        id: v.id,
        nombre: v.nombre,
        vendedor: v.vendedor,
        medioPago: v.metodoPago,
        monto: v.monto,
        comision: v.comision,
        fecha: v.fecha,
        hora: v.hora,
      });
    });

    const resumenSheet = workbook.addWorksheet("resumen_vendedores");
    const resume = ventas.reduce((acc, v) => {
      if (!acc[v.vendedor]) acc[v.vendedor] = { total: 0, comision: 0 };
      acc[v.vendedor].total += Number(v.monto || 0);
      acc[v.vendedor].comision += Number(v.comision || 0);
      return acc;
    }, {});

    resumenSheet.columns = [
      { header: "Vendedor", key: "vendedor", width: 20 },
      { header: "Total Vendido", key: "total", width: 20 },
      { header: "Comisión Total", key: "comision", width: 20 },
    ];

    Object.entries(resume).forEach(([vendedor, data]) => {
      resumenSheet.addRow({ vendedor, total: data.total, comision: data.comision });
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=cierre_caja.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error exportando XLSX:", err);
    res.status(500).json({ error: "Error al exportar XLSX" });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).lean();
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener la orden", error });
  }
};

export const downloadOrderPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).lean();
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const doc = new PDFDocument({ margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=orden_${order.orderNumber || id}.pdf`);
    doc.pipe(res);

    doc.fontSize(20).text("COMPROBANTE DE VENTA", { align: "center" }).moveDown();
    doc.fontSize(12).text(`Número de Orden: ${order.orderNumber}`);
    doc.text(`Fecha: ${dayjs(order.createdAt).format("DD/MM/YYYY HH:mm")}`);
    doc.text(`Vendedor: ${order.createdBy || "No especificado"}`).moveDown();

    doc.fontSize(14).text("Productos", { underline: true }).moveDown(0.5);
    order.items?.forEach(item => {
      doc.fontSize(12).text(`• ${item.title} x${item.qty}`);
      doc.text(`  Precio: $${item.price}`);
      doc.text(`  Subtotal: $${item.subtotal}`).moveDown(0.5);
    });

    doc.moveDown().fontSize(14).text("Totales", { underline: true }).fontSize(12);
    doc.text(`Subtotal: $${order?.totals?.items || 0}`);
    doc.text(`Descuentos: $${order?.totals?.discount || 0}`);
    doc.text(`Total Final: $${order?.totals?.grand || 0}`).moveDown();

    doc.fontSize(14).text("Método de Pago", { underline: true }).fontSize(12);
    doc.text(`Medio: ${order?.payment?.method || "No especificado"}`);
    doc.text(`Estado: ${order?.status}`).moveDown();

    doc.fontSize(10).text("Gracias por su compra.", { align: "center" });
    doc.text("Sistema POS desarrollado por Joaquín.", { align: "center" });

    doc.end();
  } catch (error) {
    res.status(500).json({ message: "Error al generar el PDF", error });
  }
};
