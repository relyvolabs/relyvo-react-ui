import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Vitest runs without globals here, so RTL's automatic cleanup is not registered.
afterEach(cleanup);

// jsdom does not implement media playback or a media stream sink.
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
HTMLMediaElement.prototype.pause = vi.fn();
Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
  configurable: true,
  get(this: HTMLMediaElement & { __srcObject?: unknown }) {
    return this.__srcObject ?? null;
  },
  set(this: HTMLMediaElement & { __srcObject?: unknown }, value: unknown) {
    this.__srcObject = value;
  },
});
