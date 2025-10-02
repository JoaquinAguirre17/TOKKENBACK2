// Models/Counter.js
import mongoose from "mongoose";
const CounterSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  seq: { type: Number, default: 0 }
});
export default mongoose.model("Counter", CounterSchema, "counters");
