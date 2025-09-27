import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: String,
  brand: String,
  category: String,
  tags: [String],
  pricing: {
    currency: { type: String, default: "ARS" },
    list: { type: Number, required: true },
    sale: Number,
    taxIncluded: { type: Boolean, default: true }
  },
  variants: [
    {
      sku: String,
      options: { type: Map, of: String },
      stock: { type: Number, default: 0 }
    }
  ],
  images: [{ url: String, alt: String }],
  inventory: [{ store: String, qty: Number }],
  seo: {
    metaTitle: String,
    metaDesc: String,
    slug: { type: String, unique: true, sparse: true }
  },
  status: { type: String, enum: ["active", "draft", "archived"], default: "active" }
}, { timestamps: true });

export default mongoose.model("Product", productSchema);
