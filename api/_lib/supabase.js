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

export function toPublicUser(profile, authUser = null) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name || "",
    username: profile.username || "",
    email: profile.email || authUser?.email || "",
    role: profile.role || "user",
    bio: profile.bio || "",
    createdAt: profile.created_at || authUser?.created_at || null,
    updatedAt: profile.updated_at || null,
    lastLoginAt: profile.last_login_at || authUser?.last_sign_in_at || null
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
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data?.user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) return null;
  return { supabase, authUser: data.user, profile, user: toPublicUser(profile, data.user) };
}
