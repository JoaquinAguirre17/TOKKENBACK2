import Order from "../Models/Order.js";

export const generateOrderNumber = async () => {

  const lastOrder = await Order
    .findOne()
    .sort({ createdAt: -1 });

  let next = 1;

  if (lastOrder?.orderNumber) {

    const num = parseInt(
      lastOrder.orderNumber.replace("TOK-", "")
    );

    next = num + 1;

  }

  return `TOK-${String(next).padStart(6, "0")}`;

};