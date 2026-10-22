# PINKROCKET Browse Studio

Customer browse feed and curation admin prototype. Built from the interaction requirements and structure of the supplied Makeshop design skin; it does not run Makeshop virtual tags outside Makeshop.

## Current responsive handoff — 2026-10-22

The customer preview now follows the supplied responsive skin's white/black header, large banner and category tiles. `dist/storefront.js` is the single source for shared banner images/copy/links, brand and menu settings. Each banner uses one common image at every width by default; a separate mobile crop is optional. Existing category/search/filter/curation/admin/account-bridge behavior and 3:4 galleries remain. Grid columns follow available container width: 2 → 3 → 4.

`integration-responsive/` contains the preserved UTF-8 original and generated 14-file native copied-skin handoff. Read [the application guide](integration-responsive/README_KO.md), then regenerate with `python -B integration-responsive/build.py --native-platform pc` after changing shared settings. It preserves native product/price/company tags, uses one search form and one sort control, and removes duplicated PC/mobile content configuration. Do not combine that native main with the alternative whole-main iframe shell. The external original skin and live Makeshop administrator have not been changed. Native server rendering, other native templates and account writes still require copied-skin QA.

The product-ID photo manifest is `dist/assets/product-images.json`; `createProductImageLookup()` returns a synchronous cached `getProductImages(id)` function. It hydrates after the first feed paint, with existing-photo fallback. The current snapshot contains 2,379 products and 2,387 actual image URLs, including four previously verified multi-image products. Full-catalog extra-image collection has not been completed. See [the importer guide](scripts/PRODUCT_IMAGES_GUIDE.md). No per-card live request or guessed filename is used.

Cloudflare email verification and Workers & Pages access are ready; no Cloudflare project, upload or deployment has been created. GitHub Pages remains the screen-preview destination. Browser checks cover actual 390/800/1280px layout metrics, gallery/category/search/filter controls and admin entry; screenshot capture was unavailable, and physical touch/native Makeshop account-write QA remain pending. Historical verification notes below describe earlier revisions.

## Open and use

- Customer view: root URL. Category tabs (including bracelets/anklets), search, material filters, price sort, favorites, progressive product reveal and image galleries.
- Admin view: top bar → 운영자 화면, or `?view=admin`.
- The admin opens the human operator overview by default. Set a category brief, diversity and pin preference, then inspect the same draft in the AI workbench (`?view=admin&adminPage=workbench`). Photo comparison (up to four), real multi-image inspection, reviewed/needs-review status, tag overrides, weighted and AND-combination rules, atomic validated batch JSON and a separate metadata undo stack support browser AI. [Workbench guide](WORKBENCH_GUIDE.md).
- Ranking is a deterministic rule engine: apply eligible filters, sum configured rules/combinations and discovery scores, optionally preserve pins, and reduce recent motif/shape/style repetition using a 40-candidate window. Rank reasons and published/draft photo comparisons are visible. Rule mode retains manual order as a tie-break; turn it off to move explicit ranks. Large natural-language briefs are saved instructions for the external AI, not automatically executed prompts. No LLM or vision API is connected.
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

Standalone preview buttons keep the local demo basket/favorites. The explicit Makeshop bridge mode uses a copied-skin parent shell to open actual product details and native account lists. Customers select real options and press the original buttons inside the detail view; the bridge neither fabricates options nor treats a click as confirmed storage. No skin/admin/checkout/order changes are made by this code generator.

## Copied-skin main handoff

2026-10-20 V5: main hearts use the original product-level `makeshopWishlist.send()` transport instead of clicking the detail's option-validating `send_wish()`. A separate `integration-main/product-wishlist.js` adapter reads the account list, toggles one UID once, then reads the list again before publishing confirmed add/remove state to the child. It does not bind native UI handlers or construct its own XHR/fetch. Uncertain writes are never retried automatically. Current syntax checks and 182 tests pass; Chrome local mocks confirmed option-free add/remove and heart state. Actual account writes and copied-skin verification remain unexecuted. Older detail-wish descriptions below are historical.


Product photo/name clicks now display the actual Makeshop detail inside a panel, replacing the fabricated product-information drawer and demo quantity controls. Standalone preview embeds the real PC/mobile page by ID; connected mode sends `product` to the same-origin parent detail dialog. The new-window link is an explicit fallback. No native cart/wishlist button is invoked automatically.

The user pastes and previews the code in Makeshop; the agent does not edit or save the Makeshop screen. Back up the copied PC/Mobile main HTML, then replace that main HTML with the matching `integration-main/01_MAIN_IFRAME_PC.txt` or `02_MAIN_IFRAME_MOBILE.txt`. Keep CSS/JS tabs. These are full replacement shells, unlike the old additive three-product PoC. See `integration-main/00_README_KO.txt` for rollback and verification.

Run `python integration-main/build.py` to reproduce the files and ignored `outputs/pinkrocket_makeshop_main_preview.zip`. The build embeds the actual shared detail-URL helper. Both parents use the same external responsive app, an explicit platform, independent viewport scrolling and a same-origin native detail dialog. A fixed frontend origin, exact message source, session, increasing request ID and valid product ID gate requests. The frontend stays inert before handshake and during the native dialog. Bridge failures never fall back to a demo write. Native wishlist/cart success still requires checking the real account lists; this handoff does not claim Makeshop live integration QA.

Local Chrome mock QA also observed intermittent detail-frame timeouts on repeated product opens. Each request gets a fresh context and a timeout/native-detail fallback, but the repeated-open issue remains unconfirmed in the actual copied-skin preview; do not claim completed live integration. After using the verified https://pink-rocket.com origin with the shared helper path/query, actual Chrome rendered product 2084924 inside the local standalone detail panel: matching native title, 79 images and one native #cartBtn. No native account button was clicked. Public responses had no X-Frame-Options/CSP header and direct source audit did not identify a startup frame-buster; earlier blank states are not attributed to a Makeshop restriction.

Third-party iframe storage may be partitioned or blocked. Standalone admin localStorage and embedded localStorage are not a shared datastore; shared storage/auth remains deferred. GitHub Pages remains a screen preview host.

## Original skin mapping

The 14 original CP949 attachments are preserved under `reference-skin/`. Their product loops and category/header/footer structure inform the new UI. The old shared product list (`item-cont2`, `itemList`), fixed 1024px visibility modes, duplicated search presentation and slider initialization are replaced with a single responsive browsing view. The new 3:4 image stage preserves source images with object-fit contain; no distorted stretching.

## Verification

2026-10-20: syntax checks and all **145** tests pass (117 prior + 6 bridge-child + 20 parent/artifact + 2 real-detail panel regressions). The new checks cover the message boundary, explicit platform, stale/closed native requests, real-control selectors and selected values, timeouts, session rotation and generated-paste/source equality. Actual Chrome local mock QA used separate localhost origins with response-only address substitution; it confirmed handshake, product requests and a mock option A / quantity 2 click. This is not Makeshop login/account-write/CSP verification or physical-touch QA.

2026-10-19 latest: syntax checks and all **117** tests pass, including 12 ranking-model, 14 workbench-UI and two motion regressions in addition to the prior 89. Actual Chrome on isolated port 4176 covered operator-to-workbench edits, large/multiple photos, tags, weights/reasons, atomic JSON apply/undo, side-by-side published/draft photos, customer 8-to-14 progressive reveal with unique IDs, photo dots and actual category-transition transform/opacity. Customer iframe widths 1528/390px retained 4/2 columns and no overflow. Photo-account writes, automatic AI image analysis and physical-touch QA remain outside this verification. Older results below are retained as revision history.

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

Connect catalog acquisition/refresh, real launch dates and rank data, multi-image automation, shared secure storage, operator authentication/authorization, robust publish/version history and actual Makeshop copied-skin verification. The main iframe uses a fixed viewport height rather than document auto-height. Keep product ID as the cross-system key.


Design source: Google Drive PC folder https://drive.google.com/drive/folders/1Pr3pVNirVM2FfWUsiOmX7bcdIV16l22a and Mobile folder https://drive.google.com/drive/folders/13ZdIJL5e28bXe1wozFd8Tiza0mCt1v56 (files modified 2026-10-15). UTF-8 copies of CP949 source are retained in reference-current-skin; these are design references only, never executed. Third-party trackers, remote scripts, dynamic promotion banners, and unverified sales/review figures are not imported. Product discovery categories and 3:4 images retain the agreed new interaction model. The old responsive sample in reference-skin is historical and no longer the design baseline.

Remote image checks: three representative GIF/JPEG URLs returned HTTP 200 with image signatures. The complete remote image set is not exhaustively fetched. Browser visual/touch/iframe QA remains unavailable in this environment.


## Integrated discovery

The original quick-browse tag vocabulary is available in the 필터 bottom sheet: item, material, color, piercing shape, motif, wearing position and bar option. Tag recommendation scores use the original group weights (5/3/2/3/3/3/3), with stable existing curation as the tie-break. Multiple labels within a group match as OR. The optional strict mode requires a match in every selected group. Price bounds are actual constraints; empty bounds are unlimited, and reversed bounds return no results. User-selected price sorting applies to the complete candidate set before the 500/1000/all recommendation cap. These are deterministic tag scores, not live sales or personalized AI claims.

Local photo-color discovery reads a user-selected image into a 48×48 canvas, compares its hue/grayscale tone with the source color swatches, and adds the original style of color score. It does not recognize object shape. Photos remain in in-memory tab state, are not uploaded or written to localStorage, and can be cleared. Discovery state is independent per category. DOM tests stub the image decoder/canvas for this flow; real browser decoding, appearance and physical-touch tuning remain unverified because the required browser capability is unavailable.

UI copy uses plain functional labels. The search placeholder is 상품 검색; promotional filler in filter titles, quick view, administrator headings and new-banner defaults has been removed. This revision changes copy only.
