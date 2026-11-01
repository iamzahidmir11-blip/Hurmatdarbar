-- Add covering indexes for foreign keys and remove the duplicate notifications index.
create index if not exists delivery_availability_requests_order_id_idx
  on public.delivery_availability_requests(order_id);
create index if not exists refund_bank_details_customer_id_idx
  on public.refund_bank_details(customer_id);
create index if not exists refund_requests_reviewed_by_idx
  on public.refund_requests(reviewed_by);
drop index if exists public.notifications_user_id_created_at_idx;
