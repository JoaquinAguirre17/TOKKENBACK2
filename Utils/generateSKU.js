export const generateSKU = (title = "", brand = "") => {

  const clean = (str) =>
    str
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(" ")
      .slice(0, 2)
      .join("");

  const t = clean(title);
  const b = clean(brand);

  const random = Math.floor(Math.random() * 900 + 100);

  return `${b || "PRD"}-${t}-${random}`;
};