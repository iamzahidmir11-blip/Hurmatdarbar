create or replace function public.notify_order_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare owner_uid uuid;
begin
  select user_id into owner_uid from public.user_roles
  where role = 'owner'::public.app_role and active = true
  order by created_at asc limit 1;

  insert into public.notifications(role, user_id, title, body, order_id)
  values ('owner'::public.app_role, owner_uid, 'New order received',
    'Order #' || new.order_no::text || ' · ₹' || new.total::text || ' is waiting for confirmation.',
    new.id);

  if new.customer_id is not null then
    insert into public.notifications(user_id, title, body, order_id)
    values (new.customer_id, 'Order received',
      'Your order #' || new.order_no::text || ' has been received by Hurmat Darbar.', new.id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_customer_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_customer uuid; v_order_no bigint; v_status text; v_body text;
begin
  select customer_id, order_no into v_customer, v_order_no
  from public.orders where id = new.order_id;
  if v_customer is null then return new; end if;
  v_status := replace(new.to_status::text, '_', ' ');
  v_body := case new.to_status::text
    when 'confirmed' then 'Your order #' || v_order_no || ' has been confirmed.'
    when 'preparing' then 'The kitchen has started preparing order #' || v_order_no || '.'
    when 'ready_for_pickup' then 'Order #' || v_order_no || ' is ready for pickup.'
    when 'picked_up' then 'Your order #' || v_order_no || ' has been picked up.'
    when 'out_for_delivery' then 'Your order #' || v_order_no || ' is on the way.'
    when 'delivered' then 'Your order #' || v_order_no || ' has been delivered. Enjoy your meal!'
    when 'cancelled' then 'Your order #' || v_order_no || ' was cancelled. ' || coalesce(new.reason, '')
    when 'rejected' then 'Your order #' || v_order_no || ' could not be accepted. ' || coalesce(new.reason, '')
    when 'delivery_failed' then 'Delivery for order #' || v_order_no || ' could not be completed. ' || coalesce(new.reason, '')
    else 'Your order #' || v_order_no || ' status is now ' || v_status || '.'
  end;
  insert into public.notifications(user_id, title, body, order_id)
  values (v_customer, 'Order update · #' || v_order_no, v_body, new.order_id);
  return new;
end;
$$;

drop trigger if exists orders_notify_created on public.orders;
create trigger orders_notify_created after insert on public.orders
for each row execute function public.notify_order_created();

drop trigger if exists order_status_notify_customer on public.order_status_history;
create trigger order_status_notify_customer after insert on public.order_status_history
for each row execute function public.notify_customer_order_status();

create index if not exists notifications_user_created_idx
on public.notifications(user_id, created_at desc);
grant select, update on public.notifications to authenticated;
