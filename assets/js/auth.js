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
  const loginRoute = window.CortexWeb?.routes?.login || "/api/auth/login";
  const submitButton = form.querySelector('button[type="submit"]');
  let isSubmitting = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const data = new FormData(form);
    const identifier = String(data.get("identifier") || "").trim();
    const password = String(data.get("password") || "");
    if (!identifier || !password) {
      window.CortexWeb.showToast("Email/username and password are required.", "error");
      return;
    }

    isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.defaultLabel = submitButton.textContent || "Login";
      submitButton.textContent = "Signing in...";
    }

    try {
      const payload = await window.CortexWeb.api(loginRoute, {
        method: "POST",
        body: { identifier, password }
      });
      window.CortexWeb.setSession(payload.token, payload.user);
      window.CortexWeb.showToast("Login successful.", "success");
      window.location.href = payload.user.role === "admin" ? "admin.html" : "profile.html";
    } catch (error) {
      window.CortexWeb.showToast(error.message, "error");
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
  const signupRoute = window.CortexWeb?.routes?.signup || "/api/auth/signup";
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
      window.CortexWeb.showToast("Name, username, and email are required.", "error");
      return;
    }

    isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.defaultLabel = submitButton.textContent || "Create Account";
      submitButton.textContent = "Creating account...";
    }

    try {
      const result = await window.CortexWeb.api(signupRoute, {
        method: "POST",
        body: payload
      });
      window.CortexWeb.setSession(result.token, result.user);
      window.CortexWeb.showToast("Account created.", "success");
      window.location.href = "profile.html";
    } catch (error) {
      window.CortexWeb.showToast(error.message, "error");
    } finally {
      isSubmitting = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.defaultLabel || "Create Account";
      }
    }
  });
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
