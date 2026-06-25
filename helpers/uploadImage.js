import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

export const uploadImage = (buffer) => {
    return new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "products",

                // 🔥 elimina fondo automáticamente
                background_removal: "remove",

                // ⚡ optimización automática
                quality: "auto",
                fetch_format: "auto"
            },
            (error, result) => {

                if (error) return reject(error);

                if (!result?.public_id) {
                    return reject(new Error("Cloudinary no devolvió public_id"));
                }

                // 🎯 generar versión con fondo blanco
                const finalUrl = cloudinary.url(result.public_id, {
                    transformation: [
                        {
                            background: "white",
                            crop: "pad"
                        }
                    ]
                });

                resolve({
                    ...result,
                    secure_url: finalUrl
                });
            }
        );

        // ⚠️ manejo de errores del stream
        stream.on("error", reject);

        // 📤 enviar buffer a Cloudinary
        streamifier.createReadStream(buffer).pipe(stream);
    });
};