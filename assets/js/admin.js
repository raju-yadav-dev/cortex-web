let allUsers = [];

document.addEventListener("DOMContentLoaded", async () => {
  const user = await resolveAdminUserNoRedirect();
  if (user && user.role === "admin") {
    await loadUsers();
  } else {
    setAdminLockedState("Admin panel is locked. Login as admin to access users.");
  }
  bindSearch();
});

async function resolveAdminUserNoRedirect() {
  const cached = window.CortexWeb.getUser();
  if (cached && cached.role === "admin") return cached;
  if (!window.CortexWeb.getToken()) return null;

  try {
    const refreshed = await window.CortexWeb.refreshUser();
    return refreshed && refreshed.role === "admin" ? refreshed : null;
  } catch (_error) {
    return null;
  }
}

function setAdminLockedState(message) {
  const totalNode = document.getElementById("statTotalUsers");
  const adminNode = document.getElementById("statAdminUsers");
  const userNode = document.getElementById("statNormalUsers");
  if (totalNode) totalNode.textContent = "--";
  if (adminNode) adminNode.textContent = "--";
  if (userNode) userNode.textContent = "--";

  const body = document.getElementById("userTableBody");
  if (body) {
    body.innerHTML = `
      <tr>
        <td colspan="6">${escapeHtml(message)}</td>
      </tr>
    `;
  }

  const search = document.getElementById("userSearch");
  if (search) search.disabled = true;
}

async function loadUsers() {
  try {
    const payload = await window.CortexWeb.api("/api/admin/users", { method: "GET" });
    allUsers = payload?.users || [];
    renderStats(allUsers);
    renderTable(allUsers);
  } catch (error) {
    window.CortexWeb.showToast(error.message, "error");
    setAdminLockedState(error.message);
  }
}

function renderStats(users) {
  const total = users.length;
  const admins = users.filter((item) => item.role === "admin").length;
  const members = total - admins;

  const totalNode = document.getElementById("statTotalUsers");
  const adminNode = document.getElementById("statAdminUsers");
  const userNode = document.getElementById("statNormalUsers");
  if (totalNode) totalNode.textContent = String(total);
  if (adminNode) adminNode.textContent = String(admins);
  if (userNode) userNode.textContent = String(members);
}

function renderTable(users) {
  const body = document.getElementById("userTableBody");
  if (!body) return;

  if (!users.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6">No users found.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = users
    .map(
      (user) => `
      <tr>
        <td>${escapeHtml(user.name || "--")}</td>
        <td>@${escapeHtml(user.username || "--")}</td>
        <td>${escapeHtml(user.email || "--")}</td>
        <td>
          <select data-role-select data-user-id="${user.id}">
            <option value="user" ${user.role === "user" ? "selected" : ""}>user</option>
            <option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option>
          </select>
        </td>
        <td>${window.CortexWeb.formatDate(user.createdAt)}</td>
        <td>${window.CortexWeb.formatDate(user.lastLoginAt)}</td>
      </tr>
    `
    )
    .join("");

  body.querySelectorAll("[data-role-select]").forEach((select) => {
    select.addEventListener("change", async (event) => {
      const target = event.currentTarget;
      const userId = target.getAttribute("data-user-id");
      const role = target.value;
      try {
        await window.CortexWeb.api(`/api/admin/users/${encodeURIComponent(userId)}`, {
          method: "PATCH",
          body: { role }
        });
        const localUser = allUsers.find((item) => item.id === userId);
        if (localUser) {
          localUser.role = role;
          renderStats(allUsers);
        }
        window.CortexWeb.showToast(`Role updated to ${role}.`, "success");
      } catch (error) {
        window.CortexWeb.showToast(error.message, "error");
        await loadUsers();
      }
    });
  });
}

function bindSearch() {
  const search = document.getElementById("userSearch");
  if (!search) return;
  search.addEventListener("input", () => {
    const query = String(search.value || "").trim().toLowerCase();
    if (!query) {
      renderTable(allUsers);
      return;
    }
    const filtered = allUsers.filter((item) => {
      const haystack = [item.name, item.username, item.email, item.role].join(" ").toLowerCase();
      return haystack.includes(query);
    });
    renderTable(filtered);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
