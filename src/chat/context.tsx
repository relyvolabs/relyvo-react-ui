import * as React from "react";

import {
  RelyvoChat as RelyvoChatClient,
  type ChatCredentials,
  type ChatMessage,
  type MessageEvent,
  type TypingEvent,
} from "@relyvolabs/web-sdk";

export type ChatStatus = "connecting" | "connected" | "disconnected" | "error";

/** The subset of RelyvoChat the UI needs. Tests inject a fake with this shape. */
export type ChatClientLike = {
  connect(): Promise<void>;
  disconnect(): void;
  on(event: "message", handler: (event: MessageEvent) => void): () => void;
  on(event: "typing", handler: (event: TypingEvent) => void): () => void;
  on(event: "disconnected", handler: (reason?: string) => void): () => void;
  on(event: "error", handler: (error: Error) => void): () => void;
  history(input?: { limit?: number }): Promise<{ items: ChatMessage[] }>;
  send(input: { content: string; clientMessageId: string }): Promise<{ message: ChatMessage }>;
};

export type RelyvoChatProviderProps = {
  credentials: ChatCredentials;
  /** Forwarded to the SDK so an expired connection token is replaced. */
  getConnectionToken?: () => Promise<string>;
  /** Forwarded to the SDK so an expired subscription token is replaced. */
  getSubscriptionToken?: (channel: string) => Promise<string>;
  historyLimit?: number;
  /** Injectable for tests. */
  createClient?: (
    credentials: ChatCredentials,
    options: {
      getConnectionToken?: () => Promise<string>;
      getSubscriptionToken?: (channel: string) => Promise<string>;
    },
  ) => ChatClientLike;
  children: React.ReactNode;
};

export type RelyvoChatState = {
  status: ChatStatus;
  error: Error | null;
  messages: ChatMessage[];
  typing: string[];
  send: (content: string) => Promise<void>;
  retry: () => void;
};

const RelyvoChatContext = React.createContext<RelyvoChatState | null>(null);

function defaultCreateClient(
  credentials: ChatCredentials,
  options: {
    getConnectionToken?: () => Promise<string>;
    getSubscriptionToken?: (channel: string) => Promise<string>;
  },
): ChatClientLike {
  return new RelyvoChatClient(credentials, options) as unknown as ChatClientLike;
}

/** Accepts a message once, by id, keeping the array in send order. */
function mergeMessage(current: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = current.findIndex((candidate) => candidate.id === message.id);
  if (index >= 0) {
    const next = [...current];
    next[index] = message;
    return next;
  }
  return [...current, message];
}

/** History arrives newest first; the panel renders oldest first. */
function mergeHistory(current: ChatMessage[], items: ChatMessage[]): ChatMessage[] {
  const seen = new Set(current.map((message) => message.id));
  const older = [...items].reverse().filter((message) => !seen.has(message.id));
  return [...older, ...current];
}

/**
 * Owns one chat session and exposes it to the panel.
 *
 * The provider connects on mount and disconnects on unmount, so a chat cannot
 * outlive the screen that shows it.
 */
export function RelyvoChatProvider({
  credentials,
  getConnectionToken,
  getSubscriptionToken,
  historyLimit = 50,
  createClient,
  children,
}: RelyvoChatProviderProps) {
  const [status, setStatus] = React.useState<ChatStatus>("connecting");
  const [error, setError] = React.useState<Error | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [typing, setTyping] = React.useState<Record<string, string>>({});
  const [attempt, setAttempt] = React.useState(0);

  const clientRef = React.useRef<ChatClientLike | null>(null);
  const optionsRef = React.useRef({ getConnectionToken, getSubscriptionToken, createClient });
  optionsRef.current = { getConnectionToken, getSubscriptionToken, createClient };

  const channelKey = `${credentials.wsUrl}|${credentials.token}|${credentials.channel}`;

  React.useEffect(() => {
    let cancelled = false;
    const options = optionsRef.current;
    const client = (options.createClient ?? defaultCreateClient)(credentials, {
      ...(options.getConnectionToken === undefined ? {} : { getConnectionToken: options.getConnectionToken }),
      ...(options.getSubscriptionToken === undefined ? {} : { getSubscriptionToken: options.getSubscriptionToken }),
    });
    clientRef.current = client;

    setStatus("connecting");
    setError(null);

    const offMessage = client.on("message", (event) => {
      setMessages((current) => mergeMessage(current, event.message));
    });
    const offTyping = client.on("typing", (event) => {
      const name = event.display_name ?? event.user_id;
      setTyping((current) => ({ ...current, [event.user_id]: name }));
      window.setTimeout(() => {
        setTyping((current) => {
          const next = { ...current };
          delete next[event.user_id];
          return next;
        });
      }, 4000);
    });
    const offDisconnected = client.on("disconnected", () => setStatus("disconnected"));
    const offError = client.on("error", (caught) => {
      setError(caught);
      setStatus("error");
    });

    void (async () => {
      try {
        await client.connect();
        if (cancelled) return;
        setStatus("connected");

        const page = await client.history({ limit: historyLimit });
        if (cancelled) return;
        setMessages((current) => mergeHistory(current, page.items));
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error(String(caught)));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      offMessage();
      offTyping();
      offDisconnected();
      offError();
      client.disconnect();
      if (clientRef.current === client) clientRef.current = null;
    };
    // The callbacks are read through optionsRef so a re-render does not reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, historyLimit, attempt]);

  const send = React.useCallback(
    async (content: string) => {
      const client = clientRef.current;
      const trimmed = content.trim();
      if (!client || trimmed === "") return;

      const clientMessageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const channelId = credentials.channel.split(":").at(-1) ?? "";
      const optimistic: ChatMessage = {
        id: `pending:${clientMessageId}`,
        channel_id: channelId,
        channel_seq: Number.MAX_SAFE_INTEGER,
        sender_id: "self",
        client_message_id: clientMessageId,
        type: "text",
        content: trimmed,
        created_at: new Date().toISOString(),
        metadata: null,
      };
      setMessages((current) => [...current, optimistic]);

      try {
        const { message } = await client.send({ content: trimmed, clientMessageId });
        setMessages((current) =>
          mergeMessage(
            current.filter((candidate) => candidate.id !== optimistic.id),
            message,
          ),
        );
      } catch (caught) {
        setMessages((current) => current.filter((candidate) => candidate.id !== optimistic.id));
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      }
    },
    [credentials.channel],
  );

  const retry = React.useCallback(() => setAttempt((value) => value + 1), []);

  const value = React.useMemo<RelyvoChatState>(
    () => ({
      status,
      error,
      messages,
      typing: Object.values(typing),
      send,
      retry,
    }),
    [status, error, messages, typing, send, retry],
  );

  return <RelyvoChatContext.Provider value={value}>{children}</RelyvoChatContext.Provider>;
}

/** Reads the nearest chat provider. Throws outside one. */
export function useRelyvoChat(): RelyvoChatState {
  const state = React.useContext(RelyvoChatContext);
  if (!state) {
    throw new Error("useRelyvoChat must be used inside <RelyvoChatProvider>.");
  }
  return state;
}
