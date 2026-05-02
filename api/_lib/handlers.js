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
import { forbidden, handleOptions, methodNotAllowed, readJson, sendJson, unauthorized } from "./http.js";

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
    .from("userdata")
    .select("id,email,username")
    .or(`email.ilike.${email},username.ilike.${username}`)
    .limit(1);
  if (duplicate.data?.length) {
    const field = normalizeEmail(duplicate.data[0].email) === email ? "Email" : "Username";
    return sendJson(res, 409, { error: `${field} already exists.` });
  }

  const inserted = await supabase
    .from("userdata")
    .insert({ name, username, email, password })
    .select("*")
    .single();
  if (inserted.error) return sendJson(res, 400, { error: inserted.error.message });

  return sendJson(res, 201, {
    token: inserted.data.id,
    user: toPublicUser(inserted.data)
  });
}
async function findUserByIdentifier(supabase, identifier) {
  const rawIdentifier = String(identifier || "").trim();
  if (!rawIdentifier) return null;

  const field = rawIdentifier.includes("@") ? "email" : "username";
  const value = rawIdentifier.includes("@")
    ? normalizeEmail(rawIdentifier)
    : normalizeUsername(rawIdentifier);

  const { data } = await supabase
    .from("userdata")
    .select("*")
    .ilike(field, value)
    .maybeSingle();

  return data || null;
}

async function findAdminByIdentifier(supabase, identifier) {
  const rawIdentifier = String(identifier || "").trim();
  if (!rawIdentifier) return null;

  const value = rawIdentifier.includes("@")
    ? rawIdentifier.toLowerCase()
    : normalizeUsername(rawIdentifier);
  if (!value) return null;

  const { data } = await supabase
    .from("admindata")
    .select("*")
    .ilike("admin_id", value)
    .maybeSingle();

  return data || null;
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
  const userRecord = await findUserByIdentifier(supabase, identifier);
  if (userRecord && String(userRecord.password || "") === password) {
    return sendJson(res, 200, {
      token: userRecord.id,
      user: toPublicUser(userRecord)
    });
  }

  const adminRecord = await findAdminByIdentifier(supabase, identifier);
  if (adminRecord && String(adminRecord.password || "") === password) {
    return sendJson(res, 200, {
      token: adminRecord.admin_id,
      user: toPublicUser(adminRecord, { accountType: "admin", role: "admin" })
    });
  }

  return sendJson(res, 401, { error: "Invalid credentials." });
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
  const profile = await supabase.from("userdata").select("id").ilike("email", email).maybeSingle();
  if (profile.error || !profile.data) return sendJson(res, 404, { error: "User not found for this email." });

  const updated = await supabase.from("userdata").update({ password }).eq("id", profile.data.id);
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
  if (name.length < 2) return sendJson(res, 400, { error: "Name must be at least 2 characters." });
  if (!username) return sendJson(res, 400, { error: "Username is required." });

  if (current.user.accountType === "admin") {
    const updated = await current.supabase
      .from("admindata")
      .update({ name })
      .eq("admin_id", current.user.id)
      .select("*")
      .single();
    if (updated.error) return sendJson(res, 400, { error: updated.error.message });
    return sendJson(res, 200, { user: toPublicUser(updated.data, { accountType: "admin", role: "admin" }) });
  }

  const duplicate = await current.supabase
    .from("userdata")
    .select("id")
    .ilike("username", username)
    .neq("id", current.user.id)
    .maybeSingle();
  if (duplicate.data) return sendJson(res, 409, { error: "Username already taken." });

  const updated = await current.supabase
    .from("userdata")
    .update({ name, username })
    .eq("id", current.user.id)
    .select("*")
    .single();
  if (updated.error) return sendJson(res, 400, { error: updated.error.message });
  return sendJson(res, 200, { user: toPublicUser(updated.data) });
}

async function handleAdminUsers(req, res, userId = "") {
  const current = await requireAdmin(req, res);
  if (!current) return;

  if (!userId) {
    if (req.method !== "GET") return methodNotAllowed(res);
    const users = await current.supabase
      .from("userdata")
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

  return sendJson(res, 400, { error: "Role updates are not supported for userdata records." });
}

async function handleMeta(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  return sendJson(res, 200, {
    name: process.env.SITE_NAME || "Altarix",
    repoUrl: process.env.PUBLIC_REPO_URL || "https://github.com/raju-yadav-dev/Altarix"
  });
}

async function handleUpdate(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_updates")
    .select("version, download_url, release_notes, is_mandatory, type")
    .order("version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return sendJson(res, 500, { error: "Failed to fetch updates." });
  }

  const updates = Array.isArray(data) ? data : [];
  const latest = updates.length
    ? updates[0]
    : { version: "", download_url: "", release_notes: "", is_mandatory: false, type: "" };

  return sendJson(res, 200, {
    version: latest.version,
    download_url: latest.download_url,
    release_notes: latest.release_notes,
    is_mandatory: latest.is_mandatory,
    type: latest.type,
    updates
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
    if (req.method === "OPTIONS") return handleOptions(res);

    const pathname = cleanApiPath(forcedPath || req.url || "");
    if (pathname === "/api/meta") return handleMeta(req, res);
    if (pathname === "/api/update") return handleUpdate(req, res);
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

