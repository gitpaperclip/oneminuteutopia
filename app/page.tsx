'use client';

/* eslint-disable @next/next/no-img-element -- local photo previews use object URLs */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { prepareReportImage } from '@/lib/image-client';

interface UploadResult {
  analysis_id: string;
  analysis_status: 'complete' | 'unavailable';
  warning?: string;
  analysis: { category: string; seriousness: number | null; ai_confidence: number };
}

interface ReportLocation { latitude: number; longitude: number; accuracy: number }
type IconName = 'camera' | 'upload' | 'pin' | 'check' | 'arrow' | 'spark';

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    camera: <><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="4" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />,
  };
  return <svg className={className} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function waitForCamera(video: HTMLVideoElement) {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', failed);
    };
    const ready = () => { if (video.videoWidth > 0) { cleanup(); resolve(); } };
    const failed = () => { cleanup(); reject(new Error('Camera preview unavailable.')); };
    const timeout = window.setTimeout(failed, 10000);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('error', failed);
  });
}

export default function ReportPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const uploadRequest = useRef(0);
  const locationRequest = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const capturingRef = useRef(false);
  const [step, setStep] = useState<'capture' | 'review'>('capture');
  const [preparedPhoto, setPreparedPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [progress, setProgress] = useState<'preparing' | 'analyzing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [locationMode, setLocationMode] = useState<'manual' | 'gps'>('manual');
  const [address, setAddress] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const closeCamera = useCallback(() => {
    cameraRequest.current += 1;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStream(null);
    setCameraOpen(false);
    setCameraLoading(false);
  }, []);

  useEffect(() => () => {
    cameraRequest.current += 1;
    uploadRequest.current += 1;
    locationRequest.current += 1;
    stopStream(streamRef.current);
    uploadController.current?.abort();
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!cameraOpen || !cameraStream || !videoRef.current) return;
    let active = true;
    const video = videoRef.current;
    video.srcObject = cameraStream;
    (async () => {
      try {
        await waitForCamera(video);
        await video.play();
        if (active) setCameraLoading(false);
      } catch {
        if (active) {
          closeCamera();
          setError('The camera preview could not start. You can upload a photo instead.');
        }
      }
    })();
    return () => { active = false; };
  }, [cameraOpen, cameraStream, closeCamera]);

  const startCamera = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera access needs a supported browser on HTTPS. Use Upload photo instead.');
      return;
    }
    closeCamera();
    const request = ++cameraRequest.current;
    setError(null);
    setCameraOpen(true);
    setCameraLoading(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false });
      } catch (cause) {
        if (!(cause instanceof DOMException) || cause.name !== 'OverconstrainedError') throw cause;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (request !== cameraRequest.current) { stopStream(stream); return; }
      streamRef.current = stream;
      setCameraStream(stream);
    } catch (cause) {
      if (request !== cameraRequest.current) return;
      closeCamera();
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'Camera permission was blocked. Allow it in your browser settings or upload a photo.'
        : 'The camera is unavailable or in use. Try again or upload a photo.');
    }
  };

  const processPhoto = async (source: File, alreadyPrepared = false) => {
    const request = ++uploadRequest.current;
    uploadController.current?.abort();
    closeCamera();
    setUpload(null);
    setError(null);
    setProgress(alreadyPrepared ? 'analyzing' : 'preparing');
    if (!alreadyPrepared) { setPreparedPhoto(null); setPreview(null); }
    let timeout: number | undefined;
    try {
      const file = alreadyPrepared ? source : await prepareReportImage(source);
      if (request !== uploadRequest.current) return;
      setPreparedPhoto(file);
      if (!alreadyPrepared) setPreview(URL.createObjectURL(file));
      setProgress('analyzing');
      const controller = new AbortController();
      uploadController.current = controller;
      timeout = window.setTimeout(() => controller.abort(), 60000);
      const form = new FormData();
      form.append('image', file);
      const response = await fetch('/api/upload', { method: 'POST', body: form, signal: controller.signal });
      const data = await response.json().catch(() => { throw new Error('The server could not process this photo. Please try again.'); });
      if (!response.ok) throw new Error(data.error || 'The photo could not be uploaded. Please try again.');
      if (!data.analysis_id || !data.analysis || !(data.analysis.category in CATEGORY_LABELS)) throw new Error('The saved assessment was incomplete. Please try again.');
      if (request !== uploadRequest.current) return;
      setUpload(data);
      setCategory(data.analysis.category);
      setStep('review');
    } catch (cause) {
      if (request !== uploadRequest.current) return;
      setError(cause instanceof DOMException && cause.name === 'AbortError'
        ? 'Processing took too long. Your photo is ready to try again.'
        : cause instanceof Error ? cause.message : 'Unable to process this photo. Please try again.');
    } finally {
      clearTimeout(timeout);
      if (request === uploadRequest.current) { setProgress(null); uploadController.current = null; }
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || capturingRef.current) return;
    const request = cameraRequest.current;
    capturingRef.current = true;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to capture a photo. Please use Upload photo.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      if (!blob || blob.size > 3 * 1024 * 1024) throw new Error('Unable to prepare this photo. Please use Upload photo.');
      if (request !== cameraRequest.current) return;
      const file = new File([blob], 'report-photo.jpg', { type: 'image/jpeg' });
      setPreview(URL.createObjectURL(file));
      await processPhoto(file, true);
    } catch (cause) {
      if (request === cameraRequest.current) setError(cause instanceof Error ? cause.message : 'Photo capture failed. Please try again.');
    } finally { capturingRef.current = false; setCapturing(false); }
  };

  const choosePhoto = () => { if (fileInput.current) { fileInput.current.value = ''; fileInput.current.click(); } };

  const requestCurrentLocation = () => {
    const request = ++locationRequest.current;
    setLocationMessage(null);
    if (!navigator.geolocation) { setLocationMessage('Location is unavailable. Enter an address or landmark below.'); return; }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition((position) => {
      if (request !== locationRequest.current) return;
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
      setLocationMode('gps');
      setLocationLoading(false);
    }, () => {
      if (request !== locationRequest.current) return;
      setLocationLoading(false);
      setLocationMessage('We could not get your location. Enter the issue’s address or a nearby landmark.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  };

  const switchToManualLocation = () => {
    locationRequest.current += 1;
    setLocationMode('manual');
    setLocationLoading(false);
    setLocationMessage(null);
  };

  const replacePhoto = () => {
    uploadRequest.current += 1;
    locationRequest.current += 1;
    uploadController.current?.abort();
    setLocationLoading(false);
    setLocationMessage(null);
    setUpload(null);
    setPreparedPhoto(null);
    setPreview(null);
    setError(null);
    setStep('capture');
    setDescription('');
  };

  const hasLocation = locationMode === 'gps' ? location !== null : address.trim().length > 0;

  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!upload || !hasLocation || category === 'unable_to_assess' || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    const gps = locationMode === 'gps' ? location : null;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('/api/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ analysis_id: upload.analysis_id, category, user_description: description.trim() || null,
          latitude: gps?.latitude ?? null, longitude: gps?.longitude ?? null, location_accuracy: gps?.accuracy ?? null,
          location_source: gps ? 'gps' : 'manual', location_address: gps ? null : address.trim() }),
      });
      const data = await response.json().catch(() => { throw new Error('The server did not confirm your report. Please try submitting again.'); });
      if (!response.ok) throw new Error(data.error || 'Your report could not be saved. Please try again.');
      if (typeof data.report_id !== 'string' || !data.report_id) throw new Error('The server did not confirm your report. Please try submitting again.');
      router.push(`/receipt/${encodeURIComponent(data.report_id)}`);
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === 'AbortError'
        ? 'Confirmation took too long. Try submitting again; a retry will not create a duplicate report.'
        : cause instanceof Error ? cause.message : 'Your report could not be saved. Please try again.');
      submittingRef.current = false;
      setSubmitting(false);
    } finally { clearTimeout(timeout); }
  };

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">✳</span><span>one minute<span className="brand-light"> utopia</span></span></Link>
        <span className="header-note">Small reports. Better places.</span>
      </header>
      <main id="main-content" className={step === 'capture' ? 'report-main' : 'report-main review-main'}>
        <div className="intro">
          <p className="eyebrow"><span className="status-dot" /> A little care goes a long way</p>
          <h1>{step === 'capture' ? <>A better block.<br />Starts with a photo.</> : <>One last look.<br /><span>Then you’re all set.</span></>}</h1>
          <p className="intro-copy">{step === 'capture' ? 'Spotted something that needs attention? Snap a photo. We’ll help identify the issue, so you can make a clear report in moments.' : 'Check the image assessment, tell us where the issue is, and add anything the photo doesn’t show.'}</p>
          <ol className="step-list" aria-label="Report progress">
            <li className={step === 'capture' ? 'current' : 'complete'} aria-current={step === 'capture' ? 'step' : undefined}><span>{step === 'review' ? <Icon name="check" /> : '1'}</span> Add a photo</li>
            <li className={step === 'review' ? 'current' : ''} aria-current={step === 'review' ? 'step' : undefined}><span>2</span> Review & locate</li>
            <li><span>3</span> Send your report</li>
          </ol>
          {step === 'capture' && <div className="intro-footnote"><Icon name="spark" /><p>AI helps with the first look.<br />You have the final say.</p></div>}
        </div>

        <section className="report-workspace" aria-label={step === 'capture' ? 'Add a report photo' : 'Review your report'}>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif" className="sr-only" tabIndex={-1} aria-label="Choose a report photo" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void processPhoto(file); }} />
          {step === 'capture' ? (
            <div className="capture-card">
              <div className="card-heading"><span className="eyebrow">Your neighborhood, noticed</span><span className="small-badge">01 / 03</span></div>
              {cameraOpen ? <>
                <div className="camera-preview"><video ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview" />{cameraLoading && <div className="camera-overlay"><span className="spinner" />Starting camera…</div>}</div>
                <div className="button-row"><button className="button button-primary" onClick={capturePhoto} disabled={cameraLoading || !cameraStream || capturing}><Icon name="camera" />{capturing ? 'Capturing…' : 'Capture photo'}</button><button className="button button-secondary" onClick={closeCamera}>Cancel</button></div>
              </> : progress ? <div className="processing" role="status" aria-live="polite">
                {preview ? <img src={preview} alt="Your selected issue" className="processing-image" /> : <div className="capture-illustration"><Icon name="upload" /></div>}
                <div className="processing-title"><span className="spinner" /><h2>{progress === 'preparing' ? 'Getting your photo ready' : 'Taking a closer look'}</h2></div>
                <p>{progress === 'preparing' ? 'Resizing the image for a quicker upload.' : 'Uploading your photo and asking AI to assess the visible issue.'}</p>
                <div className="processing-steps"><span className={progress === 'analyzing' ? 'done' : 'active'}>1. Prepare photo</span><span className={progress === 'analyzing' ? 'active' : ''}>2. Analyze image</span><span>3. Review</span></div>
              </div> : <>
                {preview && preparedPhoto ? <img src={preview} alt="Your selected issue, ready to retry" className="retry-image" /> : <div className="capture-art" aria-hidden="true"><div className="photo-frame"><span className="frame-sun" /><span className="frame-hill frame-hill-back" /><span className="frame-hill" /><span className="frame-focus"><Icon name="spark" /></span></div><span className="photo-caption">Notice it. Capture it. Report it.</span></div>}
                <h2>{preparedPhoto ? 'Let’s try that again' : 'What needs a little attention?'}</h2>
                <p className="card-copy">{preparedPhoto ? 'Your photo is ready. Retry the assessment or choose a different image.' : 'A clear photo helps us understand the issue. Include the surrounding area if you can.'}</p>
                {preparedPhoto ? <button className="button button-primary" onClick={() => processPhoto(preparedPhoto, true)}><Icon name="spark" />Try processing again</button> : <button className="button button-primary" onClick={startCamera}><Icon name="camera" />Take a photo</button>}
                <button className="button button-secondary" onClick={choosePhoto}><Icon name="upload" />{preparedPhoto ? 'Choose another photo' : 'Upload a photo'}</button>
                <p className="file-hint">Photos up to 20 MB · Optimized before upload</p>
              </>}
              <div className="privacy-note"><span aria-hidden="true">↳</span> Only take photos from a safe place. Avoid faces and personal information.</div>
            </div>
          ) : upload && (
            <form onSubmit={submitReport} className="review-card">
              <div className="review-photo">{preview && <img src={preview} alt="Photo of the issue being reported" />}<button type="button" onClick={replacePhoto} disabled={submitting} className="change-photo">Change photo</button></div>
              <div className="review-content">
                <section className="analysis-section" aria-labelledby="analysis-heading">
                  <div className="section-title"><h2 id="analysis-heading"><Icon name="spark" />{upload.analysis_status === 'unavailable' ? 'Your photo is saved' : 'First look, by AI'}</h2><span className="saved-badge"><Icon name="check" />Saved</span></div>
                  {upload.analysis_status === 'unavailable' ? <p className="notice notice-neutral">{upload.warning || 'AI analysis is temporarily unavailable. Choose the issue type below and continue with your report.'}</p> : <>
                    <p className="ai-category">{CATEGORY_LABELS[upload.analysis.category]}</p>
                    <div className="score-grid"><div><span>Seriousness</span><strong>{upload.analysis.seriousness === null ? 'Not assessed' : <>{upload.analysis.seriousness}<small> / 10</small></>}</strong></div><div><span>AI confidence</span><strong>{upload.analysis.ai_confidence}<small>%</small></strong></div></div>
                    <p className="assessment-note">An initial assessment of this photo. Confidence is an AI estimate, not verified accuracy.</p>
                  </>}
                  <details className="assessment-details"><summary>Saved assessment reference</summary><code>{upload.analysis_id}</code></details>
                </section>
                <fieldset disabled={submitting} className="report-fields">
                  <div className="form-field"><label htmlFor="category">Issue type <span>You can change this</span></label><select id="category" value={category} onChange={(event) => setCategory(event.target.value)} required>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value} disabled={value === 'unable_to_assess'}>{value === 'unable_to_assess' ? 'Choose an issue type' : label}</option>)}</select>{category === 'unable_to_assess' && <p className="field-hint category-hint">Choose the issue type that best matches your photo.</p>}</div>
                  <div className="form-field location-field"><label htmlFor={locationMode === 'manual' ? 'address' : undefined}>Where is the issue?</label><p className="field-hint">Use the issue’s location, which may differ from where you are now.</p>
                    {locationMode === 'gps' && location ? <div className="location-result"><div><Icon name="pin" /><div><strong>Current location added</strong><p>{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)} · ±{Math.round(location.accuracy)} m</p></div></div><button type="button" className="text-button" onClick={switchToManualLocation}>Use an address instead</button><button type="button" className="text-button" onClick={requestCurrentLocation} disabled={locationLoading}>{locationLoading ? 'Updating location…' : 'Refresh location'}</button></div> : <>
                      <input id="address" value={address} onChange={(event) => { switchToManualLocation(); setAddress(event.target.value); }} maxLength={500} placeholder="Street address, intersection, or landmark" autoComplete="street-address" required />
                      <button type="button" className="text-button location-button" onClick={requestCurrentLocation} disabled={locationLoading}><Icon name="pin" />{locationLoading ? 'Finding your location…' : 'Use my current location'}</button>
                    </>}
                    {locationMessage && <p className="field-hint location-message" role="status">{locationMessage}</p>}
                  </div>
                  <details className="optional-details"><summary>Add details <span>Optional</span></summary><div className="form-field"><label htmlFor="description" className="sr-only">Additional details</label><textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={2000} placeholder="Add details that might not be visible in the photo." /></div></details>
                  <button type="submit" className="button button-primary" disabled={!hasLocation || category === 'unable_to_assess' || locationLoading || submitting}>{submitting ? <><span className="spinner" />Sending your report…</> : <>Send report<Icon name="arrow" /></>}</button>
                  {!hasLocation && <p className="submit-hint">Add an address or current location to continue.</p>}
                </fieldset>
              </div>
            </form>
          )}
        </section>
      </main>
      <footer className="site-footer"><span>One Minute Utopia</span><p>A small step toward a place we all care for.</p></footer>
    </div>
  );
}
