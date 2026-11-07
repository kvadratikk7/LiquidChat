// Deploy: supabase functions deploy admin-command
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as Edge Function secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ message: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ message: "Invalid session" }, 401);

    const { data: adminRecord } = await admin.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!adminRecord) return json({ message: "Недостаточно прав." }, 403);

    const body = await req.json();
    const command = String(body.command || "").toLowerCase();
    const username = String(body.target_username || "").replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return json({ message: "Некорректный username." }, 400);
    const { data: target, error: targetError } = await admin.from("profiles")
      .select("id,username").eq("username", username).single();
    if (targetError || !target) return json({ message: "Пользователь не найден." }, 404);
    if (target.id === user.id) return json({ message: "Нельзя применить команду к самому себе." }, 400);

    if (command === "verified") {
      const { error } = await admin.from("profiles").update({ is_verified: true }).eq("id", target.id);
      if (error) throw error;
      return json({ message: `@${username} получил галочку ✓` });
    }

    if (command === "ban") {
      const { data: targetAuth, error: authErr } = await admin.auth.admin.getUserById(target.id);
      if (authErr || !targetAuth.user) throw authErr || new Error("Auth user not found");
      const email = targetAuth.user.email?.toLowerCase() ?? null;
      const phone = targetAuth.user.phone ?? null;
      const { error: banErr } = await admin.from("banned_identities").insert({
        email, phone, banned_user_id: target.id, reason: "Banned by @owner"
      });
      if (banErr) throw banErr;
      const { error: deleteErr } = await admin.auth.admin.deleteUser(target.id);
      if (deleteErr) throw deleteErr;
      return json({ message: `@${username} заблокирован, данные добавлены в чёрный список.` });
    }
    return json({ message: "Неизвестная команда." }, 400);
  } catch (e) {
    return json({ message: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
