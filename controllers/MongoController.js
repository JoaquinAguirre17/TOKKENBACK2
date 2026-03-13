import dayjs from "dayjs";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import Product from "../Models/Product.js";
import Order from "../Models/Order.js";
import Counter from "../Models/Counter.js";
import { adjustStock } from "../Utils/adjustStock.js";
import { generateOrderNumber } from "../Utils/orderNumber.js";
import { generateSKU } from "../Utils/generateSKU.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// zona horaria del sistema POS
const TZ = "America/Argentina/Cordoba";

// opcional: default global
dayjs.tz.setDefault(TZ);
import { MercadoPagoConfig, Preference } from "mercadopago";

const mpClient = new Preference({ access_token: process.env.MP_ACCESS_TOKEN });

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

    // 1️⃣ Validaciones básicas
    if (!productos?.length) return res.status(400).json({ message: "Carrito vacío" });
    if (!customer?.name || !customer?.email)
      return res.status(400).json({ message: "Faltan datos del cliente" });

    // 2️⃣ Traer productos de DB
    const ids = productos.map(p => p.productId).filter(Boolean);
    const productosDb = await Product.find({ _id: { $in: ids } }).lean();
    const mapProd = new Map(productosDb.map(p => [String(p._id), p]));

    // 3️⃣ Normalizar items
    const normItems = productos.map(p => {
      const pdb = p.productId ? mapProd.get(String(p.productId)) : null;
      const unit = Number(p.price ?? pdb?.pricing?.sale ?? pdb?.pricing?.list ?? 0);
      const qty = Number(p.qty ?? 1);
      return {
        productId: p.productId || pdb?._id,
        title: p.title || pdb?.title || "",
        price: unit,
        qty,
        subtotal: unit * qty,
      };
    });

    const itemsSum = normItems.reduce((a, b) => a + b.subtotal, 0);
    const grand = itemsSum + Number(shipping) + Number(tax) - Number(discount);

    // 4️⃣ Generar orderNumber (ejemplo simple, ajusta según tu función)
    const orderNumber = `WEB-${Date.now()}`;

    const orderData = {
      orderNumber,
      channel: "online",
      status: "created",
      items: normItems,
      totals: {
        items: itemsSum,
        discount,
        shipping,
        tax,
        grand,
        currency: "ARS",
      },
      customer,
      payment: {
        method: metodoPago || "otro",
        status: "pending",
        amount: grand,
      },
      notes: notes || `Orden web - Método: ${metodoPago}`,
    };

    // 5️⃣ Crear la orden en MongoDB
    const [order] = await Order.create([orderData], { session });

    // 6️⃣ Ajustar stock
    // await adjustStock(session, normItems, -1); // Descomenta si tienes esta función

    await session.commitTransaction();

    // 7️⃣ Preparar pago con MercadoPago
    let mpInitPoint = null;

    if (metodoPago === "mercadopago") {
      try {
        const preference = {
          items: normItems.map(i => ({
            title: i.title,
            quantity: i.qty,
            currency_id: "ARS",
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
          auto_return: "approved",
        };

        const mpResp = await mpClient.create({ body: preference });
        console.log("✅ MercadoPago response:", mpResp);

        // Puede variar según SDK
        mpInitPoint = mpResp.init_point || mpResp.body?.init_point || null;
        if (!mpInitPoint) console.warn("⚠️ mpInitPoint no recibido de MP");
      } catch (err) {
        console.error("❌ MercadoPago fallo:", err.message);
      }
    }

    res.status(201).json({ order, mpInitPoint });

  } catch (err) {
    await session.abortTransaction().catch(e => console.warn("AbortTransaction fallo:", e.message));
    console.error("Error createWebOrderMP:", err);
    res.status(500).json({ message: "Error al crear la orden web", error: err.message });
  } finally {
    session.endSession();
  }
};

// -------------------------
// Helpers (implementaciones simples — adaptá a tu lógica real si hace falta)
// -------------------------

/**
 * Ajusta stock de los productos. Recibe la sesión de mongoose para operaciones transaccionales.
 * - items: [{ productId, qty }]
 * - delta: +1 o -1 multiplicador (por ejemplo -1 resta stock)
 */

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

    if (!body.title) {
      return res.status(400).json({ error: "title es requerido" });
    }

    // generar SKU automático si no viene
    if (!body.sku) {
      body.sku = generateSKU(body.title, body.brand);
    }

    const created = await Product.create(body);

    res.status(201).json(created);

  } catch (e) {

    console.error("ERROR CREANDO PRODUCTO:", e);

    res.status(400).json({
      error: e.message
    });

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

export const createOrder = async (req, res) => {

  const session = await mongoose.startSession();

  try {

    await session.startTransaction();

    const { productos, metodoPago, vendedor, total } = req.body;

    console.log("VENTA:", req.body);

    if (!productos?.length) {
      return res.status(400).json({ message: "No hay productos" });
    }

    const ids = productos.map(p => p.productId);

    const productosDb = await Product.find({
      _id: { $in: ids }
    }).lean();

    const mapProd = new Map(
      productosDb.map(p => [String(p._id), p])
    );

    const normItems = productos.map(p => {

      const db = mapProd.get(String(p.productId));

      const price = Number(
        p.precio ??
        db?.pricing?.sale ??
        db?.pricing?.list ??
        0
      );

      const qty = Number(p.cantidad ?? 1);

      return {
        productId: db._id,
        title: db.title,
        sku: db?.variants?.[0]?.sku,
        price,
        qty,
        subtotal: price * qty
      };

    });

    const itemsTotal = normItems.reduce(
      (a, b) => a + b.subtotal,
      0
    );

    if (Math.round(itemsTotal) !== Math.round(total)) {
      throw new Error("Total inconsistente");
    }

    const orderNumber = await generateOrderNumber();

    // hora correcta Argentina
    const now = dayjs().tz(TZ).toDate();

    const order = new Order({

      orderNumber,

      items: normItems,

      totals: {
        items: itemsTotal,
        grand: itemsTotal
      },

      payment: {
        method: metodoPago,
        status: "approved",
        amount: itemsTotal,
        paidAt: now
      },

      createdBy: vendedor,

      createdAt: now

    });

    await order.save({ session });

    await adjustStock(session, normItems, -1);

    await session.commitTransaction();

    res.status(201).json({
      message: "Venta registrada",
      order
    });

  } catch (error) {

    await session.abortTransaction();

    console.error("❌ ERROR CREANDO ORDEN:", error);

    res.status(500).json({
      message: "Error al crear orden",
      error: error.message
    });

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

    if (!fecha) {
      return res.status(400).json({ error: "Falta fecha" });
    }

    // rango del día en Argentina
    const inicio = dayjs.tz(fecha, TZ).startOf("day").toDate();
    const fin = dayjs.tz(fecha, TZ).endOf("day").toDate();

    const orders = await Order.find({
      "payment.status": "approved",
      createdAt: { $gte: inicio, $lte: fin }
    }).lean();

    const ventas = [];
    const porVendedor = {};
    const porMedioPago = {};
    const porHora = {};
    const productos = {};

    let total = 0;

    orders.forEach((o) => {

      const monto = Number(o?.totals?.grand || 0);
      const vendedor = o?.createdBy || "No especificado";
      const medioPago = o?.payment?.method || "No especificado";

      const fechaPago = o?.createdAt;

      const hora = dayjs(fechaPago).tz(TZ).format("HH");

      ventas.push({

        id: String(o._id),
        nombre: o.orderNumber,
        vendedor,
        medioPago,
        monto,
        comision: monto * 0.02,

        fecha: dayjs(fechaPago).tz(TZ).format("YYYY-MM-DD"),
        hora: dayjs(fechaPago).tz(TZ).format("HH:mm"),

      });

      total += monto;

      porVendedor[vendedor] = (porVendedor[vendedor] || 0) + monto;
      porMedioPago[medioPago] = (porMedioPago[medioPago] || 0) + monto;
      porHora[hora] = (porHora[hora] || 0) + monto;

      o.items?.forEach((item) => {

        const nombre = item.title || "Producto";

        if (!productos[nombre]) {
          productos[nombre] = {
            cantidad: 0,
            total: 0
          };
        }

        productos[nombre].cantidad += item.qty || 1;
        productos[nombre].total += (item.price || 0) * (item.qty || 1);

      });

    });

    res.json({

      ventas,

      resumen: {
        total,
        comisiones: total * 0.02,
        cantidadVentas: ventas.length
      },

      porVendedor,
      porMedioPago,
      porHora,
      productos

    });

  } catch (error) {

    res.status(500).json({
      error: "Error al obtener cierre",
      message: error.message
    });

  }

};
// Obtener ventas por mes
export const obtenerVentasPorMes = async (req, res) => {
  try {
    let { mes, anio } = req.query;

    if (!mes || !anio) return res.status(400).json({ error: "Falta mes o año" });

    mes = parseInt(mes); // 1-12
    anio = parseInt(anio);

    const inicio = dayjs(`${anio}-${mes}-01`).startOf("month").toDate();
    const fin = dayjs(`${anio}-${mes}-01`).endOf("month").toDate();

    const orders = await Order.find({
      "payment.status": "approved",
      createdAt: { $gte: inicio, $lte: fin }
    }).lean();

    const data = procesarVentas(orders, true); // true = incluir ventas por día

    res.json(data);

  } catch (error) {
    res.status(500).json({ error: "Error al obtener ventas por mes", message: error.message });
  }
};

// Función de procesamiento de ventas
function procesarVentas(orders, incluirPorDia = false) {

  const ventas = [];
  const porVendedor = {};
  const porMedioPago = {};
  const porHora = {};
  const productos = {};
  const porDia = {}; // para ventas por día del mes

  let total = 0;

  orders.forEach(o => {

    const monto = Number(o?.totals?.grand || 0);
    const vendedor = o?.createdBy || "No especificado";
    const medioPago = o?.payment?.method || "No especificado";
    const fechaPago = o?.createdAt;

    const hora = dayjs(fechaPago).format("HH");

    ventas.push({
      id: String(o._id),
      nombre: o.orderNumber,
      vendedor,
      medioPago,
      monto,
      comision: monto * 0.02,
      fecha: dayjs(fechaPago).format("YYYY-MM-DD"),
      hora: dayjs(fechaPago).format("HH:mm"),
    });

    total += monto;

    porVendedor[vendedor] = (porVendedor[vendedor] || 0) + monto;
    porMedioPago[medioPago] = (porMedioPago[medioPago] || 0) + monto;
    porHora[hora] = (porHora[hora] || 0) + monto;

    if (incluirPorDia) {
      const dia = dayjs(fechaPago).format("YYYY-MM-DD");
      porDia[dia] = (porDia[dia] || 0) + monto;
    }

    o.items?.forEach(item => {

      const nombre = item.title || "Producto";

      if (!productos[nombre]) {
        productos[nombre] = { cantidad: 0, total: 0 };
      }

      productos[nombre].cantidad += item.qty || 1;
      productos[nombre].total += (item.price || 0) * (item.qty || 1);

    });

  });

  const resumen = {
    total,
    comisiones: total * 0.02,
    cantidadVentas: ventas.length
  };

  return incluirPorDia
    ? { ventas, resumen, porVendedor, porMedioPago, porHora, productos, porDia }
    : { ventas, resumen, porVendedor, porMedioPago, porHora, productos };

}
export const exportarVentasExcel = async (req, res) => {

  try {

    const {
      ventas,
      resumen,
      porVendedor,
      porMedioPago,
      porHora,
      productos
    } = req.body;

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Sistema POS";
    workbook.created = new Date();

    /* =========================
       HOJA 1 - CIERRE DE CAJA
    ========================= */

    const cierre = workbook.addWorksheet("Cierre de caja");

    cierre.mergeCells("A1:D1");

    const titulo = cierre.getCell("A1");

    titulo.value = "CIERRE DE CAJA";

    titulo.font = { size: 18, bold: true };

    titulo.alignment = { horizontal: "center" };

    cierre.addRow([]);

    cierre.addRow(["Total ventas", resumen.total]);
    cierre.addRow(["Comisiones", resumen.comisiones]);
    cierre.addRow(["Cantidad ventas", resumen.cantidadVentas]);

    cierre.getColumn(1).width = 25;
    cierre.getColumn(2).width = 20;

    /* =========================
       HOJA 2 - VENTAS
    ========================= */

    const ventasSheet = workbook.addWorksheet("Ventas");

    ventasSheet.columns = [

      { header: "Orden", key: "nombre", width: 15 },
      { header: "Vendedor", key: "vendedor", width: 20 },
      { header: "Medio Pago", key: "medioPago", width: 20 },
      { header: "Monto", key: "monto", width: 15 },
      { header: "Comisión", key: "comision", width: 15 },
      { header: "Fecha", key: "fecha", width: 15 },
      { header: "Hora", key: "hora", width: 10 },

    ];

    ventas.forEach(v => ventasSheet.addRow(v));

    ventasSheet.getRow(1).font = { bold: true };

    /* =========================
       HOJA 3 - RANKING VENDEDORES
    ========================= */

    const vendedoresSheet = workbook.addWorksheet("Ranking vendedores");

    vendedoresSheet.columns = [

      { header: "Vendedor", key: "vendedor", width: 20 },
      { header: "Total vendido", key: "total", width: 20 },
      { header: "Comisión 2%", key: "comision", width: 20 },

    ];

    const rankingVendedores = Object.entries(porVendedor)
      .map(([vendedor, total]) => ({
        vendedor,
        total,
        comision: total * 0.02
      }))
      .sort((a, b) => b.total - a.total);

    rankingVendedores.forEach(v =>
      vendedoresSheet.addRow(v)
    );

    vendedoresSheet.getRow(1).font = { bold: true };

    /* =========================
       HOJA 4 - MEDIOS DE PAGO
    ========================= */

    const pagoSheet = workbook.addWorksheet("Medios de pago");

    pagoSheet.columns = [

      { header: "Medio", key: "medio", width: 20 },
      { header: "Total", key: "total", width: 20 },

    ];

    Object.entries(porMedioPago).forEach(([medio, total]) => {

      pagoSheet.addRow({
        medio,
        total
      });

    });

    pagoSheet.getRow(1).font = { bold: true };

    /* =========================
       HOJA 5 - VENTAS POR HORA
    ========================= */

    const horaSheet = workbook.addWorksheet("Ventas por hora");

    horaSheet.columns = [

      { header: "Hora", key: "hora", width: 15 },
      { header: "Total vendido", key: "total", width: 20 },

    ];

    Object.entries(porHora).forEach(([hora, total]) => {

      horaSheet.addRow({
        hora,
        total
      });

    });

    horaSheet.getRow(1).font = { bold: true };

    /* =========================
       HOJA 6 - PRODUCTOS
    ========================= */

    const productosSheet = workbook.addWorksheet("Productos vendidos");

    productosSheet.columns = [

      { header: "Producto", key: "nombre", width: 40 },
      { header: "Cantidad", key: "cantidad", width: 15 },
      { header: "Total vendido", key: "total", width: 20 },

    ];

    Object.entries(productos).forEach(([nombre, data]) => {

      productosSheet.addRow({
        nombre,
        cantidad: data.cantidad,
        total: data.total
      });

    });

    productosSheet.getRow(1).font = { bold: true };

    /* =========================
       HOJA 7 - RANKING PRODUCTOS
    ========================= */

    const rankingSheet = workbook.addWorksheet("Ranking productos");

    rankingSheet.columns = [

      { header: "Producto", key: "nombre", width: 40 },
      { header: "Cantidad vendida", key: "cantidad", width: 20 },

    ];

    const ranking = Object.entries(productos)
      .map(([nombre, data]) => ({
        nombre,
        cantidad: data.cantidad
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    ranking.forEach(p => rankingSheet.addRow(p));

    rankingSheet.getRow(1).font = { bold: true };

    /* =========================
       DESCARGA
    ========================= */

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=reporte_cierre_caja.xlsx"
    );

    await workbook.xlsx.write(res);

    res.end();

  } catch (error) {

    res.status(500).json({
      error: "Error exportando Excel"
    });

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
