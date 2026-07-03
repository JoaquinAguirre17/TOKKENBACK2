import mongoose from "mongoose";

const webOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },

    customer: {
      name: String,
      email: String,
      phone: String,
      address: String,
      notes: String,
    },

    deliveryType: {
      type: String,
      enum: ["pickup", "delivery"],
      default: "pickup",
    },

    shippingCost: {
      type: Number,
      default: 0,
    },

    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },

        title: String,

        sku: String,

        price: Number,

        qty: Number,

        subtotal: Number,
      },
    ],

    totals: {
      subtotal: Number,
      shipping: Number,
      total: Number,
    },

    payment: {
      provider: {
        type: String,
        default: "mercadopago",
      },

      preferenceId: String,

      paymentId: String,

      status: {
        type: String,
        enum: [
          "pending",
          "approved",
          "rejected",
          "cancelled",
        ],
        default: "pending",
      },
    },

    status: {
      type: String,
      enum: [
        "pending_payment",
        "paid",
        "preparing",
        "shipped",
        "completed",
        "cancelled",
      ],
      default: "pending_payment",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "WebOrder",
  webOrderSchema
);