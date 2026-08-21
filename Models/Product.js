import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: String,

    brand: String,

    category: String,

    tags: [String],

    featured: {
      type: Boolean,
      default: false,
    },

    pricing: {
      currency: {
        type: String,
        default: "ARS",
      },

      list: {
        type: Number,
        required: true,
      },

      sale: Number,

      taxIncluded: {
        type: Boolean,
        default: true,
      },
    },

    images: [
      {
        // URL externa (Cloudinary, proveedor, fabricante, etc.)
        url: String,

        // Texto alternativo
        alt: String,

        // Indica dónde está almacenada la imagen
        source: {
          type: String,
          enum: ["url", "mongo"],
          default: "url",
        },

        // Imagen almacenada directamente en MongoDB
        data: Buffer,

        // image/jpeg, image/png, image/webp, etc.
        contentType: String,
      },
    ],

    variants: [
      {
        sku: {
          type: String,
          trim: true,
        },

        options: {
          color: {
            type: String,
            trim: true,
            default: "",
          },
        },

        stock: {
          type: Number,
          default: 0,
        },

        stockMinimo: {
          type: Number,
          default: 5,
        },

        stockIdeal: {
          type: Number,
          default: 10,
        },

        price: {
          type: Number,
        },
      },
    ],

    status: {
      type: String,
      enum: ["active", "draft", "archived"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "Product",
  productSchema,
  "products"
);