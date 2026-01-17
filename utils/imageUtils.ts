import { BoundingBox } from "../types";

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export const cropImage = async (
  base64Image: string,
  box: BoundingBox
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Image;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Gemini returns 0-1000 normalized coordinates usually, but we will ensure 
      // the prompt asks for 0-1000 scale to be precise.
      const width = img.width;
      const height = img.height;

      // Unpack box (normalized 0-1000)
      const ymin = (box.ymin / 1000) * height;
      const xmin = (box.xmin / 1000) * width;
      const ymax = (box.ymax / 1000) * height;
      const xmax = (box.xmax / 1000) * width;

      const boxWidth = xmax - xmin;
      const boxHeight = ymax - ymin;

      // Add a little padding (10%)
      const padX = boxWidth * 0.1;
      const padY = boxHeight * 0.1;

      const finalX = Math.max(0, xmin - padX);
      const finalY = Math.max(0, ymin - padY);
      const finalW = Math.min(width - finalX, boxWidth + padX * 2);
      const finalH = Math.min(height - finalY, boxHeight + padY * 2);

      canvas.width = finalW;
      canvas.height = finalH;

      // FILL WHITE BACKGROUND to prevent transparency
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, finalW, finalH);

      ctx.drawImage(
        img,
        finalX,
        finalY,
        finalW,
        finalH,
        0,
        0,
        finalW,
        finalH
      );

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = (err) => reject(err);
  });
};

/**
 * Simple heuristic to make white background transparent.
 * Threshold 0-255. Higher means more colors are considered "white".
 */
export const removeBackground = (base64Image: string, threshold = 240): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Image;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
          resolve(base64Image); 
          return;
      }
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // If pixel is very light (white background)
        if (r > threshold && g > threshold && b > threshold) {
          data[i + 3] = 0; // Set alpha to 0
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = (e) => {
        console.warn("BG Removal failed", e);
        resolve(base64Image);
    };
  });
};