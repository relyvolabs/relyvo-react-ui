import * as React from "react";

import { Track, type Participant } from "livekit-client";

import { useRelyvoCall } from "./context.js";

export type RelyvoCallStageProps = {
  className?: string;
  /** Hide the built-in control bar when you render your own. */
  showControls?: boolean;
  emptyText?: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** One participant: camera or screen share video plus its microphone audio. */
function VideoTile({ participant, version }: { participant: Participant; version: number }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  const screen = participant.getTrackPublication(Track.Source.ScreenShare)?.track ?? null;
  const camera = participant.getTrackPublication(Track.Source.Camera)?.track ?? null;
  const video = screen ?? camera;
  const microphone = participant.isLocal
    ? null
    : (participant.getTrackPublication(Track.Source.Microphone)?.track ?? null);

  React.useEffect(() => {
    const element = videoRef.current;
    if (!element || !video) return;
    video.attach(element);
    return () => {
      video.detach(element);
    };
  }, [video, version]);

  React.useEffect(() => {
    const element = audioRef.current;
    if (!element || !microphone) return;
    microphone.attach(element);
    return () => {
      microphone.detach(element);
    };
  }, [microphone, version]);

  const label = participant.name || participant.identity;

  return (
    <div
      className={[
        "relyvo-tile",
        participant.isSpeaking ? "relyvo-tile--speaking" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <video
        ref={videoRef}
        className="relyvo-tile__video"
        autoPlay
        playsInline
        muted={participant.isLocal}
        aria-label={`${label} video`}
      />
      {video ? null : <div className="relyvo-tile__placeholder">{initials(label)}</div>}
      {participant.isLocal ? null : <audio ref={audioRef} autoPlay />}
      <span className="relyvo-tile__name">
        {label}
        {participant.isLocal ? " (you)" : ""}
      </span>
    </div>
  );
}

/**
 * Video call surface: participant grid plus the standard controls.
 *
 * Screen shares take precedence over a camera on the participant's own tile, so
 * a shared screen is never hidden behind a face.
 */
export function RelyvoCallStage({
  className,
  showControls = true,
  emptyText = "Waiting for others to join…",
}: RelyvoCallStageProps) {
  const call = useRelyvoCall();

  return (
    <div className={`relyvo-ui relyvo-call ${className ?? ""}`} data-status={call.status}>
      {call.error ? (
        <div className="relyvo-call__error" role="alert">
          {call.error.message}
        </div>
      ) : null}

      <div className="relyvo-call__stage" aria-label="Participants">
        {call.participants.length === 0 ? (
          <p className="relyvo-chat__empty">
            {call.status === "connecting" ? "Connecting…" : emptyText}
          </p>
        ) : (
          call.participants.map((participant) => (
            <VideoTile key={participant.identity} participant={participant} version={call.version} />
          ))
        )}
      </div>

      {showControls ? (
        <div className="relyvo-call__controls" role="toolbar" aria-label="Call controls">
          <button
            type="button"
            className="relyvo-btn"
            aria-pressed={call.microphoneEnabled}
            onClick={() => void call.toggleMicrophone()}
          >
            {call.microphoneEnabled ? "Mute" : "Unmute"}
          </button>
          <button
            type="button"
            className="relyvo-btn"
            aria-pressed={call.cameraEnabled}
            onClick={() => void call.toggleCamera()}
          >
            {call.cameraEnabled ? "Camera off" : "Camera on"}
          </button>
          <button
            type="button"
            className="relyvo-btn"
            aria-pressed={call.screenShareEnabled}
            onClick={() => void call.toggleScreenShare()}
          >
            {call.screenShareEnabled ? "Stop sharing" : "Share screen"}
          </button>
          <button type="button" className="relyvo-btn relyvo-btn--danger" onClick={call.leave}>
            Leave
          </button>
        </div>
      ) : null}
    </div>
  );
}
