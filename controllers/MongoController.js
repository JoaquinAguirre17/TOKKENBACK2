import Product from "../Models/Product.js";

// Crear producto
export const createProduct = async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Obtener todos los productos
export const getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener un producto por ID
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar producto
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Eliminar producto
export const deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Producto eliminado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
