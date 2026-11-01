# Hurmat Darbar — Handover Notes

Last updated: 1 November 2026

## Live entry points
- Customer website: https://iamzahidmir11-blip.github.io/Hurmatdarbar/
- Owner dashboard: https://iamzahidmir11-blip.github.io/Hurmatdarbar/owner/
- Repository: https://github.com/iamzahidmir11-blip/Hurmatdarbar
- Supabase project ref: rvrboufrnkzuptfjopwd (region: ap-south-1)

## Current verified delivery state
- Supabase project status: ACTIVE_HEALTHY.
- `restaurant-api` Edge Function: ACTIVE, version 34.
- GitHub Android build passed for the rider and owner debug apps: https://github.com/iamzahidmir11-blip/Hurmatdarbar/actions/runs/41295716774
- Customer Next.js CI passed: https://github.com/iamzahidmir11-blip/Hurmatdarbar/actions/runs/41295716776
- Latest website deployment passed: https://github.com/iamzahidmir11-blip/Hurmatdarbar/actions/runs/41296394142
- Delivery radius is set to the requested 3,000 metres.
- Stale rider online flags were cleared; rider presence is considered stale after 15 minutes.
- Role checks now bind the supplied user ID to auth.uid(), preventing role lookups for arbitrary users.
- Rider app now marks the rider offline during explicit sign-out, refreshes online heartbeat while active, and exposes COD collection after delivery.
- Owner dashboard displays stale rider sessions as offline and already has COD cash reconciliation / owner handover confirmation.

## Application flow
Customer website → Supabase Auth / Database → owner dashboard and kitchen workflow → rider app → rider GPS updates → customer tracking page.

## Android debug builds
These are CI-built debug APKs for internal testing only; they are not production-signed Play Store releases.
- Rider app artifact was built from commit 31b401c89ca6dfb48f51e03d964f5d8ffe85d388.
- Owner app artifact was built from the same successful Android workflow.
- Install on test Android devices and verify login, permissions, background location, order lifecycle, COD collection, owner cash handover, and sign-out.

## Important operational limitations — do not treat as production-tested
1. No live end-to-end customer order → owner confirmation → rider claim → pickup → GPS → customer map → delivery-code completion test has been completed on real devices.
2. Android foreground GPS behavior with screen locked, battery optimisation, denied permissions, network loss and session expiry still requires real-device verification.
3. Anonymous customer sign-in is used by the customer checkout flow, but the project Auth setting enabling anonymous sign-in has not been independently verified here.
4. UPI is manual proof submission and owner review; no automatic payment gateway settlement/webhook is configured.
5. COD collection and owner handover UI/API exist, but a real cash collection has not been tested.
6. Refund and reservation workflows have not been exercised end-to-end with test accounts.
7. The location_verified setting is a stored flag, not independent proof that the restaurant pin was physically checked.
8. Debug APKs are not release-signed. A production release keystore and signed release build are still required.

## Remaining Supabase advisor items
- 3 RLS-enabled tables have no direct policies; direct anon/authenticated SELECT grants are absent, so they appear intended for restricted RPC access. Keep this model and review RPC authorization before exposing any access.
- SECURITY DEFINER warnings remain. `has_role` now checks auth.uid(), while `track_order` is intentionally token-based for customer tracking; audit the remaining functions individually rather than blanket-revoking grants.
- Supabase Auth leaked-password protection is not enabled.
- Performance advisor still reports RLS init-plan and multiple-permissive-policy warnings, plus informational unused-index findings.
- `pg_net` remains installed in the public schema and should be relocated only after checking dependent triggers/jobs.

## Recent database migrations
- 013 rider online stale timeout and role-check hardening
- 014 requested 3 km delivery radius
- 015 foreign-key indexes and duplicate notification index removal

## Handover checklist
- [ ] Install both debug APKs on dedicated test devices.
- [ ] Confirm owner and rider login with credentials supplied privately by the business owner.
- [ ] Verify customer guest checkout and order creation.
- [ ] Verify owner status transitions and rider claim.
- [ ] Verify foreground GPS, customer tracking and delivery code.
- [ ] Verify COD cash collection and owner handover.
- [ ] Verify UPI proof review, refunds and reservations.
- [ ] Create and store a production signing key securely, then build signed release APKs.
- [ ] Complete security advisor review and enable leaked-password protection.
