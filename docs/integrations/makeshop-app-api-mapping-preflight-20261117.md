# Studio B × Makeshop APP API — pre-integration mapping inventory (2026-11-17)

**Status: documentation and read-only D1 inspection only.** This is not an approved API adapter, a confirmed provider response contract, or authorization to modify the live product feed. Work is recorded on this separate GitHub branch so that ongoing APP-install URL implementation in another Codex session remains untouched.

## 1. Distinguish confirmed facts from unknown API response fields

**Confirmed in the Korean Makeshop APP API documentation:**

| Need | HTTP method/path or discovery | Source |
| --- | --- | --- |
| Product listings/details | `GET /api/v1/:shopId/product` | https://developer.makeshop.co.kr/docs/api/product/get-product |
| Categories | `GET /api/v1/:shopId/category` | https://developer.makeshop.co.kr/docs/api/product/get-category |
| Stock | `GET /api/v1/:shopId/stock` | https://developer.makeshop.co.kr/docs/api/product/get-stock |
| Main display products | `GET /api/v1/:shopId/main_display` | https://developer.makeshop.co.kr/docs/api/product/get-main-display |
| Category display products | `GET /api/v1/:shopId/category_display_products` | https://developer.makeshop.co.kr/docs/api/product/get-category-display-products |
| Wishlist/interest items | API **exists** in the product index; actual request/response schema not inspected | https://developer.makeshop.co.kr/docs/api/product/%EC%83%81%ED%92%88 |
| Cart-free analytics | `GET /api/v1/:shopId/cart_free` (not proof of actual current basket quantities) | https://developer.makeshop.co.kr/docs/api/product/get-cart-free |

The product GET documentation states that results are newest-created first, recommends querying no more than 1,000 products in a single request, and offers a `fields` request parameter to limit payload. Pagination, exact field names and response envelope must be confirmed from full API docs or actual authorized samples; do **not** implement them from assumptions.

**Important:** Existence of a “관심 상품 조회” API does **not** establish a per-product wishlist count. The `cart_free` endpoint is not proof of current user basket totals. Do not conflate Korean APP API with historical `openapi.makeshop.co.kr` Licensekey/Shopkey API or Japanese makeshop GraphQL API. Do not copy their field names into this contract.

Official developer MCP is public and can be used to fetch detailed schema from supported clients: `https://developer.makeshop.co.kr/mcp`; see https://developer.makeshop.co.kr/docs/guide/app/mcp. Verify schema details in the canonical APP API documentation as instructed by Makeshop.

## 2. Current DEV D1 facts (read-only, 2026-11-17)

Database: `interaction-ms-studio-b-dev` (Cloudflare D1).

- Existing `sb_bridge_catalog`: **2,530** product rows.
- `sb_product_source_registry`: **2** rows:
  - `public-html`: `source_kind=public_html`, `transport=legacy_read_through`, `adapter_state=read_through`.
  - `makeshop-app-api`: `source_kind=official_api`, `transport=external_push`, `adapter_state=awaiting_contract`.
- `sb_product_source_records`: **0**; `sb_product_source_runs`: **0**.
- `sb_product_source_identities`: **0**.
- `sb_product_source_field_policies`: **0**.
- No change to the existing product feed, sorting, hiding/pinning, saved skin or published snapshot was performed by this investigation.

Observed constraints from actual D1 `sqlite_master`:

- `sb_product_source_records`: `(source_id,external_id)` PK, `contract_version`, `payload_json`, `payload_sha256`, `collected_at`, `received_at`, optional `provider_updated_at`, `last_request_id` FK.
- `sb_product_source_identities`: `(source_id,external_id)` PK; `product_id` must be 1–12 ASCII digits; `verification_state` is `pending|verified|rejected`; verified requires `verified_at`, and there is `evidence_json`.
- `sb_product_source_field_policies`: **only** `name`, `price`, `saleStatus`, `representativeImageUrl` accepted by its CHECK constraint; `enabled` defaults to 0. No categories or analytics policy exists yet.
- `sb_product_source_runs`: `record_count` between 1 and 10, `request_id` PK, `fingerprint`, `contract_version`, `status=staging|staged`.
- The existing catalog JSON includes `id`, `name`, `price`, `representativeImageUrl`, `categoryKeys`, `observedAt`, `sourceKey`, `saleStatus` for sampled products. This is **Studio B's current shape**, not verified Makeshop API fields.

## 3. Candidate data mapping — do not activate without provider evidence

| Studio B consumer field | Required semantic verification from APP API | Proposed behavior before confirmation |
| --- | --- | --- |
| `id` (existing `branduid` canonical ID) | Official product primary identifier field, its data type and exact equivalence to public `branduid` | Keep external ID in `source_records.external_id`; do **not** automatically map to `id` |
| `name` | Product name path, null/markup/encoding behavior | Raw only; field policy remains disabled |
| `price` | Sale vs original/discount/option price, unit and nullability | Raw only; do not silently overwrite rendered price |
| `representativeImageUrl` | Main image URL path, absolute vs relative URLs, missing image semantics | Raw only; preserve existing valid thumbnails |
| `saleStatus` | Publication vs purchasability vs sold-out state, enumerations | Raw only; do not infer from stock=0 |
| `categoryKeys` | Category IDs, multiple classification and navigation hierarchy | Keep existing categories; no source policy defined |
| `detailUrl` | Official canonical product URL vs public `branduid` URL | Keep existing working detail links until explicit match |
| `reviewCount`, `salesCount` | Actual aggregation semantics, eligibility and freshness | No policy or feed change |
| Wishlist-related UI | Whether endpoint returns member-specific list vs aggregate per product | No generated wishlist counts |
| Basket-related UI | Whether API exposes current basket state or just event/statistics | No generated current basket totals |

**Identity evidence gate:** Only write `sb_product_source_identities.verification_state='verified'` after independently corroborating source ID with public product detail URL / existing `branduid`, plus representative name/image or equivalent primary-store evidence. Keep counterexamples, mismatches and collisions as `pending` or `rejected` with evidence. Do not infer correspondence just because two titles look alike.

**Priority gate:** Leave all `sb_product_source_field_policies` empty/disabled. A verified ID mapping and supported provider field path are prerequisites; add an explicit policy/contract version and test fallback for stale or missing API values. Existing HTML read-through remains the fallback.

## 4. Initial adapter boundary (contract, not code)

1. **GCP fixed-egress caller** authenticates to Makeshop APP API only after approval; retrieve a small, read-only product sample using documented request schema. Never put APP credentials in the browser or GitHub.
2. **Normalize minimal envelope only:** include authenticated source ID, external product ID as **string**, source contract version, raw JSON, SHA-256, collected/received/provider times. Do not normalize unknown provider fields.
3. **External push → DEV:** use the preexisting authenticated DEV ingestion endpoint. Respect currently reported limits: 10 records/request, 64 KiB request, 8 KiB per record, 3,000 retained records and 1,000 run records (must be revalidated against deployed code before load). `fields` can reduce product response size where officially supported.
4. **No live merge yet:** keep official records in `sb_product_source_records`; do not alter `sb_bridge_catalog`, `sb_bridge_supply_cache`, product feed, unpublished saves or publication heads.
5. **Explicit reconciliation:** produce deterministic ID crosswalk and per-field source policy only after reviewing real API response samples and tests.
6. **Versioned rollout:** plan independent DEV QA then controlled switch; no automatic publishing or change to QA Worker/skin revision pointers.

## 5. Critical validation checklist after APP credentials are available

- [ ] Extract authentic Korean APP API schema for product GET, category GET, stock GET, wishlist GET, and any pagination/filter parameters.
- [ ] Store a **sanitized, non-customer-specific** representative response fixture locally; remove tokens and identifiers before sharing.
- [ ] Document exact provider field paths, types, nulls, enum values, pagination and total count semantics; no assumed names.
- [ ] Check full/incremental pull frequency and provider rate limits for the **new** APP API, rather than copying limits from legacy OPEN API.
- [ ] Check whether every target product has an API ID and a verified mapping to `branduid`; investigate collisions.
- [ ] Measure worst-case raw JSON size relative to 8 KiB record cap; avoid silent truncation.
- [ ] Test supply/cache/search/sort/pin/hide, saving/editing and publishing behavior against unchanged DEV before any policy activation.
- [ ] Confirm synchronization failures preserve last-good public HTML read model, with last-success and source displayed.
- [ ] Keep APP install entrypoint (Codex separate session) independent of product API ingestion and Supabase webhook `makeshop.webhook_inbox`.

## Change boundary

This document makes **no** D1 writes, Cloudflare Worker deployments, makeshop APP registrations, or changes to the ongoing Codex installation URL work. Do not merge or deploy API field policies based only on this preflight document.
