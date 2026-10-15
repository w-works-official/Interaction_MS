# Project working instructions

Read START_HERE.md first. Continue the existing buildless dist/ app; do not scaffold a replacement or migrate frameworks without a concrete need.

Preserve category/discovery/admin behavior. Product ID is the cross-system key. Snapshot and localStorage demo behavior are not production Makeshop account integration.

The intended Makeshop integration is preview development in copied PC/Mobile skins, only replacing each main with the same external responsive iframe. Main-only width constraints can be removed and original main header/footer later removed. Existing detail/login/order/checkout remain Makeshop. Production skin replacement has not been requested.

Retain 3:4 photos and real image galleries. A gesture started on a photo must never switch category, even when long or released outside the photo. Grid columns progress 2 -> 3 -> 4 by available container width.

Use plain UI labels. No poetic search hints, unnecessary promotional banners, fabricated reviews, rankings, shipping promises or product image duplicates.

Run npm run check and the existing meaningful tests for code changes. Validate visual/touch behavior in an available browser and distinguish actual browser QA from jsdom tests. Honor the local environment's browser/preview instructions.

Confirm the destination GitHub owner/repository before creating or pushing there; preserve unrelated repositories and the CEO's original. The ZIP intentionally excludes old host identity and Git credentials.
