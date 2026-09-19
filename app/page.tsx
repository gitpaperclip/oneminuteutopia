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

export default function HomePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const gen = useRef(0);

  const [step, setStep] = useState<Step>('capture');
  const [preview, setPreview] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [busy, setBusy] = useState(false);
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

  const killCamera = useCallback(() => {
    stopTracks(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
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
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraDenied(true);
      return;
    }
    killCamera();
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
      streamRef.current = stream;
      setCameraDenied(false);
      setCameraOn(true);
    } catch {
      killCamera();
      setCameraDenied(true);
    }
  }, [killCamera]);

  useEffect(() => {
    if (step === 'capture' && !cameraOn && !busy && !preview && !cameraDenied) {
      void startCamera();
    }
  }, [step, cameraOn, busy, preview, cameraDenied, startCamera]);

  useEffect(() => {
    if (!cameraOn || preview || step !== 'capture') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [cameraOn, preview, step]);


  const runUpload = async (file: File) => {
    const id = ++gen.current;
    uploadAbort.current?.abort();
    killCamera();
    setBusy(true);
    setError(null);
    setUpload(null);
    try {
      const prepared = await prepareReportImage(file);
      if (id !== gen.current) return;
      const url = URL.createObjectURL(prepared);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
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
      setUpload(data as UploadResult);
      setCategory(data.analysis.category as string);
      setStep('analysis');
    } catch (cause) {
      if (id !== gen.current) return;
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Could not process photo.');
      setStep('capture');
    } finally {
      if (id === gen.current) {
        setBusy(false);
        uploadAbort.current = null;
      }
    }
  };

  const shutter = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || busy) return;
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
    await runUpload(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
  };

  const useGps = () => {
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
          <img src="/logo-mark.png?v=3" alt="1MU" className="logo-mark" width={64} height={64} />
          <div className="camera-bleed">
            {preview ? (
              <img src={preview} alt="" className="camera-video" />
            ) : (
              <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
            )}
            {busy && (
              <div className="busy-overlay" role="status">
                <span className="spinner" />
              </div>
            )}
            {cameraDenied && !preview && !busy && (
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
          <div className="capture-bar">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
              Upload
            </button>
            <button
              type="button"
              className="shutter"
              aria-label="Take photo"
              disabled={busy || !cameraOn}
              onClick={() => void shutter()}
            />
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
              if (f) void runUpload(f);
            }}
          />
        </section>
      )}

      {step === 'analysis' && upload && preview && (
        <section className="analysis-stage">
          <img src="/logo-mark.png?v=3" alt="1MU" className="logo-mark" width={64} height={64} />
          <img src={preview} alt="" className="analysis-photo" />
          {upload.analysis_status === 'unavailable' && (
            <p className="toast-warn">{upload.warning || 'AI unavailable — pick a category next.'}</p>
          )}
          <AnalysisCard
            category={upload.analysis.category}
            seriousness={upload.analysis.seriousness}
            ai_confidence={upload.analysis.ai_confidence}
            onContinue={() => {
              setError(null);
              setStep('confirm');
              useGps();
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
            <p className="toast-error" role="alert">
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
                <button type="button" className="text-btn" disabled={locBusy} onClick={useGps}>
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
                <button type="button" className="text-btn" disabled={locBusy} onClick={useGps}>
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
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </section>
      )}
    </div>
  );
}
