// controllers/appController.js
import dayjs from "dayjs";
import ExcelJS from "exceljs";
import mongoose from "mongoose";

import Product from "../Models/Product.js";
import Order from "../Models/Order.js";
import Counter from "../Models/Counter.js";   // opcional (numeración)
import { generateSKU } from "../GeneradorSku/skuGenerator.js";

// ---------- helpers ----------
const toNumber = (v, d = 0) => (isNaN(Number(v)) ? d : Number(v));
const redondear100Abajo = (valor) => Math.floor(Number(valor || 0) / 100) * 100;

async function nextOrderNumber(prefix = "TOK") {
  // Si no querés usar Counter, podés devolver timestamp:
  // return `${prefix}-${dayjs().format('YYYYMMDDHHmmss')}`;
  const doc = await Counter.findOneAndUpdate(
    { key: prefix },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  const padded = String(doc.seq).padStart(6, "0");
  return `${prefix}-${padded}`;
}

function resolveChannel(tags) {
  if (!tags) return "online";
  const asStr = Array.isArray(tags) ? tags.join(",") : String(tags);
  return asStr.toLowerCase().includes("local") ? "pos" : "online";
}

// Ajusta stock en variants.sku (o en la 1ra variante si no hay sku)
async function adjustStock(session, items, sign = -1) {
  for (const it of items) {
    const hasVariantSku = !!it?.variant?.sku;
    await Product.updateOne(
      { _id: it.productId, ...(hasVariantSku ? { "variants.sku": it.variant.sku } : {}) },
      hasVariantSku
        ? { $inc: { "variants.$.stock": sign * it.qty } }
        : { $inc: { "variants.0.stock": sign * it.qty } },
      { session }
    );
  }
}

// ---------- PRODUCTOS ----------
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
    const regex = new RegExp(query.trim(), "i");
    const items = await Product.find({
      $or: [{ title: regex }, { sku: regex }, { brand: regex }]
    })
      .limit(10)
      .lean();

    if (!items.length) return res.status(404).json({ message: "Sin resultados" });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const createProduct = async (req, res) => {
  try {
    const body = { ...req.body };

    if (!body.title) return res.status(400).json({ error: "title es requerido" });
    if (!body.sku) {
      body.sku = generateSKU(body.title, body.brand);
    }

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

// ---------- ÓRDENES ----------
export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      productos,            // [{ productId, price, qty, title, sku, variant:{sku,color} }] o viejo: {precio,cantidad,variant_id}
      metodoPago,           // string
      vendedor,             // string
      total,                // number (validamos)
      tags = [],            // para canal
      fecha,                // opcional
      descuentoPorcentaje,  // opcional
      customer,             // opcional
      notes,                // opcional
      shipping = 0,
      tax = 0,
      discount = 0
    } = req.body;

    if (!productos?.length) return res.status(400).json({ message: "Faltan productos" });
    if (!metodoPago || !vendedor || total == null) {
      return res.status(400).json({ message: "Faltan metodoPago, vendedor o total" });
    }

    const ids = productos.map(p => p.productId).filter(Boolean);
    const productosDb = ids.length ? await Product.find({ _id: { $in: ids } }).lean() : [];
    const mapProd = new Map(productosDb.map(p => [String(p._id), p]));

    const porcentaje = descuentoPorcentaje && !isNaN(descuentoPorcentaje) ? Number(descuentoPorcentaje) : 0;

    const normItems = productos.map((p) => {
      const pdb = p.productId ? mapProd.get(String(p.productId)) : null;

      const precioOriginal = toNumber(p.precio ?? p.price ?? pdb?.pricing?.sale ?? pdb?.pricing?.list, 0);
      const precioRedondeado = redondear100Abajo(precioOriginal);
      const dtoFijo = porcentaje > 0 ? redondear100Abajo(precioOriginal * (porcentaje / 100)) : 0;
      const unit = Math.max(0, precioRedondeado - dtoFijo);

      const qty = toNumber(p.cantidad ?? p.quantity ?? p.qty, 1);
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

    if (normItems.some(i => !i.productId)) {
      throw new Error("Uno o más items no tienen productId válido.");
    }

    const itemsSum = normItems.reduce((a, b) => a + b.subtotal, 0);
    const grand = itemsSum + toNumber(shipping) + toNumber(tax) - toNumber(discount);

    if (Math.round(grand) !== Math.round(toNumber(total))) {
      throw new Error("Total inconsistente (server vs client)");
    }

    const channel = resolveChannel(tags);
    const orderNumber = await nextOrderNumber("TOK");

    const [order] = await Order.create([{
      orderNumber,
      channel,
      status: "created",
      items: normItems,
      totals: {
        items: itemsSum,
        discount: toNumber(discount),
        shipping: toNumber(shipping),
        tax: toNumber(tax),
        grand,
        currency: "ARS",
      },
      customer: customer || {},
      payment: {
        method: String(metodoPago || "other"),
        status: "pending",
        amount: grand,
      },
      notes: notes || `Venta - Vendedor: ${vendedor} - Método de pago: ${metodoPago} - Total: ${grand} - Fecha: ${fecha || new Date().toISOString()}`,
      createdBy: vendedor || null,
    }], { session });

    // Política: descontar stock al crear
    await adjustStock(session, normItems, -1);

    await session.commitTransaction();

    // Si es POS, marcamos pagada
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

// action: 'vendido' => paid ; 'no-vendido' => cancelled
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

// Listar órdenes (útil para admin)
export const listOrders = async (req, res) => {
  try {
    const { channel, status, q, from, to, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (channel) filter.channel = channel;
    if (status)  filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
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

export const getOrderById = async (req, res) => {
  try {
    const item = await Order.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: "Orden no encontrada" });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ---------- Reportes ----------
export const obtenerVentasCierreCaja = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: "Falta el parámetro fecha" });

    const inicio = dayjs(fecha).startOf("day").toDate();
    const fin = dayjs(fecha).endOf("day").toDate();

    const orders = await Order.find({
      channel: "pos",
      status: { $in: ["paid", "fulfilled"] },
      createdAt: { $gte: inicio, $lte: fin },
    }).lean();

    const ventas = orders.map((o) => {
      const monto = Number(o?.totals?.grand || 0);
      const comision = monto * 0.02;
      const vendedor = o?.createdBy || o?.customer?.name || "No especificado";
      const medioPago = o?.payment?.method || "No especificado";
      return {
        id: String(o._id),
        nombre: o.orderNumber || "Sin número",
        monto,
        comision,
        vendedor,
        medioPago,
        hora: dayjs(o.createdAt).format("HH:mm"),
      };
    });

    res.json({ ventas });
  } catch (e) {
    res.status(500).json({ error: "Error al obtener ventas", message: e.message || e.toString() });
  }
};

export const exportarVentasExcel = async (req, res) => {
  const { ventas } = req.body;
  if (!ventas?.length) return res.status(400).json({ message: "No hay ventas para exportar" });

  try {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Ventas");

    sheet.columns = [
      { header: "ID Orden", key: "id", width: 30 },
      { header: "Nombre", key: "nombre", width: 20 },
      { header: "Monto", key: "monto", width: 15 },
      { header: "Comisión (2%)", key: "comision", width: 18 },
      { header: "Vendedor", key: "vendedor", width: 20 },
      { header: "Método de Pago", key: "metodoPago", width: 20 },
      { header: "Fecha/Hora", key: "fecha", width: 22 },
    ];

    ventas.forEach((v) => {
      sheet.addRow({
        id: v.id,
        nombre: v.nombre,
        monto: v.monto,
        comision: v.comision,
        vendedor: v.vendedor,
        metodoPago: v.metodoPago || v.medioPago,
        fecha: v.fecha || v.hora || "",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=ventas_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.xlsx`
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ message: "Error al exportar Excel", error: e.message || e });
  }
};
