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

    items: Number,

    grand: Number,

    currency: { type: String, default: "ARS" }

  },

  payment: {

    method: String,

    status: String,

    amount: Number

  },

  createdBy: String

}, { timestamps: true });

export default mongoose.model("Order", orderSchema);