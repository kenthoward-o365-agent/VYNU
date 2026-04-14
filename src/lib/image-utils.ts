/**
 * Appends Supabase Storage image-transform query params to a public URL.
 * Falls through unchanged for external URLs or data-URIs.
 */
export function optimizedImageUrl(
  url: string | null | undefined,
  width: number,
  quality = 75,
): string {
  if (!url) return "";
  // Supabase image transforms use /render/image/ instead of /object/
  if (!url.includes("/storage/v1/object/public/")) return url;
  const base = url.split("?")[0];
  const renderUrl = base.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/",
  );
  return `${renderUrl}?width=${width}&quality=${quality}`;
}

/**
 * Resize + convert a base64 data-URI image to WebP via an off-screen canvas.
 * Returns a Blob ready for upload.
 */
export function resizeToWebP(
  base64DataUri: string,
  maxDimension = 800,
  quality = 0.8,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/webp",
        quality,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image for resize"));
    img.src = base64DataUri;
  });
}
