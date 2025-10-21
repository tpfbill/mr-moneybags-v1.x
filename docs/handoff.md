# Mr‑Moneybags v1.x — Handoff Summary

This document captures the current system state, conventions, and quick steps to verify functionality. Use this as the canonical starting point for new sessions.

Commit baseline: 6bed2c1bf59d4001d0e6115cd35a9b530a7c6cb8 (short: 6bed2c1)

## Current State
- Main branch contains the merged fix for payment batches:
  - Created By is populated via a safe resolver
  - Funds join uses `funds.fund_name` (not `funds.name`)
  - Batches list returns data; UI renders names

## Architecture & Run
- Backend: Node/Express 5, sessions; entry: `server-modular.js` (API on port 3000)
- Frontend: static client (optional) via `http-server` on port 8080
- Key scripts:
  - Start API: `npm start`
  - Client (optional): `npm run client`

## Key Modules & Endpoints
- `src/routes/payment-batches.js`
  - `GET /api/payment-batches` → batches with `created_by_name`; ordered by `pb.id DESC`
  - `GET /api/payment-batches/:id` → includes `created_by_name`
  - `POST /api/payment-batches` → uses `req.user.id`; falls back to `req.session.userId`
  - Resolver: LATERAL lookup by `id::text`, `username`, or `email` (all text-cast)

- `src/routes/payments-import.js`
  - Simplified import: creates `payment_items` with status `Pending`; no Journal Entry creation; uses authenticated user id

- `server-modular.js`
  - Disables ETag and applies `no-store` cache headers on `/api` to avoid 304 masking

- Frontend (Vendor Payments)
  - `vendor-payments.html`, `src/js/vendor-payments.js`
  - Batch number is clickable → modal with 10-column table
  - Payment type filter, select‑all checkbox, “Pay Selected Items” button

## Conventions & Workflow
- Merge strategy: merge commit to `main` locally, then push to GitHub
- Keep history clean; avoid committing session/runtime artifacts (e.g., `cookie.txt` changes)
- Use `funds.fund_name` in SQL joins; avoid non-existent columns like `pb.created_at` or `pb.batch_date`
- For Created By resolution, never call `LOWER` on `uuid`; cast to `text` first

## Recent Fixes (Why they matter)
- Created By population was blank due to schema mismatches and unsafe comparisons
  - Fixed via LATERAL resolver with safe text casting and multiple identifiers
- Funds join caused 42703 errors because schema uses `fund_name`
  - Changed to `f.fund_name AS fund_name`
- Prevented cache-related empty responses by disabling ETag and adding `no-store` headers

## Quick Verification
1) `npm ci`
2) `npm start`
3) `GET /api/payment-batches` → should return rows with `created_by_name`
4) Vendor Payments page → batches visible; “Created By” shows names

## Notes
- No migrations were required for the above fixes
- Feature branches should be merged via merge commit; delete branches after merge
