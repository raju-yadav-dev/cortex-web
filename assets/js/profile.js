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
  form.elements.bio.value = user.bio || "";
}

function bindForm(currentUser) {
  const form = document.getElementById("profileForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || "").trim(),
      username: String(data.get("username") || "").trim(),
      bio: String(data.get("bio") || "").trim()
    };

    try {
      const response = await window.AltarixWeb.api("/api/profile", {
        method: "PATCH",
        body: payload
      });
      const merged = { ...currentUser, ...response.user };
      window.AltarixWeb.setUser(merged);
      renderProfile(merged);
      window.AltarixWeb.showToast("Profile updated.", "success");
    } catch (error) {
      window.AltarixWeb.showToast(error.message, "error");
    }
  });
}

