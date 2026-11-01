create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (endpoint like 'https://%' and length(endpoint) <= 4096),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 10 and 100),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_read_own on public.push_subscriptions;
create policy push_subscriptions_read_own on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create or replace function public.get_push_runtime_config()
returns table(vapid_public_key text, vapid_private_key text, vapid_subject text, webhook_secret text)
language sql security definer set search_path = public, vault
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'hurmat_vapid_public_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'hurmat_vapid_private_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'hurmat_vapid_subject'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'hurmat_push_webhook_secret');
$$;
revoke all on function public.get_push_runtime_config() from public, anon, authenticated;
grant execute on function public.get_push_runtime_config() to service_role;

create or replace function public.dispatch_push_for_notification()
returns trigger language plpgsql security definer set search_path = public, vault, net
as $$
declare hook_secret text;
begin
  if new.user_id is null then return new; end if;
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
drop trigger if exists notification_dispatch_push on public.notifications;
create trigger notification_dispatch_push after insert on public.notifications
for each row execute function public.dispatch_push_for_notification();
