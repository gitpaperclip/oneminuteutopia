const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_DIMENSION = 1600;

async function decodeOrientedPhoto(
  file: File,
  url: string,
): Promise<{ width: number; height: number; source: CanvasImageSource }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { width: bitmap.width, height: bitmap.height, source: bitmap };
    } catch {
      // Fall through to HTMLImageElement.
    }
  }
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const photo = new Image();
    photo.onload = () => resolve(photo);
    photo.onerror = () => reject(new Error('This browser cannot open that image format. Export it as JPEG or take a new photo.'));
    photo.src = url;
  });
  return { width: image.naturalWidth, height: image.naturalHeight, source: image };
}

/** Resize every photo, including small JPEGs, so embedded EXIF is not uploaded. */
export async function prepareReportImage(file: File): Promise<File> {
  if (!file.size) throw new Error('This photo is empty. Please choose another.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Choose a photo smaller than 20 MB.');
  if (!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type) &&
      !(file.type === '' && /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name))) {
    throw new Error('Choose a JPEG, PNG, WebP, HEIC, or AVIF photo.');
  }

  const url = URL.createObjectURL(file);
  let bitmap: ImageBitmap | null = null;
  try {
    const photo = await decodeOrientedPhoto(file, url);
    if ('close' in photo.source && typeof (photo.source as ImageBitmap).close === 'function') {
      bitmap = photo.source as ImageBitmap;
    }
    if (!photo.width || !photo.height) throw new Error('This photo could not be read. Choose another.');
    const scale = Math.min(1, MAX_DIMENSION / Math.max(photo.width, photo.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(photo.width * scale));
    canvas.height = Math.max(1, Math.round(photo.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo preparation is unavailable in this browser. Try another browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error('This photo is still too large to upload. Crop it or choose a smaller photo.');
    return new File([blob], 'report-photo.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap?.close();
    URL.revokeObjectURL(url);
  }
}
