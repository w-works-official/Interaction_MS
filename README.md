# PINKROCKET Browse Studio

Customer browse feed and curation admin prototype. Built from the interaction requirements and structure of the supplied Makeshop design skin; it does not run Makeshop virtual tags outside Makeshop.

## Open and use

- Customer view: root URL. Category tabs (including bracelets/anklets), search, material filters, price sort, favorites, progressive product reveal and image galleries.
- Admin view: top bar → 운영자 화면, or `?view=admin`.
- Edit a category list with rank inputs, move buttons, drag/drop, pins and exclusions. Applying a sorting criterion preserves manual edits; the explicit reset action resets manual order while retaining pins/exclusions.
- Content blocks: image + copy, notice, image, text, spacer and divider. Place them above the header, below categories, above/between/below products; use product count or a product ID anchor in the feed. Edit PC/mobile width, new-row placement, colors, padding, radius, alignment and image fit/ratio, with tab and filter visibility.
- Use the inline properties editor and immediate preview, then apply the block and save the draft. Priority inputs, move buttons, numeric placement buttons, duplicate/hide/delete and a separate 20-step block undo stack support browser AI without requiring drag. The editor previews 24/48/up to 60 products; later positions use count/ID inputs and the full customer draft preview. Shared storage is deferred; cross-browser drafts still use JSON export/import.
- Save draft; use preview (full width or mobile width); publish to the local mockup. Recent versions can be restored to a draft. Export/import configuration JSON is supported.

## Data and boundaries

2,379 valid real products imported from the CEO's public `kakamail80-cell/pinkrocket-quick-browse` snapshot (pinned commit `e6078f86492ca6a3cf8057a8c10e458c28a2566c`). The source HTML comment dates collection to 2026-10-13. Of 2,449 rows, 70 with missing names/zero prices are quarantined in `scripts/catalog-excluded.json`. Source tag labels are decoded into overlapping categories/materials, colors, shapes, motifs, wearing positions and bar options. There are 38 unclassified records, retained in the all-product feeds. No live synchronization is connected; no sales, registration dates or stock data are present. Recommendation and newest ordering remain explicitly demo curation, never live popularity or launch-date claims.

Four products retain the previously verified three-image local galleries by product ID. The other valid existing local thumbnails are retained; remaining products use the source's single remote representative image. No duplicate images are manufactured. Image errors leave the product card and detail flow usable. Photo provenance: `asset-work/sources.json`; catalog provenance/counts: `dist/assets/catalog-meta.json`.

The reproducible converter `scripts/import-quick-browse.py` reads the two JSON assignments without running source JavaScript. Run it from this checkout with `--source-html /absolute/path/to/downloaded/index.html --source-commit <verified-source-commit>`. It uses `scripts/gallery-overrides.json` solely for reviewed image galleries and any explicitly available legacy classification. It is a snapshot importer, not a crawler or scheduled updater. The CEO repository has not been changed.

The customer feed progressively reveals records; sort/filter/search resolve the full catalog. The admin initially renders 60 rows, with a next-60 control, full-catalog search and absolute rank inputs. Exact matching product IDs take priority over substring search. Saved configurations migrate by ID: the new bracelet tab is added, removed/quarantined IDs are dropped, and valid pins/manual order/exclusions remain. Shared storage, real stock and account writes are still pending.

LocalStorage holds draft, published mockup config, history, favorites and demo basket. This is not a shared production database and is not a Makeshop account session. `storage` events keep the published view in sync across tabs of the same browser. Source Site access is owner-private; the admin itself has no separate production login.

Actual product detail buttons open the existing Makeshop product page. No shopping-account write, checkout, order, admin setting, skin or platform API call is made by the prototype. Options are not fabricated; the quick view has only a clearly labelled demo quantity control.

## Original skin mapping

The 14 original CP949 attachments are preserved under `reference-skin/`. Their product loops and category/header/footer structure inform the new UI. The old shared product list (`item-cont2`, `itemList`), fixed 1024px visibility modes, duplicated search presentation and slider initialization are replaced with a single responsive browsing view. The new 3:4 image stage preserves source images with object-fit contain; no distorted stretching.

## Verification

2026-10-19: JavaScript syntax checks and all 89 model/DOM tests pass. Actual Chrome QA on isolated local port 4175 covered pending-edit preview/apply, preserving input during placement, duplicate/undo, ID anchors, JPEG upload and draft preview. The customer iframe was checked at actual CSS widths 1528px and 390px: 4/2 product columns, 2/1 image-block spans, 16:9 block images, 3:4 product photos and no document overflow. The embedded editor mobile container measured 390px. Physical touch and native mouse drag remain unverified. QA example blocks are browser-local and are not shipped as starter content. Older managed-environment limitations below describe earlier revisions.

### Current design revision

The user requested a clearer shopping-app presentation inspired by Ably. The existing PINKROCKET logo is retained; no third-party branding or invented shipping, sales or review claims are added. A rounded search field, a clear category rail, material pills, stronger price typography, rounded 3:4 thumbnails and a functional mobile bottom bar support quick browsing. Advanced tags open in a modal bottom sheet with a backdrop, Escape/close/apply controls, focus restoration, focus wrapping and body scroll locking. Selections still use the same catalogue, per-category state and recommendation logic. Banners remain absent by default.

The grid uses its own named inline-size container, with 2 columns below 38rem, 3 from 38rem, and 4 from 62rem. The thumbnail area expands smoothly inside each range; CSS viewport fallbacks are provided. Only the grid wrapper establishes containment, so the filter sheet's fixed placement remains tied to the viewport. The earlier PC/Mobile Drive sources remain reference files, rather than rigid layout constraints.

Category navigation supports clicks, previous/next controls, keyboard arrows/Home/End and horizontal gestures outside photographs. Gesture ownership is fixed at pointerdown: a drag originating on a thumbnail can only move that product's actual photos, regardless of distance or where it ends. Long gallery swipes cannot switch tabs. Single-image products rebound without switching categories. The photo threshold is 16% of thumbnail width, clamped to 24–64px. Drag visuals are clamped so long motions do not expose a blank stage. Search/select controls, filter sheets, other overlays and operator surfaces do not navigate categories. Vertical and cancelled gestures are ignored. URL history failures in an embedded context do not prevent navigation.

39 tests now pass, including DOM event regression tests of the actual app using jsdom. These tests verify category product IDs/counts, image navigation isolation, gestures, keyboard controls, operator preview and old-banner migration. They are DOM tests, not a rendered-browser or touch-device QA claim.

`npm test` checks the curation model against real asset metadata: draft isolation, pin/manual/exclusion semantics, newly appended products, sorting, category/search/material/favorite filters, banner placement and JSON import validation. `npm run check` checks generated JavaScript syntax.

Browser QA is unavailable in this managed environment because the required control-browser capability is not installed. No alternate browser or preview server was started. Actual visual, touch and iframe integration QA remains to be done in the user's browser.

Optional feature-detected browser tools expose local-demo state and rank changes through document.modelContext. They share the same state/model actions as the UI; registration and invocation are not browser-verified here. The full semantic UI remains usable without them.

## Production follow-up

Connect catalog acquisition/refresh, real launch dates and rank data, multi-image automation, shared secure storage, operator authentication/authorization, robust publish/version history, Makeshop message bridge and iframe size synchronization. Keep product ID as the cross-system key.


Design source: Google Drive PC folder https://drive.google.com/drive/folders/1Pr3pVNirVM2FfWUsiOmX7bcdIV16l22a and Mobile folder https://drive.google.com/drive/folders/13ZdIJL5e28bXe1wozFd8Tiza0mCt1v56 (files modified 2026-10-15). UTF-8 copies of CP949 source are retained in reference-current-skin; these are design references only, never executed. Third-party trackers, remote scripts, dynamic promotion banners, and unverified sales/review figures are not imported. Product discovery categories and 3:4 images retain the agreed new interaction model. The old responsive sample in reference-skin is historical and no longer the design baseline.

Remote image checks: three representative GIF/JPEG URLs returned HTTP 200 with image signatures. The complete remote image set is not exhaustively fetched. Browser visual/touch/iframe QA remains unavailable in this environment.


## Integrated discovery

The original quick-browse tag vocabulary is available in the 필터 bottom sheet: item, material, color, piercing shape, motif, wearing position and bar option. Tag recommendation scores use the original group weights (5/3/2/3/3/3/3), with stable existing curation as the tie-break. Multiple labels within a group match as OR. The optional strict mode requires a match in every selected group. Price bounds are actual constraints; empty bounds are unlimited, and reversed bounds return no results. User-selected price sorting applies to the complete candidate set before the 500/1000/all recommendation cap. These are deterministic tag scores, not live sales or personalized AI claims.

Local photo-color discovery reads a user-selected image into a 48×48 canvas, compares its hue/grayscale tone with the source color swatches, and adds the original style of color score. It does not recognize object shape. Photos remain in in-memory tab state, are not uploaded or written to localStorage, and can be cleared. Discovery state is independent per category. DOM tests stub the image decoder/canvas for this flow; real browser decoding, appearance and physical-touch tuning remain unverified because the required browser capability is unavailable.

UI copy uses plain functional labels. The search placeholder is 상품 검색; promotional filler in filter titles, quick view, administrator headings and new-banner defaults has been removed. This revision changes copy only.
