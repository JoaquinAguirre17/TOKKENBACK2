// Models/Order.js
import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  title: String,
  sku: String,
  price: { type: Number, required: true },
  qty:   { type: Number, required: true, min: 1 },
  variant: {
    sku: String,
    color: String,
  },
  subtotal: { type: Number, required: true },
}, { _id: false });

// PaymentSchema flexible, sin enum
const PaymentSchema = new mongoose.Schema({
  method: { 
    type: String, // cualquier string es válido
    default: "otro" 
  },
  status: { 
    type: String, 
    enum: ["pending","approved","rejected","refunded"], // solo status mantiene enum
    default: "pending" 
  },
  transactionId: String,
  paidAt: Date,
  amount: Number
}, { _id: false });

const CustomerSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  docId: String,
  shippingAddress: { 
    line1:String, line2:String, city:String, state:String, zip:String 
  }
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  channel: { type: String, enum: ["online","pos"], required: true },
  status:  { 
    type: String, 
    enum: ["created","paid","fulfilled","cancelled","refunded"], 
    default: "created" 
  },
  items: { 
    type: [OrderItemSchema], 
    validate: v => Array.isArray(v) && v.length > 0 
  },
  totals: {
    items:   { type: Number, required: true },
    discount:{ type: Number, default: 0 },
    shipping:{ type: Number, default: 0 },
    tax:     { type: Number, default: 0 },
    grand:   { type: Number, required: true },
    currency:{ type: String, default: "ARS" }
  },
  customer: CustomerSchema,
  payment: PaymentSchema,
  notes: String,
  createdBy: { type: String },
}, { timestamps: true });

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ channel: 1, createdAt: -1 });
OrderSchema.index({ orderNumber: 1 }, { unique: true });

export default mongoose.model("Order", OrderSchema, "orders");
