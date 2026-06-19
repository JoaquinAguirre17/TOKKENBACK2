import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({

  orderNumber: {
    type: String,
    unique: true
  },

  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      },

      title: String,

      sku: String,

      price: Number,

      qty: Number,

      subtotal: Number
    }
  ],

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

  payment: {

    method: String,

    installments: {
      type: Number,
      default: 1
    },

    status: String,

    amount: Number

  },

  createdBy: String,

  /* =========================
     🔥 AGREGAR ESTO
  ========================= */
  sessionId: {
    type: String,
    default: null
  }

}, { timestamps: true });

export default mongoose.model("Order", orderSchema);