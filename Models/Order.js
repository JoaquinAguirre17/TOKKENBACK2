import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({

  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },

  title: String,

  sku: String,

  price: Number,

  qty: Number,

  subtotal: Number

});

const orderSchema = new mongoose.Schema({

  status: {
    type: String,
    default: "paid"
  },

  items: [itemSchema],

  totals: {

    items: Number,

    grand: Number,

    currency: {
      type: String,
      default: "ARS"
    }

  },

  payment: {

    method: String,

    status: String,

    amount: Number

  },

  createdBy: String

}, { timestamps: true });

export default mongoose.model("Order", orderSchema);