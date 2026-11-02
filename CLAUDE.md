# CLAUDE.md — Request Tamper & Replay

## What this is
MV3 Chrome extension that attaches `chrome.debugger` to an in-scope tab and uses the
CDP `Fetch` domain to log, pause, edit, fulfill, fail and replay HTTP requests.
Active tool, off by default. Authorized use only. (The one tool in the suite that
overlaps Burp/mitmproxy — see PLAN.md for the honest positioning.)

## Layout
- `manifest.json` — MV3; `debugger`/storage/sidePanel/scripting/tabs.
- `scope.js` — scope helpers (shared across the suite).
- `match.js` — PURE pause/scope logic (`shouldPause`, `ruleMatches`, `isStatic`). Tested.
- `edit.js` — PURE `applyEdit(request, edit)` request transform. Tested.
- `headers.js` — PURE HeaderEntry[]↔text + base64 (UTF-8) helpers. Tested.
- `flags.js` — PURE flow tagging (auth/jwt/token/admin/id/destructive). Tested.
- `markdown.js` — PURE Markdown export. Tested.
- `background.js` — debugger attach/detach, `Fetch.enable` (both stages), the paused-request
  handler, keep-alive, flow store in `chrome.storage.session`, replay via `executeScript`.
- `panel.html` / `panel.js` — side panel (attach, toggles, rules, flow list, editor, replay, copy MD).
- `options.html` / `options.js` — scope editor; requests host access for replay.
- `testpages/` — `server.mjs` echo server + `index.html` (fetch/XHR/form).

## Rules
- Keep the five pure modules pure and Node-tested.
- **Every `Fetch.requestPaused` must be resolved** — never leave a tab hanging.
- Never attach or inspect off-scope; re-check the host inside the paused handler.
- Destructive requests warn before Forward/Replay; only your own test accounts.

## Test
`npm test`; manual: `node testpages/server.mjs`, scope `localhost`, attach, intercept a POST.
