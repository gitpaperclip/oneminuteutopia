'use client';

/* eslint-disable @next/next/no-img-element -- camera + blob previews */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnalysisCard } from '@/components/AnalysisCard';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import {
  CATEGORY_OPTIONS,
  agencyReportingCopy,
  isEmergencyHandoff,
} from '@/lib/baltimore-routes';
import {
  applyTrackZoom,
  currentTrackZoom,
  pinchDistance,
  zoomFromPinch,
  zoomRangeFromTrack,
} from '@/lib/camera-zoom';
import { captureVisibleVideo, screenOrientationAngle } from '@/lib/capture-frame';
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
  const bleedRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingFile = useRef<File | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const gen = useRef(0);
  const pinchRef = useRef({
    startDistance: 0,
    startZoom: 1,
    zoom: 1,
    min: 1,
    max: 1,
  });

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
  const [leaveOpen, setLeaveOpen] = useState(false);

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
      const track = stream.getVideoTracks()[0] ?? null;
      const range = zoomRangeFromTrack(track);
      pinchRef.current.min = range?.min ?? 1;
      pinchRef.current.max = range?.max ?? 1;
      pinchRef.current.zoom = currentTrackZoom(track, range?.min ?? 1);
      pinchRef.current.startZoom = pinchRef.current.zoom;
      pinchRef.current.startDistance = 0;
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

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const stage = new URLSearchParams(window.location.search).get('ui');
    if (stage !== 'analysis' && stage !== 'analysis-emergency' && stage !== 'confirm') return;
    let cancelled = false;
    void fetch('/logo-mark.png')
      .then((res) => res.blob())
      .then((blob) => {
        if (cancelled) return;
        const emergency = stage === 'analysis-emergency';
        replacePreview(URL.createObjectURL(blob));
        setUpload({
          analysis_id: 'ui-preview',
          analysis_status: 'complete',
          analysis: {
            category: emergency ? 'fire_injury_or_immediate_threat' : 'roads_and_sidewalks',
            seriousness: emergency ? 10 : 6,
            ai_confidence: 80,
          },
        });
        setCategory(emergency ? 'fire_injury_or_immediate_threat' : 'roads_and_sidewalks');
        if (stage === 'confirm') {
          setGps({ latitude: 39.2904, longitude: -76.6122, accuracy: 12 });
          setLocMode('gps');
        }
        setStep(stage === 'confirm' ? 'confirm' : 'analysis');
      });
    return () => {
      cancelled = true;
    };
  }, [replacePreview]);

  useEffect(() => {
    const el = bleedRef.current;
    if (!el || step !== 'capture') return;
    const prevent = (event: Event) => event.preventDefault();
    const onStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      event.preventDefault();
      pinchRef.current.startDistance = pinchDistance(event.touches[0], event.touches[1]);
      pinchRef.current.startZoom = pinchRef.current.zoom;
    };
    const onMove = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      event.preventDefault();
      if (capturePhase !== 'live') return;
      const track = streamRef.current?.getVideoTracks()[0] ?? null;
      const range = zoomRangeFromTrack(track);
      if (!range || pinchRef.current.startDistance <= 0) return;
      const next = zoomFromPinch(
        pinchRef.current.startZoom,
        pinchRef.current.startDistance,
        pinchDistance(event.touches[0], event.touches[1]),
        range,
      );
      pinchRef.current.zoom = next;
      if (track) void applyTrackZoom(track, next);
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('gesturestart', prevent, { passive: false });
    el.addEventListener('gesturechange', prevent, { passive: false });
    el.addEventListener('gestureend', prevent, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('gesturestart', prevent);
      el.removeEventListener('gesturechange', prevent);
      el.removeEventListener('gestureend', prevent);
    };
  }, [step, cameraOn, capturePhase]);

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
    const angle = screenOrientationAngle(
      typeof screen !== 'undefined' ? screen.orientation : null,
      typeof window !== 'undefined' ? (window as Window & { orientation?: number }).orientation : undefined,
    );
    const canvas = captureVisibleVideo(video, 1600, angle);
    if (!canvas) {
      setError('Capture failed. Upload instead.');
      return;
    }
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

  const resetToCapture = useCallback(() => {
    gen.current += 1;
    uploadAbort.current?.abort();
    uploadAbort.current = null;
    pendingFile.current = null;
    replacePreview(null);
    setUpload(null);
    setCategory('');
    setNote('');
    setGps(null);
    setAddress('');
    setLocMode('gps');
    setLocBusy(false);
    setSubmitting(false);
    setError(null);
    setLeaveOpen(false);
    setCapturePhase('live');
    setStep('capture');
  }, [replacePreview]);

  const askLeaveReport = () => setLeaveOpen(true);
  const stayWithReport = () => setLeaveOpen(false);

  const canSubmit =
    !!upload &&
    !!category &&
    category !== 'unable_to_assess' &&
    (locMode === 'gps' ? !!gps : address.trim().length > 0);

  const reporting = upload ? agencyReportingCopy(upload.analysis.category) : null;
  const emergency =
    !!upload && isEmergencyHandoff(upload.analysis.category, upload.analysis.seriousness);

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
        throw new Error('Could not save report.');
      });
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not save report.');
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
      setError(cause instanceof Error ? cause.message : 'Could not save report.');
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      {step === 'capture' && (
        <section className="capture-stage" aria-label="Capture">
          <img src="/logo-mark.png?v=3" alt="1MU" className="logo-mark" width={48} height={48} />
          <div className="camera-bleed" ref={bleedRef}>
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
                    Allow camera access to take a photo
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
          {!(cameraDenied && capturePhase === 'live' && !preview) && (
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
              <Link href="/map" className="btn-ghost" style={{ justifySelf: 'end' }} aria-label="Open incident map">
                Map
              </Link>
            </div>
          )}
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
        <section className="analysis-page" aria-labelledby="analysis-title">
          <header className="page-header">
            <img src="/logo-mark.png?v=3" alt="1MU" className="logo-mark" width={48} height={48} />
            <button type="button" className="text-btn" onClick={askLeaveReport}>
              Back
            </button>
          </header>
          <div className="analysis-page-body">
            <div className="analysis-stack">
              {upload.analysis_status === 'unavailable' && (
                <p className="toast-warn toast-warn-inline">
                  {upload.warning || 'Assessment unavailable — pick a category next.'}
                </p>
              )}
              <AnalysisCard
                category={upload.analysis.category}
                seriousness={upload.analysis.seriousness}
                onContinue={() => {
                  setError(null);
                  setLeaveOpen(false);
                  setStep('confirm');
                  requestGps();
                }}
              />
              {reporting ? (
                <a
                  className="agency-chip"
                  href={reporting.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {reporting.label}
                </a>
              ) : null}
              {emergency ? (
                <div className="danger-banner" role="alert">
                  <p>Dangerous environment, please move to safety and contact 911</p>
                  <a className="btn btn-emergency btn-block" href="tel:911">
                    Contact 911
                  </a>
                </div>
              ) : null}
              <img src={preview} alt="" className="analysis-thumb" />
            </div>
          </div>
        </section>
      )}

      {step === 'confirm' && upload && (
        <section className="confirm-stage" aria-label="Confirm report">
          <header className="page-header">
            <img src="/logo-mark.png?v=3" alt="1MU" className="logo-mark" width={48} height={48} />
            <button type="button" className="text-btn" onClick={askLeaveReport}>
              Back
            </button>
          </header>
          <div className="confirm-body">
            <div className="confirm-form">
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
                <span>Add a note to your report</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note to your report"
                  maxLength={200}
                />
              </label>
            </div>
          </div>
          <div className="confirm-footer">
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!canSubmit || submitting || locBusy}
              onClick={() => void submit()}
            >
              {submitting ? 'Saving…' : 'Save report'}
            </button>
          </div>
        </section>
      )}

      {leaveOpen && (step === 'analysis' || step === 'confirm') ? (
        <div
          className="leave-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-title"
        >
          <div className="leave-card">
            <h2 id="leave-title" className="leave-title">
              Leave this report?
            </h2>
            <p className="leave-copy">
              Clear the cached photo and delete this in-progress report, or return to the report.
            </p>
            <button type="button" className="btn btn-danger btn-block" onClick={resetToCapture}>
              Clear photo and delete
            </button>
            <button type="button" className="btn btn-primary btn-block" onClick={stayWithReport}>
              Return to the report
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
