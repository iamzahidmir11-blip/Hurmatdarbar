create or replace function public.get_refund_bank_details(p_refund_id uuid)
returns table(
  account_holder text,
  bank_name text,
  account_number text,
  ifsc text,
  upi_id text,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_uid uuid := auth.uid();
  encryption_key text;
begin
  if v_uid is null or not exists (
    select 1 from public.user_roles
    where user_id = v_uid and active = true and role = 'owner'
  ) then
    raise exception 'owner_only';
  end if;

  select decrypted_secret into encryption_key
    from vault.decrypted_secrets
    where name = 'refund_bank_encryption_key'
    limit 1;
  if encryption_key is null then raise exception 'refund_encryption_unavailable'; end if;

  return query
    select d.account_holder, d.bank_name,
      extensions.pgp_sym_decrypt(d.account_number_encrypted, encryption_key),
      d.ifsc, d.upi_id, d.created_at
    from public.refund_bank_details d
    where d.refund_id = p_refund_id;
end
$$;
