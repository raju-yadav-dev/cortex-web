const SUPABASE_URL = "https://tfdszotngmkrixzxhxgt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qKd2iPnUnFJDW1bDBU8M1A_7wzR7Iwb";
const USERDATA_TABLE = "userdata";
const ADMINDATA_TABLE = "admindata";

const supabaseClient = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let allUsers = [];

document.addEventListener("DOMContentLoaded", async () => {
  const user = window.CortexWeb?.getUser?.();

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  if (user.role !== "admin" || user.accountType !== "admin") {
    window.CortexWeb.showToast("Admin access required.", "error");
    window.location.href = "index.html";
    return;
  }

  bindSearch();
  await loadUsers();
});

async function loadUsers() {
  try {
    ensureSupabaseReady();

    const userResult = await supabaseClient
      .from(USERDATA_TABLE)
      .select("id, name, username, email, created_at")
      .order("created_at", { ascending: false });

    if (userResult.error) {
      throw userResult.error;
    }

    const adminResult = await supabaseClient
      .from(ADMINDATA_TABLE)
      .select("admin_id", { count: "exact" });

    if (adminResult.error) {
      throw adminResult.error;
    }

    allUsers = userResult.data || [];
    renderStats(allUsers, adminResult.count || 0);
    renderTable(allUsers);
  } catch (error) {
    console.log("Admin users load error:", error);
    window.CortexWeb.showToast(error.message || "Could not load users.", "error");
    setAdminLockedState(error.message || "Could not load users.");
  }
}

function renderStats(users, adminCount) {
  setText("statTotalUsers", users.length);
  setText("statAdminUsers", adminCount);
  setText("statNormalUsers", users.length);
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
        <td>${escapeHtml(shortId(user.id))}</td>
        <td>${escapeHtml(user.name || "--")}</td>
        <td>@${escapeHtml(user.username || "--")}</td>
        <td>${escapeHtml(user.email || "--")}</td>
        <td><span class="audit-status audit-status-success">user</span></td>
        <td>${window.CortexWeb.formatDate(user.created_at)}</td>
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
      const haystack = [item.id, item.name, item.username, item.email, "user"]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    renderTable(filtered);
  });
}

function setAdminLockedState(message) {
  setText("statTotalUsers", "--");
  setText("statAdminUsers", "--");
  setText("statNormalUsers", "--");

  const body = document.getElementById("userTableBody");
  if (body) {
    body.innerHTML = `
      <tr>
        <td colspan="6">${escapeHtml(message)}</td>
      </tr>
    `;
  }
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
