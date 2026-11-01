-- Match the explicitly requested 3 km delivery service radius.
update public.restaurant_settings
set delivery_radius_m = 3000,
    updated_at = now()
where id = 1
  and delivery_radius_m <> 3000;
