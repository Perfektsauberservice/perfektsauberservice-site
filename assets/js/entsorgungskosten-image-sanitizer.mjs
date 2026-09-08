// Entsorgungskosten-Rechner — client-side photo sanitization.
//
// Decodes an uploaded photo, renders it as pixels onto a canvas, and
// re-encodes it as a fresh JPEG before it's ever sent anywhere. Canvas
// re-encoding is used deliberately instead of deleting an EXIF block from
// the original bytes: a canvas only ever holds raw pixel data, so ALL
// metadata (EXIF, GPS, device info, timestamps, ICC profiles, thumbnails
// embedded in EXIF, ...) is structurally impossible to carry through --
// there's no metadata slot for it to survive in. createImageBitmap with
// imageOrientation:"from-image" applies the EXIF orientation tag to the
// decoded pixels BEFORE drawing to canvas, so rotation is preserved
// correctly even though the tag itself is then discarded.
//
// If any step fails, this throws. Callers must never fall back to sending
// the original file on failure -- see FAILURE MODE in the review that
// added this (LAURA_REVIEW_REPORT.md / netlify.toml history).
//
// Browser-only (createImageBitmap, canvas, FileReader) -- cannot run
// under plain Node. Pure/non-DOM helpers are exported separately so they
// can still be unit-tested there.

export const MAX_DIMENSION = 1600; // px, longest side -- ample for material ID, keeps upload small
export const MAX_SANITIZED_SIZE = 1.5 * 1024 * 1024; // 1.5MB after re-encoding
export const ACCEPTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isHeicLike(file) {
  return /^image\/hei[cf]/i.test(file.type || "") || /\.(heic|heif)$/i.test(file.name || "");
}

export function isAcceptedType(file) {
  return !file.type || ACCEPTED_MEDIA_TYPES.has(file.type);
}

export function computeScaledDimensions(width, height, maxDimension = MAX_DIMENSION) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function sanitizeImage(file, deps = {}) {
  const doc = deps.document || globalThis.document;
  const createBitmap = deps.createImageBitmap || globalThis.createImageBitmap;

  if (isHeicLike(file)) {
    throw new Error("HEIC/HEIF wird nicht unterstützt (kann nicht sicher von Metadaten bereinigt werden). Bitte als JPEG/PNG exportieren.");
  }
  if (!isAcceptedType(file)) {
    throw new Error(`Dateiformat nicht unterstützt: "${file.type}".`);
  }

  let bitmap;
  try {
    bitmap = await createBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Bild konnte nicht sicher verarbeitet werden.");
  }

  try {
    const { width, height } = computeScaledDimensions(bitmap.width, bitmap.height);
    const canvas = doc.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.85;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > MAX_SANITIZED_SIZE && quality > 0.4) {
      quality -= 0.15;
      blob = await canvasToBlob(canvas, quality);
    }
    if (blob.size > MAX_SANITIZED_SIZE) {
      throw new Error("Bild bleibt nach Komprimierung zu groß.");
    }
    const base64 = await blobToBase64(blob);
    return { dataUrl: `data:image/jpeg;base64,${base64}`, base64, mediaType: "image/jpeg" };
  } finally {
    bitmap.close?.();
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Kodierung fehlgeschlagen"))), "image/jpeg", quality);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
