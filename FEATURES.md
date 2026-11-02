# Features

## Attach / intercept
- Scope-gated `chrome.debugger.attach` (protocol `1.3`) to the current tab; refused off-scope.
- CDP `Fetch.enable` at **Request and Response** stages; a wildcard pattern with a per-request
  host re-check, so off-scope requests are continued instantly and never inspected.
- **Invariant:** every `Fetch.requestPaused` is resolved (continue / fulfill / fail) — a tab is
  never left hanging. Keep-alive alarm while attached; state in `chrome.storage.session`.
- Clean teardown on `onDetach` (DevTools opened, tab closed, or banner "Cancel").

## Flow log
- Per tab: method, URL, resource type, request headers + body, response status + headers + body.
- Response bodies captured while paused at the Response stage (redirects and binaries skipped),
  size-capped; flows capped per tab and cleared on tab close / detach.

## Interception
- **Intercept** toggle (off by default) + **skip static assets** + **pause rules** (URL-contains).
- `shouldPause` (pure, tested): off = never; rules present = only matches; no rules = all non-static.
- **Editor** per paused request: method, URL, headers (text), body → **Forward** (`continueRequest`
  with overrides), **Fulfill** (`fulfillRequest` custom response), **Fail/Drop** (`failRequest`).

## Replay
- Re-send any logged request — with edits — via `scripting.executeScript` in the page's MAIN world,
  so it carries the tab's real cookies / SameSite / session. In-scope + explicit click only.
- Browser-forbidden headers (Host, Cookie, Content-Length…) are dropped automatically by `fetch`.

## Flags (pure, tested)
`auth-header`, `cookie`, `jwt`, `token`, `admin-path`, `id-param`, `destructive`
(DELETE/PUT/PATCH or delete/refund/revoke… paths show a warning before Forward/Replay).

## Export
- **Copy MD**: flows as Markdown (request + response + whether edited) for `notes/<program>/`.

## Safety
- Active tool, **off by default**; attach + intercept are explicit. In-scope hosts only.
- `debugger` permission is powerful → load-unpacked, authorized testing only; the Chrome
  debugging banner is shown to whoever is at the browser.
- Flows may hold tokens/PII from your test accounts — kept in `storage.session`, exported only on request.

## Known limits (v1)
- WebSockets not covered (Fetch domain only) — planned via `Network.webSocketFrame*`.
- Sub-resources inside out-of-process iframes need `Target.setAutoAttach` — planned.
- Large request bodies may arrive without `postData` (would need `Network.getRequestPostData`).
