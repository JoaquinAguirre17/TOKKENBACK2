import dayjs from "dayjs";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import XLSX from "xlsx";


import Product from "../Models/Product.js";
import Order from "../Models/Order.js";
import Counter from "../Models/Counter.js";
import { adjustStock } from "../Utils/adjustStock.js";
import { generateOrderNumber } from "../Utils/orderNumber.js";
import { generateSKU } from "../Utils/generateSKU.js";
import Ingreso from "../Models/Ingreso.js";

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
    if (!fecha) return res.status(400).json({ error: "Falta fecha" });

    const inicio = dayjs.tz(fecha, TZ).startOf("day").toDate();
    const fin = dayjs.tz(fecha, TZ).endOf("day").toDate();

    // 🟢 VENTAS
    const orders = await Order.find({
      "payment.status": "approved",
      createdAt: { $gte: inicio, $lte: fin }
    }).lean();

    // 🟣 INGRESOS
    const ingresosDB = await Ingreso.find({
      createdAt: { $gte: inicio, $lte: fin }
    }).lean();

    const ventas = [];
    const porVendedor = {};
    const porMedioPago = {};
    const porHora = {};
    const productos = [];

    let total = 0;

    // 🔵 PROCESAR VENTAS
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
        hora: dayjs(fechaPago).tz(TZ).format("HH:mm")
      });

      total += monto;
      porVendedor[vendedor] = (porVendedor[vendedor] || 0) + monto;
      porMedioPago[medioPago] = (porMedioPago[medioPago] || 0) + monto;
      porHora[hora] = (porHora[hora] || 0) + monto;

      o.items?.forEach((item) => {
        const nombre = item.title || "Producto";
        productos.push({
          nombre,
          cantidad: item.qty || 1,
          fecha: dayjs(fechaPago).tz(TZ).format("YYYY-MM-DD HH:mm")
        });
      });
    });

    // 🔹 PROCESAR INGRESOS (productos ingresados)
    const productosIngresados = [];
    for (const ingreso of ingresosDB) {
      for (const item of ingreso.items) {
        const productoDB = await Product.findById(item.productId).lean();
        productosIngresados.push({
          nombre: productoDB?.title || "Producto",
          cantidad: item.quantity,
          fecha: dayjs(ingreso.createdAt).tz(TZ).format("YYYY-MM-DD HH:mm")
        });
      }
    }

    res.json({
      ventas,
      productosIngresados, // lista con nombre, cantidad y fecha/hora
      resumen: {
        total,
        comisiones: total * 0.02,
        cantidadVentas: ventas.length
      },
      porVendedor,
      porMedioPago,
      porHora
    });

  } catch (error) {
    console.error("❌ Error cierre caja:", error);
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

    if (!mes || !anio) {
      return res.status(400).json({ error: "Falta mes o año" });
    }

    mes = parseInt(mes); // 1-12
    anio = parseInt(anio);

    const inicio = dayjs(`${anio}-${mes}-01`).startOf("month").toDate();
    const fin = dayjs(`${anio}-${mes}-01`).endOf("month").toDate();

    // 🟢 VENTAS
    const orders = await Order.find({
      "payment.status": "approved",
      createdAt: { $gte: inicio, $lte: fin }
    }).lean();

    const data = procesarVentas(orders, true);

    // 🟣 INGRESOS
    const ingresosDB = await Ingreso.find({
      createdAt: { $gte: inicio, $lte: fin }
    }).lean();

    let totalIngresos = 0;

    ingresosDB.forEach(i => {
      totalIngresos += i.total || 0;
    });

    // 🟣 FORMATEO OPCIONAL
    const ingresos = ingresosDB.map(i => ({
      fecha: dayjs(i.createdAt).format("YYYY-MM-DD"),
      total: i.total
    }));

    // 💥 AGREGAMOS AL RESPONSE
    res.json({
      ...data,

      ingresos, // 👈 listado

      resumen: {
        ...data.resumen,
        ingresos: totalIngresos,
        balance: (data.resumen?.total || 0) - totalIngresos
      }

    });

  } catch (error) {
    console.error("❌ Error ventas por mes:", error);

    res.status(500).json({
      error: "Error al obtener ventas por mes",
      message: error.message
    });
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
      productos,
      ingresos = [] // 🟣 NUEVO
    } = req.body;

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Sistema POS";
    workbook.created = new Date();

    const totalIngresos = ingresos.reduce((acc, i) => acc + (i.total || 0), 0);
    const balance = (resumen.total || 0) - totalIngresos;

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
    cierre.addRow(["Total ingresos", totalIngresos]); // 🟣 NUEVO
    cierre.addRow(["Balance", balance]); // 🟣 NUEVO
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
       HOJA 3 - INGRESOS 🟣
    ========================= */

    const ingresosSheet = workbook.addWorksheet("Ingresos");

    ingresosSheet.columns = [
      { header: "Fecha", key: "fecha", width: 15 },
      { header: "Descripción", key: "descripcion", width: 30 },
      { header: "Total", key: "total", width: 20 },
    ];

    ingresos.forEach(i => {
      ingresosSheet.addRow({
        fecha: i.fecha,
        descripcion: i.descripcion || "-",
        total: i.total
      });
    });

    ingresosSheet.getRow(1).font = { bold: true };

    /* =========================
       HOJA 4 - RANKING VENDEDORES
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
       HOJA 5 - MEDIOS DE PAGO
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
       HOJA 6 - VENTAS POR HORA
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
       HOJA 7 - PRODUCTOS
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
       HOJA 8 - RANKING PRODUCTOS
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

    console.error("❌ Error exportando Excel:", error);

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
export const crearIngreso = async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "No hay productos" });

    let total = 0;

    for (const item of items) {
      const { productId, quantity, costPrice } = item;
      if (!productId || quantity <= 0 || costPrice <= 0)
        return res.status(400).json({ error: "Datos inválidos en items" });

      const product = await Product.findById(productId);
      if (!product) return res.status(404).json({ error: `Producto no encontrado: ${productId}` });

      // Crear variante si no existe
      if (!product.variants || product.variants.length === 0) {
        product.variants = [{ sku: product.sku, stock: 0, stockMinimo: 5, stockIdeal: 10, price: 0 }];
      }

      // Actualizar stock
      product.variants[0].stock = Number(product.variants[0].stock || 0) + Number(quantity);
      await product.save();

      total += quantity * costPrice;
    }

    // Guardar ingreso
    const ingreso = new Ingreso({ items, total });
    await ingreso.save();

    res.json({ ok: true, ingreso });
  } catch (error) {
    console.error("❌ Error crearIngreso:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const importarExcel = async (req, res) => {
  try {
    // Verificar archivo
    if (!req.file) {
      return res.status(400).json({
        error: "No se subió ningún archivo",
      });
    }

    // Validar extensión
    const extension = req.file.originalname
      .split(".")
      .pop()
      .toLowerCase();

    const extensionesPermitidas = ["xlsx", "xls"];

    if (!extensionesPermitidas.includes(extension)) {
      return res.status(400).json({
        error: "Solo se permiten archivos Excel (.xlsx o .xls)",
      });
    }

    // Leer Excel
    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
    });

    // Obtener primera hoja
    const sheetName = workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];

    // Convertir Excel → JSON
    const productos = XLSX.utils.sheet_to_json(sheet);

    // Validar contenido
    if (!productos.length) {
      return res.status(400).json({
        error: "El Excel está vacío",
      });
    }

    // Formatear productos según tu schema
    const productosFormateados = productos.map((p) => ({
      sku: p.sku?.toString().trim(),

      title: p.title?.toString().trim(),

      description: p.description?.toString().trim() || "",

      brand: p.brand?.toString().trim() || "",

      category: p.category?.toString().trim() || "",

      // Tags separados por coma
      tags: p.tags
        ? p.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
        : [],

      pricing: {
        currency: "ARS",
        list: Number(p.price) || 0,
        taxIncluded: true,
      },

      variants: [
        {
          sku: p.sku?.toString().trim(),

          stock: Number(p.stock) || 0,

          stockMinimo: 5,

          stockIdeal: 10,

          price: Number(p.price) || 0,
        },
      ],

      status: "active",
    }));

    // Filtrar productos válidos
    const productosValidos = productosFormateados.filter(
      (p) =>
        p.sku &&
        p.title &&
        p.pricing.list >= 0
    );

    if (!productosValidos.length) {
      return res.status(400).json({
        error: "No hay productos válidos para importar",
      });
    }

    // Insertar o actualizar productos
    for (const producto of productosValidos) {
      await Product.updateOne(
        { sku: producto.sku },
        { $set: producto },
        { upsert: true }
      );
    }

    res.status(200).json({
      ok: true,
      total: productosValidos.length,
      msg: "Productos importados correctamente",
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Error al importar Excel",
    });
  }
};
export const exportarProductosExcel = async (req, res) => {
  try {
    // Obtener productos
    const products = await Product.find();

    // Transformar productos para Excel
    const productosExcel = products.map((p) => ({
      sku: p.sku || "",

      title: p.title || "",

      description: p.description || "",

      brand: p.brand || "",

      category: p.category || "",

      tags: p.tags?.join(",") || "",

      stock: p.variants?.[0]?.stock || 0,

      price: p.pricing?.list || 0,
    }));

    // Crear hoja
    const worksheet = XLSX.utils.json_to_sheet(productosExcel);

    // Crear libro
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Productos"
    );

    // Generar buffer
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    // Headers descarga
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=productos.xlsx"
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    // Enviar archivo
    res.send(excelBuffer);

  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Error al exportar productos",
    });
  }
};