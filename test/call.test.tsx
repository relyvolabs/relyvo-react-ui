import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Participant, Room } from "livekit-client";

import { RelyvoCallProvider, RelyvoCallStage } from "../src/index.js";
import type { CallClientLike } from "../src/index.js";

const credentials = { serverUrl: "wss://rtc.test", token: "participant-token" };

function fakeParticipant(identity: string, local = false): Participant {
  return {
    identity,
    name: identity,
    isLocal: local,
    isSpeaking: false,
    getTrackPublication: () => undefined,
  } as unknown as Participant;
}

function fakeRoom(remotes: Participant[]): Room {
  const local = fakeParticipant("me", true) as unknown as Participant & {
    isCameraEnabled: boolean;
    isMicrophoneEnabled: boolean;
    isScreenShareEnabled: boolean;
  };
  local.isCameraEnabled = false;
  local.isMicrophoneEnabled = false;
  local.isScreenShareEnabled = false;

  return {
    localParticipant: local,
    remoteParticipants: new Map(remotes.map((participant) => [participant.identity, participant])),
    on: () => undefined,
    off: () => undefined,
  } as unknown as Room;
}

function fakeCall(room: Room) {
  const calls = { microphone: [] as boolean[], camera: [] as boolean[], screen: [] as boolean[], disconnect: 0 };
  const client: CallClientLike = {
    room,
    disconnect() {
      calls.disconnect += 1;
    },
    async enableMicrophone(enabled = true) {
      calls.microphone.push(enabled);
    },
    async enableCamera(enabled = true) {
      calls.camera.push(enabled);
    },
    async shareScreen(enabled = true) {
      calls.screen.push(enabled);
    },
  };
  return { client, calls };
}

describe("RelyvoCallStage", () => {
  it("renders every participant with a local marker", async () => {
    const room = fakeRoom([fakeParticipant("user_2")]);
    const { client } = fakeCall(room);

    render(
      <RelyvoCallProvider credentials={credentials} createCall={async () => client}>
        <RelyvoCallStage />
      </RelyvoCallProvider>,
    );

    expect(await screen.findByText("me (you)")).toBeInTheDocument();
    expect(screen.getByText("user_2")).toBeInTheDocument();
  });

  it("toggles the microphone through the call client", async () => {
    const room = fakeRoom([]);
    const { client, calls } = fakeCall(room);

    render(
      <RelyvoCallProvider credentials={credentials} createCall={async () => client}>
        <RelyvoCallStage />
      </RelyvoCallProvider>,
    );

    const button = await screen.findByRole("button", { name: "Unmute" });
    await userEvent.click(button);

    await waitFor(() => expect(calls.microphone).toEqual([true]));
    expect(await screen.findByRole("button", { name: "Mute" })).toBeInTheDocument();
  });

  it("leaves the call and reports a disconnected state", async () => {
    const room = fakeRoom([]);
    const { client, calls } = fakeCall(room);

    render(
      <RelyvoCallProvider credentials={credentials} createCall={async () => client}>
        <RelyvoCallStage />
      </RelyvoCallProvider>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Leave" }));

    expect(calls.disconnect).toBe(1);
    expect(screen.getByText("Waiting for others to join…")).toBeInTheDocument();
  });

  it("shows a connection error instead of pretending to be in a call", async () => {
    render(
      <RelyvoCallProvider
        credentials={credentials}
        createCall={async () => {
          throw new Error("camera permission denied");
        }}
      >
        <RelyvoCallStage />
      </RelyvoCallProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("camera permission denied");
  });
});
