'use client';

/* eslint-disable @next/next/no-img-element -- camera + blob previews */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnalysisCard } from '@/components/AnalysisCard';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { CATEGORY_OPTIONS } from '@/lib/baltimore-routes';
import { prepareReportImage } from '@/lib/image-client';
import { groupKeyFromReport } from '@/lib/incident-groups';

type Step = 'capture' | 'analysis' | 'confirm';
type CapturePhase = 'live' | 'reviewing' | 'processing';

interface UploadResult {
  analysis_id: string;
  analysis_status: 'complete' | 'unavailable';
  warning?: string;
  analysis: { category: string; seriousness: number | null; ai_confidence: number };
}

interface GpsFix {
  latitude: number;
  longitude: number;
  accuracy: number;
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

function DiscardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ConfirmIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M5 12.5 10 17.5 19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingFile = useRef<File | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const gen = useRef(0);

  const [step, setStep] = useState<Step>('capture');
  const [capturePhase, setCapturePhase] = useState<CapturePhase>('live');
  const [preview, setPreview] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);

  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [address, setAddress] = useState('');
  const [locMode, setLocMode] = useState<'gps' | 'manual'>('gps');
  const [locBusy, setLocBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reviewing = capturePhase === 'reviewing';
  const processing = capturePhase === 'processing';

  const killCamera = useCallback(() => {
    stopTracks(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const replacePreview = useCallback((url: string | null) => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  useEffect(
    () => () => {
      gen.current += 1;
      killCamera();
      uploadAbort.current?.abort();
    },
    [killCamera],
  );

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const startCamera = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraDenied(true);
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1600 },
            height: { ideal: 1200 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      stopTracks(streamRef.current);
      streamRef.current = stream;
      setError(null);
      setCameraDenied(false);
      setCameraOn(true);
    } catch {
      stopTracks(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);
      setCameraDenied(true);
    }
  }, []);

  const shouldStartCamera =
    step === 'capture' && capturePhase === 'live' && !cameraOn && !preview && !cameraDenied;

  useEffect(() => {
    if (!shouldStartCamera) return;
    // Auto-start rear camera on the capture screen (getUserMedia is an external system).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after getUserMedia
    void startCamera();
  }, [shouldStartCamera, startCamera]);

  useEffect(() => {
    if (!cameraOn || step !== 'capture') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (!preview) void video.play().catch(() => undefined);
  }, [cameraOn, preview, step]);

  const beginReview = useCallback(
    (file: File) => {
      pendingFile.current = file;
      replacePreview(URL.createObjectURL(file));
      setCapturePhase('reviewing');
      setError(null);
      videoRef.current?.pause();
    },
    [replacePreview],
  );

  const discardReview = useCallback(() => {
    if (capturePhase === 'processing') return;
    pendingFile.current = null;
    replacePreview(null);
    setCapturePhase('live');
    setError(null);
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream) {
      if (video.srcObject !== stream) video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [capturePhase, replacePreview]);

  const runUpload = async (file: File) => {
    const id = ++gen.current;
    uploadAbort.current?.abort();
    setError(null);
    setUpload(null);
    try {
      const prepared = await prepareReportImage(file);
      if (id !== gen.current) return;
      const controller = new AbortController();
      uploadAbort.current = controller;
      const form = new FormData();
      form.append('image', prepared);
      const res = await fetch('/api/upload', { method: 'POST', body: form, signal: controller.signal });
      const data = await res.json().catch(() => {
        throw new Error('Upload failed.');
      });
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Upload failed.');
      if (!data.analysis_id || !data.analysis || !(data.analysis.category in CATEGORY_LABELS)) {
        throw new Error('Incomplete analysis. Try again.');
      }
      if (id !== gen.current) return;
      killCamera();
      setUpload(data as UploadResult);
      setCategory(data.analysis.category as string);
      setCapturePhase('live');
      setStep('analysis');
    } catch (cause) {
      if (id !== gen.current) return;
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Could not process photo.');
      setCapturePhase('reviewing');
      setStep('capture');
    } finally {
      if (id === gen.current) {
        uploadAbort.current = null;
      }
    }
  };

  const confirmReview = async () => {
    const file = pendingFile.current;
    if (!file || capturePhase !== 'reviewing') return;
    setCapturePhase('processing');
    await runUpload(file);
  };

  const shutter = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || capturePhase !== 'live') return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Capture failed. Upload instead.');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) {
      setError('Capture failed. Upload instead.');
      return;
    }
    beginReview(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
  };

  const requestGps = () => {
    if (!navigator.geolocation) {
      setLocMode('manual');
      setError('GPS unavailable — enter a short address.');
      return;
    }
    setLocBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocMode('gps');
        setLocBusy(false);
      },
      () => {
        setLocBusy(false);
        setLocMode('manual');
        setError('GPS failed — enter a short address.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
    );
  };

  const canSubmit =
    !!upload &&
    !!category &&
    category !== 'unable_to_assess' &&
    (locMode === 'gps' ? !!gps : address.trim().length > 0);

  const submit = async () => {
    if (!upload || !canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const lat = locMode === 'gps' ? gps!.latitude : null;
    const lng = locMode === 'gps' ? gps!.longitude : null;
    void groupKeyFromReport({ category, lat, lng, createdAt: Date.now() });
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis_id: upload.analysis_id,
          category,
          user_description: note.trim() || null,
          latitude: lat,
          longitude: lng,
          location_accuracy: locMode === 'gps' ? gps!.accuracy : null,
          location_source: locMode,
          location_address: locMode === 'manual' ? address.trim() : null,
        }),
      });
      const data = await res.json().catch(() => {
        throw new Error('Submit failed.');
      });
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Submit failed.');
      if (typeof data.report_id !== 'string') throw new Error('No report id returned.');
      if (data.incident_id) {
        void groupKeyFromReport({
          category,
          lat,
          lng,
          createdAt: Date.now(),
          incident_id: data.incident_id,
        });
      }
      router.push(`/receipt/${encodeURIComponent(data.report_id)}?cat=${encodeURIComponent(category)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Submit failed.');
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      {step === 'capture' && (
        <section className="capture-stage" aria-label="Capture">
          <img src="/logo-mark.png?v=3" alt="1MU" className="logo-mark" width={48} height={48} />
          <div className="camera-bleed">
            <video
              ref={videoRef}
              className={preview ? 'camera-video is-hidden' : 'camera-video'}
              autoPlay
              playsInline
              muted
              disablePictureInPicture
            />
            {preview ? <img src={preview} alt="" className="camera-still" /> : null}
            {processing && (
              <div className="busy-overlay" role="status" aria-live="polite" aria-label="Working">
                <span className="spinner" />
              </div>
            )}
            {cameraDenied && capturePhase === 'live' && !preview && (
              <div
                className="analysis-popup"
                role="dialog"
                aria-modal="true"
                aria-labelledby="camera-denied-title"
                style={{ ['--sev-accent' as string]: '#2563eb', ['--sev-fill' as string]: '#dbeafe' }}
              >
                <div className="analysis-card">
                  <p className="analysis-kicker">Camera</p>
                  <h2 id="camera-denied-title" className="analysis-category">
                    Allow camera access to submit a report
                  </h2>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => fileRef.current?.click()}
                  >
                    Upload photo
                  </button>
                  <button
                    type="button"
                    className="text-btn camera-retry"
                    onClick={() => {
                      setCameraDenied(false);
                      void startCamera();
                    }}
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
          {error && (
            <p className="toast-error" role="alert">
              {error}
            </p>
          )}
          <div className={`capture-bar ${capturePhase !== 'live' ? 'is-reviewing' : ''}`}>
            <button
              type="button"
              className="btn-ghost"
              disabled={capturePhase !== 'live'}
              onClick={() => fileRef.current?.click()}
            >
              Upload
            </button>
            <div className={`shutter-cluster is-${capturePhase}`}>
              <button
                type="button"
                className="review-btn review-discard"
                aria-label="Discard photo"
                disabled={!reviewing}
                tabIndex={reviewing ? 0 : -1}
                onClick={discardReview}
              >
                <DiscardIcon />
              </button>
              <button
                type="button"
                className="shutter"
                aria-label="Take photo"
                disabled={capturePhase !== 'live' || !cameraOn}
                tabIndex={capturePhase === 'live' ? 0 : -1}
                onClick={() => void shutter()}
              />
              <button
                type="button"
                className="review-btn review-confirm"
                aria-label="Use photo"
                disabled={!reviewing}
                tabIndex={reviewing ? 0 : -1}
                onClick={() => void confirmReview()}
              >
                <ConfirmIcon />
              </button>
            </div>
            <span aria-hidden="true" className="capture-bar-spacer" />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = '';
              if (f && capturePhase === 'live') beginReview(f);
            }}
          />
        </section>
      )}

      {step === 'analysis' && upload && preview && (
        <section className="analysis-stage">
          <img src="/logo-mark.png?v=3" alt="1MU" className="logo-mark" width={48} height={48} />
          <img src={preview} alt="" className="analysis-photo" />
          {upload.analysis_status === 'unavailable' && (
            <p className="toast-warn">{upload.warning || 'Assessment unavailable — pick a category next.'}</p>
          )}
          <AnalysisCard
            category={upload.analysis.category}
            seriousness={upload.analysis.seriousness}
            onContinue={() => {
              setError(null);
              setStep('confirm');
              requestGps();
            }}
          />
        </section>
      )}

      {step === 'confirm' && upload && (
        <section className="confirm-stage">
          <header className="confirm-header">
            <img src="/logo-mark.png?v=3" alt="1MU" width={32} height={32} />
            <button type="button" className="text-btn" onClick={() => setStep('analysis')}>
              Back
            </button>
          </header>
          {preview && <img src={preview} alt="" className="confirm-thumb" />}
          {error && (
            <p className="toast-error toast-error-inline" role="alert">
              {error}
            </p>
          )}
          <label className="field">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Location</span>
            {locMode === 'gps' && gps ? (
              <div className="loc-row">
                <p className="loc-gps">GPS ±{Math.round(gps.accuracy)}m</p>
                <button type="button" className="text-btn" onClick={() => setLocMode('manual')}>
                  Address
                </button>
                <button type="button" className="text-btn" disabled={locBusy} onClick={requestGps}>
                  {locBusy ? '…' : 'Refresh'}
                </button>
              </div>
            ) : (
              <div className="loc-row">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Short address"
                  maxLength={200}
                  autoComplete="street-address"
                />
                <button type="button" className="text-btn" disabled={locBusy} onClick={requestGps}>
                  {locBusy ? '…' : 'GPS'}
                </button>
              </div>
            )}
          </div>
          <label className="field">
            <span>Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional one line"
              maxLength={200}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!canSubmit || submitting || locBusy}
            onClick={() => void submit()}
          >
            {submitting ? 'Saving…' : 'Save report'}
          </button>
        </section>
      )}
    </div>
  );
}
