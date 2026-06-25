import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

export const uploadImage = (buffer) => {
    return new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "products",

                // ✅ background removal correcto
                effect: "background_removal",

                // optimización
                quality: "auto",
                fetch_format: "auto"
            },
            (error, result) => {
                if (error) return reject(error);

                if (!result?.public_id) {
                    return reject(new Error("No public_id from Cloudinary"));
                }

                const finalUrl = cloudinary.url(result.public_id, {
                    transformation: [
                        {
                            background: "white",
                            crop: "pad",
                            width: 1000,
                            height: 1000
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