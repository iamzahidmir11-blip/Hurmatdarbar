create or replace function public.dispatch_push_for_notification()
returns trigger language plpgsql security definer set search_path = public, vault, net
as $$
declare hook_secret text;
begin
  if new.user_id is null and new.role is null then return new; end if;
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'hurmat_push_webhook_secret';
  if hook_secret is null or hook_secret = '' then return new; end if;
  perform net.http_post(
    url := 'https://rvrboufrnkzuptfjopwd.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret',hook_secret),
    body := jsonb_build_object('notification_id',new.id),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

create or replace function public.notify_customer_availability_created()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.customer_id is not null then
    insert into public.notifications(user_id,title,body)
    values(new.customer_id,'Delivery check received',
      case when new.within_radius then 'Your address is within the delivery area. The restaurant is checking your request now.'
      else 'Your delivery address needs a restaurant review. We will update you when the check is complete.' end);
  end if;
  return new;
end;
$$;
drop trigger if exists availability_customer_created_notification on public.delivery_availability_requests;
create trigger availability_customer_created_notification
after insert on public.delivery_availability_requests
for each row execute function public.notify_customer_availability_created();

create or replace function public.notify_customer_availability_expired()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status='expired' and old.status is distinct from new.status and new.customer_id is not null then
    insert into public.notifications(user_id,title,body)
    values(new.customer_id,'Delivery check expired','Your delivery availability check has expired. Please submit a new request.');
  end if;
  return new;
end;
$$;
drop trigger if exists availability_customer_expired_notification on public.delivery_availability_requests;
create trigger availability_customer_expired_notification
after update of status on public.delivery_availability_requests
for each row execute function public.notify_customer_availability_expired();

create or replace function public.notify_customer_payment_review()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_order_no bigint;
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') and new.customer_id is not null then
    select order_no into v_order_no from public.orders where id=new.order_id;
    insert into public.notifications(user_id,title,body,order_id)
    values(new.customer_id,'Payment '||new.status,
      case when new.status='approved' then 'Your payment for order #'||coalesce(v_order_no::text,'')||' has been verified.'
      else 'Your payment for order #'||coalesce(v_order_no::text,'')||' was not verified. '||coalesce(new.review_note,'Please contact the restaurant.') end,
      new.order_id);
  end if;
  return new;
end;
$$;
drop trigger if exists payment_customer_status_notification on public.payment_submissions;
create trigger payment_customer_status_notification
after update of status on public.payment_submissions
for each row execute function public.notify_customer_payment_review();
