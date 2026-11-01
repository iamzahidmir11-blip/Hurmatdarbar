-- Fix rider assignment validation: has_role() is intentionally scoped to auth.uid(),
-- so it cannot validate a different target user. Check the active rider role directly.
create or replace function public.assign_rider(p_order uuid, p_rider uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  o public.orders%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null or not public.has_role(uid, array['owner','manager','delivery_manager']::public.app_role[]) then
    raise exception 'forbidden';
  end if;

  if p_rider is null or not exists (
    select 1
    from public.user_roles r
    where r.user_id = p_rider
      and r.role = 'rider'::public.app_role
      and r.active = true
  ) then
    raise exception 'not_a_rider';
  end if;

  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status not in ('confirmed','preparing','ready_for_pickup') then
    raise exception 'cannot_assign_in_this_status';
  end if;

  update public.orders set rider_id = p_rider, updated_at = now() where id = p_order;

  insert into public.notifications(user_id, title, body, order_id)
  values (p_rider, 'New delivery assigned', 'Order #' || o.order_no, p_order);

  insert into public.audit_logs(actor, action, entity, entity_id, details)
  values (uid, 'assign_rider', 'order', p_order::text,
          jsonb_build_object('rider', p_rider, 'previous', o.rider_id));
end
$function$;

revoke all on function public.assign_rider(uuid,uuid) from public, anon;
grant execute on function public.assign_rider(uuid,uuid) to authenticated;
