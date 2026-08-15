# Radio Explorer — Improvement Plan

**Status:** Proposed, not started. Captured 2026-08-13 after a full-codebase architecture deep dive (cross-checked `PROJECT_REFERENCE.md` against `js/app.js`, `js/audio.js`, `js/globe.js`, `js/user.js`, `js/firebase-sync.js`, and `radios/nirkam/`).

This is a holding pen for prioritized follow-up work identified during that review. Nothing here has been actioned yet — a separate, newer set of core requirements takes priority (see conversation/PR history around this date). Revisit this list once that work lands.

---

## Tier 1 — Documentation accuracy (cheap, zero code risk)

1. Fix `PROJECT_REFERENCE.md` §6.2: `<audio>` is actually `preload="auto" crossorigin="anonymous"` (index.html:903), not `preload="none"`.
2. Document the double station-load in `app.js`'s init sequence (provisional cache/API/embedded-fallback load, then a second `fetch('data/stations.json')` after globe init — the second is what actually populates `search`/`favorites`/`globe`'s full directory).
3. Fix `checkSharedData()` / `checkAutoResume()` ordering in §6.1 — shared-data handling runs first (during `init()`, before `renderUI()`), auto-resume last (inside the loading-screen-hide `setTimeout`) — doc currently implies the reverse.
4. Disambiguate §13's nirkam `getRadioPosition()` bullet: say `radios/nirkam/js/app.js` explicitly, not `js/app.js` — the repo has two files with that identical name serving unrelated purposes, and the ambiguous phrasing is a real trap on a skim/grep.
5. Remove the dead, commented-out older `detectProxyUrl()` implementation in `js/audio.js` (~lines 117-150).
6. Fix `README.md`'s stale GitHub Pages deploy instructions (real deploy is Cloudflare Pages — already flagged in `PROJECT_REFERENCE.md` §2/§15).
7. Fix `radios/nirkam/README.md`'s stale 3-track playlist description (actual playlist has 26 alternating music/speech entries).

## Tier 2 — Real tech debt, moderate effort, meaningful risk reduction

8. **Deploy `firestore.rules`** (`firebase deploy --only firestore:rules`) — written, closes custom-ID hijacking and stats-tampering holes, but not yet deployed. Highest security-value-per-effort item here.
9. **Reconcile the two favorites stores** (`favorites.js` live store vs. `user.js`'s profile-embedded copy) into one source of truth — currently kept in sync only by write-order convention in `handleFavoriteToggle()`, and `user.getStats().favoritesCount` is known to show stale/0 values.
10. **Add SRI hashes** (or vendor locally, consistent with how `qrcodejs` was already handled) for three.js / three-globe / Firebase / Google Fonts — currently zero integrity checking on any CDN script.
11. Repair and wire up `automation/` into actual CI (no `.github/` exists at all). `IMPROVEMENTS.md` already fixed the port mismatch and web-player false-negatives in the test harness; its own "Next Steps" phases 1–2 (expanded unit tests, real E2E for playback/state/mobile) are the natural continuation.
12. Audit the **106 duplicate stream URLs** in `stations.json` (some legitimate shared feeds, some likely data errors) — only spot-checked so far.

## Tier 3 — Larger feature-shaped work (needs explicit sign-off before starting, per `PROJECT_REFERENCE.md` §14's own conventions)

13. Migrate Firestore access to **Firebase Anonymous Auth** for real per-user ownership (rules alone can't fully close the "anyone who knows/guesses an 8-char ID can read/write that profile" gap).
14. Address the **59% HTTP-only stations** problem at the data level (re-source/re-audit affected station entries) — the client-side proxy/upgrade fallback has known reliability gaps and can't fully solve this.
15. Disclose the third-party HTTP-stream proxy (`proxy.ramsharans-rathore.workers.dev`) to users somewhere (privacy consideration, not a bug) if the app grows a meaningfully public audience.
16. Real (non-simulated) Web Audio API visualizer path for CORS-clean streams, falling back to the current simulated one otherwise.

---

## Notes from the verification pass (for whoever picks this up)

- Three background `Explore` agents independently re-read `app.js`+`audio.js`, `globe.js`, and the `nirkam`/`user.js`/`firebase-sync.js` subsystems in full against `PROJECT_REFERENCE.md`'s claims. Overall the doc held up well — the items above are the concrete corrections/gaps found, not a sign the doc is broadly wrong.
- Confirmed cleanly (no action needed): the "connected/active users" fabricated-stats fix (§6.6) is real and matches source comments exactly; the `radios/nirkam/` `getRadioPosition()` duplication is real, hand-copied (not imported from the shared `playlist.js`), and the two implementations currently agree despite being structurally different.
- Newly found, not yet in `PROJECT_REFERENCE.md` at all: a **third**, currently-dead `syncRadioAPI` implementation in `radios/nirkam/js/embed-mode.js` (activated only by an unreachable `?embed=true` path) with a broken `getNowPlaying()`. Low priority to fix (it's dead), but worth documenting as a trap so nobody edits the wrong copy later.
