import * as React from "react";

import type { ChatChannel } from "@relyvolabs/web-sdk";

import { useRelyvoChat } from "./context.js";

export type ChannelFilter = "all" | "direct" | "group" | "meeting";

/**
 * The RPC returns the full channel document; the SDK type currently narrows it.
 * These two fields are what a list needs to tell a meeting channel from a group.
 */
type ChannelRecord = ChatChannel & {
  source_product?: string;
  sending_enabled?: boolean;
};

export type RelyvoChannelListProps = {
  /** Highlighted channel; defaults to the channel the session is subscribed to. */
  activeChannelId?: string;
  onSelect: (channel: ChatChannel) => void;
  filter?: ChannelFilter;
  /** Hide the unread badges when the application renders its own. */
  showUnread?: boolean;
  title?: string;
  emptyText?: string;
  className?: string;
};

/** Meeting channels are created by the control plane, not by chat. */
function isMeetingChannel(channel: ChannelRecord): boolean {
  return channel.source_product === "meet" || (channel.external_id ?? "").startsWith("ch_");
}

function displayName(channel: ChannelRecord): string {
  if (channel.name.trim() !== "") return channel.name;
  if (isMeetingChannel(channel)) return "Meeting chat";
  return channel.type === "direct" ? "Direct message" : "Untitled channel";
}

function matchesFilter(channel: ChannelRecord, filter: ChannelFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "meeting":
      return isMeetingChannel(channel);
    case "direct":
      return channel.type === "direct";
    case "group":
      return channel.type !== "direct" && !isMeetingChannel(channel);
    default:
      return true;
  }
}

/**
 * Conversation list for the chat session.
 *
 * Selecting a channel is a navigation decision: the application fetches fresh
 * credentials for that channel (a subscription token is scoped to one channel) and
 * re-renders the provider. This component never guesses a token.
 */
export function RelyvoChannelList({
  activeChannelId,
  onSelect,
  filter = "all",
  showUnread = true,
  title = "Channels",
  emptyText = "No conversations yet.",
  className,
}: RelyvoChannelListProps) {
  const { channels, unread, status, activeChannelId: currentChannelId } = useRelyvoChat();
  const active = activeChannelId ?? currentChannelId;
  const visible = (channels as ChannelRecord[]).filter((channel) => matchesFilter(channel, filter));

  return (
    <nav className={`relyvo-ui relyvo-channels ${className ?? ""}`} aria-label={title}>
      <header className="relyvo-channels__header">
        <h2 className="relyvo-channels__title">{title}</h2>
        <span className="relyvo-channels__count" aria-label={`${visible.length} channels`}>
          {visible.length}
        </span>
      </header>

      {visible.length === 0 ? (
        <p className="relyvo-channels__empty">
          {status === "connecting" ? "Loading conversations…" : emptyText}
        </p>
      ) : (
        <ul className="relyvo-channels__list">
          {visible.map((channel) => {
            const count = showUnread ? (unread[channel.id] ?? 0) : 0;
            const isActive = channel.id === active;
            const meeting = isMeetingChannel(channel);

            return (
              <li key={channel.id}>
                <button
                  type="button"
                  className="relyvo-channels__item"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSelect(channel)}
                >
                  <span className="relyvo-channels__name">{displayName(channel)}</span>
                  <span className="relyvo-channels__meta">
                    {meeting ? "Meeting" : channel.type === "direct" ? "Direct" : "Group"}
                    {channel.sending_enabled === false ? " · read-only" : ""}
                  </span>
                  {count > 0 ? (
                    <span className="relyvo-channels__badge" aria-label={`${count} unread messages`}>
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
