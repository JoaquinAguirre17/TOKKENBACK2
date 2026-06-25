import cloudinary from "../confing/cloudinary";
import streamifier from "streamifier";

export const uploadImage = (buffer) => {
  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products"
      },
      (error, result) => {

        if (error) {
          reject(error);
        } else {
          resolve(result);
        }

      }
    );

    streamifier
      .createReadStream(buffer)
      .pipe(stream);

  });
};