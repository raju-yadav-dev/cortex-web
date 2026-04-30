const SUPABASE_URL = "https://tfdszotngmkrixzxhxgt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qKd2iPnUnFJDW1bDBU8M1A_7wzR7Iwb";
const USERDATA_TABLE = "userdata";
const RECENT_DAYS = 7;

const supabaseClient = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let allUsers = [];

document.addEventListener("DOMContentLoaded", async () => {
  const user = window.AltarixWeb?.getUser?.();
  const buildAppUrl = window.AltarixWeb?.buildAppUrl || ((path) => path);

  if (!user) {
    window.location.href = buildAppUrl("login.html");
    return;
  }

  if (user.role !== "admin" || user.accountType !== "admin") {
    window.AltarixWeb.showToast("Admin access required.", "error");
    window.location.href = buildAppUrl("index.html");
    return;
  }

  bindSearch();
  bindActions();
  await loadUsers();
});

async function loadUsers() {
  try {
    ensureSupabaseReady();

    const userResult = await supabaseClient
      .from(USERDATA_TABLE)
      .select("id, name, username, email, ban, created_at")
      .order("created_at", { ascending: false });

    if (userResult.error) {
      throw userResult.error;
    }

    allUsers = userResult.data || [];
    renderStats(allUsers);
    renderRecentUsers(allUsers);
    renderTable(allUsers);
  } catch (error) {
    console.log("Admin users load error:", error);
    window.AltarixWeb.showToast(error.message || "Could not load users.", "error");
    setAdminLockedState(error.message || "Could not load users.");
  }
}

function renderStats(users) {
  const bannedCount = users.filter((user) => Boolean(user.ban)).length;
  const recentCount = getRecentUsers(users).length;
  setText("statTotalUsers", users.length);
  setText("statBannedUsers", bannedCount);
  setText("statRecentUsers", recentCount);
}

function renderRecentUsers(users) {
  const host = document.getElementById("recentUsersList");
  if (!host) return;

  const recent = getRecentUsers(users).slice(0, 6);
  if (!recent.length) {
    host.innerHTML = "<p class=\"admin-note\">No new users in the last 7 days.</p>";
    return;
  }

  host.innerHTML = recent
    .map((user) => (
      `
        <div class="admin-user-chip">
          <span class="admin-user-dot"></span>
          <div>
            <strong>${escapeHtml(user.name || "--")}</strong>
            <small>@${escapeHtml(user.username || "--")} - ${escapeHtml(user.email || "--")}</small>
          </div>
          <span class="pill">${window.AltarixWeb.formatDate(user.created_at)}</span>
        </div>
      `
    ))
    .join("");
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
        <td>${window.AltarixWeb.formatDate(user.created_at)}</td>
        <td>
          <span class="audit-status ${user.ban ? "audit-status-failed" : "audit-status-success"}">
            ${user.ban ? "Banned" : "Active"}
          </span>
        </td>
        <td class="table-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="${user.ban ? "unban" : "ban"}" data-user-id="${escapeHtml(user.id)}">
            ${user.ban ? "Unban" : "Ban"}
          </button>
          <button class="btn btn-danger btn-sm" type="button" data-action="delete" data-user-id="${escapeHtml(user.id)}">
            Delete
          </button>
        </td>
      </tr>
    `
    )
    .join("");
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
      const haystack = [item.id, item.name, item.username, item.email, item.ban ? "banned" : "active"]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    renderTable(filtered);
  });
}

function setAdminLockedState(message) {
  setText("statTotalUsers", "--");
  setText("statBannedUsers", "--");
  setText("statRecentUsers", "--");

  const body = document.getElementById("userTableBody");
  if (body) {
    body.innerHTML = `
      <tr>
        <td colspan="6">${escapeHtml(message)}</td>
      </tr>
    `;
  }
}

function bindActions() {
  const body = document.getElementById("userTableBody");
  if (!body) return;

  body.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const userId = button.dataset.userId;
    if (!userId) return;

    if (action === "delete") {
      const confirmDelete = window.confirm("Delete this user? This cannot be undone.");
      if (!confirmDelete) return;
    }

    button.disabled = true;
    try {
      ensureSupabaseReady();
      if (action === "ban") {
        await updateUserBan(userId, true);
      } else if (action === "unban") {
        await updateUserBan(userId, false);
      } else if (action === "delete") {
        await deleteUser(userId);
      }
    } catch (error) {
      window.AltarixWeb.showToast(error.message || "Action failed.", "error");
    } finally {
      button.disabled = false;
    }
  });
}

async function updateUserBan(userId, value) {
  const { error } = await supabaseClient
    .from(USERDATA_TABLE)
    .update({ ban: value })
    .eq("id", userId);
  if (error) {
    throw error;
  }

  allUsers = allUsers.map((user) => (user.id === userId ? { ...user, ban: value } : user));
  renderStats(allUsers);
  renderRecentUsers(allUsers);
  renderTable(allUsers);
  window.AltarixWeb.showToast(value ? "User banned." : "User unbanned.", "success");
}

async function deleteUser(userId) {
  const { error } = await supabaseClient
    .from(USERDATA_TABLE)
    .delete()
    .eq("id", userId);
  if (error) {
    throw error;
  }

  allUsers = allUsers.filter((user) => user.id !== userId);
  renderStats(allUsers);
  renderRecentUsers(allUsers);
  renderTable(allUsers);
  window.AltarixWeb.showToast("User deleted.", "success");
}

function getRecentUsers(users) {
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  return users.filter((user) => {
    const createdAt = Date.parse(user.created_at || "");
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
}


function ensureSupabaseReady() {
  if (!supabaseClient) {
    throw new Error("Supabase library is not loaded.");
  }
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = String(value);
  }
}

function shortId(id) {
  const value = String(id || "--");
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

