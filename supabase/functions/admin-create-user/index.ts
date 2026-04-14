import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;

    if (claimsError || !callerId) {
      return json({ error: "Not authenticated" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if caller is tabless_admin
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", callerId)
      .eq("role", "tabless_admin")
      .maybeSingle();
    const isTablessAdmin = !!roleData;

    // Helper: check if caller is owner/manager at a venue
    const isVenueManager = async (venueId: string): Promise<boolean> => {
      if (isTablessAdmin) return true;
      const { data } = await adminClient
        .from("venue_staff")
        .select("id")
        .eq("user_id", callerId)
        .eq("venue_id", venueId)
        .in("role", ["owner", "manager"])
        .eq("is_active", true)
        .maybeSingle();
      return !!data;
    };

    const body = await req.json();
    const { action } = body;

    // ── LIST EMAILS for user_ids ──
    if (action === "list_emails") {
      const { user_ids, venue_id } = body;
      if (!Array.isArray(user_ids)) return json({ error: "user_ids required" }, 400);
      // Allow "platform" as a special venue_id for admin-level queries
      if (venue_id !== "platform") {
        if (!venue_id) return json({ error: "venue_id required" }, 400);
        if (!(await isVenueManager(venue_id))) return json({ error: "Forbidden" }, 403);
      } else {
        if (!isTablessAdmin) return json({ error: "Forbidden" }, 403);
      }

      const emails: Record<string, string> = {};
      for (const uid of user_ids) {
        const { data: u } = await adminClient.auth.admin.getUserById(uid);
        if (u?.user?.email) emails[uid] = u.user.email;
      }
      return json({ emails });
    }

    // ── CREATE ADMIN (tabless_admin role) ──
    if (action === "create_admin") {
      if (!isTablessAdmin) return json({ error: "Forbidden" }, 403);
      const { email, password } = body;
      if (!email || !password) return json({ error: "email and password are required" }, 400);
      if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

      // Create or find existing auth user
      let userId: string;
      const { data: newUser, error: createError } =
        await adminClient.auth.admin.createUser({ email, password, email_confirm: true });

      if (createError) {
        if (createError.message.includes("already been registered")) {
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const existing = listData?.users?.find((u: any) => u.email === email);
          if (!existing) return json({ error: "User exists but could not be found" }, 400);
          userId = existing.id;
        } else {
          return json({ error: createError.message }, 400);
        }
      } else {
        userId = newUser.user.id;
      }

      // Check if already admin
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "tabless_admin")
        .maybeSingle();

      if (existingRole) {
        return json({ error: "This user is already a Ordrup admin" }, 400);
      }

      const { error: roleErr } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "tabless_admin" });

      if (roleErr) return json({ error: roleErr.message }, 500);
      return json({ success: true, user_id: userId });
    }

    // ── REMOVE ADMIN ──
    if (action === "remove_admin") {
      if (!isTablessAdmin) return json({ error: "Forbidden" }, 403);
      const { user_id: targetUserId, role_id } = body;
      if (!targetUserId || !role_id) return json({ error: "user_id and role_id required" }, 400);
      // Prevent removing yourself
      if (targetUserId === callerId) return json({ error: "Cannot remove your own admin access" }, 400);

      const { error: delErr } = await adminClient
        .from("user_roles")
        .delete()
        .eq("id", role_id);

      if (delErr) return json({ error: delErr.message }, 400);
      return json({ success: true });
    }

    // ── DELETE USER (remove from venue + optionally delete auth) ──
    if (action === "delete") {
      const { staff_id, venue_id, delete_auth } = body;
      if (!staff_id || !venue_id) return json({ error: "staff_id and venue_id are required" }, 400);
      if (!(await isVenueManager(venue_id))) return json({ error: "Forbidden" }, 403);

      // Get user_id before deleting staff record
      const { data: staffRow } = await adminClient
        .from("venue_staff")
        .select("user_id")
        .eq("id", staff_id)
        .single();

      // Remove staff record
      const { error: delErr } = await adminClient
        .from("venue_staff")
        .delete()
        .eq("id", staff_id);
      if (delErr) return json({ error: delErr.message }, 400);

      // Optionally delete the auth user entirely (only tabless_admin)
      if (delete_auth && isTablessAdmin && staffRow?.user_id) {
        await adminClient.auth.admin.deleteUser(staffRow.user_id);
      }

      return json({ success: true, deleted: staff_id });
    }

    // ── UPDATE STAFF ──
    if (action === "update") {
      const { staff_id, venue_id, display_name, role } = body;
      if (!staff_id || !venue_id) return json({ error: "staff_id and venue_id are required" }, 400);
      if (!(await isVenueManager(venue_id))) return json({ error: "Forbidden" }, 403);

      const updates: any = {};
      if (display_name !== undefined) updates.display_name = display_name || null;
      if (role) {
        const validRoles = ["owner", "manager", "staff"];
        if (validRoles.includes(role)) updates.role = role;
      }

      const { error } = await adminClient
        .from("venue_staff")
        .update(updates)
        .eq("id", staff_id);
      if (error) return json({ error: error.message }, 400);

      return json({ success: true });
    }

    // ── TOGGLE ACTIVE ──
    if (action === "toggle_active") {
      const { staff_id, venue_id, is_active } = body;
      if (!staff_id || !venue_id) return json({ error: "staff_id and venue_id are required" }, 400);
      if (!(await isVenueManager(venue_id))) return json({ error: "Forbidden" }, 403);

      const { error } = await adminClient
        .from("venue_staff")
        .update({ is_active })
        .eq("id", staff_id);
      if (error) return json({ error: error.message }, 400);

      return json({ success: true });
    }

    // ── CREATE USER ──
    const { email, password, venue_id, role, display_name } = body;

    if (!email || !password || !venue_id) {
      return json({ error: "email, password, and venue_id are required" }, 400);
    }
    if (!(await isVenueManager(venue_id))) return json({ error: "Forbidden" }, 403);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const validRoles = ["owner", "manager", "staff"];
    const userRole = validRoles.includes(role) ? role : "staff";

    // Create or find existing auth user
    let userId: string;
    const { data: newUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError) {
      if (createError.message.includes("already been registered")) {
        const { data: listData } = await adminClient.auth.admin.listUsers();
        const existing = listData?.users?.find((u: any) => u.email === email);
        if (!existing) return json({ error: "User exists but could not be found" }, 400);
        userId = existing.id;
      } else {
        return json({ error: createError.message }, 400);
      }
    } else {
      userId = newUser.user.id;
    }

    // Check if already staff at this venue
    const { data: existingStaff } = await adminClient
      .from("venue_staff")
      .select("id")
      .eq("venue_id", venue_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingStaff) {
      return json({ error: "This user is already assigned to this venue" }, 400);
    }

    const { error: staffError } = await adminClient
      .from("venue_staff")
      .insert({
        venue_id,
        user_id: userId,
        role: userRole,
        display_name: display_name || null,
      });

    if (staffError) {
      return json({ error: `User created but staff assignment failed: ${staffError.message}` }, 500);
    }

    return json({ success: true, user_id: userId, email, role: userRole });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
