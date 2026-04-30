const SUPABASE_URL = "https://tfdszotngmkrixzxhxgt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qKd2iPnUnFJDW1bDBU8M1A_7wzR7Iwb";
const USERDATA_TABLE = "userdata";

const supabaseClient = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

document.addEventListener("DOMContentLoaded", async () => {
  const user = await window.AltarixWeb.requireAuth();
  if (!user) return;

  renderProfile(user);
  bindForm(user);
});

function renderProfile(user) {
  const nameNode = document.querySelector("[data-profile-name]");
  const emailNode = document.querySelector("[data-profile-email]");
  const roleNode = document.querySelector("[data-profile-role]");
  const avatarNode = document.querySelector("[data-avatar]");

  if (nameNode) nameNode.textContent = user.name || "Altarix User";
  if (emailNode) emailNode.textContent = user.email || "--";
  if (roleNode) roleNode.textContent = `Role: ${user.role || "user"}`;
  if (avatarNode) {
    const initial = (user.name || user.email || "CU")
      .split(" ")
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
    avatarNode.textContent = initial || "CU";
  }

  const form = document.getElementById("profileForm");
  if (!form) return;
  form.elements.name.value = user.name || "";
  form.elements.username.value = user.username || "";
  if (user.accountType === "admin") {
    form.elements.username.setAttribute("readonly", "readonly");
  }
}

function bindForm(currentUser) {
  const form = document.getElementById("profileForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || "").trim(),
      username: String(data.get("username") || "").trim()
    };

    if (payload.name.length < 2) {
      window.AltarixWeb.showToast("Name must be at least 2 characters.", "error");
      return;
    }

    const normalizedUsername = normalizeUsername(payload.username);
    if (!normalizedUsername) {
      window.AltarixWeb.showToast("Username is required.", "error");
      return;
    }

    try {
      ensureSupabaseReady();

      let updatedUser = null;

      if (currentUser.accountType === "admin") {
        const { data: updated, error } = await supabaseClient
          .from("admindata")
          .update({ name: payload.name })
          .eq("admin_id", currentUser.id)
          .select("*")
          .single();
        if (error) {
          throw error;
        }
        updatedUser = {
          ...currentUser,
          name: updated.name || currentUser.name
        };
      } else {
        const { data: duplicate, error: duplicateError } = await supabaseClient
          .from(USERDATA_TABLE)
          .select("id")
          .ilike("username", normalizedUsername)
          .neq("id", currentUser.id)
          .maybeSingle();
        if (duplicateError) {
          throw duplicateError;
        }
        if (duplicate?.id) {
          throw new Error("Username already taken.");
        }

        const { data: updated, error } = await supabaseClient
          .from(USERDATA_TABLE)
          .update({ name: payload.name, username: normalizedUsername })
          .eq("id", currentUser.id)
          .select("*")
          .single();
        if (error) {
          throw error;
        }

        updatedUser = {
          ...currentUser,
          name: updated.name,
          username: updated.username
        };
      }

      const merged = updatedUser || currentUser;
      window.AltarixWeb.setUser(merged);
      renderProfile(merged);
      window.AltarixWeb.showToast("Profile updated.", "success");
    } catch (error) {
      window.AltarixWeb.showToast(error.message, "error");
    }
  });
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function ensureSupabaseReady() {
  if (!supabaseClient) {
    throw new Error("Supabase library is not loaded.");
  }
  if (SUPABASE_URL === "SUPABASE_URL" || SUPABASE_ANON_KEY === "SUPABASE_ANON_KEY") {
    throw new Error("Please add your Supabase URL and anon key in assets/js/profile.js.");
  }
}

