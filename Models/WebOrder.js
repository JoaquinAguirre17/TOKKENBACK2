import mongoose from "mongoose";

const WebOrder = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    sku: {
      type: String,
      default: "",
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    image: {
      type: String,
      default: "",
    },

    brand: {
      type: String,
      default: "",
    },

    category: {
      type: String,
      default: "",
    },

    variantId: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  }
);


const webOrderSchema = new mongoose.Schema(
  {

    /* =====================================================
       NÚMERO DE PEDIDO
    ===================================================== */

    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },


    /* =====================================================
       REFERENCIA MERCADO PAGO
    ===================================================== */

    externalReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },


    /* =====================================================
       DATOS DEL CLIENTE
    ===================================================== */

    customer: {

      name: {
        type: String,
        required: true,
        trim: true,
      },

      surname: {
        type: String,
        required: true,
        trim: true,
      },

      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },

      phone: {
        type: String,
        required: true,
        trim: true,
      },

    },


    /* =====================================================
       ENTREGA
    ===================================================== */

    delivery: {

      type: {
        type: String,

        enum: [
          "delivery",
          "pickup",
        ],

        required: true,
      },

      address: {
        type: String,
        default: "",
        trim: true,
      },

      city: {
        type: String,
        default: "",
        trim: true,
      },

      postalCode: {
        type: String,
        default: "",
        trim: true,
      },

      notes: {
        type: String,
        default: "",
        trim: true,
      },

      shippingCost: {
        type: Number,
        default: 0,
        min: 0,
      },

    },


    /* =====================================================
       PRODUCTOS
    ===================================================== */

    items: {
      type: [webOrderItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items.length > 0;
        },
        message: "La orden debe tener al menos un producto.",
      },
    },


    /* =====================================================
       TOTALES
    ===================================================== */

    totals: {

      subtotal: {
        type: Number,
        required: true,
        min: 0,
      },

      shipping: {
        type: Number,
        default: 0,
        min: 0,
      },

      total: {
        type: Number,
        required: true,
        min: 0,
      },

    },


    /* =====================================================
       ESTADO DE LA ORDEN
    ===================================================== */

    status: {

      type: String,

      enum: [
        "pending_payment",
        "paid",
        "preparing",
        "ready",
        "delivered",
        "cancelled",
      ],

      default: "pending_payment",

      index: true,
    },


    /* =====================================================
       MERCADO PAGO
    ===================================================== */

    mercadoPago: {

      preferenceId: {
        type: String,
        default: "",
      },

      paymentId: {
        type: String,
        default: "",
        index: true,
      },

      status: {
        type: String,
        default: "",
      },

      statusDetail: {
        type: String,
        default: "",
      },

      transactionAmount: {
        type: Number,
        default: 0,
      },

      installments: {
        type: Number,
        default: 1,
      },

      paidAt: {
        type: Date,
        default: null,
      },

    },


    /* =====================================================
       STOCK
    ===================================================== */

    stockDiscounted: {
      type: Boolean,
      default: false,
    },


    /* =====================================================
       FECHAS
    ===================================================== */

    paidAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

  },
  {
    timestamps: true,
  }
);


export default mongoose.model(
  "WebOrder",
  WebOrder,
  "weborders"
);