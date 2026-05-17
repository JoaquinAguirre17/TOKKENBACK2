import mongoose from "mongoose";

const userSchema = new mongoose.Schema({

  username: {
    type: String,
    required: true,
    unique: true,
  },

  password: {
    type: String,
    required: true,
  },

  nombre: {
    type: String,
    required: true,
  },

  rol: {
    type: String,
    enum: [
      "owner",
      "admin",
      "vendedor",
    ],
    default: "vendedor",
  },

  activo: {
    type: Boolean,
    default: true,
  },

}, { timestamps: true });

export default mongoose.model(
  "User",
  userSchema
);