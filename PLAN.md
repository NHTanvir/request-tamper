# Request Tamper & Replay — Plan

## Goal
Attach to an **in-scope** tab and sit on its network path **inside the browser**, at the
Chrome DevTools Protocol `Fetch` layer: log every request/response, **pause** matching
requests, hand-edit URL / method / headers / body (or return a fully custom response),
forward them, and **replay** any captured request with changes — a Repeater/Proxy-lite
that needs no proxy, no CA certificate and no upstream setup.

**Roadmap fit:** a general tamper/replay workbench for the active-testing classes —
#3 BFLA (swap ids/roles in a request), #4 multi-tenant isolation (swap tenant/org ids),
#5/#6 business-logic & price/plan (tamper quantity, price, coupon), mass assignment
(add fields to a JSON body), and auth chains. It pairs with the rest of the suite:
intercept the request a **Hidden UI Revealer** control makes, or tamper a call built from
**SPA State Explorer** findings — all in one browser, one session, no context switch.

## How this differs from Burp / mitmproxy — honest note
This is the **one tool in the suite that overlaps** a network proxy. Burp Repeater and
mitmproxy already intercept, modify and replay HTTP, and on raw capability they do it
*better* (non-browser clients, other protocols, transparent/reverse modes). This exists
for three narrower reasons, not because "Burp can't":
1. **Zero setup, in-browser.** No proxy config, no CA install, no cert-pinning fight — it
   works in the real tab with the real cookies/session/TLS as-is. Useful when proxying is
   painful or blocked.
2. **Suite integration.** Same browser as the other four extensions; shared scope list,
   shared Markdown-notes format, shared detectors.
3. **Lightweight & focused** for quick in-page tamper/replay during a session.
It operates at the renderer's `Fetch` layer, i.e. **after** the page's own JS has built the
request — the same bytes Burp sees on the wire (editing a signed body breaks the signature
here exactly as in Burp; no magic). The PLAN states this so the tool is never oversold.

## Features
### v1 (MVP)
- **Attach / detach** the debugger to the current in-scope tab from the panel — an explicit,
  per-tab action. The panel shows the unavoidable Chrome "is debugging this browser" banner
  warning up front, and the fact that opening DevTools on that tab will detach us.
- **Flow log** (passive): per tab, every request with method, URL, status, resource type,
  request headers + body, and response headers + body (captured while paused at the Response
  stage, size-capped, binary/media skipped). Newest first; filter by method / type / flagged.
- **Intercept toggle** (OFF by default): when ON, requests matching the **pause rules** stop
  and queue; everything else auto-continues untouched. When OFF, nothing pauses (pass-through
  logging only). *Every* paused request is always resolved — the tab never hangs.
- **Pause rules:** url-contains / method / resource-type filters; a built-in "skip static
  assets" default so you only stop on documents / XHR / fetch.
- **Editor** for a paused (or replayed) request: edit URL, method, headers (as text), and
  body; then **Forward** (continueRequest), **Fulfill** a custom response
  (code + headers + body), or **Fail/Drop** (failRequest).
- **Replay:** re-send any captured request — with edits — from the inspected tab's own
  origin (via `scripting.executeScript` `fetch` in the MAIN world), so it carries the real
  cookies / SameSite / session; show the response in the panel. In-scope + explicit only.
- **Flags:** mark interesting flows first — `Authorization`/cookie/token headers, JWTs,
  admin/internal paths, id-like params — reusing the suite's detector style.
- **Copy as Markdown** for `notes/<program>/`: a flow (request + response + any edit applied)
  or the whole flagged list.
- **Scope-gated:** only attaches to hosts on the shared scope list; empty scope = off.

### Later
- WebSocket frames (CDP `Network.webSocketFrameSent/Received`) — out of `Fetch`'s reach.
- Auto-attach to OOP iframes (`Target.setAutoAttach`) so sub-frame subresources are caught.
- Match-and-rewrite **rules** that apply an edit automatically (header set, body find/replace)
  without pausing — a standing "autoresponder".
- Save/replay collections across sessions; export flows as JSON / HAR.
- `handleAuthRequests` for HTTP auth prompts.

## Design
| File | Role |
|---|---|
| `manifest.json` | MV3. Permissions: `debugger`, `storage`, `sidePanel`, `scripting`, `tabs`; `optional_host_permissions` `*://*/*` (requested per scope host, for replay injection). |
| `scope.js` | Shared scope-list helpers (same module as the other four). |
| `match.js` | **PURE.** `shouldPause(flow, {rules, skipStatic})`, rule matching (url-contains / method / type), host-in-scope guard. Node-tested. |
| `edit.js` | **PURE.** `applyEdit(request, edit)` → new request (set/remove headers, replace body, change url/method); merge semantics. Node-tested. |
| `headers.js` | **PURE.** `headersToText` / `textToHeaders` (CDP `HeaderEntry[]` ↔ text), `utf8ToBase64` / `base64ToUtf8` (for CDP `binary` body/postData). Node-tested. |
| `flags.js` | **PURE.** `flagFlow(flow)` → tags (auth header, JWT, token param, admin/internal path, id-like). Node-tested. |
| `markdown.js` | **PURE.** `flowToMarkdown` / `flowsToMarkdown`. Node-tested. |
| `background.js` | Service worker. Scope-gated `chrome.debugger.attach` (proto `"1.3"`); `Fetch.enable` with scope patterns at Request **and** Response stages; routes `Fetch.requestPaused`: resolve off-scope/non-matching immediately, queue matching ones; keep-alive while attached; state + flows in `chrome.storage.session`; `onDetach` cleanup; replay via `executeScript`. |
| `panel.html` / `panel.js` | Side panel (ES module): attach/detach + banner warning, intercept toggle, pause-rules, flow list + detail (request/response), interception queue + editor (Forward / Fulfill / Fail), replay, copy MD. |
| `options.html` / `options.js` | Scope editor (shared pattern). |
| `testpages/` | `server.mjs` (Node, no deps) that echoes method/headers/body as JSON and sets a cookie; `index.html` firing fetch / XHR / form POST so tamper and fulfill are visible. |

**Flow shape:** `{ id, tabId, time, method, url, resourceType, reqHeaders[], reqBody, reqBodyB64,
status, resHeaders[], resBody, resBodyB64, flags[], edited }`. Flows capped per tab, cleared on
tab close / detach.

## Safety and scope
- **Active tool — off by default.** Attaching is a deliberate per-tab click; the intercept
  toggle starts OFF (pass-through logging only). Nothing is modified or replayed without an
  explicit action.
- **In-scope hosts only.** `attach` is refused off-scope; the `Fetch` patterns are built from
  the scope list and the paused-request handler re-checks the host before stopping anything.
- **Correctness = safety here:** every `requestPaused` is always resolved
  (continue / fulfill / fail), so a tab can never be left hanging.
- **Destructive requests** (DELETE, or paths like delete/refund/remove) show a warning before
  Forward / Replay. Follow the roadmap's non-destructive rule: only your own test accounts and
  objects.
- The Chrome **"is debugging this browser" banner is unavoidable** and is shown to whoever is at
  the browser; the `debugger` permission is powerful, so this is for **load-unpacked, your own
  authorized testing** only.
- Flows can hold tokens / personal data from your test accounts — kept in `storage.session`,
  cleared on tab close, exported only when you choose.

## Testing
- **Node unit tests** (`npm test`) for the five pure modules: `match` (rule/scope matching,
  skip-static), `edit` (header add/remove, body/method/url change, untouched fields),
  `headers` (text↔HeaderEntry round-trip, base64 round-trip incl. UTF-8), `flags` (each tag),
  `markdown` (request+response+edit render).
- **Manual (CDP + error watcher, 0 errors):** `node testpages/server.mjs`, scope `localhost`,
  attach; confirm (a) flows logged with request+response bodies; (b) intercept ON pauses a
  POST, editing its body is reflected in the echo; (c) Fulfill returns a custom response to the
  page; (d) Fail/Drop blocks it; (e) replay re-sends with the tab's cookie; (f) off-scope tabs
  are never attached and nothing hangs; (g) opening DevTools detaches cleanly.

## Issues → commits
1. Scaffold: manifest, worker skeleton, scope, package/CI/.gitignore
2. Pure core: `match`, `edit`, `headers`, `flags`, `markdown` + Node tests
3. Debugger attach/detach, `Fetch.enable`, scope-gated pause handler + keep-alive + flow log
4. Side panel: attach UI + banner warning, flow list + detail
5. Interception queue + editor (Forward / Fulfill / Fail)
6. Replay via `executeScript`; copy as Markdown
7. Test pages (echo server) + README / FEATURES / CLAUDE.md
