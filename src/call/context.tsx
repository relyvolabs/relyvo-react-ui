import * as React from "react";

import { RelyvoCall as RelyvoCallClient, type CallCredentials } from "@relyvolabs/web-sdk";
import { RoomEvent, type Participant, type Room } from "livekit-client";

export type CallStatus = "connecting" | "connected" | "disconnected" | "error";

/** The subset of RelyvoCall the UI needs. Tests inject a fake with this shape. */
export type CallClientLike = {
  room: Room;
  disconnect(): void;
  enableCamera(enabled?: boolean): Promise<void>;
  enableMicrophone(enabled?: boolean): Promise<void>;
  shareScreen(enabled?: boolean): Promise<void>;
};

export type RelyvoCallProviderProps = {
  credentials: CallCredentials;
  /** Injectable for tests. */
  createCall?: (credentials: CallCredentials) => Promise<CallClientLike>;
  children: React.ReactNode;
};

export type RelyvoCallState = {
  status: CallStatus;
  error: Error | null;
  room: Room | null;
  participants: Participant[];
  /** Bumped whenever tracks or participants change, so tiles re-attach. */
  version: number;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  screenShareEnabled: boolean;
  toggleCamera: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  leave: () => void;
};

const RelyvoCallContext = React.createContext<RelyvoCallState | null>(null);

const ROOM_EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged,
] as const;

async function defaultCreateCall(credentials: CallCredentials): Promise<CallClientLike> {
  return (await RelyvoCallClient.connect(credentials)) as unknown as CallClientLike;
}

/**
 * Owns one media room.
 *
 * Connection happens on mount and teardown on unmount, so leaving the screen
 * always releases the camera and microphone.
 */
export function RelyvoCallProvider({ credentials, createCall, children }: RelyvoCallProviderProps) {
  const [status, setStatus] = React.useState<CallStatus>("connecting");
  const [error, setError] = React.useState<Error | null>(null);
  const [room, setRoom] = React.useState<Room | null>(null);
  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [version, setVersion] = React.useState(0);
  const [cameraEnabled, setCameraEnabled] = React.useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = React.useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = React.useState(false);

  const callRef = React.useRef<CallClientLike | null>(null);
  const createRef = React.useRef(createCall);
  createRef.current = createCall;

  const { serverUrl, token } = credentials;

  React.useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | undefined;

    setStatus("connecting");
    setError(null);

    void (async () => {
      try {
        const call = await (createRef.current ?? defaultCreateCall)({ serverUrl, token });
        if (cancelled) {
          call.disconnect();
          return;
        }

        callRef.current = call;
        setRoom(call.room);
        setStatus("connected");
        setCameraEnabled(call.room.localParticipant.isCameraEnabled);
        setMicrophoneEnabled(call.room.localParticipant.isMicrophoneEnabled);
        setScreenShareEnabled(call.room.localParticipant.isScreenShareEnabled);

        const sync = () => {
          const next = [call.room.localParticipant, ...Array.from(call.room.remoteParticipants.values())];
          setParticipants(next);
          setVersion((value) => value + 1);
          setCameraEnabled(call.room.localParticipant.isCameraEnabled);
          setMicrophoneEnabled(call.room.localParticipant.isMicrophoneEnabled);
          setScreenShareEnabled(call.room.localParticipant.isScreenShareEnabled);
        };

        const onDisconnected = () => setStatus("disconnected");

        for (const event of ROOM_EVENTS) call.room.on(event, sync);
        call.room.on(RoomEvent.Disconnected, onDisconnected);
        sync();

        detach = () => {
          for (const event of ROOM_EVENTS) call.room.off(event, sync);
          call.room.off(RoomEvent.Disconnected, onDisconnected);
        };
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error(String(caught)));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      detach?.();
      callRef.current?.disconnect();
      callRef.current = null;
      setRoom(null);
      setParticipants([]);
    };
  }, [serverUrl, token]);

  const toggleCamera = React.useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    const next = !cameraEnabled;
    try {
      await call.enableCamera(next);
      setCameraEnabled(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  }, [cameraEnabled]);

  const toggleMicrophone = React.useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    const next = !microphoneEnabled;
    try {
      await call.enableMicrophone(next);
      setMicrophoneEnabled(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  }, [microphoneEnabled]);

  const toggleScreenShare = React.useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    const next = !screenShareEnabled;
    try {
      await call.shareScreen(next);
      setScreenShareEnabled(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  }, [screenShareEnabled]);

  const leave = React.useCallback(() => {
    callRef.current?.disconnect();
    callRef.current = null;
    setRoom(null);
    setParticipants([]);
    setStatus("disconnected");
  }, []);

  const value = React.useMemo<RelyvoCallState>(
    () => ({
      status,
      error,
      room,
      participants,
      version,
      cameraEnabled,
      microphoneEnabled,
      screenShareEnabled,
      toggleCamera,
      toggleMicrophone,
      toggleScreenShare,
      leave,
    }),
    [
      status,
      error,
      room,
      participants,
      version,
      cameraEnabled,
      microphoneEnabled,
      screenShareEnabled,
      toggleCamera,
      toggleMicrophone,
      toggleScreenShare,
      leave,
    ],
  );

  return <RelyvoCallContext.Provider value={value}>{children}</RelyvoCallContext.Provider>;
}

/** Reads the nearest call provider. Throws outside one. */
export function useRelyvoCall(): RelyvoCallState {
  const state = React.useContext(RelyvoCallContext);
  if (!state) {
    throw new Error("useRelyvoCall must be used inside <RelyvoCallProvider>.");
  }
  return state;
}
