# Studio B product curation — isolated batch-reorder candidate

**Status:** Not integrated into the active Studio B Worker, not deployed to DEV, no D1 writes. This worktree-independent helper was prepared while a separate Codex session was working on the Makeshop APP URL and GCP API bridge. The company GitHub `main` checkout is not necessarily the latest deployed V3 source.

## Existing features verified in `dist/app.js` and `dist/model.js` (main)
- Exact product ID / product-name search.
- Pin/unpin, exclude/restore and bulk selected pin/unpin/exclude.
- Single-item direct rank input, up/down and drag movement.
- Undo/redo and category-specific auto vs manual ranking.
- Current preview already displays published vs draft rank for top items.

Do **not** rebuild these. This candidate fills a narrower usability gap: **safe batch movement of selected products to a specific anchor, with a full impacted-order preview**.

## Candidate contract

- `planBatchMove({visibleOrder,selectedIds,targetId,placement,pinnedIds,rankingEnabled})`: pure plan only; accepts `placement='before'|'after'`; stable ordering follows visible display, not click order.
- `applyBatchToDraft({config,tab,oldVisibleOrder,nextVisibleOrder,fullOrder})`: immutable conversion to existing `tabs[tab].manual` and `pins`. Preserves hidden/excluded latent slots and unrelated categories; call only after re-checking the live draft revision and rank mode.
- `comparePublished({publishedOrder,draftOrder,limit})`: readonly shift summary from published to draft order.

No import from Supabase, Makeshop, Cloudflare D1, or browser globals. No direct upload, publication, localStorage, or analytics write.

## Integration proposal (after Codex final report)

1. Compare the **newest actual Codex worktree / DEV deployed Worker sources** against older GitHub `main` before editing any shared file.
2. In the existing `adminPage=list`, keep all current controls. Add a compact panel: selected N → destination product ID → before/after → *preview changes* → *apply to draft*.
3. Obtain `oldVisibleOrder` from current `resolveList(catalog,adminTab,draft)`; derive `fullOrder` exactly as existing `reorder()` computes it, using the same `excluded:[],hideSoldout:false` shadow config. Do not use filtered search results as ordering input.
4. Refuse mixed pinned + unpinned moves and rank-rule mode. Re-check the draft revision at the moment of applying. Do not move excluded products.
5. Apply under the existing `mutateCuration()` undo history, never directly to D1. Do not silently publish.
6. Compare with existing recent preview and UX; avoid a redundant UI if Codex has already added equivalent behavior.
7. Test across 2,530 catalog records, search subsets, pinned/unpinned boundaries, hidden product latent order, no-op, undo, auto-sort and restoration, and preserve V3 revision 21, QA revision 80 and public #14.

## Test

`node --test experiments/studio-b-bulk-curation-20261117/batch-curation.test.mjs`

**Future API fields:** Source status badges and freshness should be read-only and only shown when backed by an actual trusted source record. Current API source registry is initialized but has no official records, identity mappings, or active field policies. Do not generate fake freshness, or couple curation order to API ID mapping.

This candidate is deliberately independent, to be evaluated with the upcoming Codex report before any integration or deployment.
