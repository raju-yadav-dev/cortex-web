import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseAdmin() {
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function toPublicUser(record, options = {}) {
  if (!record) return null;
  const accountType = options.accountType
    || record.accountType
    || (record.admin_id ? "admin" : "user");
  const role = options.role || record.role || (accountType === "admin" ? "admin" : "user");
  const id = record.id || record.admin_id || "";

  return {
    id,
    name: record.name || (accountType === "admin" ? "Admin" : ""),
    username: record.username || record.admin_id || "",
    email: record.email || "",
    role,
    accountType,
    bio: record.bio || "",
    createdAt: record.created_at || null,
    updatedAt: record.updated_at || null,
    lastLoginAt: record.last_login_at || null
  };
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

export async function getCurrentUserFromRequest(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const match = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const supabase = getSupabaseAdmin();
  const token = match[1];

  const { data: userRecord } = await supabase
    .from("userdata")
    .select("*")
    .eq("id", token)
    .maybeSingle();

  if (userRecord) {
    return { supabase, profile: userRecord, user: toPublicUser(userRecord) };
  }

  const { data: adminRecord } = await supabase
    .from("admindata")
    .select("*")
    .eq("admin_id", token)
    .maybeSingle();

  if (!adminRecord) return null;
  return { supabase, profile: adminRecord, user: toPublicUser(adminRecord, { accountType: "admin", role: "admin" }) };
}
