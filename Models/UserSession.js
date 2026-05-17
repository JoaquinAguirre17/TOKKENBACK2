import mongoose from "mongoose";

const userSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    username: String,
    nombre: String,
    rol: String,

    sessionId: {
      type: String,
      required: true,
      unique: true,
    },

    loginAt: {
      type: Date,
      default: Date.now,
    },

    logoutAt: {
      type: Date,
      default: null,
    },

    durationMinutes: {
      type: Number,
      default: null,
    },

    active: {
      type: Boolean,
      default: true,
    },

    ip: String,
    userAgent: String,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("UserSession", userSessionSchema);