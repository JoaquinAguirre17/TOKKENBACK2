import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({

  /* =========================
     NÚMERO DE ORDEN
  ========================= */

  orderNumber: {
    type: String,
    unique: true
  },


  /* =========================
     PRODUCTOS
  ========================= */

  items: [

    {

      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      },

      title: String,

      sku: String,

      /*
       * SKU de la variante
       */
      variantSku: String,

      /*
       * Color de la variante
       */
      color: String,

      price: Number,

      qty: Number,

      subtotal: Number

    }

  ],


  /* =========================
     TOTALES
  ========================= */

  totals: {

    items: {
      type: Number,
      default: 0
    },

    discountPercentage: {
      type: Number,
      default: 0
    },

    subtotal: {
      type: Number,
      default: 0
    },

    grand: {
      type: Number,
      default: 0
    },

    currency: {
      type: String,
      default: "ARS"
    }

  },


  /* =========================
     💳 PAGOS
  ========================= */

  payment: {

    /*
     * Método principal.
     *
     * Ejemplos:
     * Efectivo
     * Transferencia
     * Débito
     * Crédito
     * QR Openpay
     * Combinado
     */

    method: {
      type: String,
      required: true
    },


    /*
     * Cuotas de tarjeta
     */

    installments: {
      type: Number,
      default: 1
    },


    /*
     * Estado del pago
     */

    status: {
      type: String,
      default: "approved"
    },


    /*
     * Total pagado
     */

    amount: {
      type: Number,
      default: 0
    },


    /*
     * =====================================
     * PAGOS INDIVIDUALES
     * =====================================
     *
     * Para una venta normal:
     *
     * payments: [
     *   {
     *     method: "Efectivo",
     *     amount: 20000
     *   }
     * ]
     *
     * Para una venta combinada:
     *
     * payments: [
     *   {
     *     method: "Efectivo",
     *     amount: 8000
     *   },
     *   {
     *     method: "Transferencia",
     *     amount: 12000
     *   }
     * ]
     */

    payments: [

      {

        method: {
          type: String,
          required: true
        },

        amount: {
          type: Number,
          required: true,
          min: 0
        }

      }

    ],


    /*
     * Fecha en la que se recibió
     * el pago.
     */

    paidAt: {
      type: Date
    }

  },


  /* =========================
     VENDEDOR
  ========================= */

  createdBy: String,


  /* =========================
     SESIÓN DEL VENDEDOR
  ========================= */

  sessionId: {
    type: String,
    default: null
  }

}, {

  timestamps: true

});


export default mongoose.model(
  "Order",
  orderSchema
);