// utils/skuGenerator.js
export function generateSKU(title = "PROD", brand = "GEN") {
  const prefix = brand.substring(0, 3).toUpperCase();
  const slug = title.substring(0, 3).toUpperCase();
  const rand = Math.floor(1000 + Math.random() * 9000); // número de 4 dígitos
  return `${prefix}-${slug}-${rand}`;
}
