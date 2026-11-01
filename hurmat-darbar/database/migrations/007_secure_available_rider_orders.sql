-- Secure rider-facing pickup queue. Do not expose unassigned orders through the
-- ordinary orders table policy; return only the minimum pickup data to an online rider.

create or replace function public.get_available_delivery_orders()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_online boolean;
  v_orders jsonb;
begin
  if v_uid is null or not public.has_role(v_uid, array['rider']::public.app_role[]) then
    raise exception 'forbidden';
  end if;
  select is_online into v_online from public.riders where user_id = v_uid;
  if coalesce(v_online,false) = false then
    return jsonb_build_object('orders','[]'::jsonb,'rider_offline',true);
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',o.id,'order_no',o.order_no,'customer_name',o.customer_name,
      'address_text',o.address_text,'lat',o.lat,'lng',o.lng,
      'payment_method',o.payment_method,'payment_status',o.payment_status,
      'status',o.status,'total',o.total,'created_at',o.created_at,
      'order_items',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',i.id,'item_name',i.item_name,'variant_label',i.variant_label,'qty',i.qty
        )),'[]'::jsonb)
        from public.order_items i where i.order_id=o.id
      )
    ) order by o.created_at
  ),'[]'::jsonb) into v_orders
  from public.orders o
  where o.rider_id is null and o.status='ready_for_pickup';
  return jsonb_build_object('orders',v_orders,'rider_offline',false);
end;
$function$;
revoke all on function public.get_available_delivery_orders() from public;
grant execute on function public.get_available_delivery_orders() to authenticated;
