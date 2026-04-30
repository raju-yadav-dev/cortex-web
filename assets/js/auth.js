const SUPABASE_URL = "https://tfdszotngmkrixzxhxgt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qKd2iPnUnFJDW1bDBU8M1A_7wzR7Iwb";
const USER_PROFILES_TABLE = "user_profiles";

const supabaseClient = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

document.addEventListener("DOMContentLoaded", () => {
  bindPasswordVisibilityButtons();

  const buildAppUrl = resolveBuildAppUrl();
  preserveDesktopRedirectLinks(buildAppUrl);
  initAuthStateHandling(buildAppUrl);

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
      if (window.AltarixWeb?.api) {
        const response = await window.AltarixWeb.api(window.AltarixWeb.routes?.login || "/api/auth/login", {
          method: "POST",
          body: { identifier, password }
        });
        if (!response?.token || !response?.user) {
          throw new Error("Login failed. Please try again.");
        }
        setLocalSession(response.token, response.user);
        showMessage(getDesktopRedirectUrl() ? "Login successful. Returning to Altarix app." : "Login successful.", "success");
        if (completeDesktopRedirect(response.token)) {
          return;
        }
        window.location.href = buildAppUrl("profile.html");
        return;
      }

      ensureSupabaseReady();
      const email = await resolveIdentifierToEmail(identifier);
      if (!email) {
        throw new Error("Please enter a valid email address or username.");
      }

      const { data: authData, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      if (error) {
        throw error;
      }
      if (!authData?.session || !authData.user) {
        throw new Error("Login failed. Please try again.");
      }

      await syncSessionWithProfile(authData.session);
      showMessage(getDesktopRedirectUrl() ? "Login successful. Returning to Altarix app." : "Login successful.", "success");
      if (completeDesktopRedirect(authData.session.access_token)) {
        return;
      }
      window.location.href = buildAppUrl("profile.html");
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
      const { data: signUpData, error } = await supabaseClient.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
          data: {
            name: payload.name,
            username: normalizeUsername(payload.username)
          }
        }
      });
      if (error) {
        throw error;
      }

      if (signUpData?.session?.user) {
        await upsertUserProfile(signUpData.session.user, payload);
        await syncSessionWithProfile(signUpData.session);
        showMessage(getDesktopRedirectUrl() ? "Account created. Returning to Altarix app." : "Account created and signed in.", "success");
        if (completeDesktopRedirect(signUpData.session.access_token)) {
          return;
        }
        window.location.href = buildAppUrl("profile.html");
        return;
      }

      showMessage("Account created. Please check your email to confirm, then login.", "success");
      form.reset();
      setTimeout(() => {
        window.location.href = withDesktopRedirect(buildAppUrl("login.html"));
      }, 900);
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

function getCurrentPage() {
  return document.body?.dataset?.page || "";
}

async function resolveIdentifierToEmail(identifier) {
  const trimmed = String(identifier || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return normalizeEmail(trimmed);

  const username = normalizeUsername(trimmed);
  if (!username) return "";

  const { data, error } = await supabaseClient.rpc("get_email_for_username", {
    input_username: username
  });

  if (error || !data) {
    return "";
  }

  return normalizeEmail(data);
}

async function fetchUserProfile(userId) {
  const { data, error } = await supabaseClient
    .from(USER_PROFILES_TABLE)
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data || null;
}

async function upsertUserProfile(user, payload) {
  const profile = {
    id: user.id,
    name: String(payload.name || "").trim(),
    username: normalizeUsername(payload.username),
    email: normalizeEmail(payload.email),
    role: "user",
    bio: ""
  };

  const { error } = await supabaseClient
    .from(USER_PROFILES_TABLE)
    .upsert(profile, { onConflict: "id" });

  if (error) {
    console.warn("Profile upsert failed:", error.message || error);
  }
}

function buildUserPayload(authUser, profile) {
  if (!authUser) return null;
  const safeProfile = profile || {};
  return {
    id: authUser.id,
    email: authUser.email || safeProfile.email || "",
    name: safeProfile.name || authUser.user_metadata?.name || "",
    username: safeProfile.username || authUser.user_metadata?.username || "",
    role: safeProfile.role || "user",
    bio: safeProfile.bio || "",
    created_at: safeProfile.created_at,
    updated_at: safeProfile.updated_at
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

function clearLocalSession() {
  if (window.AltarixWeb?.clearSession) {
    window.AltarixWeb.clearSession();
    return;
  }
  localStorage.removeItem("Altarix_token");
  localStorage.removeItem("Altarix_user");
}

async function syncSessionWithProfile(session) {
  if (!session?.user) return null;
  let profile = null;
  try {
    profile = await fetchUserProfile(session.user.id);
  } catch (error) {
    console.warn("Profile fetch failed:", error.message || error);
  }
  const user = buildUserPayload(session.user, profile);
  setLocalSession(session.access_token, user);
  return user;
}

async function checkExistingSession(page, buildAppUrl) {
  try {
    ensureSupabaseReady();
  } catch (error) {
    showMessage(error.message, "error");
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  const session = data?.session;
  if (!session?.user) return;

  await syncSessionWithProfile(session);
  if (page === "login" || page === "signup") {
    if (completeDesktopRedirect(session.access_token)) return;
    window.location.href = buildAppUrl("profile.html");
  }
}

function initAuthStateHandling(buildAppUrl) {
  try {
    ensureSupabaseReady();
  } catch (_error) {
    return;
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT" || !session) {
      clearLocalSession();
      return;
    }
    await syncSessionWithProfile(session);
    if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
      && (getCurrentPage() === "login" || getCurrentPage() === "signup")) {
      if (completeDesktopRedirect(session.access_token)) return;
      window.location.href = buildAppUrl("profile.html");
    }
  });
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

    isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.defaultLabel = submitButton.textContent || "Reset Password";
      submitButton.textContent = "Sending reset link...";
    }

    try {
      ensureSupabaseReady();
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: buildAppUrl("login.html")
      });
      if (error) {
        throw error;
      }
      showMessage("Password reset email sent. Please check your inbox.", "success");
      form.reset();
    } catch (error) {
      showMessage(error.message || "Unable to send reset email.", "error");
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
  try {
    ensureSupabaseReady();
    await supabaseClient.auth.signOut();
  } catch (_error) {
    // Ignore sign-out errors to allow local logout fallback.
  }
  clearLocalSession();
  if (buildAppUrl) {
    window.location.href = buildAppUrl("login.html");
  }
}

window.AltarixAuth = {
  logout
};

