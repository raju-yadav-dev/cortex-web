import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  getCurrentUserFromRequest,
  getSupabaseAdmin,
  isValidEmail,
  normalizeEmail,
  normalizeUsername,
  toPublicUser
} from "./supabase.js";
import { forbidden, methodNotAllowed, readJson, sendJson, unauthorized } from "./http.js";

const MIN_PASSWORD_LENGTH = 8;

function cleanApiPath(value = "") {
  const pathname = String(value).split("?")[0].replace(/\/+$/, "") || "/";
  return pathname;
}

function assertPassword(password, confirmPassword = password) {
  if (String(password || "").length < MIN_PASSWORD_LENGTH) {
    return "Password must be at least 8 characters.";
  }
  if (password !== confirmPassword) {
    return "Password confirmation does not match.";
  }
  return "";
}

async function requireUser(req) {
  return getCurrentUserFromRequest(req);
}

async function requireAdmin(req, res) {
  const current = await requireUser(req);
  if (!current) {
    unauthorized(res);
    return null;
  }
  if (current.user.role !== "admin") {
    forbidden(res);
    return null;
  }
  return current;
}

async function handleSignup(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const username = normalizeUsername(body.username);
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  const passwordError = assertPassword(password, String(body.confirmPassword || ""));

  if (name.length < 2) return sendJson(res, 400, { error: "Name must be at least 2 characters." });
  if (!username) return sendJson(res, 400, { error: "Username is required." });
  if (!isValidEmail(email)) return sendJson(res, 400, { error: "Please enter a valid email address." });
  if (passwordError) return sendJson(res, 400, { error: passwordError });

  const supabase = getSupabaseAdmin();
  const duplicate = await supabase
    .from("user_profiles")
    .select("id,email,username")
    .or(`email.eq.${email},username.eq.${username}`)
    .limit(1);
  if (duplicate.data?.length) {
    const field = duplicate.data[0].email === email ? "Email" : "Username";
    return sendJson(res, 409, { error: `${field} already exists.` });
  }

  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, username }
  });
  if (created.error) return sendJson(res, 400, { error: created.error.message });

  const profilePayload = {
    id: created.data.user.id,
    name,
    username,
    email,
    role: "user",
    bio: ""
  };
  const inserted = await supabase.from("user_profiles").insert(profilePayload).select("*").single();
  if (inserted.error) {
    await supabase.auth.admin.deleteUser(created.data.user.id);
    return sendJson(res, 400, { error: inserted.error.message });
  }

  const session = await supabase.auth.signInWithPassword({ email, password });
  if (session.error) return sendJson(res, 201, { token: "", user: toPublicUser(inserted.data, created.data.user) });
  return sendJson(res, 201, {
    token: session.data.session.access_token,
    user: toPublicUser(inserted.data, session.data.user)
  });
}

async function handleLogin(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = await readJson(req);
  const identifier = String(body.identifier || "").trim();
  const password = String(body.password || "");
  if (!identifier || !password) {
    return sendJson(res, 400, { error: "Email/username and password are required." });
  }

  const supabase = getSupabaseAdmin();
  let email = normalizeEmail(identifier);
  if (!identifier.includes("@")) {
    const profileLookup = await supabase
      .from("user_profiles")
      .select("email")
      .eq("username", normalizeUsername(identifier))
      .maybeSingle();
    if (profileLookup.error || !profileLookup.data?.email) {
      return sendJson(res, 401, { error: "Invalid credentials." });
    }
    email = profileLookup.data.email;
  }

  const session = await supabase.auth.signInWithPassword({ email, password });
  if (session.error || !session.data?.user) {
    return sendJson(res, 401, { error: "Invalid credentials." });
  }

  const now = new Date().toISOString();
  await supabase.from("user_profiles").update({ last_login_at: now }).eq("id", session.data.user.id);
  const profile = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", session.data.user.id)
    .maybeSingle();
  if (profile.error || !profile.data) return sendJson(res, 401, { error: "Profile not found." });

  return sendJson(res, 200, {
    token: session.data.session.access_token,
    user: toPublicUser({ ...profile.data, last_login_at: now }, session.data.user)
  });
}

async function handleForgotPassword(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = String(body.newPassword || "");
  const passwordError = assertPassword(password, String(body.confirmPassword || ""));
  if (!isValidEmail(email)) return sendJson(res, 400, { error: "Valid email is required." });
  if (passwordError) return sendJson(res, 400, { error: passwordError });

  const supabase = getSupabaseAdmin();
  const profile = await supabase.from("user_profiles").select("id").eq("email", email).maybeSingle();
  if (profile.error || !profile.data) return sendJson(res, 404, { error: "User not found for this email." });

  const updated = await supabase.auth.admin.updateUserById(profile.data.id, { password });
  if (updated.error) return sendJson(res, 400, { error: updated.error.message });
  return sendJson(res, 200, { message: "Password updated." });
}

async function handleMe(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const current = await requireUser(req);
  if (!current) return unauthorized(res);
  return sendJson(res, 200, { user: current.user });
}

async function handleLogout(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);
  return sendJson(res, 200, { message: "Logged out." });
}

async function handleProfile(req, res) {
  const current = await requireUser(req);
  if (!current) return unauthorized(res);

  if (req.method === "GET") return sendJson(res, 200, { user: current.user });
  if (req.method !== "PATCH") return methodNotAllowed(res);

  const body = await readJson(req);
  const name = String(body.name || "").trim();
  const username = normalizeUsername(body.username);
  const bio = String(body.bio || "").trim();
  if (name.length < 2) return sendJson(res, 400, { error: "Name must be at least 2 characters." });
  if (!username) return sendJson(res, 400, { error: "Username is required." });

  const duplicate = await current.supabase
    .from("user_profiles")
    .select("id")
    .eq("username", username)
    .neq("id", current.user.id)
    .maybeSingle();
  if (duplicate.data) return sendJson(res, 409, { error: "Username already taken." });

  const updated = await current.supabase
    .from("user_profiles")
    .update({ name, username, bio, updated_at: new Date().toISOString() })
    .eq("id", current.user.id)
    .select("*")
    .single();
  if (updated.error) return sendJson(res, 400, { error: updated.error.message });
  return sendJson(res, 200, { user: toPublicUser(updated.data, current.authUser) });
}

async function handleAdminUsers(req, res, userId = "") {
  const current = await requireAdmin(req, res);
  if (!current) return;

  if (!userId) {
    if (req.method !== "GET") return methodNotAllowed(res);
    const users = await current.supabase
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (users.error) return sendJson(res, 400, { error: users.error.message });
    return sendJson(res, 200, { users: users.data.map((item) => toPublicUser(item)) });
  }

  if (req.method !== "PATCH") return methodNotAllowed(res);
  const body = await readJson(req);
  const role = String(body.role || "").trim().toLowerCase();
  if (!["admin", "user"].includes(role)) {
    return sendJson(res, 400, { error: "Role must be either admin or user." });
  }
  if (userId === current.user.id && role !== "admin") {
    return sendJson(res, 400, { error: "You cannot remove your own admin role." });
  }

  const updated = await current.supabase
    .from("user_profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("*")
    .single();
  if (updated.error) return sendJson(res, 400, { error: updated.error.message });
  return sendJson(res, 200, { user: toPublicUser(updated.data) });
}

async function handleMeta(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  return sendJson(res, 200, {
    name: process.env.SITE_NAME || "Cortex",
    repoUrl: process.env.PUBLIC_REPO_URL || "https://github.com/raju-yadav-dev/cortex"
  });
}

async function handleDownloads(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const downloadsDir = path.join(process.cwd(), "downloads");
  try {
    const names = await readdir(downloadsDir);
    const files = await Promise.all(
      names.map(async (name) => {
        const info = await stat(path.join(downloadsDir, name));
        if (!info.isFile()) return null;
        return {
          name,
          size: info.size,
          updatedAt: info.mtime.toISOString(),
          downloadUrl: `/downloads/${encodeURIComponent(name)}`
        };
      })
    );
    return sendJson(res, 200, { files: files.filter(Boolean) });
  } catch (_error) {
    return sendJson(res, 200, { files: [] });
  }
}

export async function handleApiRequest(req, res, forcedPath = "") {
  try {
    const pathname = cleanApiPath(forcedPath || req.url || "");
    if (pathname === "/api/meta") return handleMeta(req, res);
    if (pathname === "/api/downloads") return handleDownloads(req, res);
    if (pathname === "/api/auth/signup") return handleSignup(req, res);
    if (pathname === "/api/auth/login") return handleLogin(req, res);
    if (pathname === "/api/auth/forgot-password") return handleForgotPassword(req, res);
    if (pathname === "/api/auth/me") return handleMe(req, res);
    if (pathname === "/api/auth/logout") return handleLogout(req, res);
    if (pathname === "/api/profile") return handleProfile(req, res);
    if (pathname === "/api/admin/users") return handleAdminUsers(req, res);

    const userMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userMatch) return handleAdminUsers(req, res, decodeURIComponent(userMatch[1]));

    return sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
}
