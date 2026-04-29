(() => {
  const TOKEN_KEY = "Altarix_token";
  const USER_KEY = "Altarix_user";
  const API_ROUTES = Object.freeze({
    login: "/api/auth/login",
    signup: "/api/auth/signup",
    forgotPassword: "/api/auth/forgot-password",
    me: "/api/auth/me",
    logout: "/api/auth/logout",
    profile: "/api/profile",
    adminUsers: "/api/admin/users"
  });
  const THEME_KEY = "Altarix_theme";
  const DARK_THEME = "dark";
  const LIGHT_THEME = "light";
  const DEFAULT_THEME = "dark";
  const APP_BASE_URL = "https://altarix.vercel.app";

  function buildAppUrl(path) {
    const trimmed = String(path || "").replace(/^\/+/, "");
    return `${APP_BASE_URL}/${trimmed}`;
  }

  function resolveApiUrl(path) {
    const value = String(path || "");
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    if (!value.startsWith("/api/")) {
      return value;
    }

    const localPreview = window.location.protocol === "file:"
      || window.location.hostname === "localhost"
      || window.location.hostname === "127.0.0.1";

    return localPreview ? `${APP_BASE_URL}${value}` : value;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function setUser(user) {
    if (!user) return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    renderAuthSlots();
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    renderAuthSlots();
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    renderAuthSlots();
  }

  function resolveTheme(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (
      normalized === LIGHT_THEME ||
      normalized === "light-mist" ||
      normalized === "light-sand" ||
      normalized === "light-sky"
    ) {
      return LIGHT_THEME;
    }
    return DARK_THEME;
  }

  function getStoredTheme() {
    return resolveTheme(localStorage.getItem(THEME_KEY));
  }

  function applyTheme(themeValue) {
    const theme = resolveTheme(themeValue);
    document.body.setAttribute("data-theme", theme);
    return theme;
  }

  function updateThemeToggleState(button, themeValue) {
    if (!button) return;
    const isLight = themeValue === LIGHT_THEME;
    button.classList.toggle("is-light", isLight);
    button.setAttribute(
      "aria-label",
      isLight ? "Switch to dark theme" : "Switch to light theme"
    );
    button.setAttribute("title", isLight ? "Dark theme" : "Light theme");
  }

  function initThemeControl() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    let host = header.querySelector(".theme-switcher");
    if (!host) {
      host = document.createElement("div");
      host.className = "theme-switcher";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-toggle";
      button.innerHTML = `
        <span class="theme-toggle-icon theme-toggle-icon-sun" aria-hidden="true"></span>
        <span class="theme-toggle-icon theme-toggle-icon-moon" aria-hidden="true"></span>
      `;
      button.addEventListener("click", () => {
        const current = getStoredTheme();
        const next = current === LIGHT_THEME ? DARK_THEME : LIGHT_THEME;
        const selected = applyTheme(next);
        localStorage.setItem(THEME_KEY, selected);
        updateThemeToggleState(button, selected);
      });

      host.appendChild(button);

      const authSlot = header.querySelector("[data-auth-slot]");
      if (authSlot) {
        header.insertBefore(host, authSlot);
      } else {
        header.appendChild(host);
      }
    }

    const button = host.querySelector(".theme-toggle");
    if (button) {
      updateThemeToggleState(button, getStoredTheme());
    }
  }

  async function api(path, options = {}) {
    const request = { ...options };
    const headers = { Accept: "application/json", ...(request.headers || {}) };
    if (request.body && !(request.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      if (typeof request.body !== "string") {
        request.body = JSON.stringify(request.body);
      }
    }
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const parseResponse = async (response) => {
      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (_error) {
          payload = null;
        }
      }
      return { response, payload };
    };

    const parsed = await parseResponse(await fetch(resolveApiUrl(path), { ...request, headers }));

    if (!parsed.response.ok) {
      const message = parsed.payload?.error || `Request failed (${parsed.response.status})`;
      const error = new Error(message);
      error.status = parsed.response.status;
      error.payload = parsed.payload;
      throw error;
    }
    return parsed.payload;
  }

  function showToast(message, type = "info") {
    let host = document.querySelector(".toast-stack");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-stack";
      document.body.appendChild(host);
    }
    const item = document.createElement("div");
    item.className = `toast toast-${type}`;
    item.textContent = message;
    host.appendChild(item);
    requestAnimationFrame(() => item.classList.add("show"));
    setTimeout(() => {
      item.classList.remove("show");
      setTimeout(() => item.remove(), 220);
    }, 2600);
  }

  function formatDate(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString();
  }

  function formatBytes(size) {
    if (!Number.isFinite(size) || size <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = size;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  async function refreshUser() {
    if (!getToken()) return null;
    try {
      const data = await api(API_ROUTES.me, { method: "GET" });
      if (data?.user) {
        setUser(data.user);
        return data.user;
      }
      return null;
    } catch (_error) {
      clearSession();
      return null;
    }
  }

  async function requireAuth({ adminOnly = false, redirect = buildAppUrl("login.html") } = {}) {
    let user = getUser();
    if (!user && getToken()) {
      user = await refreshUser();
    }
    if (!user) {
      window.location.href = redirect;
      return null;
    }
    if (adminOnly && user.role !== "admin") {
      showToast("Admin access required.", "error");
      window.location.href = buildAppUrl("profile.html");
      return null;
    }
    return user;
  }

  function renderAuthSlots() {
    const slots = document.querySelectorAll("[data-auth-slot]");
    const user = getUser();
    const label = "Profile";
    const initial = "P";
    slots.forEach((slot) => {
      slot.innerHTML = "";
      if (user) {
        slot.appendChild(createProfileChip({
          href: buildAppUrl("profile.html"),
          label: "Open profile",
          initial,
          name: label
        }));
      }
    });
    renderAuthMenu(user);
    updateHomeCta(user);
  }

  function createProfileChip({ href, label, initial, name }) {
    const link = document.createElement("a");
    link.className = "profile-chip";
    link.href = href;
    link.setAttribute("aria-label", label);

    const avatar = document.createElement("span");
    avatar.className = "profile-avatar";
    avatar.textContent = initial;

    const nameNode = document.createElement("span");
    nameNode.className = "profile-name";
    nameNode.textContent = name;

    link.appendChild(avatar);
    link.appendChild(nameNode);
    return link;
  }

  function renderAuthMenu(user) {
    const menu = document.querySelector("[data-nav-menu]");
    if (!menu) return;
    menu.querySelectorAll("[data-auth-menu]").forEach((node) => node.remove());

    if (user) {
      const profileLink = document.createElement("a");
      profileLink.className = "nav-auth-link";
      profileLink.href = buildAppUrl("profile.html");
      profileLink.dataset.authMenu = "true";
      profileLink.textContent = "Profile";
      menu.appendChild(profileLink);
      return;
    }

    const loginLink = document.createElement("a");
    loginLink.className = "nav-auth-link";
    loginLink.href = buildAppUrl("login.html");
    loginLink.dataset.authMenu = "true";
    loginLink.textContent = "Login";
    menu.appendChild(loginLink);

    const signupLink = document.createElement("a");
    signupLink.className = "nav-auth-link";
    signupLink.href = buildAppUrl("signup.html");
    signupLink.dataset.authMenu = "true";
    signupLink.textContent = "Sign Up";
    menu.appendChild(signupLink);
  }

  function updateHomeCta(user = getUser()) {
    const homeCta = document.querySelector("[data-home-cta]");
    if (!homeCta) return;

    const title = homeCta.querySelector("[data-home-cta-title]");
    const copy = homeCta.querySelector("[data-home-cta-copy]");
    const actions = homeCta.querySelector("[data-home-cta-actions]");

    if (!title || !copy || !actions) return;

    if (!user) {
      title.textContent = "Ready to start with Altarix?";
      copy.textContent = "Create your account, log in, and manage your profile.";
      actions.innerHTML = `
        <a class="btn btn-primary" href="${buildAppUrl("login.html")}">Login</a>
        <a class="btn btn-ghost" href="${buildAppUrl("signup.html")}">Sign Up</a>
      `;
      return;
    }

    title.textContent = `Welcome back, ${user.name || "Altarix user"}.`;
    copy.textContent = "Open your profile and keep your account up to date.";
    actions.innerHTML = `
      <a class="btn btn-primary" href="${buildAppUrl("profile.html")}">Go to Profile</a>
      <button class="btn btn-ghost" type="button" data-logout-btn>Logout</button>
    `;
  }

  function bindMenuToggle() {
    const toggle = document.querySelector("[data-menu-toggle]");
    const menu = document.querySelector("[data-nav-menu]");
    if (!toggle || !menu) return;

    const setMenuState = (open) => {
      menu.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };

    setMenuState(false);

    toggle.addEventListener("click", () => {
      const isOpen = menu.classList.contains("is-open");
      setMenuState(!isOpen);
    });

    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        setMenuState(false);
      }
    });

    document.addEventListener("click", (event) => {
      if (!menu.classList.contains("is-open")) return;
      const clickedToggle = event.target.closest("[data-menu-toggle]");
      const clickedMenu = event.target.closest("[data-nav-menu]");
      if (clickedToggle || clickedMenu) return;
      setMenuState(false);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) {
        setMenuState(false);
      }
    });
  }

  function bindLogout() {
    document.addEventListener("click", async (event) => {
      const target = event.target.closest("[data-logout-btn]");
      if (!target) return;
      try {
        await api(API_ROUTES.logout, { method: "POST" });
      } catch (_error) {
        // Intentionally ignored to allow local logout fallback.
      }
      clearSession();
      showToast("Logged out.", "info");
      window.location.href = buildAppUrl("login.html");
    });
  }

  function initSectionNavHighlight() {
    const navLinks = Array.from(document.querySelectorAll(".site-nav a[href^='#']"));
    if (!navLinks.length) return;

    const sectionPairs = navLinks
      .map((link) => {
        const target = String(link.getAttribute("href") || "").trim();
        if (!target.startsWith("#")) return null;
        const section = document.getElementById(target.slice(1));
        if (!section) return null;
        return { link, section };
      })
      .filter(Boolean);

    if (!sectionPairs.length) return;

    const linkBySectionId = new Map(
      sectionPairs.map((pair) => [pair.section.id, pair.link])
    );
    const visibleSections = new Map();

    const setActiveLink = (activeLink) => {
      navLinks.forEach((link) => {
        const isActive = link === activeLink;
        link.classList.toggle("is-active", isActive);
        if (isActive) {
          link.setAttribute("aria-current", "true");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    };

    const applyScrollFallback = () => {
      if (visibleSections.size) return;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      let candidate = sectionPairs[0];
      sectionPairs.forEach((pair) => {
        if (scrollTop + 160 >= pair.section.offsetTop) {
          candidate = pair;
        }
      });
      setActiveLink(candidate.link);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const sectionId = entry.target.id;
          if (entry.isIntersecting) {
            visibleSections.set(sectionId, entry.intersectionRatio);
          } else {
            visibleSections.delete(sectionId);
          }
        });

        if (visibleSections.size) {
          let bestId = "";
          let bestRatio = -1;
          visibleSections.forEach((ratio, id) => {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestId = id;
            }
          });
          if (bestId && linkBySectionId.has(bestId)) {
            setActiveLink(linkBySectionId.get(bestId));
            return;
          }
        }

        applyScrollFallback();
      },
      {
        threshold: [0.15, 0.3, 0.45, 0.6],
        rootMargin: "-34% 0px -52% 0px"
      }
    );

    sectionPairs.forEach((pair) => observer.observe(pair.section));
    window.addEventListener("scroll", applyScrollFallback, { passive: true });
    window.addEventListener("hashchange", applyScrollFallback);
    applyScrollFallback();
  }

  function setupReveals() {
    const nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    nodes.forEach((node) => observer.observe(node));
  }

  function setFooterYear() {
    document.querySelectorAll("[data-year]").forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function initScrollProgressBar() {
    const bar = document.querySelector("[data-scroll-progress]");
    if (!bar) return;

    const update = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollHeight > 0 ? Math.min(1, Math.max(0, scrollTop / scrollHeight)) : 0;
      bar.style.transform = `scaleX(${ratio})`;
    };

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  function initCursorGlow() {
    const node = document.querySelector("[data-cursor-glow]");
    if (!node) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;

    window.addEventListener(
      "mousemove",
      (event) => {
        tx = event.clientX;
        ty = event.clientY;
        node.classList.add("is-active");
      },
      { passive: true }
    );

    window.addEventListener(
      "mouseout",
      () => {
        node.classList.remove("is-active");
      },
      { passive: true }
    );

    const tick = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      node.style.transform = `translate3d(${x - 120}px, ${y - 120}px, 0)`;
      requestAnimationFrame(tick);
    };
    tick();
  }

  function init() {
    applyTheme(getStoredTheme());
    initThemeControl();
    renderAuthSlots();
    bindMenuToggle();
    initSectionNavHighlight();
    bindLogout();
    setupReveals();
    setFooterYear();
    initScrollProgressBar();
    initCursorGlow();
  }

  document.addEventListener("DOMContentLoaded", init);

  window.AltarixWeb = {
    api,
    routes: API_ROUTES,
    buildAppUrl,
    getToken,
    getUser,
    setSession,
    setUser,
    clearSession,
    refreshUser,
    requireAuth,
    showToast,
    formatDate,
    formatBytes,
    applyTheme
  };
})();

