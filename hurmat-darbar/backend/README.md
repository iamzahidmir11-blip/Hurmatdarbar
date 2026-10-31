# Hurmat Darbar backend

The connected Supabase project is `hurmat-darbar` in the Mumbai region (`ap-south-1`). Its live database was inspected before this integration was written.

## Shared architecture
- Customer website: menu, authenticated customer ordering and order tracking.
- Admin Android app: staff order operations and manual rider assignment.
- Delivery Android app: rider's assigned orders and delivery updates.
- Supabase Auth, PostgreSQL and RLS: shared identity and data layer.
- Customer ordering now follows Check Availability → Owner YES/NO → Pay & Place Order. Availability requests are private to the customer and Owner; order creation is gated by an approved, unexpired request.
- Edge Function `restaurant-api`: authenticated API entry point.

## Live database
The connected project already contains its own schema and migrations, including `orders`, `order_items`, `user_roles`, `riders`, `order_status_history`, `rider_locations`, `notifications`, `audit_logs`, and protected order RPC functions. This live schema differs from the older draft migration in this repository. **Do not apply that draft migration to the live project.**

## API
Invoke `/functions/v1/restaurant-api` with a valid Supabase user access token.
- `GET`: list up to 100 orders; RLS limits visible rows.
- `POST { action: "request_delivery_availability", request: {...} }`: saves a customer delivery check and notifies the Owner.
- `GET ?view=availability`: Owner-only list of recent availability requests.
- `GET ?view=availability_status&request_id=...`: customer-only status for their own request.
- `POST { action: "decide_delivery_availability", request_id, decision, reason? }`: Owner approves or rejects the delivery request.
- `POST { action: "create_order", order: {..., availability_request_id} }`: creates an order only through the approved availability request. Direct execution of `create_order(jsonb)` is revoked from client roles.
- `POST { action: "assign_rider", order_id, rider_id }`: owner/manager/delivery-manager; database RPC validates rider and order state.
- `POST { action: "update_order_status", order_id, status, reason? }`: database RPC enforces transitions and role permissions.
- `POST { action: "post_location", order_id, lat, lng, accuracy? }`: rider-only; database RPC verifies assignment and rate-limits writes.

The function uses a JWT-scoped Supabase client and publishable/legacy anon key. It does not use a service-role key.

## Example
```js
const { data, error } = await supabase.functions.invoke("restaurant-api", {
  body: { action: "assign_rider", order_id: "ORDER_UUID", rider_id: "RIDER_USER_UUID" }
});
```

## Remaining before production
- Confirm phone OTP provider and consent settings.
- Verify owner/admin/rider accounts and role assignments.
- Integrate and test all three clients on real devices.
- Verify restaurant coordinates and delivery radius before enabling delivery orders.
- Configure payment provider in test mode; live activation is for the restaurant operator.
- Review privacy, cancellation, refund and delivery policies with the restaurant operator.
- Run end-to-end tests for ordering, assignment, status transitions, tracking and rider location.

Never put service-role or payment secrets in the website, source repository, or APK.
