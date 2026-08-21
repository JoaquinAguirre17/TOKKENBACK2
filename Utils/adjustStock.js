import Product from "../Models/Product.js";

export const adjustStock = async (session, items, factor) => {

  for (const item of items) {

    const product = await Product
      .findById(item.productId)
      .session(session || null);

    if (!product) {
      throw new Error(
        `Producto no encontrado: ${item.productId}`
      );
    }

    if (
      !Array.isArray(product.variants) ||
      product.variants.length === 0
    ) {
      throw new Error(
        `Producto sin variantes: ${product.title}`
      );
    }

    const quantity = Number(item.qty);

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw new Error(
        `Cantidad inválida para ${product.title}`
      );
    }

    // =====================================================
    // BUSCAR LA VARIANTE CORRECTA
    // =====================================================

    let variant = null;

    // 1. Buscar por variantId
    if (item.variantId) {

      variant = product.variants.find(
        (v) =>
          String(v._id) ===
          String(item.variantId)
      );
    }

    // 2. Si no encontró, buscar por variantSku
    if (!variant && item.variantSku) {

      variant = product.variants.find(
        (v) =>
          String(v.sku) ===
          String(item.variantSku)
      );
    }

    // =====================================================
    // SI NO ENCONTRÓ LA VARIANTE
    // =====================================================

    if (!variant) {

      console.error("❌ VARIANTE NO ENCONTRADA");
      console.error({
        producto: product.title,
        productId: product._id,
        variantId: item.variantId || null,
        variantSku: item.variantSku || null,
      });

      throw new Error(
        `Variante no encontrada para ${product.title}`
      );
    }

    // =====================================================
    // STOCK ACTUAL
    // =====================================================

    const currentStock =
      Number(variant.stock || 0);

    const newStock =
      currentStock +
      quantity * factor;

    console.log("====================================");
    console.log("📦 AJUSTANDO STOCK");
    console.log("PRODUCTO:", product.title);
    console.log("VARIANTE:", {
      id: variant._id,
      sku: variant.sku,
      options: variant.options,
    });
    console.log("STOCK ACTUAL:", currentStock);
    console.log("CANTIDAD:", quantity);
    console.log("FACTOR:", factor);
    console.log("NUEVO STOCK:", newStock);
    console.log("====================================");

    // =====================================================
    // VALIDAR STOCK
    // =====================================================

    if (newStock < 0) {

      throw new Error(
        `Stock insuficiente para ${product.title} - variante ${variant.sku}`
      );
    }

    // =====================================================
    // ACTUALIZAR VARIANTE
    // =====================================================

    variant.stock = newStock;

    await product.save({
      session: session || undefined,
    });
  }
};