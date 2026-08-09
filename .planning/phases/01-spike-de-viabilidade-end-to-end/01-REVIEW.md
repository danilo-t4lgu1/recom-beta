---
phase: 01-spike-de-viabilidade-end-to-end
reviewed: 2026-07-10T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - app-partners-recomendados/api/recommendations/[productId].js
  - app-partners-recomendados/api/webhooks/customers-data-request.js
  - app-partners-recomendados/api/webhooks/customers-redact.js
  - app-partners-recomendados/api/webhooks/store-redact.js
  - app-partners-recomendados/package.json
  - app-partners-recomendados/scripts/roundtrip-metafield.js
  - app-partners-recomendados/src/api/recommendations.js
  - app-partners-recomendados/src/auth/nuvemshop-auth.js
  - app-partners-recomendados/src/nuvemshop-client/client.js
  - app-partners-recomendados/src/server.js
  - storefront-script/main.js
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
fixes_applied:
  - CR-01
  - CR-02
---

# Phase 1: Code Review Report

## Fixes Applied

**CR-01 and CR-02 (both Critical) were fixed by the orchestrator directly, commit `1686b78`** (`fix(01-review): escape HTML in storefront block and encode API identifiers`):
- CR-01: added `escapeHtml()` in `storefront-script/main.js`, applied to `recommendedProduct.name/url/image/price` everywhere they're concatenated into rendered markup.
- CR-02: added `encodeURIComponent()` around `productId`/`ownerId` in `app-partners-recomendados/src/nuvemshop-client/client.js`'s `getProduct`/`getMetafields` URL construction.

Warnings (WR-01 through WR-04) and Info items (IN-01 through IN-03) were left as-is — not blocking for this phase's viability spike, tracked here for future pickup.

**Reviewed:** 2026-07-10
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Phase 1 viability-spike codebase: the Nuvemshop client wrapper, auth module, the two `getRecommendations` server entry points (local `http` server + Vercel serverless function), the LGPD webhook stubs, the round-trip CLI script, and the storefront `v.Alpha` script. Secrets hygiene is good (`.env` is gitignored inside `app-partners-recomendados/`, not tracked in git history, no hardcoded credentials found). The documented technical debt (legacy Script API v.Alpha per D-11, hardcoded single-Metafield "algorithm", stub LGPD webhooks) is exactly as described and is not re-flagged here.

Two real, provable defects were found that go beyond the documented debt: (1) unescaped HTML injection when rendering the recommended product's name/URL/image into the storefront DOM, and (2) unencoded interpolation of attacker-controlled `productId` into outbound Nuvemshop API URLs (both path segment and query string), which allows query-parameter injection into an authenticated upstream call. Several robustness/error-handling gaps (swallowed errors, no input validation, no graceful degradation when a recommended product is deleted) round out the warnings.

## Critical Issues

### CR-01: Unescaped product data injected into DOM via `insertAdjacentHTML` (stored/reflected HTML injection)

**File:** `storefront-script/main.js:120-147`
**Issue:** `renderRecommendationBlock` builds the recommendation block via raw string concatenation and inserts it with `insertAdjacentHTML`. `recommendedProduct.name`, `.url`, and `.image` — all sourced from the Nuvemshop product API response (`product.name.pt`, `product.canonical_url`, `product.images[0].src` in `src/api/recommendations.js:40-43`) — are embedded directly into HTML attributes (`href="..."`, `src="..."`, `alt="..."`) and text content without any escaping. Only `recommendedProduct.name` used in the `data-recommended-product-id` attribute is passed through `encodeURIComponent` (line 138); the same `name` is inserted unescaped again at line 142, and `url`/`image` are never escaped at all.

A product name or handle containing `"`, `<`, or `>` (e.g. a catalog entry titled `Vestido "Elegante" <Promo>`) breaks the attribute boundary or injects arbitrary markup into a real merchant storefront page. Because the merchant curates the Metafield content per D-06/D-07, the practical attacker surface is the Nuvemshop catalog fields (name, canonical_url, image URL) — which are usually merchant-controlled, but are not currently validated/sanitized anywhere in the pipeline (`recommendations.js` → `main.js`). This is a genuine HTML-injection bug independent of the documented "legacy Script API" debt (D-11 covers execution model, not output encoding).

**Fix:**
```js
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// then use escapeHtml(recommendedProduct.name), escapeHtml(recommendedProduct.url),
// escapeHtml(recommendedProduct.image) everywhere they're concatenated into html/imageHtml/priceHtml.
```

### CR-02: Unencoded `productId` interpolated into outbound Nuvemshop API URLs (query/path injection)

**File:** `app-partners-recomendados/src/nuvemshop-client/client.js:34` and `:80`
**Issue:** Both `getProduct(productId)` (`.../products/${productId}`) and `getMetafields({ ownerId })` (`?owner_id=${ownerId}&namespace=recomendados`) interpolate their identifier arguments directly into the URL template string without `encodeURIComponent`. These identifiers originate from unauthenticated, public, attacker-controlled input:

- `server.js:11,36`: `RECOMMENDATIONS_PATH = /^\/recommendations\/([^/]+)\/?$/` captures any character except `/` (including `&`, `?`, `#`, spaces) into `productId`, which flows straight to `getRecommendations` → `getMetafields`/`getProduct`.
- `api/recommendations/[productId].js:43`: `req.query.productId` similarly flows unvalidated into the same client calls.

A request such as `GET /recommendations/1&owner_id=999` decodes to `productId = "1&owner_id=999"`, producing an outbound URL `.../metafields/products?owner_id=1&owner_id=999&namespace=recomendados` — a query-parameter injection into an **authenticated** upstream API call (the request carries the app's real `Bearer` token). Depending on how the upstream API resolves duplicate params (commonly "last wins"), this lets an external caller influence which product's metafields get queried through a public, unauthenticated endpoint. The same lack of encoding applies to the `/products/${productId}` path segment in `getProduct`.

**Fix:**
```js
// client.js
const url = `${API_BASE}/${storeId}/products/${encodeURIComponent(productId)}`;
...
const url = `${API_BASE}/${storeId}/metafields/products?owner_id=${encodeURIComponent(ownerId)}&namespace=recomendados`;
```
Additionally validate `productId` at the entry points (`server.js`, `[productId].js`) to reject empty/non-numeric values before calling `getRecommendations` (see WR-02).

## Warnings

### WR-01: Errors silently swallowed in both public HTTP handlers — no server-side logging

**File:** `app-partners-recomendados/api/recommendations/[productId].js:48-50`, `app-partners-recomendados/src/server.js:41-43`
**Issue:** Both `catch (err) { res.status(500).json(...) }` blocks discard `err` completely — no `console.error` or any logging. On Vercel, function logs are the only way to diagnose a production 500 (e.g., upstream Nuvemshop API outage, malformed token, rate limiting). As written, every failure is a black box; operators have no way to distinguish "Nuvemshop API down" from "bad productId" from "auth token expired" without reproducing locally.
**Fix:**
```js
} catch (err) {
  console.error('[recommendations] failed:', err);
  res.status(500).json({ error: 'Internal error fetching recommendations' });
}
```

### WR-02: No validation of `productId` before use — `undefined`/empty values reach the Nuvemshop client

**File:** `app-partners-recomendados/api/recommendations/[productId].js:43-46`, `app-partners-recomendados/src/api/recommendations.js:27-28`
**Issue:** `const { productId } = req.query` is used directly with no presence/format check. If the route is hit without a segment (edge case in routing, or a malformed client request), `productId` can be `undefined`, and `getRecommendations(undefined)` proceeds to call `getMetafields({ ownerId: undefined })`, producing a URL literally containing `owner_id=undefined` — a wasted round-trip to the upstream API that always fails, surfacing as an opaque 500 (compounded by WR-01's lack of logging).
**Fix:**
```js
const { productId } = req.query;
if (!productId || typeof productId !== 'string') {
  res.status(400).json({ error: 'productId is required' });
  return;
}
```

### WR-03: Broken recommended-product lookup takes down the entire endpoint instead of degrading gracefully

**File:** `app-partners-recomendados/src/api/recommendations.js:36-45`
**Issue:** When a Metafield points at a `recommendedProductId` that no longer resolves (product deleted/unpublished in the Nuvemshop catalog — a realistic scenario per D-05, since the Metafield persists indefinitely post-spike), `getProduct(recommendedProductId)` throws via `assertOk` on a non-2xx response. This exception is not caught locally in `getRecommendations`, so it propagates to the handler's generic catch and turns the *entire* request into a 500 — even though the base product lookup and Metafield read both succeeded. The correct behavior is to treat an unresolvable recommended product as "no recommendation available" (return `recommendedProduct: null`) rather than fail the whole response.
**Fix:**
```js
let recommendedProduct = null;
if (recommendedProductId) {
  try {
    const product = await getProduct(recommendedProductId);
    recommendedProduct = { ... };
  } catch (err) {
    console.error('[recommendations] recommended product lookup failed:', err);
    // leave recommendedProduct as null — degrade gracefully
  }
}
```

### WR-04: `renderRecommendationBlock` silently no-ops when neither anchor selector is found, with only a console warning

**File:** `storefront-script/main.js:149-167`
**Issue:** This is a lower-severity robustness gap: if the theme markup changes (both `#product-description` and `#compre-junto-block` disappear or get renamed), the script fails silently for real site visitors with only a `console.warn` that no one will see in production. Given this is an explicitly short-lived v.Alpha (D-11), this is acceptable as-is, but worth flagging since there's no monitoring/alerting hook and the failure mode is invisible in production traffic.
**Fix:** Not blocking for a spike; if this script's lifetime extends beyond a few weeks, consider reporting failures to the backend (e.g., a lightweight beacon) so anchor-selector drift is detected proactively rather than discovered via support tickets.

## Info

### IN-01: Duplicate/hardcoded `NAMESPACE`/`KEY` constants across two files

**File:** `app-partners-recomendados/src/api/recommendations.js:9-10` and `app-partners-recomendados/src/nuvemshop-client/client.js:59-60`
**Issue:** The Metafield `namespace: 'recomendados'` / `key: 'produto_sugerido'` pair is defined as constants in `recommendations.js` but hardcoded as string literals in `client.js`'s `createMetafield`. If either value changes, it must be updated in two places; a mismatch would cause `getRecommendations` to silently never find the metafield it just wrote (via `roundtrip-metafield.js`).
**Fix:** Extract `NAMESPACE`/`KEY` to a single shared constants module (or export from `client.js`) and import in both places.

### IN-02: `USER_AGENT` contains a personal email hardcoded in source

**File:** `app-partners-recomendados/src/nuvemshop-client/client.js:8`
**Issue:** `const USER_AGENT = 'TalguiRecomendados (danilopradosilva20@gmail.com)';` embeds a personal email address directly in source that will be committed to git history. Not a secret/credential, but worth flagging as a minor PII exposure in a public-ish repo context — Nuvemshop's own API guidelines typically just want a contact method, which could be a generic support alias instead.
**Fix:** Consider using a project/support alias instead of a personal address, or move to an env var if this needs to change per environment.

### IN-03: CORS origin allowlist is a single hardcoded string with no `www.` variant handling

**File:** `app-partners-recomendados/api/recommendations/[productId].js:22`
**Issue:** `ALLOWED_ORIGIN = 'https://talgui.com.br'` is fine given the documented storefront domain, but if the store is ever also reachable at `https://www.talgui.com.br` (common Nuvemshop domain setup) or over both `http`/`https` during any transitional DNS state, the fetch from `main.js` would be silently blocked by the browser with no server-side signal. Low risk for a spike confined to one verified URL, but worth a one-line note for whoever picks this up post-Phase-1.
**Fix:** If multi-domain support is ever needed, validate `req.headers.origin` against an allowlist array instead of a single static header value.

---

_Reviewed: 2026-07-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
