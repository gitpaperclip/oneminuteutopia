'use client';

import { useState, useRef, useEffect } from 'react';
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

export default function ReportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
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
  const [pendingStream, setPendingStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    // Request location on mount
    requestLocation();
  }, []);

  useEffect(() => {
    // Cleanup camera stream on unmount
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  useEffect(() => {
    // Cleanup pending stream if component unmounts or camera is cancelled
    return () => {
      if (pendingStream) {
        pendingStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [pendingStream]);

  useEffect(() => {
    // Attach pending stream to video element once it mounts
    const attachStream = async () => {
      if (!pendingStream || !videoRef.current || cameraStream) {
        return;
      }

      const video = videoRef.current;
      
      try {
        video.srcObject = pendingStream;
        
        // Wait for video metadata to load
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Video stream timeout'));
          }, 10000);
          
          const handleLoadedMetadata = () => {
            clearTimeout(timeoutId);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            resolve();
          };
          
          video.addEventListener('loadedmetadata', handleLoadedMetadata);
          
          // Explicitly play for iOS Safari
          video.play().catch(reject);
        });
        
        // Successfully attached
        setCameraStream(pendingStream);
        setPendingStream(null);
        setIsCameraLoading(false);
      } catch (err) {
        console.error('Video attach error:', err);
        
        // Clean up the stream
        pendingStream.getTracks().forEach(track => track.stop());
        setPendingStream(null);
        
        setIsCameraLoading(false);
        setShowCamera(false);
        
        setError('Unable to display camera stream. Please use the upload option below.');
      }
    };

    if (showCamera && pendingStream && videoRef.current) {
      attachStream();
    }
  }, [showCamera, pendingStream, videoRef.current]);

  useEffect(() => {
    // Cleanup image preview URLs to prevent memory leaks
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocationStatus('granted');
      },
      (error) => {
        // Permission denial is expected; the review screen offers manual entry.
        setLocationStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const startCamera = async () => {
    setIsCameraLoading(true);
    setShowCamera(true); // Mount video element first
    setError(null);
    
    try {
      // Request camera stream (don't check videoRef yet - element is mounting)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false,
      });
      
      // Store stream; useEffect will attach it once video element is ready
      setPendingStream(stream);
    } catch (err) {
      console.error('Camera error:', err);
      
      setIsCameraLoading(false);
      setShowCamera(false);
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // Provide helpful error messages based on common failure modes
      if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
        setError('Camera permission denied. Please use the upload option below.');
      } else if (errorMessage.includes('NotFoundError') || errorMessage.includes('not found')) {
        setError('No camera found on this device. Please use the upload option below.');
      } else {
        setError(`Unable to access camera: ${errorMessage}. Please use the upload option below.`);
      }
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
      
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      // Stop and cleanup camera
      cameraStream.getTracks().forEach(track => track.stop());
      setShowCamera(false);
      setCameraStream(null);
      
      // Process the captured image
      await handleImageSelected(file);
    } catch (err) {
      console.error('Capture error:', err);
      setError('Failed to capture photo. Please try again or use upload.');
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelected(file);
    }
  };

  const handleImageSelected = async (file: File) => {
    // Revoke previous object URL to prevent memory leak
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
    setIsUploading(true);

    try {
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
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}

          {locationStatus === 'denied' && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium mb-2">Location access denied</p>
              <p className="text-sm text-yellow-700">
                You can still submit a report. You'll be able to enter an address manually.
              </p>
            </div>
          )}

          {showCamera || isCameraLoading ? (
            <div className="space-y-4">
              {isCameraLoading ? (
                <div className="w-full aspect-video bg-black rounded-lg flex items-center justify-center">
                  <div className="text-center text-white">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                    <p>Starting camera...</p>
                  </div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-lg bg-black"
                  style={{ maxHeight: '70vh' }}
                />
              )}
              <div className="flex gap-3">
                <button
                  onClick={capturePhoto}
                  disabled={isCameraLoading || !cameraStream}
                  className="flex-1 bg-blue-600 text-white py-4 px-6 rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Capture Photo
                </button>
                <button
                  onClick={() => {
                    // Clean up both active and pending streams
                    if (cameraStream) {
                      cameraStream.getTracks().forEach(track => track.stop());
                    }
                    if (pendingStream) {
                      pendingStream.getTracks().forEach(track => track.stop());
                    }
                    setShowCamera(false);
                    setCameraStream(null);
                    setPendingStream(null);
                    setIsCameraLoading(false);
                    setError(null);
                  }}
                  className="px-6 py-4 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {isUploading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-600">Processing image...</p>
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

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
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
              <img src={imagePreview} alt="Report" className="w-full" />
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
                setImageFile(null);
                setImagePreview(null);
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
