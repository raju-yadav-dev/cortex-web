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
      ensureSupabaseReady();

      const user = await getLoginAccount(identifier);

      if (!user || user.password !== password) {
        throw new Error("Invalid login ID or password.");
      }

      const safeUser = removePassword(user);
      localStorage.setItem("cortex_user", JSON.stringify(safeUser));
      localStorage.setItem("cortex_token", "supabase-table-login");
      showMessage("Login successful.", "success");
      window.location.href = safeUser.accountType === "admin" ? "admin.html" : "index.html";
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
      ensureSupabaseReady();

      const { error } = await supabaseClient.from(USERDATA_TABLE).insert([
        {
          name: payload.name,
          username: payload.username,
          email: payload.email,
          password: payload.password
        }
      ]);

      if (error) {
        throw error;
      }

      showMessage("Account created successfully. Please login.", "success");
      form.reset();
      setTimeout(() => {
        window.location.href = "login.html";
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

async function getLoginAccount(identifier) {
  const admin = await getAdminById(identifier);
  if (admin) {
    return admin;
  }
  return getUserByIdentifier(identifier);
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
  if (window.CortexWeb?.showToast) {
    window.CortexWeb.showToast(message, type);
    return;
  }

  const messageBox = document.createElement("div");
  messageBox.className = `toast toast-${type} show`;
  messageBox.textContent = message;
  document.body.appendChild(messageBox);
  setTimeout(() => messageBox.remove(), 2800);
}

function setupForgotPassword() {
  const form = document.getElementById("forgotForm");
  if (!form) return;
  const forgotRoute = window.CortexWeb?.routes?.forgotPassword || "/api/auth/forgot-password";
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
      window.CortexWeb.showToast("Please fill all required fields.", "error");
      return;
    }

    isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.defaultLabel = submitButton.textContent || "Reset Password";
      submitButton.textContent = "Updating password...";
    }

    try {
      await window.CortexWeb.api(forgotRoute, {
        method: "POST",
        body: payload
      });
      window.CortexWeb.showToast("Password updated. Please login.", "success");
      form.reset();
      setTimeout(() => {
        window.location.href = "login.html";
      }, 600);
    } catch (error) {
      window.CortexWeb.showToast(error.message, "error");
    } finally {
      isSubmitting = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.defaultLabel || "Reset Password";
      }
    }
  });
}
