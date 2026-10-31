create or replace function public.customer_cancel_order(
  p_order uuid,
  p_reason text default 'Cancelled by customer'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  o public.orders%rowtype;
  uid uuid := auth.uid();
  reason_text text := left(trim(coalesce(p_reason, 'Cancelled by customer')), 300);
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_order is null then
    raise exception 'invalid_order';
  end if;

  select * into o
  from public.orders
  where id = p_order and customer_id = uid
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  -- Customers may cancel only before kitchen preparation starts.
  if o.status not in ('pending_confirmation', 'confirmed') then
    raise exception 'customer_cancellation_closed';
  end if;
  if not public.can_transition(o.status, 'cancelled'::public.order_status) then
    raise exception 'invalid_transition';
  end if;

  update public.orders
  set status = 'cancelled',
      cancel_reason = coalesce(nullif(reason_text, ''), 'Cancelled by customer'),
      updated_at = now()
  where id = p_order;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
  values (p_order, o.status, 'cancelled', uid, coalesce(nullif(reason_text, ''), 'Cancelled by customer'));

  -- Restore tracked stock exactly once while the order row remains locked.
  update public.menu_items i
  set stock_qty = i.stock_qty + x.qty
  from (
    select item_id, sum(qty)::int as qty
    from public.order_items
    where order_id = p_order and item_id is not null
    group by item_id
  ) x
  where i.id = x.item_id and i.track_stock;

  insert into public.audit_logs(actor, action, entity, entity_id, details)
  values (uid, 'customer_order_cancelled', 'order', p_order::text,
          jsonb_build_object('from', o.status, 'reason', reason_text));

  -- Existing orders_create_refund_on_cancel trigger creates a refund request
  -- automatically for paid/cash-collected orders and notifies the Owner.
end;
$function$;

revoke all on function public.customer_cancel_order(uuid, text) from public;
revoke all on function public.customer_cancel_order(uuid, text) from anon;
grant execute on function public.customer_cancel_order(uuid, text) to authenticated;