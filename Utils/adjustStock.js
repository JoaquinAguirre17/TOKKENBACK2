import Product from "../Models/Product.js";

export const adjustStock = async (session, items, factor) => {

  for (const item of items) {

    const product = await Product.findById(item.productId).session(session);

    if (!product) {
      throw new Error("Producto no encontrado");
    }

    if (!product.variants.length) {
      throw new Error("Producto sin variantes");
    }

    product.variants[0].stock += item.qty * factor;

    if (product.variants[0].stock < 0) {
      throw new Error("Stock insuficiente");
    }

    await product.save({ session });

  }

};