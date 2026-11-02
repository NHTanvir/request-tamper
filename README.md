# Request Tamper & Replay

Chrome (MV3) extension: attach to an **in-scope** tab and log, **pause, edit and replay**
its HTTP requests — a Repeater/Proxy-lite inside the browser (no proxy, no CA cert).

> **Authorized testing only.** Works only on hosts you add to scope. Attaching shows
> Chrome's unavoidable *“is debugging this browser”* banner. Use on your own test accounts.

## How it works (one line)
It attaches `chrome.debugger` to the tab and uses the DevTools Protocol **Fetch** domain to
pause requests *after* the page builds them, so you can change or replay them in the side panel.

## Features — what each does
1. **Attach / Detach** — turns interception on for the current in-scope tab (per-tab, explicit).
2. **Flow log** — lists every request: method, URL, status, headers, and request/response bodies.
3. **Intercept toggle** — OFF = just log; ON = matching requests *pause* and wait for you.
4. **Pause rules** — "URL contains" filters (+ skip-static) decide which requests pause; empty = all non-static.
5. **Editor** — change a paused request's method / URL / headers / body, then **Forward** it.
6. **Fulfill** — answer the page with your own response (code + body) instead of hitting the server.
7. **Fail / Drop** — block a paused request.
8. **Replay** — re-send any logged request (with your edits) from the tab's real session/cookies.
9. **Flags** — auto-tags interesting flows: `auth-header`, `jwt`, `token`, `admin-path`, `id-param`, `destructive`.
10. **Copy MD** — export flows (request + response + edits) as Markdown for notes.
11. **Scope** — Options page; only in-scope hosts are ever touched (empty = off).

## Start
1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. **Options** → add a host (e.g. `localhost`) → Save (grant host access).
3. `node testpages/server.mjs`, open `http://localhost:8000`, open the side panel, **Attach**.
4. Tick **Intercept**, click a button on the page, edit the paused request, **Forward** — the echo shows your changes.

## Tests
```
npm test     # pure modules: match, edit, headers, flags, markdown
```
See [FEATURES.md](FEATURES.md) for details and [PLAN.md](PLAN.md) for the design & the honest
"this overlaps Burp" note.
