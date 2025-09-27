import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: String,
  category: String,
  tags: [String],
  pricing: {
    currency: { type: String, default: "ARS" },
    list: { type: Number, required: true },
    sale: Number,
    taxIncluded: { type: Boolean, default: true }
  },
  images: [{ url: String, alt: String }],
  variants: [{ sku: String, stock: { type: Number, default: 0 }, price: Number }],
  status: { type: String, enum: ["active","draft","archived"], default: "active" }
}, { timestamps: true });

export default mongoose.model("Product", productSchema);
