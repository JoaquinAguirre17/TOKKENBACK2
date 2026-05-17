import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "tokken_secret";

export const authMiddleware = (
  req,
  res,
  next
) => {

  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "Token requerido",
      });
    }

    const token =
      authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      error: "Token inválido",
    });

  }

};