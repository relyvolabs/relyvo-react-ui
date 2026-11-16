import * as React from "react";

import type { ChatMessage } from "@relyvolabs/web-sdk";

import { useRelyvoChat } from "./context.js";

export type RelyvoChatPanelProps = {
  title?: string;
  /** Shown when the conversation has no messages yet. */
  emptyText?: string;
  /** Your own chat user id, so your messages render on the right. */
  selfId?: string;
  placeholder?: string;
  className?: string;
};

/** Deterministic clock label: no locale or timezone hydration mismatch. */
function clock(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(11, 16);
}

/**
 * A complete chat surface: history, live messages, typing indicator, composer
 * and connection state. Wrap it in `RelyvoChatProvider` with credentials minted
 * by your backend.
 */
export function RelyvoChatPanel({
  title = "Chat",
  emptyText = "No messages yet. Say hello.",
  selfId,
  placeholder = "Write a message…",
  className,
}: RelyvoChatPanelProps) {
  const { status, error, messages, typing, send, retry } = useRelyvoChat();
  const [draft, setDraft] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, typing.length]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (content === "" || status !== "connected") return;
    setDraft("");
    await send(content);
  };

  const isOwn = (message: ChatMessage): boolean =>
    message.id.startsWith("pending:") ||
    message.sender_id === "self" ||
    (selfId !== undefined && message.sender_id === selfId);

  return (
    <div className={`relyvo-ui relyvo-chat ${className ?? ""}`} data-status={status}>
      <header className="relyvo-chat__header">
        <h2 className="relyvo-chat__title">{title}</h2>
        <span className="relyvo-chat__status">
          <span className={`relyvo-chat__dot relyvo-chat__dot--${status}`} aria-hidden="true" />
          {status === "connected"
            ? "Live"
            : status === "connecting"
              ? "Connecting…"
              : status === "disconnected"
                ? "Offline"
                : "Unavailable"}
        </span>
      </header>

      <div className="relyvo-chat__list" ref={listRef} role="log" aria-live="polite" aria-label="Messages">
        {error ? (
          <div className="relyvo-chat__error" role="alert">
            {error.message}
            {status === "error" ? (
              <div style={{ marginTop: 8 }}>
                <button type="button" className="relyvo-btn" onClick={retry}>
                  Try again
                </button>
              </div>
            ) : null}
          </div>
        ) : messages.length === 0 && status !== "connecting" ? (
          <p className="relyvo-chat__empty">{emptyText}</p>
        ) : null}

        {messages.map((message) => (
          <article
            key={message.id}
            className={[
              "relyvo-msg",
              isOwn(message) ? "relyvo-msg--own" : "",
              message.id.startsWith("pending:") ? "relyvo-msg--pending" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="relyvo-msg__meta">
              {isOwn(message) ? "You" : message.sender_id.slice(0, 8)} · {clock(message.created_at)}
            </span>
            <div className="relyvo-msg__bubble">{message.content}</div>
          </article>
        ))}
      </div>

      <p className="relyvo-chat__typing" aria-live="polite">
        {typing.length === 0
          ? ""
          : typing.length === 1
            ? `${typing[0]} is typing…`
            : `${typing.length} people are typing…`}
      </p>

      <form className="relyvo-chat__composer" onSubmit={submit}>
        <input
          className="relyvo-chat__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          aria-label="Message"
          disabled={status !== "connected"}
        />
        <button
          type="submit"
          className="relyvo-btn relyvo-btn--primary"
          disabled={status !== "connected" || draft.trim() === ""}
        >
          Send
        </button>
      </form>
    </div>
  );
}
