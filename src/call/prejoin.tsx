import * as React from "react";

export type PrejoinSelection = {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  cameraDeviceId?: string;
  microphoneDeviceId?: string;
  speakerDeviceId?: string;
};

export type RelyvoPrejoinProps = {
  /** Called with the chosen devices; connect the call with credentials from your backend. */
  onJoin: (selection: PrejoinSelection) => void | Promise<void>;
  onCancel?: () => void;
  title?: string;
  joinLabel?: string;
  cancelLabel?: string;
  className?: string;
};

type DeviceList = {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
};

const EMPTY_DEVICES: DeviceList = { cameras: [], microphones: [], speakers: [] };

/** Device labels are hidden until the user grants permission. */
function deviceLabel(device: MediaDeviceInfo, fallback: string): string {
  return device.label.trim() !== "" ? device.label : fallback;
}

/**
 * Camera and microphone check before joining a call.
 *
 * It previews the local camera, shows an input level meter, and lets the
 * participant pick devices and turn either one off. Nothing is published: the
 * preview stream is stopped when the component unmounts or the choice changes.
 */
export function RelyvoPrejoin({
  onJoin,
  onCancel,
  title = "Ready to join?",
  joinLabel = "Join now",
  cancelLabel = "Cancel",
  className,
}: RelyvoPrejoinProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const frameRef = React.useRef<number | null>(null);

  const [cameraEnabled, setCameraEnabled] = React.useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = React.useState(true);
  const [cameraId, setCameraId] = React.useState<string | undefined>(undefined);
  const [microphoneId, setMicrophoneId] = React.useState<string | undefined>(undefined);
  const [speakerId, setSpeakerId] = React.useState<string | undefined>(undefined);
  const [devices, setDevices] = React.useState<DeviceList>(EMPTY_DEVICES);
  const [error, setError] = React.useState<string | null>(null);
  const [level, setLevel] = React.useState(0);
  const [joining, setJoining] = React.useState(false);

  const supported =
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";

  const stop = React.useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  const startMeter = React.useCallback((stream: MediaStream) => {
    const AudioContextCtor =
      typeof window === "undefined"
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioContextCtor || stream.getAudioTracks().length === 0) return;

    const context = new AudioContextCtor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);

    const samples = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      setLevel(Math.min(100, Math.round(rms * 320)));
      frameRef.current = requestAnimationFrame(tick);
    };

    audioContextRef.current = context;
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  React.useEffect(() => {
    if (!supported) {
      setError("Camera and microphone are not available in this browser.");
      setCameraEnabled(false);
      setMicrophoneEnabled(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: cameraEnabled ? (cameraId ? { deviceId: { exact: cameraId } } : true) : false,
          audio: microphoneEnabled ? (microphoneId ? { deviceId: { exact: microphoneId } } : true) : false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        stop();
        streamRef.current = stream;
        setError(null);

        const video = videoRef.current;
        if (video && cameraEnabled) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }

        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;

        const pick = (kind: MediaDeviceKind) => list.filter((device) => device.kind === kind);
        setDevices({
          cameras: pick("videoinput"),
          microphones: pick("audioinput"),
          speakers: pick("audiooutput"),
        });

        if (microphoneEnabled) startMeter(stream);
      } catch {
        if (cancelled) return;
        setError("We could not access your camera or microphone. Check the browser permission and try again.");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [supported, cameraEnabled, microphoneEnabled, cameraId, microphoneId, stop, startMeter]);

  const join = async () => {
    setJoining(true);
    try {
      await onJoin({
        cameraEnabled,
        microphoneEnabled,
        ...(cameraId === undefined ? {} : { cameraDeviceId: cameraId }),
        ...(microphoneId === undefined ? {} : { microphoneDeviceId: microphoneId }),
        ...(speakerId === undefined ? {} : { speakerDeviceId: speakerId }),
      });
    } finally {
      setJoining(false);
    }
  };

  return (
    <section className={`relyvo-ui relyvo-prejoin ${className ?? ""}`} aria-label={title}>
      <div className="relyvo-prejoin__screen">
        <video
          ref={videoRef}
          className="relyvo-prejoin__video"
          autoPlay
          playsInline
          muted
          aria-label="Camera preview"
          style={{ visibility: cameraEnabled ? "visible" : "hidden" }}
        />
        {cameraEnabled ? null : <p className="relyvo-prejoin__placeholder">Camera is off</p>}
      </div>

      <div className="relyvo-prejoin__side">
        <h2 className="relyvo-prejoin__title">{title}</h2>

        {error ? (
          <p className="relyvo-prejoin__error" role="alert">
            {error}
          </p>
        ) : null}

        <label className="relyvo-prejoin__field">
          Camera
          <select
            className="relyvo-prejoin__select"
            value={cameraId ?? ""}
            onChange={(event) => setCameraId(event.target.value || undefined)}
            disabled={!supported || devices.cameras.length === 0}
          >
            <option value="">Default camera</option>
            {devices.cameras.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {deviceLabel(device, `Camera ${index + 1}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="relyvo-prejoin__field">
          Microphone
          <select
            className="relyvo-prejoin__select"
            value={microphoneId ?? ""}
            onChange={(event) => setMicrophoneId(event.target.value || undefined)}
            disabled={!supported || devices.microphones.length === 0}
          >
            <option value="">Default microphone</option>
            {devices.microphones.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {deviceLabel(device, `Microphone ${index + 1}`)}
              </option>
            ))}
          </select>
        </label>

        {devices.speakers.length > 0 ? (
          <label className="relyvo-prejoin__field">
            Speaker
            <select
              className="relyvo-prejoin__select"
              value={speakerId ?? ""}
              onChange={(event) => setSpeakerId(event.target.value || undefined)}
            >
              <option value="">Default speaker</option>
              {devices.speakers.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {deviceLabel(device, `Speaker ${index + 1}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="relyvo-prejoin__field">
          Input level
          <div
            className="relyvo-prejoin__meter"
            role="meter"
            aria-label="Microphone input level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={microphoneEnabled ? level : 0}
            style={{ ["--relyvo-level" as string]: `${microphoneEnabled ? level : 0}%` }}
          >
            <span />
          </div>
        </div>

        <div className="relyvo-call__controls">
          <button
            type="button"
            className="relyvo-btn"
            aria-pressed={microphoneEnabled}
            onClick={() => setMicrophoneEnabled((value) => !value)}
          >
            {microphoneEnabled ? "Mute" : "Unmute"}
          </button>
          <button
            type="button"
            className="relyvo-btn"
            aria-pressed={cameraEnabled}
            onClick={() => setCameraEnabled((value) => !value)}
          >
            {cameraEnabled ? "Camera off" : "Camera on"}
          </button>
        </div>

        <div className="relyvo-prejoin__actions">
          {onCancel ? (
            <button type="button" className="relyvo-btn" onClick={onCancel}>
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="relyvo-btn relyvo-btn--primary"
            onClick={() => void join()}
            disabled={joining}
          >
            {joining ? "Joining…" : joinLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
