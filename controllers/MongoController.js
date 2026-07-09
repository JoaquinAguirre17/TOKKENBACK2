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
import { uploadImage } from "../helpers/uploadImage.js";
import Ingreso from "../Models/Ingreso.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";


import User from "../Models/User.js";
import UserSession
  from "../Models/UserSession.js";

import "../Models/CashClosure.js";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "tokken_secret";


dayjs.extend(utc);
dayjs.extend(timezone);

// zona horaria del sistema POS
const TZ = "America/Argentina/Cordoba";

import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

/* =========================
   MP CLIENT
========================= */
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const preference = new Preference(client);

// opcional: default global
dayjs.tz.setDefault(TZ);


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
// Productoss
// -------------------------
// Normalizo las imágenes para que siempre tengan url, alt y source
// =========================
// NORMALIZADOR DE IMÁGENES
// Todas las respuestas salen
// con:
// url
// alt
// source
// =========================

const normalizeProductImages = (product) => {

  return {

    ...product,

    images: (product.images || []).map((img, index) => {


      // =========================
      // IMAGEN GUARDADA EN MONGO
      // =========================

      if (
        img.source === "mongo" ||
        img.contentType ||
        img.data
      ) {

        return {

          url:
            `https://tokkenback2.onrender.com/api/products/${product._id}/image/${index}`,

          alt:
            img.alt || product.title,

          source: "mongo"

        };

      }


      // =========================
      // IMAGEN EXTERNA
      // =========================

      return {

        url: img.url || "",

        alt:
          img.alt || product.title,

        source: "url"

      };


    })

  };

};
export const getProducts = async (_req, res) => {

  try {


    const products = await Product
      .find()
      .select("-images.data")
      .lean();



    const items = products.map(product =>

      normalizeProductImages(product)

    );



    return res.json(items);



  } catch (error) {


    console.error(
      "ERROR GET PRODUCTS:",
      error
    );


    return res.status(500).json({

      error:
        "Error obteniendo productos",

      detail:
        error.message

    });


  }

};
export const getProductImage = async (req, res) => {

  try {


    const {
      id,
      index
    } = req.params;



    const product =
      await Product.findById(id);



    if (!product) {

      return res.status(404).json({

        error:
          "Producto no encontrado"

      });

    }



    const img =
      product.images?.[Number(index)];



    if (!img) {

      return res.status(404).json({

        error:
          "Imagen no encontrada"

      });

    }



    // =========================
    // IMAGEN EXTERNA
    // =========================

    if (
      img.source === "url" &&
      img.url
    ) {

      return res.redirect(img.url);

    }



    // =========================
    // IMAGEN MONGO
    // =========================

    if (!img.data) {

      return res.status(404).json({

        error:
          "La imagen no tiene datos"

      });

    }



    res.set(
      "Content-Type",
      img.contentType || "image/jpeg"
    );



    return res.send(img.data);



  } catch (error) {


    console.error(
      "ERROR IMAGE:",
      error
    );


    return res.status(500).json({

      error:
        error.message

    });


  }

};

export const getProductById = async (req, res) => {

  try {


    const item =
      await Product
        .findById(req.params.id)
        .select("-images.data")
        .lean();



    if (!item) {

      return res.status(404).json({

        error:
          "Producto no encontrado"

      });

    }



    return res.json(

      normalizeProductImages(item)

    );



  } catch (error) {


    console.error(
      "ERROR GET PRODUCT ID:",
      error
    );


    return res.status(500).json({

      error: error.message

    });


  }

};

export const getProductBySlug = async (req, res) => {

  try {


    const item =
      await Product
        .findOne({
          slug: req.params.slug
        })
        .select("-images.data")
        .lean();



    if (!item) {

      return res.status(404).json({

        error:
          "Producto no encontrado"

      });

    }



    return res.json(

      normalizeProductImages(item)

    );



  } catch (error) {


    console.error(
      "ERROR GET PRODUCT SLUG:",
      error
    );


    return res.status(500).json({

      error: error.message

    });


  }

};

export const searchProducts = async (req, res) => {

  const { query } = req.query;

  if (!query?.trim()) {
    return res.status(400).json({
      message: "La consulta de búsqueda no puede estar vacía."
    });
  }

  try {

    const r = new RegExp(
      query.trim(),
      "i"
    );

    const items = await Product.find({
      $or: [
        { title: r },
        { sku: r },
        { brand: r }
      ]
    })
      .select("title pricing images _id")
      .limit(10)
      .lean();

    res.json(
      items.map(normalizeProductImages)
    );

  } catch (e) {

    res.status(500).json({
      message: "Error al buscar productos",
      error: e.message
    });

  }
};

export const createProduct = async (req, res) => {
  try {

    const body =
      req.body.product
        ? JSON.parse(req.body.product)
        : { ...req.body };

    /* =========================
       VALIDACIONES
    ========================= */

    if (!body.title) {
      return res.status(400).json({
        error: "title es requerido"
      });
    }

    if (!body.pricing?.list) {
      return res.status(400).json({
        error: "pricing.list es requerido"
      });
    }

    /* =========================
       SKU AUTOMÁTICO
    ========================= */

    if (!body.sku) {
      body.sku = generateSKU(
        body.title,
        body.brand
      );
    }

    console.log("========== CREATE PRODUCT ==========");
    console.log("BODY:", body);
    console.log("FILES:", req.files?.length || 0);

    /* =========================
       IMÁGENES
    ========================= */

    let finalImages = [];

    // ----------------------------------
    // URLs enviadas desde el frontend
    // ----------------------------------

    if (Array.isArray(body.images)) {

      finalImages.push(

        ...body.images.map(img => {

          // URL como string
          if (typeof img === "string") {

            return {
              url: img,
              alt: body.title,
              source: "url"
            };

          }

          // Objeto URL
          if (img.url) {

            return {
              url: img.url,
              alt: img.alt || body.title,
              source: "url"
            };

          }

          return img;

        })

      );

    }

    // ----------------------------------
    // Imágenes subidas desde PC/celular
    // ----------------------------------

    if (req.files?.length) {

      for (const file of req.files) {

        console.log("IMAGEN RECIBIDA:", {
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          bufferLength: file.buffer?.length
        });

        finalImages.push({

          alt: body.title,

          source: "mongo",

          data: file.buffer,

          contentType: file.mimetype

        });

      }

    }

    body.images = finalImages;

    console.log(
      "IMAGENES FINALES:",
      body.images.map(img => ({
        source: img.source,
        url: img.url || null
      }))
    );

    /* =========================
       CREAR PRODUCTO
    ========================= */

    const created =
      await Product.create(body);

    console.log(
      "PRODUCTO CREADO:",
      created._id
    );

    return res.status(201).json({
      ok: true,
      product: created
    });

  } catch (e) {

    console.error(
      "ERROR CREANDO PRODUCTO:",
      e
    );

    return res.status(400).json({
      error: e.message
    });

  }
};
// ======================================================
// ACTUALIZAR PRODUCTO
// ======================================================

export const updateProduct = async (req, res) => {

  try {

    const body =
      req.body.product
        ? JSON.parse(req.body.product)
        : { ...req.body };

    const product =
      await Product.findById(req.params.id);

    if (!product) {

      return res.status(404).json({
        error: "Producto no encontrado"
      });

    }

    console.log("========== UPDATE PRODUCT ==========");
    console.log("PRODUCT ID:", req.params.id);
    console.log("BODY:", body);
    console.log("FILES:", req.files?.length || 0);

    /* =========================
       SKU AUTOMÁTICO
    ========================= */

    if (!body.sku && (body.title || body.brand)) {

      body.sku = generateSKU(
        body.title || product.title,
        body.brand || product.brand
      );

    }

    /* =========================
       IMÁGENES
    ========================= */

    let finalImages = [];

    // Si subieron archivos nuevos
    if (req.files?.length > 0) {

      console.log(
        "REEMPLAZANDO IMAGENES:",
        req.files.length
      );

      finalImages = req.files.map(file => {

        console.log("GUARDANDO IMAGEN:", {
          name: file.originalname,
          size: file.size,
          type: file.mimetype
        });

        return {
          alt: body.title || product.title,
          source: "mongo",
          data: file.buffer,
          contentType: file.mimetype
        };

      });

    } else {

      // Si vienen imágenes desde el formulario
      if (body.images?.length) {

        finalImages = body.images.map(img => {

          // URL como string
          if (typeof img === "string") {

            return {
              url: img,
              alt: body.title || product.title,
              source: "url"
            };

          }

          // URL como objeto
          if (img.url) {

            return {
              url: img.url,
              alt: img.alt || body.title || product.title,
              source: "url"
            };

          }

          return img;

        });

      } else {

        // Mantener imágenes existentes
        finalImages = product.images || [];

      }

    }

    /* =========================
       ACTUALIZAR PRODUCTO
    ========================= */

    product.set({

      ...body,

      images: finalImages

    });

    const updated =
      await product.save();

    console.log(
      "PRODUCTO ACTUALIZADO:",
      updated._id
    );

    return res.json({

      ok: true,

      message:
        "Producto actualizado correctamente",

      product: updated

    });

  } catch (error) {

    console.error(
      "ERROR UPDATE PRODUCT:",
      error
    );

    if (error instanceof SyntaxError) {

      return res.status(400).json({

        error:
          "JSON inválido recibido en product"

      });

    }

    if (error.name === "ValidationError") {

      return res.status(400).json({

        error:
          "Error de validación",

        details:
          error.errors

      });

    }

    return res.status(500).json({

      error:
        "Error interno actualizando producto",

      detail:
        error.message

    });

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

    const {
      productos,
      metodoPago,
      cuotas = 1,
      vendedor,
      total,
      sessionId,
      descuentoPorcentaje = 0
    } = req.body;

    console.log("VENTA:", req.body);

    /* =========================
       VALIDAR PRODUCTOS
    ========================= */

    if (!productos?.length) {

      return res.status(400).json({
        message: "No hay productos"
      });

    }

    /* =========================
       OBTENER PRODUCTOS DB
    ========================= */

    const ids = productos.map(
      p => p.productId
    );

    const productosDb =
      await Product.find({
        _id: { $in: ids }
      }).lean();

    const mapProd = new Map(
      productosDb.map(
        p => [String(p._id), p]
      )
    );

    /* =========================
       NORMALIZAR ITEMS
    ========================= */

    const normItems =
      productos.map(p => {

        const db =
          mapProd.get(
            String(p.productId)
          );

        if (!db) {

          throw new Error(
            `Producto no encontrado: ${p.productId}`
          );

        }

        const price = Number(
          p.precio ??
          db?.pricing?.sale ??
          db?.pricing?.list ??
          0
        );

        const qty = Number(
          p.cantidad ?? 1
        );

        return {

          productId: db._id,

          title: db.title,

          sku:
            db?.variants?.[0]?.sku,

          price,

          qty,

          subtotal:
            price * qty

        };

      });

    /* =========================
       TOTAL PRODUCTOS
    ========================= */

    const itemsTotal =
      normItems.reduce(
        (a, b) => a + b.subtotal,
        0
      );

    /* =========================
       DESCUENTO
    ========================= */

    const subtotal =
      itemsTotal -
      (
        itemsTotal *
        Number(descuentoPorcentaje) /
        100
      );

    /* =========================
       RECARGO TARJETA CRÉDITO
    ========================= */

    let porcentajeRecargo = 0;

    if (metodoPago === "Crédito") {

      if (Number(cuotas) === 3) {

        porcentajeRecargo = 10;

      }

      if (Number(cuotas) === 6) {

        porcentajeRecargo = 20;

      }

    }

    /* =========================
       TOTAL FINAL
    ========================= */

    const totalFinal =
      subtotal +
      (
        subtotal *
        porcentajeRecargo /
        100
      );

    console.log({

      itemsTotal,

      descuentoPorcentaje,

      subtotal,

      porcentajeRecargo,

      totalFinal,

      totalFrontend: total

    });

    /* =========================
       VALIDAR TOTAL
    ========================= */

    if (
      Math.round(totalFinal) !==
      Math.round(total)
    ) {

      return res.status(400).json({

        message:
          "Total inconsistente",

        backendTotal:
          totalFinal,

        frontendTotal:
          total

      });

    }

    /* =========================
       NÚMERO DE ORDEN
    ========================= */

    const orderNumber =
      await generateOrderNumber();

    const now =
      dayjs()
        .tz(TZ)
        .toDate();

    /* =========================
       CREAR ORDEN
    ========================= */

    const order = new Order({

      orderNumber,

      items: normItems,

      totals: {

        items:
          itemsTotal,

        discountPercentage:
          Number(
            descuentoPorcentaje
          ),

        subtotal,

        grand:
          totalFinal

      },

      payment: {

        method:
          metodoPago,

        installments:
          Number(cuotas),

        status:
          "approved",

        amount:
          totalFinal,

        paidAt:
          now

      },

      createdBy:
        vendedor,

      sessionId,

      createdAt:
        now

    });

    /* =========================
       GUARDAR ORDEN
    ========================= */

    await order.save({
      session
    });

    console.log(
      "🟢 ORDER GUARDADA:",
      order
    );

    /* =========================
       DESCONTAR STOCK
    ========================= */

    await adjustStock(
      session,
      normItems,
      -1
    );

    /* =========================
       COMMIT
    ========================= */

    await session.commitTransaction();

    return res.status(201).json({

      message:
        "Venta registrada",

      order

    });

  } catch (error) {

    await session.abortTransaction();

    console.error(
      "❌ ERROR CREANDO ORDEN:",
      error
    );

    return res.status(500).json({

      message:
        "Error al crear orden",

      error:
        error.message

    });

  } finally {

    await session.endSession();

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
export const deleteOrder = async (req, res) => {

  const session = await mongoose.startSession();

  try {

    await session.startTransaction();

    const { id } = req.params;

    const order = await Order.findById(id)
      .session(session);

    if (!order) {

      await session.abortTransaction();

      return res.status(404).json({
        error: "Orden no encontrada",
      });

    }

    /* =========================
       DEVOLVER STOCK
    ========================= */

    for (const item of order.items) {

      if (!item.productId) continue;

      await Product.findByIdAndUpdate(
        item.productId,
        {
          $inc: {
            "variants.0.stock":
              Number(item.qty || 1),
          },
        },
        { session }
      );

    }

    /* =========================
       ELIMINAR ORDEN
    ========================= */

    await Order.findByIdAndDelete(
      id,
      { session }
    );

    await session.commitTransaction();

    res.json({
      success: true,
      message:
        "Venta eliminada correctamente",
    });

  } catch (error) {

    await session.abortTransaction();

    console.error(
      "❌ Error eliminando orden:",
      error
    );

    res.status(500).json({
      error: "Error al eliminar venta",
      message: error.message,
    });

  } finally {

    session.endSession();

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

      return res.status(400).json({
        error: "Falta fecha",
      });

    }

    const inicio = dayjs
      .tz(fecha, TZ)
      .startOf("day")
      .toDate();

    const fin = dayjs
      .tz(fecha, TZ)
      .endOf("day")
      .toDate();

    /* =========================
       VENTAS
    ========================= */

    const orders = await Order.find({

      "payment.status": "approved",

      createdAt: {
        $gte: inicio,
        $lte: fin,
      },

    }).lean();

    /* =========================
       INGRESOS
    ========================= */

    const ingresosDB = await Ingreso.find({

      createdAt: {
        $gte: inicio,
        $lte: fin,
      },

    }).lean();

    const ventas = [];

    const porVendedor = {};

    const porMedioPago = {};

    const porHora = {};

    const productos = {};

    let total = 0;

    /* =========================
       PROCESAR VENTAS
    ========================= */

    orders.forEach((o) => {

      const vendedor =
        o?.createdBy || "No especificado";

      const medioPago =
        o?.payment?.method ||
        "No especificado";

      const fechaPago =
        o?.createdAt;

      const hora =
        dayjs(fechaPago)
          .tz(TZ)
          .format("HH");

      /* =========================
         TOTAL REAL DE LA VENTA
      ========================= */

      const montoVenta =
        Number(
          o?.totals?.grand || 0
        );

      /* =========================
         PRODUCTOS DE LA VENTA
      ========================= */

      const nombresProductos =
        o.items
          ?.map(item => {

            const cantidad =
              Number(
                item.qty || 1
              );

            return cantidad > 1
              ? `${item.title} x${cantidad}`
              : item.title;

          })
          .join(" + ");

      /* =========================
         TABLA DE VENTAS
      ========================= */

      ventas.push({

        id: String(o._id),

        producto:
          nombresProductos,

        vendedor,

        medioPago,

        monto:
          montoVenta,

        descuento:
          Number(
            o?.totals?.discountPercentage || 0
          ),

        fecha:
          dayjs(fechaPago)
            .tz(TZ)
            .format("YYYY-MM-DD"),

        hora:
          dayjs(fechaPago)
            .tz(TZ)
            .format("HH:mm"),

      });

      /* =========================
         RESUMENES
      ========================= */

      total += montoVenta;

      porVendedor[vendedor] =
        (porVendedor[vendedor] || 0) +
        montoVenta;

      porMedioPago[medioPago] =
        (porMedioPago[medioPago] || 0) +
        montoVenta;

      porHora[hora] =
        (porHora[hora] || 0) +
        montoVenta;

      /* =========================
         ESTADISTICAS PRODUCTOS
      ========================= */

      o.items?.forEach(item => {

        const nombre =
          item.title || "Producto";

        const cantidad =
          Number(
            item.qty || 1
          );

        const subtotal =
          Number(
            item.subtotal || 0
          );

        if (!productos[nombre]) {

          productos[nombre] = {

            cantidad: 0,

            total: 0,

          };

        }

        productos[nombre].cantidad +=
          cantidad;

        productos[nombre].total +=
          subtotal;

      });

    });

    /* =========================
       PRODUCTOS INGRESADOS
    ========================= */

    const productosIngresados = [];

    for (const ingreso of ingresosDB) {

      for (const item of ingreso.items) {

        const productoDB =
          await Product.findById(
            item.productId
          ).lean();

        productosIngresados.push({

          nombre:
            productoDB?.title ||
            "Producto",

          cantidad:
            item.quantity,

          fecha:
            dayjs(
              ingreso.createdAt
            )
              .tz(TZ)
              .format(
                "YYYY-MM-DD HH:mm"
              ),

        });

      }

    }

    /* =========================
       RESPUESTA
    ========================= */

    res.json({

      ventas,

      productos,

      productosIngresados,

      resumen: {

        total,

        comisiones:
          total * 0.02,

        cantidadVentas:
          orders.length,

      },

      porVendedor,

      porMedioPago,

      porHora,

    });

  } catch (error) {

    console.error(
      "❌ Error cierre caja:",
      error
    );

    res.status(500).json({

      error:
        "Error al obtener cierre",

      message:
        error.message,

    });

  }
};
// Obtener ventas por mes
export const obtenerVentasPorMes = async (req, res) => {
  try {
    let { mes, anio } = req.query;

    // 🔴 VALIDACIÓN
    if (!mes || !anio) {
      return res.status(400).json({
        error: "Falta mes o año"
      });
    }

    mes = Number(mes);
    anio = Number(anio);

    if (Number.isNaN(mes) || Number.isNaN(anio)) {
      return res.status(400).json({
        error: "Mes y año deben ser numéricos"
      });
    }

    if (mes < 1 || mes > 12) {
      return res.status(400).json({
        error: "Mes inválido (1-12)"
      });
    }

    // 🟡 RANGO DE FECHAS
    const inicio = dayjs(new Date(anio, mes - 1, 1))
      .startOf("month")
      .toDate();

    const fin = dayjs(new Date(anio, mes - 1, 1))
      .endOf("month")
      .toDate();

    /* =========================
       VENTAS
    ========================= */

    const orders = await Order.find({
      "payment.status": "approved",
      createdAt: { $gte: inicio, $lte: fin }
    })
      .lean()
      .select("items totals payment createdAt createdBy");

    /* =========================
       INGRESOS
    ========================= */

    const ingresosDB = await Ingreso.find({
      createdAt: { $gte: inicio, $lte: fin }
    })
      .lean()
      .select("total createdAt");

    /* =========================
       INIT ESTADÍSTICAS
    ========================= */

    const ventas = [];
    const productos = {};
    const porVendedor = {};
    const porMedioPago = {};
    const porHora = {};
    const porDia = {};

    let totalVentas = 0;

    /* =========================
       PROCESAR VENTAS
    ========================= */

    orders.forEach((o) => {
      const fecha = dayjs(o.createdAt);
      const dia = fecha.format("YYYY-MM-DD");
      const hora = fecha.format("HH");

      const vendedor = o?.createdBy || "No especificado";
      const medioPago = o?.payment?.method || "No especificado";

      const monto = Number(o?.totals?.grand || 0);
      const descuento = Number(o?.totals?.discountPercentage || 0);

      // 🧾 PRODUCTOS EN UNA SOLA VENTA
      const nombresProductos = (o.items || [])
        .map((item) => {
          const qty = Number(item.qty || 1);
          return qty > 1 ? `${item.title} x${qty}` : item.title;
        })
        .join(" + ");

      ventas.push({
        id: String(o._id),
        producto: nombresProductos,
        vendedor,
        medioPago,
        monto,
        descuento,
        fecha: fecha.format("YYYY-MM-DD"),
        hora: fecha.format("HH:mm")
      });

      // 📊 TOTALES GENERALES
      totalVentas += monto;

      porVendedor[vendedor] =
        (porVendedor[vendedor] || 0) + monto;

      porMedioPago[medioPago] =
        (porMedioPago[medioPago] || 0) + monto;

      porHora[hora] =
        (porHora[hora] || 0) + monto;

      porDia[dia] =
        (porDia[dia] || 0) + monto;

      // 📦 PRODUCTOS AGRUPADOS
      (o.items || []).forEach((item) => {
        const nombre = item.title || "Producto";
        const cantidad = Number(item.qty || 1);
        const subtotal = Number(item.subtotal || 0);

        if (!productos[nombre]) {
          productos[nombre] = {
            cantidad: 0,
            total: 0
          };
        }

        productos[nombre].cantidad += cantidad;
        productos[nombre].total += subtotal;
      });
    });

    /* =========================
       INGRESOS
    ========================= */

    const totalIngresos = ingresosDB.reduce(
      (acc, i) => acc + (i.total || 0),
      0
    );

    const ingresos = ingresosDB.map((i) => ({
      fecha: dayjs(i.createdAt).format("YYYY-MM-DD"),
      total: i.total || 0
    }));

    /* =========================
       RESPUESTA FINAL (SAFE CONTRACT)
    ========================= */

    return res.json({
      ventas,
      productos,
      ingresos,

      porVendedor,
      porMedioPago,
      porHora,
      porDia,

      resumen: {
        total: totalVentas,
        ingresos: totalIngresos,
        balance: totalVentas - totalIngresos,
        cantidadVentas: orders.length
      }
    });
  } catch (error) {
    console.error("❌ Error ventas por mes:", error);

    return res.status(500).json({
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
    const body = req.body || {};

    const ventas = body.ventas || [];
    const resumen = body.resumen || {};
    const porVendedor = body.porVendedor || {};
    const porMedioPago = body.porMedioPago || {};
    const porHora = body.porHora || {};
    const productos = body.productos || {};
    const ingresos = body.ingresos || [];

    const ventasAnterior = body.ventasAnterior || 0;
    const ingresosAnterior = body.ingresosAnterior || 0;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "BI PRO POS SYSTEM";
    workbook.created = new Date();

    /* =========================
       MÉTRICAS BASE
    ========================= */

    const totalVentas = resumen.total || 0;

    const totalIngresos = ingresos.reduce(
      (acc, i) => acc + (i.total || 0),
      0
    );

    const balance = totalVentas - totalIngresos;
    const cantidadVentas = resumen.cantidadVentas || 0;

    const ticketPromedio =
      cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;

    const crecimientoVentas =
      ventasAnterior > 0
        ? ((totalVentas - ventasAnterior) / ventasAnterior) * 100
        : 0;

    const crecimientoIngresos =
      ingresosAnterior > 0
        ? ((totalIngresos - ingresosAnterior) / ingresosAnterior) * 100
        : 0;

    const proyeccion =
      (totalVentas + ventasAnterior) / 2;

    /* =========================
       DASHBOARD
    ========================= */

    const dashboard = workbook.addWorksheet("Dashboard BI");

    const mejorVendedor =
      Object.entries(porVendedor || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

    const mejorProducto =
      Object.entries(productos || {}).sort((a, b) => b[1].total - a[1].total)[0]?.[0] || "-";

    const mejorHora =
      Object.entries(porHora || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

    dashboard.addRow(["📊 DASHBOARD BI"]);
    dashboard.addRow([]);

    dashboard.addRow(["Ventas", totalVentas]);
    dashboard.addRow(["Ingresos", totalIngresos]);
    dashboard.addRow(["Balance", balance]);
    dashboard.addRow(["Cantidad ventas", cantidadVentas]);
    dashboard.addRow(["Ticket promedio", ticketPromedio]);

    dashboard.addRow([]);

    dashboard.addRow(["📈 Crecimiento ventas %", `${crecimientoVentas.toFixed(2)}%`]);
    dashboard.addRow(["📈 Crecimiento ingresos %", `${crecimientoIngresos.toFixed(2)}%`]);

    dashboard.addRow([]);

    dashboard.addRow(["🏆 Mejor vendedor", mejorVendedor]);
    dashboard.addRow(["🍔 Mejor producto", mejorProducto]);
    dashboard.addRow(["⏰ Hora pico", mejorHora]);

    dashboard.addRow([]);

    dashboard.addRow(["🔮 Proyección ventas", proyeccion]);

    dashboard.getCell("A1").font = { size: 18, bold: true };
    dashboard.getColumn(1).width = 30;
    dashboard.getColumn(2).width = 25;

    /* =========================
       VENTAS DETALLADAS
    ========================= */

    const ventasSheet = workbook.addWorksheet("Ventas");

    ventasSheet.columns = [
      { header: "Producto", key: "producto", width: 35 },
      { header: "Vendedor", key: "vendedor", width: 20 },
      { header: "Medio Pago", key: "medioPago", width: 20 },
      { header: "Monto", key: "monto", width: 15 },
      { header: "Descuento %", key: "descuento", width: 15 },
      { header: "Fecha", key: "fecha", width: 15 },
      { header: "Hora", key: "hora", width: 10 },
      { header: "ID", key: "id", width: 25 }
    ];

    ventas.forEach(v => {
      ventasSheet.addRow({
        producto: v.producto || "-",
        vendedor: v.vendedor || "-",
        medioPago: v.medioPago || "-",
        monto: v.monto || 0,
        descuento: v.descuento || 0,
        fecha: v.fecha || "-",
        hora: v.hora || "-",
        id: v.id || "-"
      });
    });

    ventasSheet.getRow(1).font = { bold: true };

    /* =========================
       INGRESOS
    ========================= */

    const ingresosSheet = workbook.addWorksheet("Ingresos");

    ingresosSheet.columns = [
      { header: "Fecha", key: "fecha", width: 15 },
      { header: "Total", key: "total", width: 20 }
    ];

    ingresos.forEach(i => {
      ingresosSheet.addRow({
        fecha: i.fecha || "-",
        total: i.total || 0
      });
    });

    ingresosSheet.getRow(1).font = { bold: true };

    /* =========================
       PRODUCTOS
    ========================= */

    const productosSheet = workbook.addWorksheet("Top Productos");

    productosSheet.columns = [
      { header: "Producto", key: "nombre", width: 40 },
      { header: "Cantidad", key: "cantidad", width: 15 },
      { header: "Total", key: "total", width: 20 },
      { header: "% impacto", key: "porcentaje", width: 20 }
    ];

    const totalProductos = Object.values(productos || {})
      .reduce((acc, p) => acc + (p.total || 0), 0);

    Object.entries(productos || {})
      .map(([nombre, data]) => ({
        nombre,
        cantidad: data.cantidad || 0,
        total: data.total || 0,
        porcentaje:
          totalProductos > 0
            ? ((data.total / totalProductos) * 100).toFixed(2) + "%"
            : "0%"
      }))
      .sort((a, b) => b.total - a.total)
      .forEach(p => productosSheet.addRow(p));

    productosSheet.getRow(1).font = { bold: true };

    /* =========================
       PRODUCTIVIDAD VENDEDORES
    ========================= */

    const vendedorSheet = workbook.addWorksheet("Productividad");

    vendedorSheet.columns = [
      { header: "Vendedor", key: "vendedor", width: 25 },
      { header: "Ventas", key: "ventas", width: 15 },
      { header: "Horas", key: "horas", width: 15 },
      { header: "$/Hora", key: "porHora", width: 15 },
      { header: "Comisión", key: "comision", width: 15 },
      { header: "Neto", key: "neto", width: 15 }
    ];

    const map = {};

    ventas.forEach(v => {
      const vendedor = v.vendedor || "Sin vendedor";

      if (!map[vendedor]) {
        map[vendedor] = { total: 0, fechas: [] };
      }

      map[vendedor].total += v.monto || 0;
      map[vendedor].fechas.push(new Date(v.fecha));
    });

    Object.entries(map).forEach(([vendedor, data]) => {
      const total = data.total;

      const fechas = data.fechas.sort((a, b) => a - b);

      const horas =
        fechas.length > 1
          ? (fechas[fechas.length - 1] - fechas[0]) / (1000 * 60 * 60)
          : 1;

      const comision = total * 0.02;
      const neto = total - comision;

      vendedorSheet.addRow({
        vendedor,
        ventas: total,
        horas: horas.toFixed(2),
        porHora: (total / horas).toFixed(2),
        comision,
        neto
      });
    });

    vendedorSheet.getRow(1).font = { bold: true };

    /* =========================
       FLUJO DE CAJA
    ========================= */

    const cashflow = workbook.addWorksheet("Flujo de caja");

    cashflow.columns = [
      { header: "Tipo", key: "tipo", width: 15 },
      { header: "Monto", key: "monto", width: 15 },
      { header: "Fecha", key: "fecha", width: 20 }
    ];

    ventas.forEach(v => {
      cashflow.addRow({ tipo: "VENTA", monto: v.monto, fecha: v.fecha });
    });

    ingresos.forEach(i => {
      cashflow.addRow({ tipo: "INGRESO", monto: i.total, fecha: i.fecha });
    });

    cashflow.getRow(1).font = { bold: true };

    /* =========================
       DESCARGA
    ========================= */

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=BI_PRO_dashboard.xlsx"
    );

    return res.end(buffer);
  } catch (error) {
    console.error("❌ Error BI Excel:", error);

    return res.status(500).json({
      error: "Error generando Excel BI",
      message: error.message
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
    // 1. Verificar archivo
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "No se subió ningún archivo",
      });
    }

    // 2. Validar extensión
    const extension = req.file.originalname
      .split(".")
      .pop()
      .toLowerCase();

    const extensionesPermitidas = ["xlsx", "xls"];

    if (!extensionesPermitidas.includes(extension)) {
      return res.status(400).json({
        ok: false,
        error: "Solo se permiten archivos Excel (.xlsx o .xls)",
      });
    }

    // 3. Leer Excel
    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
    });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const productos = XLSX.utils.sheet_to_json(sheet);

    // 4. Validar contenido
    if (!productos.length) {
      return res.status(400).json({
        ok: false,
        error: "El Excel está vacío",
      });
    }

    // 5. Formatear productos
    const productosFormateados = productos.map((p) => ({
      sku: p.sku?.toString().trim(),
      title: p.title?.toString().trim(),
      description: p.description?.toString().trim() || "",
      brand: p.brand?.toString().trim() || "",
      category: p.category?.toString().trim() || "",

      tags: p.tags
        ? p.tags
          .toString()
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
        : [],

      pricing: {
        currency: "ARS",
        list: Number(p.price) || 0,
        taxIncluded: true,
      },

      images: p.image
        ? [{ url: p.image, alt: p.title || "" }]
        : [],

      variants: [
        {
          sku: p.sku?.toString().trim(),
          stock: Number(p.stock) || 0,
          stockMinimo: Number(p.stockMinimo) || 5,
          stockIdeal: Number(p.stockIdeal) || 10,
          price: Number(p.price) || 0,
        },
      ],

      status: "active",
    }));

    // 6. Filtrar inválidos
    const productosValidos = productosFormateados.filter(
      (p) =>
        p.sku &&
        p.title &&
        typeof p.pricing.list === "number"
    );

    if (!productosValidos.length) {
      return res.status(400).json({
        ok: false,
        error: "No hay productos válidos para importar",
      });
    }

    // 7. IMPORTANTE: insertar/actualizar correctamente
    let insertados = 0;
    let actualizados = 0;

    for (const producto of productosValidos) {
      const result = await Product.updateOne(
        { sku: producto.sku },
        {
          $set: producto,
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        insertados++;
      } else {
        actualizados++;
      }
    }

    // 8. Respuesta real
    return res.status(200).json({
      ok: true,
      total: productosValidos.length,
      insertados,
      actualizados,
      msg: "Importación completada correctamente",
    });

  } catch (error) {
    console.log("IMPORT ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "Error al importar Excel",
    });
  }
};
export const exportarProductosExcel = async (req, res) => {
  try {
    const products = await Product.find();

    const productosExcel = products.map((p) => {
      const variant = p.variants?.[0] || {};
      const image = p.images?.[0]?.url || "";

      return {
        sku: p.sku || "",
        title: p.title || "",
        description: p.description || "",
        brand: p.brand || "",
        category: p.category || "",
        tags: p.tags?.join(",") || "",

        image, // 👈 nueva columna

        stock: variant.stock ?? 0,
        stockMinimo: variant.stockMinimo ?? 0,
        stockIdeal: variant.stockIdeal ?? 0,

        price: p.pricing?.list || 0,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(productosExcel);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=productos.xlsx"
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(excelBuffer);

  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Error al exportar productos",
    });
  }
};

//Funcion de login
export const login = async (req, res) => {

  try {

    const {
      username,
      password
    } = req.body;

    /* =========================
       BUSCAR USUARIO
    ========================= */
    const user =
      await User.findOne({
        username
      });

    if (!user) {

      return res.status(401).json({
        error: "Usuario incorrecto",
      });

    }

    /* =========================
       VALIDAR CONTRASEÑA
    ========================= */
    const validPassword =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!validPassword) {

      return res.status(401).json({
        error: "Contraseña incorrecta",
      });

    }

    /* =========================
       CERRAR SESIONES ACTIVAS
       ANTERIORES DEL USUARIO
    ========================= */
    const sesionesActivas =
      await UserSession.find({

        userId: user._id,

        active: true

      });

    for (const session of sesionesActivas) {

      const logoutAt =
        new Date();

      const durationMinutes =
        Math.floor(
          (logoutAt - session.loginAt)
          / 60000
        );

      session.logoutAt =
        logoutAt;

      session.durationMinutes =
        durationMinutes;

      session.active = false;

      await session.save();

    }

    /* =========================
       GENERAR TOKEN JWT
    ========================= */
    const token = jwt.sign(
      {
        id: user._id,
        rol: user.rol,
        username: user.username,
      },
      JWT_SECRET,
      {
        expiresIn: "6h"
      }
    );

    /* =========================
       GENERAR SESSION ID
    ========================= */
    const sessionId =
      crypto.randomUUID();

    /* =========================
       CREAR NUEVA SESIÓN
    ========================= */
    await UserSession.create({

      userId: user._id,

      username: user.username,

      nombre: user.nombre,

      rol: user.rol,

      sessionId,

      loginAt: new Date(),

      active: true,

    });

    /* =========================
       RESPUESTA
    ========================= */
    return res.json({

      token,

      sessionId,

      user: {

        id: user._id,

        nombre: user.nombre,

        username: user.username,

        rol: user.rol,

      },

    });

  } catch (error) {

    console.error(
      "ERROR LOGIN:",
      error
    );

    return res.status(500).json({

      error: "Error login"

    });

  }

};

export const checkSession = async (req, res) => {

  try {

    const { sessionId } = req.body;

    const session =
      await UserSession.findOne({
        sessionId
      });

    if (!session || !session.active) {

      return res.status(401).json({
        error: "Sesión inválida o expirada",
      });

    }

    /* =========================
       VALIDAR LÍMITE DE 6 HORAS
    ========================= */
    const horasTranscurridas =
      (Date.now() - session.loginAt.getTime()) /
      (1000 * 60 * 60);

    if (horasTranscurridas >= 6) {

      session.active = false;

      session.logoutAt = new Date();

      session.durationMinutes =
        Math.floor(
          (session.logoutAt - session.loginAt)
          / 60000
        );

      await session.save();

      return res.status(401).json({
        error: "La sesión expiró (6 horas)"
      });

    }

    return res.json({
      ok: true,
      session,
    });

  } catch (error) {

    return res.status(500).json({
      error: "Error validando sesión",
    });

  }

};

export const getCashClosureModal = async (req, res) => {
  try {

    const { fecha, sessionId } = req.query;

    if (!fecha) {
      return res.status(400).json({
        error: "Falta fecha",
      });
    }

    /* =========================
       FECHA INICIO / FIN
    ========================= */
    const inicio = dayjs
      .tz(fecha, TZ)
      .startOf("day")
      .toDate();

    const fin = dayjs
      .tz(fecha, TZ)
      .endOf("day")
      .toDate();

    /* =========================
       BUSCAR ÓRDENES
    ========================= */
    console.log("📥 QUERY:", {
      fecha,
      sessionId
    });
    console.log("📆 INICIO:", inicio);
    console.log("📆 FIN:", fin);
    const orders = await Order.find({
      "payment.status": "approved",

      createdAt: {
        $gte: inicio,
        $lte: fin,
      },

      ...(sessionId
        ? { sessionId }
        : {}),
    }).lean();
    console.log("📆 INICIO:", inicio);
    console.log("📆 FIN:", fin);
    console.log("=================================");
    console.log("💰 CIERRE DE CAJA MODAL");
    console.log("📅 FECHA:", fecha);
    console.log("🧾 ÓRDENES:", orders.length);
    console.log("🆔 SESSION:", sessionId);
    console.log("=================================");

    /* =========================
       ACUMULADORES
    ========================= */
    let total = 0;

    const porMedioPago = {
      "Efectivo": 0,
      "Transferencia": 0,
      "Débito": 0,
      "Crédito": 0,
      "QR Openpay": 0,
    };

    /* =========================
       RECORRER ÓRDENES
    ========================= */
    orders.forEach((o) => {

      const amount = Number(
        o?.totals?.grand || 0
      );

      total += amount;

      const medioPago =
        o?.payment?.method ||
        "Efectivo";

      console.log(
        "💳 PAYMENT:",
        medioPago,
        "| MONTO:",
        amount
      );

      if (
        porMedioPago[medioPago] !== undefined
      ) {
        porMedioPago[medioPago] += amount;
      }

    });

    /* =========================
       RESPUESTA
    ========================= */
    return res.json({

      resumen: {
        total,
        cantidadVentas: orders.length,
      },

      porMedioPago,

    });

  } catch (error) {

    console.error(
      "❌ ERROR CIERRE MODAL:",
      error
    );

    return res.status(500).json({
      message: "Error obteniendo cierre",
      error: error.message,
      stack: error.stack,
    });

  }
};

export const createCashClosure = async (req, res) => {

  try {

    /* =========================
       DATOS RECIBIDOS DEL FRONT
    ========================= */
    const {
      sessionId,
      realByPayment,
      withdrawals = 0,
      observations = "",
      difference = 0,
    } = req.body;

    console.log(
      "🧾 CIERRE DE CAJA RECIBIDO:",
      req.body
    );

    /* =========================
       VALIDAR SESSION ID
    ========================= */
    if (!sessionId) {

      return res.status(400).json({
        error: "Falta sessionId"
      });

    }

    /* =========================
       BUSCAR SESIÓN ACTIVA
       PARA OBTENER EL userId
    ========================= */
    const session =
      await UserSession.findOne({
        sessionId
      });

    if (!session) {

      return res.status(404).json({
        error: "Sesión no encontrada"
      });

    }

    /* =========================
       NORMALIZAR MEDIOS DE PAGO
       EL FRONT ENVÍA:
       Efectivo
       Transferencia
       Débito
       Crédito
       QR Openpay
 
       EL MODELO ESPERA:
       efectivo
       transferencia
       debito
       credito
       qr
    ========================= */
    const pagosNormalizados = {

      efectivo:
        Number(
          realByPayment?.["Efectivo"] || 0
        ),

      transferencia:
        Number(
          realByPayment?.["Transferencia"] || 0
        ),

      debito:
        Number(
          realByPayment?.["Débito"] || 0
        ),

      credito:
        Number(
          realByPayment?.["Crédito"] || 0
        ),

      qr:
        Number(
          realByPayment?.["QR Openpay"] || 0
        ),

    };

    /* =========================
       CALCULAR TOTAL REAL
    ========================= */
    const realTotal =

      pagosNormalizados.efectivo +
      pagosNormalizados.transferencia +
      pagosNormalizados.debito +
      pagosNormalizados.credito +
      pagosNormalizados.qr;

    /* =========================
       CREAR CIERRE DE CAJA
    ========================= */
    const closure =
      await CashClosure.create({

        userId:
          session.userId,

        sessionId,

        date:
          new Date(),

        realByPayment:
          pagosNormalizados,

        realTotal,

        withdrawals,

        observations,

        difference,

      });

    console.log(
      "✅ CIERRE GUARDADO:",
      closure._id
    );

    /* =========================
       RESPUESTA EXITOSA
    ========================= */
    return res.json({

      ok: true,

      message:
        "Cierre de caja guardado correctamente",

      closure

    });

  } catch (error) {

    console.error(
      "❌ Error createCashClosure:",
      error
    );

    return res.status(500).json({

      ok: false,

      error:
        "Error al crear cierre de caja"

    });

  }

};
export const logout = async (req, res) => {

  try {

    console.log("=================================");
    console.log("🚪 LOGOUT EJECUTADO");
    console.log("BODY:", req.body);

    const { sessionId } = req.body;

    console.log("🆔 SESSION ID:", sessionId);

    /* =========================
       1. BUSCAR SESIÓN
    ========================= */
    const session =
      await UserSession.findOne({ sessionId });

    if (!session) {

      return res.status(404).json({
        error: "Sesión no encontrada",
      });

    }

    /* =========================
       2. CALCULAR DURACIÓN
    ========================= */
    const logoutAt = new Date();

    const durationMinutes =
      Math.floor(
        (logoutAt - session.loginAt) / 60000
      );

    /* =========================
       3. OBTENER ÓRDENES (SOLO INFO)
       NO CREAR CASH CLOSURE ACÁ
    ========================= */
    const orders =
      await Order.find({ sessionId });

    let totalSales = 0;

    orders.forEach(order => {
      totalSales += order.total;
    });

    console.log(
      "💰 TOTAL VENTAS SESIÓN:",
      totalSales
    );

    /* =========================
       4. CERRAR SESIÓN
    ========================= */
    session.logoutAt = logoutAt;
    session.durationMinutes = durationMinutes;
    session.active = false;

    await session.save();

    /* =========================
       5. RESPUESTA
    ========================= */
    return res.json({
      message: "Logout exitoso",
      durationMinutes,
    });

  } catch (error) {

    console.error("Error logout:", error);

    return res.status(500).json({
      error: "Error logout",
    });

  }
};
/* =====================================
   CERRAR SESIONES ABANDONADAS
   Busca sesiones activas con más de
   24 horas y las cierra automáticamente
===================================== */
/* ==================================================
   CERRAR SESIONES ABANDONADAS
 
   Busca sesiones activas que superen 24 horas
   y las cierra automáticamente.
 
   Esto sirve para limpiar sesiones viejas que
   quedaron abiertas por errores, cierres del
   navegador o caídas del sistema.
================================================== */
export const cerrarSesionesAbandonadas = async (
  req,
  res
) => {

  try {

    /* =========================
       FECHA LÍMITE (24 HORAS)
    ========================= */
    const limite = new Date(
      Date.now() - (6 * 60 * 60 * 1000)
    );

    /* =========================
       BUSCAR SESIONES VIEJAS
    ========================= */
    const sesiones =
      await UserSession.find({

        active: true,

        loginAt: {
          $lt: limite
        }

      });

    let cerradas = 0;

    /* =========================
       CERRAR UNA POR UNA
    ========================= */
    for (const session of sesiones) {

      const logoutAt =
        new Date();

      const durationMinutes =
        Math.floor(
          (logoutAt - session.loginAt)
          / 60000
        );

      session.logoutAt =
        logoutAt;

      session.durationMinutes =
        durationMinutes;

      session.active = false;

      await session.save();

      cerradas++;

    }

    /* =========================
       RESPUESTA
    ========================= */
    return res.json({

      ok: true,

      sesionesEncontradas:
        sesiones.length,

      sesionesCerradas:
        cerradas

    });

  } catch (error) {

    console.error(
      "ERROR CERRAR SESIONES:",
      error
    );

    return res.status(500).json({

      ok: false,

      error:
        "Error cerrando sesiones"

    });

  }

};

/* =====================================
   DETALLE DE PERSONAL
   Devuelve todas las sesiones de un
   usuario dentro de un rango de fechas
===================================== */
export const getPersonalDetail = async (req, res) => {

  try {

    /* =========================
       OBTENER PARÁMETROS
    ========================= */
    const { username } = req.params;

    const {
      desde,
      hasta
    } = req.query;

    /* =========================
       VALIDACIONES
    ========================= */
    if (!username) {

      return res.status(400).json({
        error: "Usuario requerido"
      });

    }

    if (!desde || !hasta) {

      return res.status(400).json({
        error:
          "Debe enviar desde y hasta"
      });

    }

    /* =========================
       ARMAR RANGO DE FECHAS
    ========================= */
    const inicio =
      new Date(desde);

    const fin =
      new Date(hasta);

    // Fin del día
    fin.setHours(
      23,
      59,
      59,
      999
    );

    /* =========================
       BUSCAR SESIONES
    ========================= */
    const sesiones =
      await UserSession.find({

        nombre: username,

        loginAt: {
          $gte: inicio,
          $lte: fin
        }

      })
        .sort({
          loginAt: -1
        });

    /* =========================
       FORMATEAR RESPUESTA
    ========================= */
    const detalle =
      sesiones.map(session => {

        const minutos =
          session.durationMinutes || 0;

        const horas =
          Number(
            (
              minutos / 60
            ).toFixed(2)
          );

        return {

          sessionId:
            session.sessionId,

          usuario:
            session.nombre,

          rol:
            session.rol,

          fecha:
            session.loginAt
              ?.toISOString()
              ?.split("T")[0],

          entrada:
            session.loginAt,

          salida:
            session.logoutAt,

          minutos,

          horas,

          activa:
            session.active

        };

      });

    /* =========================
       RESPUESTA FINAL
    ========================= */
    return res.json({
      usuario: username,
      totalSesiones:
        detalle.length,
      sesiones: detalle
    });

  } catch (error) {

    console.error(
      "ERROR GET PERSONAL DETAIL:",
      error
    );

    return res.status(500).json({
      error:
        "Error obteniendo detalle del usuario"
    });

  }

};
/* ==========================================
 REPORTE GENERAL DE PERSONAL
 AGRUPADO POR USUARIO
========================================== */
export const getPersonalReport = async (
  req,
  res
) => {

  try {

    /* =========================
       FECHAS
    ========================= */
    const {
      desde,
      hasta
    } = req.query;

    if (!desde || !hasta) {

      return res.status(400).json({
        error:
          "Debe enviar desde y hasta"
      });

    }

    /* =========================
       RANGO DE FECHAS
    ========================= */
    const inicio =
      new Date(desde);

    const fin =
      new Date(hasta);

    fin.setHours(
      23,
      59,
      59,
      999
    );

    /* =========================
       TRAER SESIONES
    ========================= */
    const sesiones =
      await UserSession.find({

        loginAt: {
          $gte: inicio,
          $lte: fin
        }

      });

    /* =========================
       AGRUPAR POR USUARIO
    ========================= */
    const resumen = {};

    sesiones.forEach(session => {

      const usuario =
        session.nombre;

      if (!resumen[usuario]) {

        resumen[usuario] = {

          usuario,

          dias: new Set(),

          minutos: 0,

          sesiones: 0,

          abandonadas: 0

        };

      }

      /* =========================
         CONTAR DÍAS TRABAJADOS
      ========================= */
      const fecha =
        session.loginAt
          .toISOString()
          .split("T")[0];

      resumen[usuario]
        .dias
        .add(fecha);

      /* =========================
     CALCULAR MINUTOS
     Si la sesión está cerrada:
     usa durationMinutes
  
     Si sigue activa:
     calcula desde loginAt
  ========================= */
      let minutosSesion = 0;

      if (
        session.durationMinutes !== null &&
        session.durationMinutes !== undefined
      ) {

        minutosSesion =
          session.durationMinutes;

      } else {

        minutosSesion = Math.floor(
          (
            new Date() -
            new Date(session.loginAt)
          ) / 60000
        );

      }

      /* =========================
         SUMAR MINUTOS
      ========================= */
      resumen[usuario]
        .minutos += minutosSesion;

      /* =========================
         CONTAR SESIÓN
      ========================= */
      resumen[usuario]
        .sesiones++;

      /* =========================
         SESIONES ABANDONADAS
      
         Activa hace más de 24 horas
      ========================= */
      if (session.active) {

        const horasActiva =
          (
            new Date() -
            new Date(session.loginAt)
          ) / (1000 * 60 * 60);

        if (horasActiva > 24) {

          resumen[usuario]
            .abandonadas++;

        }

      }

    });

    /* =========================
       FORMATEAR RESPUESTA
    ========================= */
    const resultado =
      Object.values(resumen)
        .map(item => ({

          usuario:
            item.usuario,

          diasTrabajados:
            item.dias.size,

          horas:
            Number(
              (
                item.minutos / 60
              ).toFixed(2)
            ),

          sesiones:
            item.sesiones,

          abandonadas:
            item.abandonadas

        }));

    /* =========================
       RESPUESTA
    ========================= */
    return res.json(resultado);

  } catch (error) {

    console.error(
      "ERROR PERSONAL REPORT:",
      error
    );

    return res.status(500).json({

      error:
        "Error obteniendo reporte"

    });

  }

};
/* =========================
   CREATE WEB CHECKOUT
========================= */
export const createWebCheckout = async (req, res) => {
  try {
    const {
      customer,
      deliveryType,
      shipping,
      productos,
      total,
    } = req.body;

    /* =========================
       VALIDACIÓN BÁSICA
    ========================= */
    if (!productos?.length) {
      return res.status(400).json({
        message: "Carrito vacío",
      });
    }

    /* =========================
       RECONSTRUIR ITEMS DESDE DB (IMPORTANTE)
    ========================= */
    const items = [];

    for (const p of productos) {
      const product = await Product.findById(p.productId);

      if (!product) continue;

      const price =
        product.pricing?.sale || product.pricing?.list;

      const qty = p.qty || 1;

      items.push({
        productId: product._id,
        title: product.title,
        sku: product.sku,
        price,
        qty,
        subtotal: price * qty,
      });
    }

    const subtotal = items.reduce(
      (acc, i) => acc + i.subtotal,
      0
    );

    const shippingCost =
      deliveryType === "delivery" ? shipping : 0;

    const grandTotal = subtotal + shippingCost;

    /* =========================
       CREAR WEB ORDER
    ========================= */
    const orderNumber = crypto
      .randomBytes(6)
      .toString("hex")
      .toUpperCase();

    const webOrder = await WebOrder.create({
      orderNumber,
      customer,
      deliveryType,
      shippingCost,
      items,
      totals: {
        subtotal,
        shipping: shippingCost,
        total: grandTotal,
      },
    });

    /* =========================
       CREAR PREFERENCIA MP
    ========================= */
    const response = await preference.create({
      body: {
        items: [
          ...items.map((i) => ({
            title: i.title,
            quantity: i.qty,
            unit_price: i.price,
            currency_id: "ARS",
          })),
          ...(shippingCost > 0
            ? [
              {
                title: "Envío",
                quantity: 1,
                unit_price: shippingCost,
                currency_id: "ARS",
              },
            ]
            : []),
        ],

        metadata: {
          webOrderId: webOrder._id.toString(),
        },

        payer: {
          name: customer.name,
          email: customer.email,
        },

        back_urls: {
          success:
            "https://tu-frontend.com/pago-exitoso",
          failure:
            "https://tu-frontend.com/pago-fallido",
          pending:
            "https://tu-frontend.com/pago-pendiente",
        },

        auto_return: "approved",

        notification_url:
          "https://tu-backend.com/api/payments/webhook",
      },
    });

    /* =========================
       GUARDAR preferenceId
    ========================= */
    webOrder.payment.preferenceId =
      response.id;

    await webOrder.save();

    return res.json({
      mpInitPoint: response.init_point,
      orderId: webOrder._id,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error creando checkout",
    });
  }
};
/* =========================
   WEBHOOK
========================= */
export const mercadoPagoWebhook = async (req, res) => {
  try {
    const paymentId = req.query["data.id"];

    if (!paymentId) {
      return res.sendStatus(200);
    }

    /* =========================
       CONSULTAR PAGO REAL
    ========================= */
    const payment = await paymentClient.get({
      id: paymentId,
    });

    if (payment.status !== "approved") {
      return res.sendStatus(200);
    }

    const webOrderId =
      payment.metadata?.webOrderId;

    if (!webOrderId) {
      return res.sendStatus(200);
    }

    /* =========================
       BUSCAR WEB ORDER
    ========================= */
    const webOrder = await WebOrder.findById(
      webOrderId
    );

    if (!webOrder) {
      return res.sendStatus(200);
    }

    /* =========================
       EVITAR DUPLICADOS
    ========================= */
    if (webOrder.status === "paid") {
      return res.sendStatus(200);
    }

    /* =========================
       ACTUALIZAR WEB ORDER
    ========================= */
    webOrder.payment.status = "approved";
    webOrder.payment.paymentId = paymentId;
    webOrder.status = "paid";

    await webOrder.save();

    /* =========================
       DESCONTAR STOCK
    ========================= */
    for (const item of webOrder.items) {
      const product = await Product.findById(
        item.productId
      );

      if (!product) continue;

      const variant = product.variants?.[0];

      if (variant) {
        variant.stock -= item.qty;
      }

      await product.save();
    }

    /* =========================
       CREAR ORDER FINAL (POS)
    ========================= */
    const orderNumber =
      webOrder.orderNumber;

    await Order.create({
      orderNumber,
      items: webOrder.items,
      totals: {
        items: webOrder.items.length,
        subtotal: webOrder.totals.subtotal,
        grand: webOrder.totals.total,
      },
      payment: {
        method: "mercadopago",
        status: "approved",
        amount: webOrder.totals.total,
      },
      createdBy: "web",
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error(error);
    return res.sendStatus(500);
  }
}
