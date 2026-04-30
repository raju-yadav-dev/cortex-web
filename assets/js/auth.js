const SUPABASE_URL = "https://tfdszotngmkrixzxhxgt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qKd2iPnUnFJDW1bDBU8M1A_7wzR7Iwb";
const USERDATA_TABLE = "userdata";
const ADMINDATA_TABLE = "admindata";
const MIN_PASSWORD_LENGTH = 8;

const supabaseClient = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

document.addEventListener("DOMContentLoaded", () => {
  bindPasswordVisibilityButtons();

  const buildAppUrl = resolveBuildAppUrl();
  preserveDesktopRedirectLinks(buildAppUrl);
  const page = getCurrentPage();
  if (page === "login") {
    setupLogin(buildAppUrl);
  }
  if (page === "signup") {
    setupSignup(buildAppUrl);
  }
  if (page === "forgot-password") {
    setupForgotPassword(buildAppUrl);
  }

  checkExistingSession(page, buildAppUrl);
});

function bindPasswordVisibilityButtons() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-target");
      if (!targetId) return;

      const input = document.getElementById(targetId);
      if (!input) return;

      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      button.setAttribute("aria-pressed", show ? "true" : "false");
      button.classList.toggle("is-visible", show);
    });
  });
}

function resolveBuildAppUrl() {
  return window.AltarixWeb?.buildAppUrl || ((path) => path);
}

function setupLogin(buildAppUrl) {
  const form = document.getElementById("loginForm");
  if (!form) return;
  const submitButton = form.querySelector('button[type="submit"]');
  let isSubmitting = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const data = new FormData(form);
    const identifier = String(data.get("identifier") || "").trim();
    const password = String(data.get("password") || "");
    if (!identifier || !password) {
      showMessage("Email or username and password are required.", "error");
      return;
    }

    isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.defaultLabel = submitButton.textContent || "Login";
      submitButton.textContent = "Signing in...";
    }

    try {
      ensureSupabaseReady();

      const userRecord = await findUserByIdentifier(identifier);
      if (userRecord && String(userRecord.password || "") === password) {
        const user = buildLocalUser(userRecord, "user");
        setLocalSession(user.id, user);
        showMessage(getDesktopRedirectUrl() ? "Login successful. Returning to Altarix app." : "Login successful.", "success");
        if (completeDesktopRedirect(user.id)) {
          return;
        }
        window.location.href = buildAppUrl("profile.html");
        return;
      }

      const adminRecord = await findAdminByIdentifier(identifier);
      if (adminRecord && String(adminRecord.password || "") === password) {
        const admin = buildLocalUser(adminRecord, "admin");
        setLocalSession(admin.id, admin);
        showMessage(getDesktopRedirectUrl() ? "Login successful. Returning to Altarix app." : "Login successful.", "success");
        if (completeDesktopRedirect(admin.id)) {
          return;
        }
        window.location.href = buildAppUrl("admin.html");
        return;
      }

      throw new Error("Invalid email/username or password.");
    } catch (error) {
      console.log("Login error:", error);
      showMessage(error.message || "Login failed. Please try again.", "error");
    } finally {
      isSubmitting = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.defaultLabel || "Login";
      }
    }
  });
}

function setupSignup(buildAppUrl) {
  const form = document.getElementById("signupForm");
  if (!form) return;
  const submitButton = form.querySelector('button[type="submit"]');
  let isSubmitting = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || "").trim(),
      username: String(data.get("username") || "").trim(),
      email: normalizeEmail(data.get("email")),
      password: String(data.get("password") || ""),
      confirmPassword: String(data.get("confirmPassword") || "")
    };
    if (!payload.name || !payload.username || !payload.email) {
      showMessage("Name, username, and email are required.", "error");
      return;
    }
    if (!payload.password || !payload.confirmPassword) {
      showMessage("Password and confirm password are required.", "error");
      return;
    }
    if (payload.password !== payload.confirmPassword) {
      showMessage("Passwords do not match.", "error");
      return;
    }

    isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.defaultLabel = submitButton.textContent || "Create Account";
      submitButton.textContent = "Creating account...";
    }

    try {
      ensureSupabaseReady();
      if (!isValidEmail(payload.email)) {
        throw new Error("Please enter a valid email address.");
      }
      const passwordError = assertPassword(payload.password, payload.confirmPassword);
      if (passwordError) {
        throw new Error(passwordError);
      }

      const normalizedUsername = normalizeUsername(payload.username);
      const { data: existing, error: existingError } = await supabaseClient
        .from(USERDATA_TABLE)
        .select("id,email,username")
        .or(`email.ilike.${payload.email},username.ilike.${normalizedUsername}`)
        .limit(1);
      if (existingError) {
        throw existingError;
      }
      if (existing && existing.length) {
        const match = existing[0];
        const conflict = normalizeEmail(match.email) === payload.email ? "Email" : "Username";
        throw new Error(`${conflict} already exists.`);
      }

      const { data: inserted, error: insertError } = await supabaseClient
        .from(USERDATA_TABLE)
        .insert({
          name: payload.name,
          username: normalizedUsername,
          email: payload.email,
          password: payload.password
        })
        .select("*")
        .single();
      if (insertError) {
        throw insertError;
      }

      const user = buildLocalUser(inserted, "user");
      setLocalSession(user.id, user);
      showMessage(getDesktopRedirectUrl() ? "Account created. Returning to Altarix app." : "Account created and signed in.", "success");
      if (completeDesktopRedirect(user.id)) {
        return;
      }
      window.location.href = buildAppUrl("profile.html");
    } catch (error) {
      console.log("Signup error:", error);
      showMessage(error.message || "Signup failed. Please try again.", "error");
    } finally {
      isSubmitting = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.defaultLabel || "Create Account";
      }
    }
  });
}

function ensureSupabaseReady() {
  if (!supabaseClient) {
    throw new Error("Supabase library is not loaded.");
  }
  if (SUPABASE_URL === "SUPABASE_URL" || SUPABASE_ANON_KEY === "SUPABASE_ANON_KEY") {
    throw new Error("Please add your Supabase URL and anon key in assets/js/auth.js.");
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function assertPassword(password, confirmPassword = password) {
  if (String(password || "").length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }
  return "";
}

function getCurrentPage() {
  return document.body?.dataset?.page || "";
}

async function findUserByIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;
  const field = raw.includes("@") ? "email" : "username";
  const value = raw.includes("@") ? normalizeEmail(raw) : normalizeUsername(raw);

  const { data, error } = await supabaseClient
    .from(USERDATA_TABLE)
    .select("*")
    .ilike(field, value)
    .maybeSingle();

  if (error) {
    return null;
  }
  return data || null;
}

async function findAdminByIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw || raw.includes("@")) return null;
  const value = normalizeUsername(raw);
  if (!value) return null;

  const { data, error } = await supabaseClient
    .from(ADMINDATA_TABLE)
    .select("*")
    .ilike("admin_id", value)
    .maybeSingle();

  if (error) {
    return null;
  }
  return data || null;
}

function buildLocalUser(record, accountType) {
  if (!record) return null;
  if (accountType === "admin") {
    const adminId = record.admin_id || record.id || "admin";
    return {
      id: adminId,
      name: record.name || "Admin",
      username: record.admin_id || "admin",
      email: record.email || "",
      role: "admin",
      accountType: "admin",
      created_at: record.created_at || null
    };
  }

  return {
    id: record.id,
    name: record.name || "",
    username: record.username || "",
    email: record.email || "",
    role: "user",
    accountType: "user",
    created_at: record.created_at || null
  };
}

function setLocalSession(token, user) {
  if (window.AltarixWeb?.setSession) {
    window.AltarixWeb.setSession(token, user);
    return;
  }
  localStorage.setItem("Altarix_token", token || "");
  if (user) {
    localStorage.setItem("Altarix_user", JSON.stringify(user));
  }
}

function getLocalUser() {
  const raw = localStorage.getItem("Altarix_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function clearLocalSession() {
  if (window.AltarixWeb?.clearSession) {
    window.AltarixWeb.clearSession();
    return;
  }
  localStorage.removeItem("Altarix_token");
  localStorage.removeItem("Altarix_user");
}

async function checkExistingSession(page, buildAppUrl) {
  const user = window.AltarixWeb?.getUser?.() || getLocalUser();
  if (!user) return;

  if (page === "login" || page === "signup" || page === "forgot-password") {
    if (completeDesktopRedirect(user.id)) return;
    const target = user.accountType === "admin" ? "admin.html" : "profile.html";
    window.location.href = buildAppUrl(target);
  }
}

function showMessage(message, type = "info") {
  console.log(message);
  if (window.AltarixWeb?.showToast) {
    window.AltarixWeb.showToast(message, type);
    return;
  }

  const messageBox = document.createElement("div");
  messageBox.className = `toast toast-${type} show`;
  messageBox.textContent = message;
  document.body.appendChild(messageBox);
  setTimeout(() => messageBox.remove(), 2800);
}

function getDesktopRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  const rawRedirect = params.get("redirect") || "";
  if (!rawRedirect) return "";

  try {
    const url = new URL(rawRedirect);
    const loopbackHost = url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname === "::1"
      || url.hostname === "[::1]";
    if (url.protocol !== "http:" || !loopbackHost || url.pathname !== "/oauth-callback") {
      return "";
    }
    return url.toString();
  } catch (_error) {
    return "";
  }
}

function appendQuery(urlString, values) {
  const url = new URL(urlString, window.location.href);
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function completeDesktopRedirect(token) {
  const redirectUrl = getDesktopRedirectUrl();
  if (!redirectUrl || !token) {
    return false;
  }
  window.location.href = appendQuery(redirectUrl, { token });
  return true;
}

function withDesktopRedirect(url) {
  const redirectUrl = getDesktopRedirectUrl();
  if (!redirectUrl) {
    return url;
  }
  return appendQuery(url, { redirect: redirectUrl });
}

function preserveDesktopRedirectLinks(buildAppUrl) {
  const redirectUrl = getDesktopRedirectUrl();
  if (!redirectUrl) {
    return;
  }

  const authPages = new Set(["login.html", "signup.html", "forgot-password.html"]);
  document.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    let url;
    try {
      url = new URL(href, window.location.href);
    } catch (_error) {
      return;
    }

    const pageName = url.pathname.split("/").pop();
    if (!authPages.has(pageName)) {
      return;
    }

    link.href = withDesktopRedirect(buildAppUrl(pageName));
  });
}

function setupForgotPassword(buildAppUrl) {
  const form = document.getElementById("forgotForm");
  if (!form) return;
  const submitButton = form.querySelector('button[type="submit"]');
  let isSubmitting = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const data = new FormData(form);
    const email = normalizeEmail(data.get("email"));
    if (!email) {
      showMessage("Please enter your email.", "error");
      return;
    }
    const newPassword = String(data.get("newPassword") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");
    const passwordError = assertPassword(newPassword, confirmPassword);
    if (passwordError) {
      showMessage(passwordError, "error");
      return;
    }

    isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.defaultLabel = submitButton.textContent || "Reset Password";
      submitButton.textContent = "Sending reset link...";
    }

    try {
      ensureSupabaseReady();
      const { data: userRecord, error: userError } = await supabaseClient
        .from(USERDATA_TABLE)
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (userError || !userRecord?.id) {
        throw new Error("User not found for this email.");
      }

      const { error } = await supabaseClient
        .from(USERDATA_TABLE)
        .update({ password: newPassword })
        .eq("id", userRecord.id);
      if (error) {
        throw error;
      }

      showMessage("Password updated. Please login with your new password.", "success");
      form.reset();
      setTimeout(() => {
        window.location.href = buildAppUrl("login.html");
      }, 900);
    } catch (error) {
      showMessage(error.message || "Unable to update password.", "error");
    } finally {
      isSubmitting = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.defaultLabel || "Reset Password";
      }
    }
  });
}

async function logout(buildAppUrl) {
  clearLocalSession();
  if (buildAppUrl) {
    window.location.href = buildAppUrl("login.html");
  }
}

window.AltarixAuth = {
  logout
};

