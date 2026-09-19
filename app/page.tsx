'use client';

/* eslint-disable @next/next/no-img-element -- previews use local object URLs, which next/image cannot optimize */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';

interface AnalysisResult {
  category: string;
  short_label: string;
  full_description: string;
  confidence: number;
  possible_hazard: boolean;
  community_action_candidate: boolean;
  routing_suggestion: string;
  model: string;
}

interface UploadResult {
  image_path: string;
  image_hash: string;
  analysis: AnalysisResult | null;
}

interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string;
}

const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_BROWSER_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function waitForVideoMetadata(video: HTMLVideoElement, timeoutMs = 10000) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      video.removeEventListener('loadedmetadata', handleReady);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('error', handleError);
    };
    const handleReady = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('The browser could not play the camera stream.'));
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Camera preview timed out.'));
    }, timeoutMs);

    video.addEventListener('loadedmetadata', handleReady);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('error', handleError);
  });
}

function getCameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Camera permission was blocked. Allow camera access in your browser settings, or upload a photo.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No camera was found on this device. You can upload a photo instead.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The camera is being used by another app. Close it there and try again, or upload a photo.';
    }
    if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
      return 'This camera does not support the requested settings. Try again or upload a photo.';
    }
  }

  return 'Unable to start the camera. Check browser permissions, then try again or upload a photo.';
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('This image format cannot be previewed by your browser.'));
    };
    image.src = objectUrl;
  });
}

async function normalizeImageForUpload(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file such as JPEG, PNG, WebP, HEIC, or HEIF.');
  }
  if (file.size === 0) {
    throw new Error('The selected image is empty. Choose another photo.');
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('The selected image is too large. Choose a photo smaller than 25 MB.');
  }

  // Camera captures are already sized for upload and do not need another lossy pass.
  if (file.type === 'image/jpeg' && file.size <= MAX_BROWSER_UPLOAD_BYTES) {
    return file;
  }

  try {
    const image = await loadImage(file);
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / longestSide);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Image conversion is unavailable in this browser.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.86;
    let blob: Blob | null = null;
    do {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      quality -= 0.12;
    } while (blob && blob.size > MAX_BROWSER_UPLOAD_BYTES && quality >= 0.5);

    if (!blob || blob.size > MAX_BROWSER_UPLOAD_BYTES) {
      throw new Error('The image could not be reduced to a safe upload size.');
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (error) {
    // Gemini accepts HEIC/HEIF. Preserve a small original if the browser cannot
    // decode it locally; the review screen will show a filename fallback.
    if (file.size <= MAX_BROWSER_UPLOAD_BYTES) {
      return file;
    }
    throw error;
  }
}

export default function ReportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestIdRef = useRef(0);
  
  const [step, setStep] = useState<'capture' | 'review' | 'submitting'>('capture');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [manualAddress, setManualAddress] = useState('');
  const [userDescription, setUserDescription] = useState('');
  const [category, setCategory] = useState('');
  const [shortLabel, setShortLabel] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'pending' | 'granted' | 'denied' | 'error'>('pending');
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocationStatus('granted');
      },
      () => {
        // Permission denial is expected; the review screen offers manual entry.
        setLocationStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const stopCamera = useCallback((clearError = false) => {
    cameraRequestIdRef.current += 1;
    stopMediaStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStream(null);
    setShowCamera(false);
    setIsCameraLoading(false);
    if (clearError) setError(null);
  }, []);

  useEffect(() => () => {
    cameraRequestIdRef.current += 1;
    stopMediaStream(cameraStreamRef.current);
  }, []);

  useEffect(() => {
    // The video stays mounted while loading so the stream always has a target.
    const attachStream = async () => {
      if (!showCamera || !cameraStream || !videoRef.current) return;

      const video = videoRef.current;
      try {
        if (video.srcObject !== cameraStream) video.srcObject = cameraStream;
        await waitForVideoMetadata(video);
        await video.play();
        setIsCameraLoading(false);
      } catch (err) {
        console.error('Video attach error:', err);
        stopCamera();
        setError('Unable to display camera stream. Please use the upload option below.');
      }
    };

    attachStream();
  }, [showCamera, cameraStream, stopCamera]);

  useEffect(() => {
    // Cleanup image preview URLs to prevent memory leaks
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const startCamera = async () => {
    if (!window.isSecureContext) {
      setError('Camera access requires HTTPS. Open the secure deployed site, or upload a photo instead.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not provide camera access. You can upload a photo instead.');
      return;
    }

    stopCamera();
    const requestId = ++cameraRequestIdRef.current;
    setIsCameraLoading(true);
    setShowCamera(true);
    setError(null);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch (error) {
        if (!(error instanceof DOMException) ||
            (error.name !== 'OverconstrainedError' && error.name !== 'ConstraintNotSatisfiedError')) {
          throw error;
        }
        // Some desktop and older mobile browsers reject rear-camera constraints.
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      if (cameraRequestIdRef.current !== requestId) {
        stopMediaStream(stream);
        return;
      }

      cameraStreamRef.current = stream;
      setCameraStream(stream);
    } catch (err) {
      console.error('Camera error:', err);
      if (cameraRequestIdRef.current !== requestId) return;
      stopCamera();
      setError(getCameraErrorMessage(err));
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !cameraStream) {
      setError('Camera not ready. Please try again or use upload.');
      return;
    }

    const video = videoRef.current;
    
    // Ensure video has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setError('Video stream not ready. Please wait a moment and try again.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Canvas context not available');
      }
      
      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0);
      
      // Convert to blob (JPEG for iOS compatibility)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });
      
      if (!blob) {
        throw new Error('Failed to capture image');
      }
      
      const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
      
      stopCamera();
      // Process the captured image
      await handleImageSelected(file);
    } catch (err) {
      console.error('Capture error:', err);
      setError('Failed to capture photo. Please try again or use upload.');
    }
  };

  const handleFileSelect = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (file) handleImageSelected(file);
  };

  const handleImageSelected = async (sourceFile: File, reusePreview = false) => {
    setError(null);
    setIsUploading(true);

    try {
      const file = await normalizeImageForUpload(sourceFile);

      if (!reusePreview) {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        setPreviewUnavailable(false);
      }

      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => {
        throw new Error('The server could not process your request. Please try again.');
      });

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadResult(data);
      
      // Set initial values from AI analysis or defaults
      if (data.analysis) {
        setCategory(data.analysis.category);
        setShortLabel(data.analysis.short_label);
      } else {
        setCategory('other');
        setShortLabel('Issue requiring review');
      }

      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!uploadResult) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const submissionData = {
        image_path: uploadResult.image_path,
        image_hash: uploadResult.image_hash,
        category,
        short_label: shortLabel,
        full_description: uploadResult.analysis?.full_description || null,
        user_description: userDescription || null,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        location_accuracy: location?.accuracy || null,
        location_source: locationStatus === 'granted' ? 'gps' : 'manual',
        location_address: location?.address || manualAddress || null,
        ai_confidence: uploadResult.analysis?.confidence || null,
        ai_model: uploadResult.analysis?.model || null,
        ai_routing: uploadResult.analysis?.routing_suggestion || null,
        user_corrected: category !== uploadResult.analysis?.category || shortLabel !== uploadResult.analysis?.short_label,
        idempotency_key: nanoid(),
      };

      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      });

      const data = await response.json().catch(() => {
        throw new Error('The server could not process your request. Please try again.');
      });

      if (!response.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      // Redirect to receipt page
      router.push(`/receipt/${data.report_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
      setIsSubmitting(false);
    }
  };

  if (step === 'capture') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Report an Issue</h1>
          <p className="text-sm text-gray-600 mt-1">Help improve your community</p>
        </header>

        <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={handleFileChange}
            className="hidden"
          />

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}

          {locationStatus === 'denied' && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium mb-2">Location access denied</p>
              <p className="text-sm text-yellow-700">
                You can still submit a report. You&apos;ll be able to enter an address manually.
              </p>
            </div>
          )}

          {showCamera ? (
            <div className="space-y-4">
              <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  aria-label="Live camera preview"
                  className="h-full w-full object-cover"
                />
                {isCameraLoading && (
                  <div className="absolute inset-0 bg-black flex items-center justify-center">
                  <div className="text-center text-white">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                    <p>Starting camera...</p>
                  </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={capturePhoto}
                  disabled={isCameraLoading || !cameraStream}
                  className="flex-1 bg-blue-600 text-white py-4 px-6 rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Capture Photo
                </button>
                <button
                  onClick={() => stopCamera(true)}
                  className="px-6 py-4 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {isUploading ? (
                <div className="text-center py-8">
                  {imagePreview && !previewUnavailable && (
                    <img
                      src={imagePreview}
                      alt="Selected report preview"
                      onError={() => setPreviewUnavailable(true)}
                      className="w-full max-h-80 object-contain rounded-lg bg-black mb-6"
                    />
                  )}
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-600">Processing image...</p>
                </div>
              ) : imageFile && imagePreview && error ? (
                <div className="space-y-4">
                  {!previewUnavailable ? (
                    <img
                      src={imagePreview}
                      alt="Selected report preview"
                      onError={() => setPreviewUnavailable(true)}
                      className="w-full max-h-80 object-contain rounded-lg bg-black"
                    />
                  ) : (
                    <div className="p-4 rounded-lg bg-white border border-gray-200 text-sm text-gray-700">
                      Selected: {imageFile.name}
                    </div>
                  )}
                  <button
                    onClick={() => handleImageSelected(imageFile, true)}
                    className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-medium hover:bg-blue-700 transition"
                  >
                    Try Processing Again
                  </button>
                  <button
                    onClick={handleFileSelect}
                    className="w-full border-2 border-gray-300 text-gray-700 py-4 px-6 rounded-lg font-medium hover:bg-gray-50 transition"
                  >
                    Choose Another Photo
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={startCamera}
                    disabled={isCameraLoading}
                    className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-medium hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {isCameraLoading ? 'Starting Camera...' : 'Take Photo'}
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-gray-50 text-gray-500">or</span>
                    </div>
                  </div>

                  <button
                    onClick={handleFileSelect}
                    disabled={isCameraLoading}
                    className="w-full border-2 border-gray-300 text-gray-700 py-4 px-6 rounded-lg font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2 disabled:bg-gray-200 disabled:cursor-not-allowed"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Upload Photo
                  </button>

                </>
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Review Report</h1>
        </header>

        <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-4">
            {imagePreview && (
              !previewUnavailable ? (
                <img
                  src={imagePreview}
                  alt="Report"
                  onError={() => setPreviewUnavailable(true)}
                  className="w-full"
                />
              ) : (
                <div className="p-6 text-sm text-gray-700">
                  Photo uploaded successfully. Preview is unavailable for this image format.
                </div>
              )
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4 space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Issue Type
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="litter">Litter / Debris</option>
                <option value="path_obstruction">Path Obstruction</option>
                <option value="road_damage">Road Damage</option>
                <option value="other">Other Issue</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Short Description
              </label>
              <input
                type="text"
                value={shortLabel}
                onChange={(e) => setShortLabel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Brief description of the issue"
              />
            </div>

            {uploadResult?.analysis && uploadResult.analysis.confidence < 0.85 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                Please confirm the issue type and description above.
              </div>
            )}

            {locationStatus === 'granted' && location ? (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800 mb-1">Location captured</p>
                <p className="text-xs text-green-700">
                  Lat: {location.latitude.toFixed(6)}, Lon: {location.longitude.toFixed(6)}
                  {location.accuracy && ` (±${Math.round(location.accuracy)}m)`}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Approximate Address or Location
                </label>
                <input
                  type="text"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Near 123 Main St"
                />
              </div>
            )}

            <div>
              <button
                onClick={() => setDetailsExpanded(!detailsExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${detailsExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Add details (optional)
              </button>

              {detailsExpanded && (
                <div className="mt-3">
                  <textarea
                    value={userDescription}
                    onChange={(e) => setUserDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional details about this issue..."
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep('capture');
                if (imagePreview) URL.revokeObjectURL(imagePreview);
                setImageFile(null);
                setImagePreview(null);
                setPreviewUnavailable(false);
                setUploadResult(null);
                setError(null);
              }}
              className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !shortLabel}
              className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Submitting...
                </>
              ) : (
                'Submit Report'
              )}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return null;
}
