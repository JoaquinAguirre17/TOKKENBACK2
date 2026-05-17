import mongoose from "mongoose";

const cashClosureSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    sessionId: {
      type: String,
      required: true,
    },

    date: {
      type: Date,
      default: Date.now,
    },

    /* =========================
       SISTEMA (LO QUE DEBERÍA HABER)
    ========================= */
    systemTotal: {
      type: Number,
      default: 0,
    },

    systemByPayment: {
      efectivo: Number,
      transferencia: Number,
      debito: Number,
      credito: Number,
      qr: Number,
    },

    /* =========================
       REAL (LO QUE CONTÓ EL CAJERO)
    ========================= */
    realByPayment: {
      efectivo: Number,
      transferencia: Number,
      debito: Number,
      credito: Number,
      qr: Number,
    },

    realTotal: {
      type: Number,
      default: 0,
    },

    /* =========================
       CAJA
    ========================= */
    withdrawals: {
      type: Number,
      default: 0,
    },

    difference: {
      type: Number,
      default: 0,
    },

    observations: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("CashClosure", cashClosureSchema);