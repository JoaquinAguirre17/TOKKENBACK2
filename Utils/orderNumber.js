import Counter from "../Models/Counter.js";
import Order from "../Models/Order.js";

export const generateOrderNumber = async () => {

  let counter = await Counter.findOne({ name: "order" });

  // Si no existe el contador lo creamos sincronizado
  if (!counter) {

    const lastOrder = await Order
      .findOne({ orderNumber: { $regex: "^TOK" } })
      .sort({ createdAt: -1 });

    let seq = 0;

    if (lastOrder?.orderNumber) {
      seq = parseInt(lastOrder.orderNumber.split("-")[1]);
    }

    counter = await Counter.create({
      name: "order",
      seq
    });

  }

  counter.seq += 1;

  await counter.save();

  return `TOK-${String(counter.seq).padStart(6, "0")}`;
};