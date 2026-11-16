# @relyvolabs/react-ui

Ready-made React surfaces for Relyvo: a chat panel and a video call stage on top
of [`@relyvolabs/web-sdk`](https://www.npmjs.com/package/@relyvolabs/web-sdk).
Your backend mints the credentials; the browser never holds an API key.

```bash
npm install @relyvolabs/react-ui
```

React 18 or 19 is a peer dependency; the SDK and its transports are installed for
you.

## Chat

```tsx
"use client";
import { RelyvoChatPanel, RelyvoChatProvider } from "@relyvolabs/react-ui";
import "@relyvolabs/react-ui/styles.css";

export function SupportChat({ credentials, chatUserId }) {
  return (
    <RelyvoChatProvider
      credentials={credentials}
      getConnectionToken={() => fetch("/api/chat/token").then((r) => r.json()).then((v) => v.token)}
      getSubscriptionToken={(channel) =>
        fetch(`/api/chat/subscription?channel=${encodeURIComponent(channel)}`)
          .then((r) => r.json())
          .then((v) => v.token)
      }
    >
      <RelyvoChatPanel selfId={chatUserId} title="Support" />
    </RelyvoChatProvider>
  );
}
```

The panel renders history, live messages, a typing indicator, connection state,
error state with retry, and a composer. Enter sends; the composer is disabled
while the socket is not connected.

### Channel list

```tsx
<RelyvoChannelList
  activeChannelId={activeId}
  onSelect={(channel) => {
    // Fetch credentials for this channel from your backend, then re-render the
    // provider with them: a subscription token is scoped to one channel.
    void loadCredentials(channel.id).then(setChatCredentials);
  }}
/>
```

Shows name, type (Direct/Group/Meeting), read-only state for closed meeting
channels, and unread badges. `filter` narrows the list to `direct`, `group` or
`meeting`. The channel already open is never badged.

## Video call

```tsx
"use client";
import { RelyvoCallProvider, RelyvoCallStage } from "@relyvolabs/react-ui";
import "@relyvolabs/react-ui/styles.css";

export function CallScreen({ credentials }) {
  return (
    <RelyvoCallProvider credentials={credentials}>
      <RelyvoCallStage />
    </RelyvoCallProvider>
  );
}
```

The stage renders every participant, attaches camera or screen-share video (a
share takes precedence), plays remote microphones, outlines the active speaker
and offers microphone, camera, screen-share and leave controls.

`showControls={false}` hides the built-in bar when you render your own controls
with `useRelyvoCall()`.

### Pre-join

```tsx
<RelyvoPrejoin
  onJoin={async ({ cameraEnabled, microphoneEnabled, cameraDeviceId, microphoneDeviceId }) => {
    const credentials = await fetchCallCredentials({ cameraDeviceId, microphoneDeviceId });
    setCall(credentials);
  }}
  onCancel={() => setStage("idle")}
/>
```

Previews the local camera, lists cameras/microphones/speakers, shows an input
level meter, and lets the participant turn either device off before joining. The
preview stream is stopped when the component unmounts or the choice changes.

## Hooks

| Hook | Returns |
| --- | --- |
| `useRelyvoChat()` | `status`, `error`, `messages`, `typing`, `send`, `retry` |
| `useRelyvoCall()` | `status`, `error`, `room`, `participants`, `version`, toggles, `leave` |

Both throw when used outside their provider, so a missing provider fails loudly
instead of rendering an empty surface.

## Theming

Every class is namespaced `relyvo-`. Override the CSS variables on `.relyvo-ui`:

```css
.relyvo-ui {
  --relyvo-accent: #7c5cff;
  --relyvo-surface: #101322;
  --relyvo-surface-raised: #171b30;
  --relyvo-line: #262b45;
  --relyvo-ink: #f2f5ff;
  --relyvo-ink-muted: #9aa3c0;
  --relyvo-radius: 14px;
  --relyvo-font: inherit;
}
```

## Server-side rendering

The package is built with a `"use client"` banner, so importing it in a Next.js
App Router project marks the boundary automatically. Use it inside a client
component; credentials must arrive from your server.

## Status

`0.2.0`: chat panel, channel list, call stage and pre-join. Not included yet:
attachments, message editing, a room/meeting list, and a no-framework build
(web components).

## Licence

Proprietary. Not for redistribution.
