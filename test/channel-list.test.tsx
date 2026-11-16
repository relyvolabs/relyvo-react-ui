import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RelyvoChannelList, RelyvoChatProvider } from "../src/index.js";
import type { ChatClientLike } from "../src/index.js";

const credentials = {
  wsUrl: "wss://chat.test/connection/websocket",
  token: "connection-token",
  channel: "project:p:channel:0f5b3a7e",
  subscriptionToken: "subscription-token",
};

const CHANNELS = [
  { id: "0f5b3a7e", type: "group", name: "Support", last_seq: 4 },
  { id: "ch_mtg_1", type: "group", name: "Meeting chat", last_seq: 1, source_product: "meet", sending_enabled: false },
  { id: "a1b2c3d4", type: "direct", name: "", last_seq: 2 },
];

function client(): ChatClientLike {
  return {
    async connect() {},
    disconnect() {},
    on() {
      return () => {};
    },
    async history() {
      return { items: [] };
    },
    async channels() {
      return CHANNELS;
    },
    async unread(channelId: string) {
      const count = channelId === "a1b2c3d4" ? 2 : channelId === "0f5b3a7e" ? 3 : 0;
      return { channel_id: channelId, unread_count: count, has_unread: count > 0, last_seq: 4, last_read_seq: 1 };
    },
    async send() {
      throw new Error("not used");
    },
  } as ChatClientLike;
}

function renderList(props: Partial<React.ComponentProps<typeof RelyvoChannelList>> = {}) {
  const onSelect = vi.fn();
  render(
    <RelyvoChatProvider credentials={credentials} createClient={client}>
      <RelyvoChannelList onSelect={onSelect} {...props} />
    </RelyvoChatProvider>,
  );
  return { onSelect };
}

describe("RelyvoChannelList", () => {
  it("lists conversations with type, name and unread badge", async () => {
    renderList();

    expect(await screen.findByText("Support")).toBeInTheDocument();
    expect(screen.getByText("Meeting chat")).toBeInTheDocument();
    expect(screen.getByText("Direct message")).toBeInTheDocument();
    expect(screen.getByText("Meeting · read-only")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
  });

  it("does not badge the channel already open", async () => {
    renderList();
    await screen.findByText("Support");

    // Support is the subscribed channel, so its badge is omitted.
    expect(screen.getByLabelText("2 unread messages")).toBeInTheDocument();
    expect(screen.queryByLabelText("3 unread messages")).not.toBeInTheDocument();
  });

  it("selects a channel", async () => {
    const { onSelect } = renderList();
    await screen.findByText("Support");

    await userEvent.click(screen.getByRole("button", { name: /Support/ }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "0f5b3a7e" }));
  });

  it("filters to meeting channels", async () => {
    renderList({ filter: "meeting" });
    await screen.findByText("Meeting chat");

    expect(screen.queryByText("Support")).not.toBeInTheDocument();
    expect(screen.queryByText("Direct message")).not.toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    render(
      <RelyvoChatProvider credentials={credentials} createClient={() => ({ ...client(), channels: async () => [] })}>
        <RelyvoChannelList onSelect={() => {}} />
      </RelyvoChatProvider>,
    );

    expect(await screen.findByText("No conversations yet.")).toBeInTheDocument();
  });
});
