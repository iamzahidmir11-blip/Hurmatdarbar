import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return reply({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return reply({ error: "authentication_required" }, 401);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const keyMapRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    let anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (keyMapRaw) {
      try {
        const keyMap = JSON.parse(keyMapRaw);
        anonKey = Deno.env.get(keyMap.default) ?? anonKey;
      } catch {
        return reply({ error: "server_configuration_error" }, 500);
      }
    }
    if (!url || !anonKey) return reply({ error: "server_configuration_error" }, 500);

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (authError || !user) return reply({ error: "invalid_session" }, 401);

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role, active")
      .eq("user_id", user.id)
      .eq("active", true);

    if (roleError) return reply({ error: "authorization_check_failed" }, 500);
    const roles = new Set((roleRows ?? []).map((row: { role: string }) => row.role));

    if (req.method === "GET") {
      const view = new URL(req.url).searchParams.get("view") ?? "orders";
      const requestId = new URL(req.url).searchParams.get("request_id");
      if (view === "availability_status") {
        if (!isUuid(requestId)) return reply({ error: "invalid_request_id" }, 400);
        const { data, error } = await supabase.rpc("get_delivery_availability_status", { p_request_id: requestId });
        if (error) return reply({ error: error.message || "availability_status_unavailable" }, 400);
        return reply({ availability: data });
      }
      if (view === "availability") {
        if (!roles.has("owner")) return reply({ error: "forbidden" }, 403);
        const { data, error } = await supabase.rpc("get_delivery_availability_requests");
        if (error) return reply({ error: error.message || "availability_requests_unavailable" }, 400);
        return reply({ requests: data ?? [] });
      }
      if (view === "menu" || view === "reservations") {
        if (![...roles].some((r) => ["owner", "manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        if (view === "menu") {
          const { data, error } = await supabase.from("menu_items")
            .select("id, category_id, name, description, image_url, is_veg, active, available, needs_verification, track_stock, stock_qty, menu_categories(name), menu_variants(id, label, price, active)")
            .order("name", { ascending: true }).limit(300);
          if (error) return reply({ error: "menu_unavailable" }, 500);
          return reply({ items: data ?? [] });
        }
        const { data, error } = await supabase.from("reservations")
          .select("id, name, phone, party_size, reserve_at, notes, status, created_at")
          .order("reserve_at", { ascending: true }).limit(200);
        if (error) return reply({ error: "reservations_unavailable" }, 500);
        return reply({ reservations: data ?? [] });
      }
      if (view === "riders") {
        if (![...roles].some((r) => ["owner", "manager", "delivery_manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        const { data, error } = await supabase.from("riders").select("user_id, name, phone, is_online, last_seen").order("name");
        if (error) return reply({ error: "riders_unavailable" }, 500);
        return reply({ riders: data ?? [] });
      }
      if (![...roles].some((r) => ["owner", "manager", "kitchen", "delivery_manager", "rider"].includes(r))) return reply({ error: "forbidden" }, 403);
      let orderQuery = supabase.from("orders")
        .select("id, order_no, customer_name, customer_phone, address_text, lat, lng, notes, payment_method, payment_status, status, subtotal, delivery_fee, total, rider_id, created_at, updated_at, order_items(id, item_name, variant_label, unit_price, qty, line_total)");
      if (roles.has("rider") && ![...roles].some((r) => ["owner", "manager", "kitchen", "delivery_manager"].includes(r))) {
        orderQuery = orderQuery.eq("rider_id", user.id);
      }
      const { data, error } = await orderQuery.order("created_at", { ascending: false }).limit(100);
      if (error) return reply({ error: "orders_unavailable" }, 500);
      return reply({ orders: data ?? [] });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply({ error: "invalid_json_body" }, 400);
    }

    switch (body.action) {

      case "request_delivery_availability": {
        const { data, error } = await supabase.rpc("request_delivery_availability", { p: body.request });
        if (error) return reply({ error: error.message || "availability_request_failed" }, 400);
        return reply({ availability: data }, 201);
      }

      case "decide_delivery_availability": {
        if (!roles.has("owner")) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.request_id) || !["approved", "rejected"].includes(body.decision)) {
          return reply({ error: "invalid_availability_decision" }, 400);
        }
        const { data, error } = await supabase.rpc("decide_delivery_availability", {
          p_request_id: body.request_id,
          p_decision: body.decision,
          p_reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : null,
        });
        if (error) return reply({ error: error.message || "availability_decision_failed" }, 400);
        return reply({ availability: data });
      }

      case "set_rider_availability": {
        if (!roles.has("rider") || typeof body.is_online !== "boolean") return reply({ error: "forbidden_or_invalid_availability" }, 403);
        const { error } = await supabase.from("riders").update({ is_online: body.is_online, last_seen: new Date().toISOString() }).eq("user_id", user.id);
        if (error) return reply({ error: "availability_update_failed" }, 400);
        return reply({ ok: true, is_online: body.is_online });
      }

      case "adjust_menu_stock": {
        if (![...roles].some((r) => ["owner", "manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.item_id) || !Number.isInteger(body.delta) || body.delta === 0 || Math.abs(body.delta) > 1000000) return reply({ error: "invalid_stock_adjustment" }, 400);
        const { data, error } = await supabase.rpc("adjust_menu_stock", { p_item_id: body.item_id, p_delta: body.delta });
        if (error) return reply({ error: error.message.includes("stock_adjustment_rejected") ? "stock_adjustment_rejected" : "stock_adjustment_failed" }, 400);
        return reply({ ok: true, stock_qty: data });
      }
      case "create_menu_variant": {
        if (![...roles].some((r) => ["owner", "manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.item_id) || typeof body.label !== "string" || !body.label.trim() || body.label.trim().length > 60 || !Number.isInteger(body.price) || body.price < 1 || body.price > 1000000) return reply({ error: "invalid_variant" }, 400);
        const { data, error } = await supabase.from("menu_variants").insert({ item_id: body.item_id, label: body.label.trim(), price: body.price, active: true }).select("id,label,price,active").single();
        if (error) return reply({ error: "variant_create_failed" }, 400);
        return reply({ ok: true, variant: data }, 201);
      }
      case "update_menu_item": {
        if (![...roles].some((r) => ["owner", "manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.item_id)) return reply({ error: "invalid_item_id" }, 400);
        const patch: Record<string, unknown> = {};
        if (typeof body.available === "boolean") patch.available = body.available;
        if (typeof body.active === "boolean") patch.active = body.active;
        if (typeof body.name === "string" && body.name.trim().length >= 2 && body.name.length <= 120) patch.name = body.name.trim();
        if (typeof body.description === "string" && body.description.length <= 500) patch.description = body.description;
        if (body.image_url === null) patch.image_url = null;
        else if (typeof body.image_url === "string" && body.image_url.length <= 2048) {
          const imageUrl = body.image_url.trim();
          if (imageUrl && !imageUrl.startsWith("https://")) return reply({ error: "invalid_image_url" }, 400);
          patch.image_url = imageUrl || null;
        }
        if (typeof body.is_veg === "boolean") patch.is_veg = body.is_veg;
        if (typeof body.track_stock === "boolean") patch.track_stock = body.track_stock;
        if (Number.isInteger(body.stock_qty) && body.stock_qty >= 0 && body.stock_qty <= 1000000) patch.stock_qty = body.stock_qty;

        if (!Object.keys(patch).length) return reply({ error: "no_valid_changes" }, 400);
        const { error } = await supabase.from("menu_items").update(patch).eq("id", body.item_id);
        if (error) return reply({ error: "menu_update_failed" }, 400);
        return reply({ ok: true });
      }
      case "update_menu_variant": {
        if (![...roles].some((r) => ["owner", "manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.variant_id)) return reply({ error: "invalid_variant_id" }, 400);
        const patch: Record<string, unknown> = {};
        if (typeof body.active === "boolean") patch.active = body.active;
        if (Number.isInteger(body.price) && body.price > 0 && body.price <= 1000000) patch.price = body.price;
        if (typeof body.label === "string" && body.label.trim() && body.label.length <= 60) patch.label = body.label.trim();
        if (!Object.keys(patch).length) return reply({ error: "no_valid_changes" }, 400);
        const { error } = await supabase.from("menu_variants").update(patch).eq("id", body.variant_id);
        if (error) return reply({ error: "variant_update_failed" }, 400);
        return reply({ ok: true });
      }
      case "update_reservation_status": {
        if (![...roles].some((r) => ["owner", "manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.reservation_id) || !["confirmed", "rejected", "cancelled", "pending"].includes(body.status)) return reply({ error: "invalid_reservation_update" }, 400);
        const { error } = await supabase.from("reservations").update({ status: body.status }).eq("id", body.reservation_id);
        if (error) return reply({ error: "reservation_update_failed" }, 400);
        return reply({ ok: true });
      }
      case "create_staff_account": {
        if (!roles.has("owner")) return reply({ error: "forbidden" }, 403);
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const allowedRoles = new Set(["manager", "kitchen", "delivery_manager"]);
        const staffRole = typeof body.role === "string" ? body.role : "";
        if (email.length > 254 || email.includes(" ") || !email.includes("@") || email.indexOf("@") === 0 || email.lastIndexOf(".") < email.indexOf("@") + 2) return reply({ error: "invalid_staff_email" }, 400);
        if (password.length < 10 || password.length > 128) return reply({ error: "weak_staff_password" }, 400);
        if (!allowedRoles.has(staffRole)) return reply({ error: "invalid_staff_role" }, 400);
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!serviceRoleKey) return reply({ error: "staff_accounts_not_configured" }, 503);
        const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { account_created_by: "hurmat_owner_dashboard" },
        });
        if (createError) {
          const msg = createError.message.toLowerCase();
          return reply({ error: msg.includes("already") || msg.includes("registered") ? "staff_email_already_registered" : "staff_account_creation_failed" }, 400);
        }
        const newUser = created?.user;
        if (!newUser?.id) return reply({ error: "staff_account_creation_failed" }, 500);
        const { error: roleInsertError } = await adminClient.from("user_roles").upsert(
          { user_id: newUser.id, role: staffRole, active: true },
          { onConflict: "user_id,role" },
        );
        if (roleInsertError) {
          await adminClient.auth.admin.deleteUser(newUser.id);
          return reply({ error: "staff_role_assignment_failed" }, 500);
        }
        await adminClient.from("audit_logs").insert({
          actor: user.id, action: "staff_account_created", entity: "user", entity_id: newUser.id,
          details: { role: staffRole },
        });
        return reply({ ok: true, user_id: newUser.id, role: staffRole }, 201);
      }

      case "invite_owner": {
        if (!roles.has("owner")) return reply({ error: "forbidden" }, 403);
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (email.length > 254 || email.includes(" ") || !email.includes("@") || email.indexOf("@") === 0 || email.lastIndexOf(".") < email.indexOf("@") + 2) return reply({ error: "invalid_owner_email" }, 400);
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!serviceRoleKey) return reply({ error: "owner_invites_not_configured" }, 503);
        const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email);
        if (inviteError) {
          const msg = inviteError.message.toLowerCase();
          return reply({ error: msg.includes("already") || msg.includes("registered") ? "owner_email_already_registered" : "owner_invitation_failed" }, 400);
        }
        const invitedUser = inviteData?.user;
        if (!invitedUser?.id) return reply({ error: "owner_invitation_failed" }, 400);
        const { error: setupFlagError } = await adminClient.auth.admin.updateUserById(invitedUser.id, {
          user_metadata: { ...(invitedUser.user_metadata ?? {}), owner_password_setup_required: true },
        });
        if (setupFlagError) return reply({ error: "owner_setup_failed" }, 500);
        const { error: roleInsertError } = await adminClient.from("user_roles").upsert(
          { user_id: invitedUser.id, role: "owner", active: true },
          { onConflict: "user_id,role" },
        );
        if (roleInsertError) return reply({ error: "owner_role_assignment_failed" }, 500);
        await adminClient.from("audit_logs").insert({
          actor: user.id, action: "owner_invited", entity: "user", entity_id: invitedUser.id,
          details: { email },
        });
        return reply({ ok: true, invited: true }, 201);
      }

      case "create_order": {
        const { data, error } = await supabase.rpc("create_order_after_availability", { p: body.order });
        if (error) return reply({ error: "order_creation_failed", code: error.message }, 400);
        return reply({ order: data }, 201);
      }

      case "assign_rider": {
        if (![...roles].some((r) => ["owner", "manager", "delivery_manager"].includes(r))) {
          return reply({ error: "forbidden" }, 403);
        }
        if (!isUuid(body.order_id) || !isUuid(body.rider_id)) {
          return reply({ error: "invalid_order_or_rider_id" }, 400);
        }
        const { error } = await supabase.rpc("assign_rider", {
          p_order: body.order_id,
          p_rider: body.rider_id,
        });
        if (error) return reply({ error: "assignment_failed", code: error.message }, 400);
        return reply({ ok: true });
      }

      case "update_order_status": {
        if (![...roles].some((r) => ["owner", "manager", "kitchen", "rider"].includes(r))) {
          return reply({ error: "forbidden" }, 403);
        }
        if (!isUuid(body.order_id) || typeof body.status !== "string") {
          return reply({ error: "invalid_order_or_status" }, 400);
        }
        const allowed = new Set([
          "pending_confirmation", "confirmed", "preparing", "ready_for_pickup",
          "picked_up", "out_for_delivery", "delivered", "cancelled", "rejected", "delivery_failed",
        ]);
        if (!allowed.has(body.status)) return reply({ error: "invalid_status" }, 400);
        const reason = typeof body.reason === "string" ? body.reason.slice(0, 300) : null;
        const { error } = await supabase.rpc("update_order_status", {
          p_order: body.order_id,
          p_to: body.status,
          p_reason: reason,
        });
        if (error) return reply({ error: "status_update_failed", code: error.message }, 400);
        return reply({ ok: true });
      }

      case "post_location": {
        if (!roles.has("rider")) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.order_id) || typeof body.lat !== "number" ||
            typeof body.lng !== "number" || !Number.isFinite(body.lat) ||
            !Number.isFinite(body.lng) || body.lat < -90 || body.lat > 90 ||
            body.lng < -180 || body.lng > 180) {
          return reply({ error: "invalid_location" }, 400);
        }
        const accuracy = typeof body.accuracy === "number" && Number.isFinite(body.accuracy)
          ? Math.max(0, Math.min(body.accuracy, 10000))
          : null;
        const { data, error } = await supabase.rpc("rider_post_location", {
          p_order: body.order_id,
          p_lat: body.lat,
          p_lng: body.lng,
          p_accuracy: accuracy,
        });
        if (error) return reply({ error: "location_update_failed" }, 400);
        return reply({ ok: Boolean(data) });
      }

      default:
        return reply({ error: "unknown_action" }, 400);
    }
  } catch {
    return reply({ error: "unexpected_server_error" }, 500);
  }
});
