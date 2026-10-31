create or replace function public.update_order_status(
  p_order uuid,
  p_to public.order_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  o public.orders%rowtype;
  uid uuid := auth.uid();
  ok boolean := false;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into o from public.orders where id=p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if not public.can_transition(o.status,p_to) then raise exception 'invalid_transition'; end if;
  if p_to='confirmed' and o.payment_method='upi_manual' and o.payment_status<>'paid' then
    raise exception 'upi_payment_not_verified';
  end if;
  if public.has_role(uid,array['owner','manager']::public.app_role[]) then
    ok:=true;
  elsif public.has_role(uid,array['kitchen']::public.app_role[])
    and ((o.status='confirmed' and p_to='preparing') or (o.status='preparing' and p_to='ready_for_pickup')) then
    ok:=true;
  elsif public.has_role(uid,array['rider']::public.app_role[])
    and o.rider_id=uid and p_to in ('picked_up','out_for_delivery','delivery_failed') then
    ok:=true;
  end if;
  if not ok then raise exception 'forbidden'; end if;
  if p_to in ('cancelled','rejected','delivery_failed') and coalesce(trim(p_reason),'')='' then
    raise exception 'reason_required';
  end if;
  if p_to in ('picked_up','out_for_delivery') and o.rider_id is null then
    raise exception 'rider_required';
  end if;
  update public.orders set status=p_to,updated_at=now(),
    cancel_reason=case when p_to in ('cancelled','rejected','delivery_failed') then p_reason else cancel_reason end,
    delivered_at=case when p_to='delivered' then now() else delivered_at end
  where id=p_order;
  insert into public.order_status_history(order_id,from_status,to_status,changed_by,reason)
  values(p_order,o.status,p_to,uid,p_reason);
  if p_to in ('cancelled','rejected') then
    update public.menu_items i set stock_qty=i.stock_qty+x.q
    from (select item_id,sum(qty)::int q from public.order_items
          where order_id=p_order and item_id is not null group by item_id) x
    where i.id=x.item_id and i.track_stock;
  end if;
  if p_to in ('cancelled','rejected','delivery_failed') then
    insert into public.audit_logs(actor,action,entity,entity_id,details)
    values(uid,'order_'||p_to,'order',p_order::text,jsonb_build_object('reason',p_reason,'from',o.status));
  end if;
end;
$function$;