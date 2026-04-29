const SUPABASE_URL = "https://tfdszotngmkrixzxhxgt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qKd2iPnUnFJDW1bDBU8M1A_7wzR7Iwb";
const USERDATA_TABLE = "userdata";
const ADMINDATA_TABLE = "admindata";

const supabaseClient = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

document.addEventListener("DOMContentLoaded", () => {
  bindPasswordVisibilityButtons();

  const buildAppUrl = window.AltarixWeb?.buildAppUrl || ((path) => path);
  preserveDesktopRedirectLinks(buildAppUrl);

  const page = document.body.dataset.page || "";
  if (page === "login") {
    setupLogin();
  }
  if (page === "signup") {
    setupSignup();
  }
  if (page === "forgot-password") {
    setupForgotPassword();
  }
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

function setupLogin() {
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
      showMessage("Email/username and password are required.", "error");
      return;
    }

    isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.defaultLabel = submitButton.textContent || "Login";
      submitButton.textContent = "Signing in...";
    }

    try {
      // Use server API to authenticate and receive a real token + user
      const route = window.AltarixWeb?.routes?.login || "/api/auth/login";
      const payload = await window.AltarixWeb.api(route, {
        method: "POST",
        body: { identifier, password }
      });

      if (!payload || !payload.token || !payload.user) {
        throw new Error(payload?.error || "Invalid login response.");
      }

      // Persist real session and redirect
      window.AltarixWeb.setSession(payload.token, payload.user);
      showMessage(getDesktopRedirectUrl() ? "Login successful. Returning to Altarix app." : "Login successful.", "success");
      if (completeDesktopRedirect(payload.token)) {
        return;
      }
      window.location.href = payload.user.role === "admin"
        ? buildAppUrl("admin.html")
        : buildAppUrl("index.html");
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

function setupSignup() {
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
      email: String(data.get("email") || "").trim(),
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
      // Use server API signup flow so server issues proper tokens and profile
      const route = window.AltarixWeb?.routes?.signup || "/api/auth/signup";
      const result = await window.AltarixWeb.api(route, {
        method: "POST",
        body: payload
      });

      // Server may return token+user or simply a success message. If token present, set session.
      if (result?.token && result?.user) {
        window.AltarixWeb.setSession(result.token, result.user);
        showMessage(getDesktopRedirectUrl() ? "Account created. Returning to Altarix app." : "Account created and signed in.", "success");
        if (completeDesktopRedirect(result.token)) {
          return;
        }
        setTimeout(() => { window.location.href = buildAppUrl("index.html"); }, 600);
        return;
      }

      showMessage("Account created successfully. Please login.", "success");
      form.reset();
      setTimeout(() => {
        window.location.href = withDesktopRedirect(buildAppUrl("login.html"));
      }, 800);
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

async function getLoginAccount(identifier, password) {
  const admin = await getAdminById(identifier);
  if (admin && admin.password === password) {
    return admin;
  }

  const user = await getUserByIdentifier(identifier);
  if (user && user.password === password) {
    return user;
  }

  return null;
}

async function getUserByIdentifier(identifier) {
  const user = await findRecordByIdentifier(USERDATA_TABLE, identifier);
  if (user) {
    return { ...user, role: "user", accountType: "user" };
  }

  return null;
}

async function getAdminById(adminId) {
  const adminResult = await supabaseClient
    .from(ADMINDATA_TABLE)
    .select("*")
    .eq("admin_id", adminId)
    .maybeSingle();

  if (adminResult.error) {
    throw adminResult.error;
  }
  if (!adminResult.data) {
    return null;
  }

  return { ...adminResult.data, role: "admin", accountType: "admin" };
}

async function findRecordByIdentifier(tableName, identifier) {
  const emailResult = await supabaseClient
    .from(tableName)
    .select("*")
    .eq("email", identifier)
    .maybeSingle();

  if (emailResult.error) {
    throw emailResult.error;
  }
  if (emailResult.data) {
    return emailResult.data;
  }

  const usernameResult = await supabaseClient
    .from(tableName)
    .select("*")
    .eq("username", identifier)
    .maybeSingle();

  if (usernameResult.error) {
    throw usernameResult.error;
  }

  return usernameResult.data;
}

function removePassword(user) {
  const safeUser = { ...user };
  delete safeUser.password;
  return safeUser;
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

function setupForgotPassword() {
  const form = document.getElementById("forgotForm");
  if (!form) return;
  const forgotRoute = window.AltarixWeb?.routes?.forgotPassword || "/api/auth/forgot-password";
  const submitButton = form.querySelector('button[type="submit"]');
  let isSubmitting = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const data = new FormData(form);
    const payload = {
      email: String(data.get("email") || "").trim(),
      newPassword: String(data.get("newPassword") || ""),
      confirmPassword: String(data.get("confirmPassword") || "")
    };
    if (!payload.email || !payload.newPassword || !payload.confirmPassword) {
      window.AltarixWeb.showToast("Please fill all required fields.", "error");
      return;
    }

    isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.defaultLabel = submitButton.textContent || "Reset Password";
      submitButton.textContent = "Updating password...";
    }

    try {
      await window.AltarixWeb.api(forgotRoute, {
        method: "POST",
        body: payload
      });
      window.AltarixWeb.showToast("Password updated. Please login.", "success");
      form.reset();
      setTimeout(() => {
        window.location.href = (window.AltarixWeb?.buildAppUrl || ((path) => path))("login.html");
      }, 600);
    } catch (error) {
      window.AltarixWeb.showToast(error.message, "error");
    } finally {
      isSubmitting = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.defaultLabel || "Reset Password";
      }
    }
  });
}

