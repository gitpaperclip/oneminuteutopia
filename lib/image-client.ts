const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_DIMENSION = 1600;

/** Resize every photo, including small JPEGs, so embedded EXIF is not uploaded. */
export async function prepareReportImage(file: File): Promise<File> {
  if (!file.size) throw new Error('This photo is empty. Please choose another.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Choose a photo smaller than 20 MB.');
  if (!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type) &&
      !(file.type === '' && /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name))) {
    throw new Error('Choose a JPEG, PNG, WebP, HEIC, or AVIF photo.');
  }

  const url = URL.createObjectURL(file);
  try {
    const photo = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('This browser cannot open that image format. Export it as JPEG or take a new photo.'));
      image.src = url;
    });
    if (!photo.naturalWidth || !photo.naturalHeight) throw new Error('This photo could not be read. Choose another.');
    const scale = Math.min(1, MAX_DIMENSION / Math.max(photo.naturalWidth, photo.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo preparation is unavailable in this browser. Try another browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error('This photo is still too large to upload. Crop it or choose a smaller photo.');
    return new File([blob], 'report-photo.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(url);
  }
}
