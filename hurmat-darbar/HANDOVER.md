# Hurmat Darbar — Final Handover Status

Last updated: 1 November 2026

## Live entry points
- Customer website: https://iamzahidmir11-blip.github.io/Hurmatdarbar/
- Owner dashboard: https://iamzahidmir11-blip.github.io/Hurmatdarbar/owner/
- Repository: https://github.com/iamzahidmir11-blip/Hurmatdarbar
- Supabase project ref: rvrboufrnkzuptfjopwd (region: ap-south-1)

## Latest deployment
- Latest GitHub Pages workflow run: https://github.com/iamzahidmir11-blip/Hurmatdarbar/actions/runs/41302761723
- Run #504, branch main, commit 20502347d69afccc0814fbb787a9727f6ceeb638.
- Both build and deploy jobs completed successfully.
- Customer page source cache token: `script.js?v=registered-checkout-20261101-5`.
- Owner page loads `admin.js?v=owner-mobile-app-shell-20261101-9`.
- GitHub Actions success confirms the Pages publish job completed; external browser delivery and live UI interaction still require a real-browser check.

## Current restaurant configuration (read from live database)
- Restaurant: Hurmat Darbar; currently marked open.
- Restaurant location flag: verified.
- Delivery radius: 5,000 metres (5 km).
- Delivery fee: ₹30.
- Minimum order: ₹0.
- UPI manual payment: enabled.
- COD: disabled.
- Customer checkout requires a registered, non-anonymous Supabase account.
- Customer signup and password login code are present. Signup handles the email-confirmation-required case and asks the customer to verify then log in.

## Current database snapshot
- Auth users: 2 (one active Owner role and one active Rider role); no customer test account is present.
- Orders: 0.
- Rider location rows: 0.
- Delivery availability requests: 0.
- Notifications: 0.
- Menu items: 159 total.
- Items awaiting Owner verification: 11.
- Customer-visible active/available verified items: 147.
- Customer and server-side availability/order creation both block menu items awaiting verification.

## Application workflow implemented in source
1. Customer creates an account or logs in.
2. Customer browses the verified live menu and builds a cart.
3. Customer shares delivery details and device location.
4. Server validates the request, menu/stock, restaurant status and delivery radius.
5. Owner reviews and approves/rejects delivery availability.
6. Customer completes manual UPI proof submission and creates the order after approval.
7. Owner confirms/updates the order and assigns a Rider.
8. Rider accepts/works the delivery and shares GPS location.
9. Customer uses the tracking reference to view order status and the rider map while the order is in delivery.
10. Rider verifies the customer delivery code before completion; location sharing should stop after successful verification.

## Owner dashboard
- Owner dashboard source is present at /owner/ and imports the live admin module.
- Development preview is disabled in admin.js.
- Owner sign-in uses Supabase email/password authentication and verifies an active staff role.
- Delivery availability, order status, rider assignment, tracking, payment review, refunds, reservations, inventory and store settings are represented in the dashboard/API.
- Existing Owner and Rider roles are active in the database.
- Do not share Owner or Rider passwords in this document or public chat.

## Rider app and GPS — test status
- Rider debug APK build previously succeeded in GitHub Actions.
- User reports installing the Rider APK and testing GPS on an Android device.
- The database snapshot currently has zero rider_locations rows. Rider record last_seen was 2026-11-01 11:25:17 UTC and the stored is_online flag was true; the API intentionally treats a rider heartbeat older than 15 minutes as offline.
- Therefore, basic app/GPS testing is user-reported, but a real assigned-order GPS stream and customer live-map test are NOT yet independently proven by database telemetry.
- Background GPS with screen locked, battery optimisation, network loss, permission denial and session expiry still require device validation.
- Debug APKs are internal test builds, not production-signed releases. A production signing keystore and signed release build are still required.

## Security and reliability review
- Security Advisor rechecked 1 November 2026: three anon-callable SECURITY DEFINER RPCs are `has_owner()`, `has_role(uid, roles)`, and `track_order(p_token)`. `has_role` is used by RLS for public menu reads and binds the supplied UID to the authenticated UID; `track_order` is the intended token-based customer tracking entry point. Do not revoke these blindly. The functions must remain narrowly scoped and tracking tokens must remain high-entropy and unguessable.
- Twenty-seven authenticated SECURITY DEFINER RPC warnings remain. The advisor flags their privilege class, not proof of exploitability. Keep role/ownership checks in each function and review the full function body before changing ACLs.

- Supabase project previously reported ACTIVE_HEALTHY; restaurant-api Edge Function is ACTIVE, version 35; send-push-notification is ACTIVE, version 2.
- `restaurant-api` manually verifies the bearer token and checks active user roles. Its CORS origin is currently the GitHub Pages origin. A future custom domain must be added to the CORS allowlist before use.
- Three RLS-enabled tables (`app_setup`, `delivery_availability_requests`, `refund_bank_details`) have no direct policies. Current grants show only postgres/service_role access, so these tables remain intended for restricted server/RPC access; do not add public table grants.
- `private.delivery_verification_codes` has RLS disabled but only postgres has direct table privileges. Keep direct access restricted; review any future grants carefully.
- SECURITY DEFINER advisor warnings require function-by-function review. `has_role` is referenced by public-schema RLS policies and is deliberately callable during anon menu reads; it binds the supplied user ID to `auth.uid()`. `track_order` is intentionally anon-callable using a high-entropy tracking token. Do not blanket-revoke these functions or break public menu reads/tracking.
- Auth leaked-password protection is not enabled; enable it in Supabase Auth password security settings when the project owner can access the dashboard.
- Performance advisor reports RLS init-plan / multiple-permissive-policy warnings and informational index findings. These are optimization work, not proof of a checkout outage.
- `pg_net` is installed in the public schema. Do not move it without checking dependent triggers/jobs.
- Push notification dispatch is deployed but end-to-end delivery has not been confirmed.
- UPI is manual proof submission and Owner review; no automatic payment gateway settlement/webhook is configured.

## Handover tests still required before declaring production-ready
- [ ] Open the live customer site in a normal browser and confirm the latest cache token is served.
- [ ] Verify customer signup/login separately with a fresh customer account, email confirmation if enabled, refresh and persistent session. The reported order test confirms checkout was completed in an authenticated customer session, but signup itself was not separately confirmed.
- [x] User-reported test order completed: customer order and payment receipt submitted; Owner processed/assigned it; Rider accepted and picked it up. No need to repeat this test unless a later error is reported.
- [x] User-reported GPS check: Rider location permission allowed and live GPS tracking independently checked successfully. [ ] Background GPS with phone locked, battery optimisation and network-loss recovery remain resilience checks.
- [ ] Verify delivery-code completion and that rider location updates stop afterward; this step was not explicitly included in the user's reported test.
- [ ] Exercise UPI proof review, reservation handling, refunds and COD collection/handover only with explicitly approved test records. COD is currently disabled.
- [ ] Enable leaked-password protection in Supabase Auth. This is an Auth dashboard security setting; it has not been changed from this workflow.
- [ ] Create and securely store a production signing key, then build and test signed release APKs.
- [ ] If using hurmatdarbar.com, configure DNS/domain and update Edge Function CORS before switching traffic.

## Safe operating notes
- Do not use real customer payment details or real bank details for testing.
- Do not manually mark UPI as paid until payment is independently confirmed.
- Do not enable COD unless the Owner explicitly decides to operate it and the rider cash-collection workflow has been tested.
- Keep the 11 unverified menu items unpublished until the Owner reviews them.
- Keep all Owner/Rider credentials private and enable strong passwords.
