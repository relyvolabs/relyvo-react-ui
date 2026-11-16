import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RelyvoPrejoin } from "../src/index.js";

function fakeStream() {
  const stop = vi.fn();
  return {
    stop,
    stream: {
      getTracks: () => [{ stop }],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
    } as unknown as MediaStream,
  };
}

function installMediaDevices() {
  const { stream } = fakeStream();
  const devices = [
    { deviceId: "cam-1", kind: "videoinput", label: "Front camera", groupId: "g" },
    { deviceId: "mic-1", kind: "audioinput", label: "Desk microphone", groupId: "g" },
    { deviceId: "spk-1", kind: "audiooutput", label: "Desk speaker", groupId: "g" },
  ] as MediaDeviceInfo[];

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
      enumerateDevices: vi.fn().mockResolvedValue(devices),
    },
  });

  return () => {
    delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
  };
}

describe("RelyvoPrejoin", () => {
  it("explains that media is unavailable and still allows joining", async () => {
    const onJoin = vi.fn();
    render(<RelyvoPrejoin onJoin={onJoin} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/not available/i);

    await userEvent.click(screen.getByRole("button", { name: "Join now" }));

    expect(onJoin).toHaveBeenCalledWith(
      expect.objectContaining({ cameraEnabled: false, microphoneEnabled: false }),
    );
  });

  it("lists devices and joins with the chosen state", async () => {
    const restore = installMediaDevices();
    const onJoin = vi.fn();

    render(<RelyvoPrejoin onJoin={onJoin} />);

    expect(await screen.findByText("Front camera")).toBeInTheDocument();
    expect(screen.getByText("Desk microphone")).toBeInTheDocument();
    expect(screen.getByText("Desk speaker")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mute" }));
    await userEvent.click(screen.getByRole("button", { name: "Join now" }));

    await waitFor(() =>
      expect(onJoin).toHaveBeenCalledWith(
        expect.objectContaining({ cameraEnabled: true, microphoneEnabled: false }),
      ),
    );

    restore();
  });

  it("calls onCancel", async () => {
    installMediaDevices();
    const onCancel = vi.fn();

    render(<RelyvoPrejoin onJoin={() => {}} onCancel={onCancel} />);
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
