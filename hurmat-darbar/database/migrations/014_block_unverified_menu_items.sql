-- Prevent menu entries awaiting owner verification from entering checkout.
-- Apply the same guard to the availability quote and final order creation.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.request_delivery_availability(jsonb)'::regprocedure);
  v_new := replace(
    v_def,
    'and v.active and i.active and i.available and v.price is not null',
    'and v.active and i.active and i.available and not i.needs_verification and v.price is not null'
  );
  if v_new = v_def then
    raise exception 'Could not locate availability item validation clause';
  end if;
  execute v_new;

  v_def := pg_get_functiondef('public.create_order(jsonb)'::regprocedure);
  v_new := replace(
    v_def,
    'and v.active and i.active and i.available and v.price is not null',
    'and v.active and i.active and i.available and not i.needs_verification and v.price is not null'
  );
  if v_new = v_def then
    raise exception 'Could not locate final order item validation clause';
  end if;
  execute v_new;
end $$;
