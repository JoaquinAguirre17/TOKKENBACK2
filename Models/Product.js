import mongoose from "mongoose";

const variantImageSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["url", "mongo"],
      default: "url",
    },

    url: {
      type: String,
      default: "",
    },

    data: {
      type: Buffer,
    },

    contentType: {
      type: String,
      default: "",
    },

    alt: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
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

    image: {
      type: variantImageSchema,
      default: undefined,
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
  { _id: true }
);

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

    slug: {
      type: String,
      trim: true,
    },

    description: {
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

    tags: {
      type: [String],
      default: [],
    },

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

      sale: {
        type: Number,
      },

      taxIncluded: {
        type: Boolean,
        default: true,
      },
    },

    // ==========================================
    // IMÁGENES GENERALES DEL PRODUCTO
    // ==========================================

    images: [
      {
        url: {
          type: String,
          default: "",
        },

        alt: {
          type: String,
          default: "",
        },

        source: {
          type: String,
          enum: ["url", "mongo"],
          default: "url",
        },

        data: {
          type: Buffer,
        },

        contentType: {
          type: String,
        },
      },
    ],

    // ==========================================
    // VARIANTES
    // ==========================================

    variants: {
      type: [variantSchema],
      default: [],
    },

    // ==========================================
    // INVENTARIO
    // ==========================================

    inventory: [
      {
        store: {
          type: String,
          default: "",
        },

        qty: {
          type: Number,
          default: 0,
        },
      },
    ],

    // ==========================================
    // SEO
    // ==========================================

    seo: {
      metaTitle: {
        type: String,
        default: "",
      },

      metaDesc: {
        type: String,
        default: "",
      },
    },

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