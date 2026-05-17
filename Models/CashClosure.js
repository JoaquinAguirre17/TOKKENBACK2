import mongoose from "mongoose";

const cashClosureSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    sessionId: String,

    closedAt: {
      type: Date,
      default: Date.now,
    },

    totalSales: {
      type: Number,
      default: 0,
    },

    cashExpected: {
      type: Number,
      default: 0,
    },

    cashReal: {
      type: Number,
      default: 0,
    },

    difference: {
      type: Number,
      default: 0,
    },

    withdrawals: {
      type: Number,
      default: 0,
    },

    observations: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export default mongoose.model("CashClosure", cashClosureSchema);