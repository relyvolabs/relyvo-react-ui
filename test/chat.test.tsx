import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RelyvoChatPanel, RelyvoChatProvider } from "../src/index.js";
import type { ChatClientLike } from "../src/index.js";
import type { ChatMessage } from "@relyvolabs/web-sdk";

const credentials = {
  wsUrl: "wss://chat.test/connection/websocket",
  token: "connection-token",
  channel: "project:p:channel:0f5b3a7e",
  subscriptionToken: "subscription-token",
};

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    channel_id: "0f5b3a7e",
    channel_seq: 1,
    sender_id: "user_1",
    type: "text",
    content: "hello",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function fakeClient() {
  const state = {
    connected: false,
    sent: [] as { content: string; clientMessageId: string }[],
    messageHandlers: [] as ((event: { message: ChatMessage }) => void)[],
    typingHandlers: [] as ((event: { channel_id: string; user_id: string; display_name?: string }) => void)[],
    disconnected: 0,
  };

  const client: ChatClientLike = {
    async connect() {
      state.connected = true;
    },
    disconnect() {
      state.disconnected += 1;
    },
    on(event: string, handler: (payload: unknown) => void) {
      if (event === "message") state.messageHandlers.push(handler as never);
      if (event === "typing") state.typingHandlers.push(handler as never);
      return () => {};
    },
    async history() {
      return { items: [message({ id: "m1", content: "from history" })] };
    },
    async channels() {
      return [
        { id: "0f5b3a7e", type: "group", name: "Support", last_seq: 4 },
        { id: "ch_mtg_1", type: "group", name: "Meeting chat", last_seq: 1, source_product: "meet", sending_enabled: false },
        { id: "a1b2c3d4", type: "direct", name: "", last_seq: 2 },
      ];
    },
    async unread(channelId: string) {
      return { channel_id: channelId, unread_count: channelId === "0f5b3a7e" ? 3 : 0, has_unread: channelId === "0f5b3a7e", last_seq: 4, last_read_seq: 1 };
    },
    async send(input) {
      state.sent.push(input);
      return { message: message({ id: "m2", content: input.content }) };
    },
  } as ChatClientLike;

  return { client, state };
}

function renderChat(extra: Partial<{ selfId: string }> = {}) {
  const fake = fakeClient();
  render(
    <RelyvoChatProvider credentials={credentials} createClient={() => fake.client}>
      <RelyvoChatPanel selfId={extra.selfId} />
    </RelyvoChatProvider>,
  );
  return fake;
}

describe("RelyvoChatPanel", () => {
  it("loads history and shows the live state", async () => {
    renderChat();

    expect(await screen.findByText("from history")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("sends a message and renders the canonical result", async () => {
    const fake = renderChat();
    await screen.findByText("from history");

    await userEvent.type(screen.getByLabelText("Message"), "hi there");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(fake.state.sent).toHaveLength(1));
    expect(fake.state.sent[0]?.content).toBe("hi there");
    expect(await screen.findByText("hi there")).toBeInTheDocument();
  });

  it("renders an incoming realtime message once", async () => {
    const fake = renderChat();
    await screen.findByText("from history");

    act(() => {
      for (const handler of fake.state.messageHandlers) {
        handler({ message: message({ id: "m3", content: "live message", sender_id: "user_2" }) });
      }
    });

    expect(await screen.findByText("live message")).toBeInTheDocument();
    expect(screen.getAllByText("live message")).toHaveLength(1);
  });

  it("shows who is typing and clears the indicator", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fake = renderChat();
    await screen.findByText("from history");

    act(() => {
      for (const handler of fake.state.typingHandlers) {
        handler({ channel_id: "0f5b3a7e", user_id: "user_2", display_name: "Ada" });
      }
    });

    expect(await screen.findByText("Ada is typing…")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4500);
    });

    expect(screen.queryByText("Ada is typing…")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("disconnects the transport on unmount", async () => {
    const fake = fakeClient();
    const view = render(
      <RelyvoChatProvider credentials={credentials} createClient={() => fake.client}>
        <RelyvoChatPanel />
      </RelyvoChatProvider>,
    );
    await screen.findByText("from history");

    view.unmount();

    expect(fake.state.disconnected).toBe(1);
  });
});
