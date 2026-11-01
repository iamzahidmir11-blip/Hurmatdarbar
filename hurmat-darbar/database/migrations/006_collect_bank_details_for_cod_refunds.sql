create or replace function public.customer_cancel_order_with_refund_details(
  p_order uuid,
  p_reason text default 'Cancelled by customer',
  p_account_holder text default null,
  p_bank_name text default null,
  p_account_number text default null,
  p_ifsc text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_refund_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_order from public.orders
    where id = p_order and customer_id = v_uid for update;
  if not found then raise exception 'order_not_found'; end if;

  if v_order.payment_status in ('paid','cod_collected') then
    if length(trim(coalesce(p_account_holder,''))) < 2
       or length(trim(coalesce(p_bank_name,''))) < 2
       or trim(coalesce(p_account_number,'')) !~ '^[0-9]{8,20}$'
       or upper(trim(coalesce(p_ifsc,''))) !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then
      raise exception 'valid_refund_bank_details_required';
    end if;
  end if;

  perform public.customer_cancel_order(p_order, p_reason);

  if v_order.payment_status in ('paid','cod_collected') then
    select id into v_refund_id
      from public.refund_requests
      where order_id = p_order and customer_id = v_uid;
    if v_refund_id is null then raise exception 'refund_request_not_created'; end if;

    perform public.submit_refund_bank_details(
      v_refund_id,
      p_account_holder,
      p_bank_name,
      p_account_number,
      p_ifsc,
      null
    );
  end if;

  return jsonb_build_object('cancelled', true, 'refund_id', v_refund_id);
end
$$;
