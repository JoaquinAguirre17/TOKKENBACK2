const stream = cloudinary.uploader.upload_stream(
  {
    folder: "products",

    // 1. remover fondo automáticamente
    background_removal: "remove",

    // 2. optimización
    quality: "auto",
    fetch_format: "auto"
  },
  (error, result) => {
    if (error) reject(error);

    // 3. generar URL con fondo blanco final
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