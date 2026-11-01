-- Delivery completion verification and customer-only delivery code access.
-- Applied to Supabase as rider_delivery_code_verification and
-- persist_delivery_code_attempt_limits.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.delivery_verification_codes (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_id uuid not null,
  code text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on private.delivery_verification_codes from public, anon, authenticated;

create or replace function private.create_delivery_verification_code()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into private.delivery_verification_codes(order_id, customer_id, code)
  values (new.id, new.customer_id, upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8)));
  return new;
end;
$$;
revoke all on function private.create_delivery_verification_code() from public, anon, authenticated;

drop trigger if exists create_delivery_verification_code_after_order on public.orders;
create trigger create_delivery_verification_code_after_order
after insert on public.orders
for each row execute function private.create_delivery_verification_code();

create or replace function public.get_customer_delivery_code(p_order uuid)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select c.code into v_code
  from private.delivery_verification_codes c
  join public.orders o on o.id = c.order_id
  where c.order_id = p_order
    and c.customer_id = auth.uid()
    and o.customer_id = auth.uid()
    and o.status in ('picked_up','out_for_delivery')
    and c.used_at is null;
  return v_code;
end;
$$;
revoke all on function public.get_customer_delivery_code(uuid) from public, anon;
grant execute on function public.get_customer_delivery_code(uuid) to authenticated;

create or replace function public.verify_delivery_code(p_order uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  o public.orders%rowtype;
  c private.delivery_verification_codes%rowtype;
begin
  if v_uid is null or not public.has_role(v_uid, array['rider']::public.app_role[]) then
    raise exception 'forbidden';
  end if;
  if p_order is null or length(trim(coalesce(p_code,''))) <> 8 then
    return jsonb_build_object('ok',false,'error','invalid_delivery_code');
  end if;

  select * into o from public.orders where id = p_order for update;
  if not found or o.rider_id is distinct from v_uid then raise exception 'forbidden'; end if;
  if o.status <> 'out_for_delivery' then raise exception 'order_not_out_for_delivery'; end if;

  select * into c from private.delivery_verification_codes where order_id = p_order for update;
  if not found or c.used_at is not null then raise exception 'delivery_code_unavailable'; end if;
  if c.locked_until is not null and c.locked_until > now() then
    return jsonb_build_object('ok',false,'error','delivery_code_temporarily_locked');
  end if;

  if upper(trim(p_code)) <> c.code then
    update private.delivery_verification_codes
      set failed_attempts = least(failed_attempts + 1, 5),
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
      where order_id = p_order;
    return jsonb_build_object('ok',false,'error','invalid_delivery_code');
  end if;

  update private.delivery_verification_codes set used_at = now() where order_id = p_order;
  update public.orders
    set status = 'delivered',
        delivered_at = now(),
        updated_at = now(),
        payment_status = case when payment_method = 'cod' then 'cod_collected'::public.payment_status else payment_status end
    where id = p_order;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
  values (p_order, o.status, 'delivered', v_uid, 'Customer delivery code verified');

  if o.payment_method = 'cod' and o.payment_status = 'cod_pending' then
    insert into public.cash_collections(order_id, rider_id, amount)
    select p_order, v_uid, o.total
    where not exists (select 1 from public.cash_collections cc where cc.order_id = p_order);
  end if;

  insert into public.notifications(user_id, title, body, order_id)
  values (o.customer_id, 'Order delivered', 'Your order #' || o.order_no || ' has been delivered.', p_order);

  insert into public.audit_logs(actor, action, entity, entity_id, details)
  values (v_uid, 'delivery_code_verified', 'order', p_order::text,
          jsonb_build_object('order_no', o.order_no, 'payment_method', o.payment_method));

  return jsonb_build_object('ok', true, 'status', 'delivered', 'order_no', o.order_no);
end;
$$;
revoke all on function public.verify_delivery_code(uuid,text) from public, anon;
grant execute on function public.verify_delivery_code(uuid,text) to authenticated;
