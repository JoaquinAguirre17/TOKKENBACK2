import mongoose from "mongoose";

const ingresoSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },

  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
      },
      quantity: {
        type: Number,
        required: true
      },
      costPrice: {
        type: Number,
        required: true
      }
    }
  ],

  total: {
    type: Number,
    required: true
  }

}, { timestamps: true });

export default mongoose.model("Ingreso", ingresoSchema, "ingresos");