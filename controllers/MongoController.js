// controllers/appController.js
import dayjs from "dayjs";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import MercadoPago from 'mercadopago';

import Product from "../Models/Product.js";
import Order from "../Models/Order.js";
import Counter from "../Models/Counter.js";   // opcional (numeración)
import { generateSKU } from "../GeneradorSku/skuGenerator.js";
import { adjustStock, nextOrderNumber, resolveChannel } from './helpers.js'; // tus helpers pr
// ---------- helpers ----------

// Configurar Mercado Pago
MercadoPago.configurations.setAccessToken(process.env.MP_ACCESS_TOKEN);



// Ajusta stock en variants.sku (o en la 1ra variante si no hay sku)
// Ajusta stock en variants.sku (o en la 1ra variante si no hay sku)
// Esta versión es robusta: soporta item.qty / item.cantidad / item.quantity,
// intenta por SKU y si falla usa productId -> variants[0]
async function adjustStock(session, items, sign = -1) {
  for (const it of items) {
    // normalizamos cantidad
    const qty = Number(it.qty ?? it.cantidad ?? it.quantity ?? 0);
    if (!qty) continue; // nada que hacer

    const sku = it.variant?.sku || it.sku || null;

    // Si tenemos SKU, intentamos decrementar la variante por SKU
    if (sku) {
      const res = await Product.updateOne(
        { "variants.sku": sku },
        { $inc: { "variants.$.stock": sign * qty } },
        { session }
      );

      // si no encontró variante por SKU, caemos al fallback por productId
      if (res.matchedCount === 0 && it.productId) {
        // intentar decrementar la primera variante del producto
        await Product.updateOne(
          { _id: it.productId, "variants.0": { $exists: true } },
          { $inc: { "variants.0.stock": sign * qty } },
          { session }
        );
      }
      continue;
    }

    // Si no hay SKU, pero sí productId, decrementamos primera variante (fallback)
    if (it.productId) {
      const res2 = await Product.updateOne(
        { _id: it.productId, "variants.0": { $exists: true } },
        { $inc: { "variants.0.stock": sign * qty } },
        { session }
      );

      // Si tampoco hay variantes (rare), podríamos loggear o crear una propiedad stock general
      if (res2.matchedCount === 0) {
        // opcional: registrar log para investigar
        console.warn(`adjustStock: product ${it.productId} no tiene variantes para ajustar stock.`);
      }
    }
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

// controllers/... (el que estés usando)
export const searchProducts = async (req, res) => {
  const { query } = req.query;
  if (!query || !query.trim()) {
    return res.status(400).json({ message: "La consulta de búsqueda no puede estar vacía." });
  }
  try {
    const r = new RegExp(query.trim(), "i");
    const items = await Product.find({ $or: [{ title: r }, { sku: r }, { brand: r }] })
      .select("title pricing images _id")   // solo lo necesario
      .limit(10)
      .lean();
    res.json(items); // 👈 array directo
  } catch (e) {
    res.status(500).json({ message: "Error al buscar productos", error: e.message });
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
      productos,           // [{ productId, price, qty, title, sku, variant:{sku,color} }]
      metodoPago,          // string flexible ahora
      vendedor,
      total,
      tags = [],
      fecha,
      descuentoPorcentaje,
      customer,
      notes,
      shipping = 0,
      tax = 0,
      discount = 0
    } = req.body;

    if (!productos?.length) 
      return res.status(400).json({ message: "Faltan productos" });

    if (!metodoPago || !vendedor || total == null) 
      return res.status(400).json({ message: "Faltan metodoPago, vendedor o total" });

    // Obtener productos de DB
    const ids = productos.map(p => p.productId).filter(Boolean);
    const productosDb = ids.length ? await Product.find({ _id: { $in: ids } }).lean() : [];
    const mapProd = new Map(productosDb.map(p => [String(p._id), p]));

    const porcentaje = descuentoPorcentaje && !isNaN(descuentoPorcentaje) ? Number(descuentoPorcentaje) : 0;

    // Normalizar items
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

    if (normItems.some(i => !i.productId)) 
      throw new Error("Uno o más items no tienen productId válido.");

    const itemsSum = normItems.reduce((a, b) => a + b.subtotal, 0);
    const grand = itemsSum + Number(shipping) + Number(tax) - Number(discount);

    if (Math.round(grand) !== Math.round(Number(total))) 
      throw new Error("Total inconsistente (server vs client)");

    const channel = resolveChannel(tags);
    const orderNumber = await nextOrderNumber("TOK");

    // Crear orden
    const [order] = await Order.create([{
      orderNumber,
      channel,
      status: "created",
      items: normItems,
      totals: {
        items: itemsSum,
        discount: Number(discount),
        shipping: Number(shipping),
        tax: Number(tax),
        grand,
        currency: "ARS",
      },
      customer: customer || {},
      payment: {
        method: String(metodoPago || "otro"), // ahora flexible
        status: "pending",
        amount: grand,
      },
      notes: notes || `Venta - Vendedor: ${vendedor} - Método de pago: ${metodoPago} - Total: ${grand} - Fecha: ${fecha || new Date().toISOString()}`,
      createdBy: vendedor || null,
    }], { session });

    // Ajustar stock
    await adjustStock(session, normItems, -1);

    await session.commitTransaction();

    // Si es POS, marcar pagada
    if (channel === "pos") {
      order.status = "paid";
      order.payment.status = "approved";
      order.payment.paidAt = new Date();
      await order.save();
    }

    res.status(201).json({ 
      message: channel === "pos" ? "Venta local registrada." : "Orden creada (web).", 
      order 
    });

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





// ------------------------------------------------------
// 1) OBTENER VENTAS PARA CIERRE DE CAJA
// ------------------------------------------------------
export const obtenerVentasCierreCaja = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) {
      return res.status(400).json({ error: "Falta el parámetro fecha" });
    }

    const inicio = dayjs(fecha).startOf("day").toDate();
    const fin = dayjs(fecha).endOf("day").toDate();

    // 🔥 Usamos payment.paidAt porque para POS siempre existe
    const orders = await Order.find({
      channel: "pos",
      status: { $in: ["paid", "fulfilled"] },
      "payment.paidAt": { $gte: inicio, $lte: fin },
    }).lean();

    const ventas = orders.map((o) => {
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
    res.status(500).json({
      error: "Error al obtener ventas",
      message: e.message || e.toString(),
    });
  }
};

// ------------------------------------------------------
// 2) EXPORTAR VENTAS A EXCEL (DISEÑO PROFESIONAL)
// ------------------------------------------------------
export const exportarVentasExcel = async (req, res) => {
  try {
    const { ventas } = req.body;
    if (!ventas || !ventas.length) {
      return res.status(400).json({ error: "No hay ventas para exportar" });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("ventas");

    // 🧾 HOJA 1 - VENTAS
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
        medioPago: v.medioPago,
        monto: v.monto,
        comision: v.comision,
        fecha: v.fecha,
        hora: v.hora,
      });
    });

    // 🧾 HOJA 2 - RESUMEN POR VENDEDOR
    const resumenSheet = workbook.addWorksheet("resumen_vendedores");

    // Calcular totales por vendedor
    const resume = ventas.reduce((acc, v) => {
      if (!acc[v.vendedor]) {
        acc[v.vendedor] = { total: 0, comision: 0 };
      }
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
      resumenSheet.addRow({
        vendedor,
        total: data.total,
        comision: data.comision
      });
    });

    // 📄 Exportar
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=cierre_caja.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Error exportando XLSX:", err);
    res.status(500).json({ error: "Error al exportar XLSX" });
  }
};
// =========================
// OBTENER ORDEN POR ID
// =========================
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

// =========================
// DESCARGAR ORDEN EN PDF
// =========================
export const downloadOrderPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).lean();
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=orden_${order.orderNumber || id}.pdf`
    );

    doc.pipe(res);

    // ============================
    // ENCABEZADO
    // ============================
    doc
      .fontSize(20)
      .text("COMPROBANTE DE VENTA", { align: "center" })
      .moveDown();

    doc.fontSize(12).text(`Número de Orden: ${order.orderNumber}`);
    doc.text(`Fecha: ${dayjs(order.createdAt).format("DD/MM/YYYY HH:mm")}`);
    doc.text(`Vendedor: ${order.createdBy || "No especificado"}`);
    doc.moveDown();

    // ============================
    // ITEMS
    // ============================
    doc.fontSize(14).text("Productos", { underline: true });
    doc.moveDown(0.5);

    order.items?.forEach((item) => {
      doc.fontSize(12).text(`• ${item.title} x${item.qty}`);
      doc.text(`  Precio: $${item.price}`);
      doc.text(`  Subtotal: $${item.subtotal}`);
      doc.moveDown(0.5);
    });

    doc.moveDown();

    // ============================
    // MONTOS
    // ============================
    doc.fontSize(14).text("Totales", { underline: true });
    doc.fontSize(12);

    doc.text(`Subtotal: $${order?.totals?.items || 0}`);
    doc.text(`Descuentos: $${order?.totals?.discount || 0}`);
    doc.text(`Total Final: $${order?.totals?.grand || 0}`);
    doc.moveDown();

    // ============================
    // MÉTODO DE PAGO
    // ============================
    doc.fontSize(14).text("Método de Pago", { underline: true });
    doc.fontSize(12);

    doc.text(`Medio: ${order?.payment?.method || "No especificado"}`);
    doc.text(`Estado: ${order?.status}`);
    doc.moveDown();

    // ============================
    // FOOTER
    // ============================
    doc
      .fontSize(10)
      .text("Gracias por su compra.", { align: "center" })
      .text("Sistema POS desarrollado por Joaquín.", { align: "center" });

    doc.end();
  } catch (error) {
    res.status(500).json({ message: "Error al generar el PDF", error });
  }
};

export const createWebOrderMP = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      productos,           // [{ productId, price, qty, title, sku, variant }]
      metodoPago,          // 'mercadopago', 'transferencia', etc.
      customer,            // { name, email, phone }
      shipping = 0,
      tax = 0,
      discount = 0,
      notes,
    } = req.body;

    if (!productos?.length) return res.status(400).json({ message: "Carrito vacío" });
    if (!customer?.name || !customer?.email) return res.status(400).json({ message: "Faltan datos del cliente" });

    // Traer productos de DB
    const ids = productos.map(p => p.productId).filter(Boolean);
    const productosDb = await Product.find({ _id: { $in: ids } }).lean();
    const mapProd = new Map(productosDb.map(p => [String(p._id), p]));

    // Normalizar items y calcular subtotal
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

    // Ajustar stock
    await adjustStock(session, normItems, -1);

    await session.commitTransaction();

    // ⚡ Si el método es Mercado Pago, crear preference
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
      const mpResp = await MercadoPago.preferences.create(preference);
      mpInitPoint = mpResp.body.init_point;
    }

    res.status(201).json({ order, mpInitPoint });

  } catch (err) {
    await session.abortTransaction();
    console.error(err);
    res.status(500).json({ message: 'Error al crear la orden web', error: err.message || err.toString() });
  } finally {
    session.endSession();
  }
};
