/**
 * Relyvo React UI.
 *
 * Ready-made chat and call surfaces on top of `@relyvolabs/web-sdk`. The browser
 * still holds only short-lived credentials minted by your backend; these
 * components never see a project API key.
 *
 * @example
 * ```tsx
 * <RelyvoChatProvider credentials={chatCredentials}>
 *   <RelyvoChatPanel selfId={chatUserId} />
 * </RelyvoChatProvider>
 * ```
 */

export { RelyvoChatProvider, useRelyvoChat } from "./chat/context.js";
export type {
  ChatClientLike,
  ChatStatus,
  RelyvoChatProviderProps,
  RelyvoChatState,
} from "./chat/context.js";
export { RelyvoChatPanel } from "./chat/panel.js";
export type { RelyvoChatPanelProps } from "./chat/panel.js";

export { RelyvoCallProvider, useRelyvoCall } from "./call/context.js";
export type {
  CallClientLike,
  CallStatus,
  RelyvoCallProviderProps,
  RelyvoCallState,
} from "./call/context.js";
export { RelyvoCallStage } from "./call/stage.js";
export type { RelyvoCallStageProps } from "./call/stage.js";

export const VERSION = "0.1.0";
