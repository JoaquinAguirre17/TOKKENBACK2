import Counter from "../Models/Counter.js";

export const nextOrderNumber = async () => {

  const counter = await Counter.findOneAndUpdate(
    { name: "order" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `TOK-${String(counter.seq).padStart(6, "0")}`;

};