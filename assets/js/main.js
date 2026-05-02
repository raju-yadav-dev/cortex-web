document.addEventListener("DOMContentLoaded", () => {
  initRotatingText();
  initCounterCards();
  initTypingLine();
  initTiltCards();
  initParticleCanvas();
  loadRepositoryCard();
  loadDownloads();
});

async function loadRepositoryCard() {
  const card = document.querySelector("[data-repo-card]");
  if (!card) return;

  const fallbackRepoUrl = "https://github.com/raju-yadav-dev/Altarix";
  const repoName = card.querySelector("[data-repo-name]");
  const repoStatus = card.querySelector("[data-repo-status]");
  const repoLink = card.querySelector("[data-repo-link]");
  const stars = card.querySelector("[data-repo-stars]");
  const forks = card.querySelector("[data-repo-forks]");
  const issues = card.querySelector("[data-repo-issues]");
  const pulls = card.querySelector("[data-repo-pulls]");
  const commits = card.querySelector("[data-repo-commits]");
  const languages = card.querySelector("[data-repo-language]");
  const languageLine = card.querySelector("[data-repo-language-line]");
  const languageLegend = card.querySelector("[data-repo-language-legend]");
  const contributors = card.querySelector("[data-repo-contributors]");

  try {
    let url = fallbackRepoUrl;
    try {
      if (window.AltarixWeb && typeof window.AltarixWeb.api === "function") {
        const meta = await window.AltarixWeb.api("/api/meta");
        if (meta?.repoUrl) {
          url = meta.repoUrl;
        }
      }
    } catch (_error) {
      // Fallback to static repo URL when backend metadata is unavailable.
    }

    repoLink.href = url;

    const match = url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (!match) {
      repoStatus.textContent = "Repository link configured.";
      return;
    }
    const owner = match[1];
    const repo = match[2].replace(".git", "");
    repoName.textContent = `${owner}/${repo}`;

    const headers = { Accept: "application/vnd.github+json" };
    const fetchJson = async (endpoint, extraHeaders = {}) => {
      const response = await fetch(endpoint, {
        headers: { ...headers, ...extraHeaders }
      });
      if (!response.ok) {
        throw new Error(`GitHub request failed (${response.status}).`);
      }
      return response.json();
    };

    const fetchCommitCount = async () => {
      const commitsResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
        { headers }
      );
      if (!commitsResponse.ok) {
        throw new Error(`GitHub request failed (${commitsResponse.status}).`);
      }

      const linkHeader = commitsResponse.headers.get("link");
      if (linkHeader) {
        const lastPageMatch = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/i);
        if (lastPageMatch) {
          return Number(lastPageMatch[1]);
        }
      }

      const list = await commitsResponse.json();
      if (Array.isArray(list) && list.length <= 1) {
        // Fallback for environments where pagination headers are unavailable.
        const searchQuery = encodeURIComponent(`repo:${owner}/${repo}`);
        const searchResult = await fetchJson(
          `https://api.github.com/search/commits?q=${searchQuery}&per_page=1`,
          { Accept: "application/vnd.github.cloak-preview+json" }
        );
        if (Number.isFinite(searchResult.total_count)) {
          return searchResult.total_count;
        }
      }

      return Array.isArray(list) ? list.length : 0;
    };

    const languagePalette = [
      "#2bf5c7",
      "#67a2ff",
      "#ffcb6b",
      "#ff7a7a",
      "#b58cff",
      "#7fffd4",
      "#ff9f40"
    ];

    const renderLanguageGraph = (items) => {
      if (!languageLine || !languageLegend) return;
      languageLine.innerHTML = "";
      languageLegend.innerHTML = "";

      if (!items.length) {
        const placeholder = document.createElement("span");
        placeholder.className = "repo-language-segment";
        placeholder.style.width = "100%";
        placeholder.style.backgroundColor = "rgba(255,255,255,0.2)";
        languageLine.appendChild(placeholder);

        const label = document.createElement("span");
        label.className = "repo-language-pill";
        label.textContent = "Language data unavailable";
        languageLegend.appendChild(label);
        languageLine.setAttribute("aria-label", "Repository language distribution unavailable");
        return;
      }

      items.forEach((item) => {
        const segment = document.createElement("span");
        segment.className = "repo-language-segment";
        segment.style.width = `${item.percent}%`;
        segment.style.backgroundColor = item.color;
        segment.title = `${item.name} ${item.percent.toFixed(1)}%`;
        languageLine.appendChild(segment);

        const pill = document.createElement("span");
        pill.className = "repo-language-pill";
        pill.innerHTML = `
          <span class="repo-language-dot" style="background:${item.color}"></span>
          <span>${escapeHtml(item.name)} ${item.percent.toFixed(1)}%</span>
        `;
        languageLegend.appendChild(pill);
      });

      const summary = items
        .map((item) => `${item.name} ${item.percent.toFixed(1)}%`)
        .join(", ");
      languageLine.setAttribute(
        "aria-label",
        `Repository language distribution: ${summary}`
      );
    };

    const normalizeLanguageData = (payload) => {
      if (!payload || typeof payload !== "object") return [];
      const source = Object.entries(payload).filter((entry) => Number(entry[1]) > 0);
      if (!source.length) return [];

      source.sort((a, b) => Number(b[1]) - Number(a[1]));
      const total = source.reduce((sum, [, bytes]) => sum + Number(bytes || 0), 0);
      if (!total) return [];

      const topEntries = source.slice(0, 5);
      const otherBytes = source
        .slice(5)
        .reduce((sum, [, bytes]) => sum + Number(bytes || 0), 0);

      const items = topEntries.map(([name, bytes], index) => ({
        name,
        bytes: Number(bytes || 0),
        color: languagePalette[index % languagePalette.length]
      }));

      if (otherBytes > 0) {
        items.push({
          name: "Other",
          bytes: otherBytes,
          color: languagePalette[items.length % languagePalette.length]
        });
      }

      const withPercentages = items.map((item) => ({
        ...item,
        percent: Number(((item.bytes / total) * 100).toFixed(1))
      }));

      const currentTotal = withPercentages.reduce(
        (sum, item) => sum + Number(item.percent || 0),
        0
      );
      const adjustment = Number((100 - currentTotal).toFixed(1));
      if (withPercentages.length && adjustment !== 0) {
        withPercentages[0].percent = Number(
          Math.max(0.1, withPercentages[0].percent + adjustment).toFixed(1)
        );
      }

      return withPercentages;
    };

    const renderContributors = (list) => {
      if (!contributors) return;
      contributors.innerHTML = "";

      const filteredList = Array.isArray(list)
        ? list.filter((person) => !/copilot/i.test(String(person?.login || "")))
        : [];

      if (!filteredList.length) {
        const empty = document.createElement("span");
        empty.className = "repo-contrib-empty";
        empty.textContent = "Contributors unavailable";
        contributors.appendChild(empty);
        return;
      }

      const topList = filteredList.slice(0, 8);
      topList.forEach((person) => {
        const login = String(person?.login || "Contributor");
        const profileUrl = String(person?.html_url || "").trim();
        const avatarUrl = String(person?.avatar_url || "").trim();
        const contributionCount = Number(person?.contributions || 0);

        const link = document.createElement("a");
        link.className = "repo-contrib-item";
        link.href = profileUrl || "#";
        link.target = "_blank";
        link.rel = "noreferrer";
        link.title = `${login} (${contributionCount.toLocaleString("en-US")} commits)`;
        link.setAttribute("aria-label", `${login} profile`);

        const image = document.createElement("img");
        image.alt = `${login} avatar`;
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.src = avatarUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
        link.appendChild(image);
        contributors.appendChild(link);
      });

      if (filteredList.length > topList.length) {
        const more = document.createElement("span");
        more.className = "repo-contrib-more";
        more.textContent = `+${filteredList.length - topList.length} more`;
        contributors.appendChild(more);
      }
    };

    const issueQuery = encodeURIComponent(`repo:${owner}/${repo} is:issue is:open`);
    const pullQuery = encodeURIComponent(`repo:${owner}/${repo} is:pr is:open`);

    const [repoResult, issueResult, pullResult, commitResult, languageResult, contributorResult] =
      await Promise.allSettled([
      fetchJson(`https://api.github.com/repos/${owner}/${repo}`),
      fetchJson(`https://api.github.com/search/issues?q=${issueQuery}&per_page=1`),
      fetchJson(`https://api.github.com/search/issues?q=${pullQuery}&per_page=1`),
      fetchCommitCount(),
      fetchJson(`https://api.github.com/repos/${owner}/${repo}/languages`),
      fetchJson(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=16`)
    ]);

    if (repoResult.status === "fulfilled") {
      stars.textContent = String(repoResult.value.stargazers_count ?? "--");
      forks.textContent = String(repoResult.value.forks_count ?? "--");
      repoStatus.textContent = repoResult.value.description || "Public Altarix repository.";
      if (languages && repoResult.value.language) {
        languages.textContent = String(repoResult.value.language);
      }
    } else {
      repoStatus.textContent = "Repo found. Live stats unavailable right now.";
    }

    if (issueResult.status === "fulfilled") {
      issues.textContent = String(issueResult.value.total_count ?? "--");
    }

    if (pullResult.status === "fulfilled") {
      pulls.textContent = String(pullResult.value.total_count ?? "--");
    }

    if (commits && commitResult.status === "fulfilled") {
      const count = Number(commitResult.value);
      commits.textContent = Number.isFinite(count) ? count.toLocaleString("en-US") : "--";
    }

    if (languages && languageResult.status === "fulfilled") {
      const languageItems = normalizeLanguageData(languageResult.value);
      renderLanguageGraph(languageItems);
      languages.textContent = languageItems.length
        ? languageItems
            .filter((item) => item.name !== "Other")
            .slice(0, 3)
            .map((item) => item.name)
            .join(", ")
        : "--";
    } else {
      renderLanguageGraph([]);
    }

    if (contributorResult.status === "fulfilled") {
      renderContributors(contributorResult.value);
    } else {
      renderContributors([]);
    }
  } catch (_error) {
    repoStatus.textContent = "Unable to load GitHub details at the moment.";
    if (languageLine && languageLegend) {
      languageLine.innerHTML = "";
      languageLegend.innerHTML = "";
    }
    if (contributors) {
      contributors.innerHTML = "";
    }
  }
}

async function loadDownloads() {
  const host = document.getElementById("downloadSections");
  const summaryHost = document.querySelector("[data-download-summary]");
  if (!host) return;

  const fallbackVersion = "v1.5.4";
  const fallbackReleaseBaseUrl = "http://github.com/raju-yadav-dev/altarix/releases/download/v1.5.4/Altarix-1.5.4.exe";
  const apiUpdateUrl =
    (window.AltarixWeb && typeof window.AltarixWeb.buildAppUrl === "function")
      ? window.AltarixWeb.buildAppUrl("api/update")
      : "https://altarix.vercel.app/api/update";

  const installers = {
    windowsExe: {
      family: "Windows",
      label: "Windows EXE",
      file: "Altarix-windows.exe",
      type: "EXE",
      mode: "Recommended",
      summary: "Guided installer for desktop users.",
      details: [
        "Creates Start Menu and desktop shortcuts",
        "Best for interactive installation",
        "Uses the Windows installer icon"
      ],
      installSteps: [
        "Download the EXE file",
        "Run the installer",
        "Follow the setup wizard"
      ]
    },
    windowsMsi: {
      family: "Windows",
      label: "Windows MSI",
      file: "Altarix-windows.msi",
      type: "MSI",
      mode: "Deployment",
      summary: "Installer package for managed installs.",
      details: [
        "Fits scripted or enterprise deployment flows",
        "Matches Windows installer conventions",
        "Includes the same Windows app branding"
      ],
      installSteps: [
        "Download the MSI file",
        "Launch it with Windows Installer",
        "Complete the installation prompts"
      ]
    },
    linuxDeb: {
      family: "Linux",
      label: "Linux DEB",
      file: "Altarix-linux.deb",
      type: "DEB",
      mode: "Recommended",
      summary: "Debian package for Ubuntu and Debian-based systems.",
      details: [
        "Designed for apt/dpkg-based environments",
        "Works well on Ubuntu and Debian",
        "Uses the Linux installer icon"
      ],
      installSteps: [
        "Download the DEB package",
        "Install with your package tool",
        "Launch Altarix from the applications menu"
      ]
    }
  };

  const detectOs = () => {
    const ua = String(navigator.userAgent || "").toLowerCase();
    const platform = String(
      navigator.userAgentData?.platform || navigator.platform || ""
    ).toLowerCase();
    const source = `${ua} ${platform}`;

    if (source.includes("win")) return "windows";
    if (source.includes("mac") || source.includes("darwin")) return "macos";
    if (source.includes("linux") || source.includes("x11")) return "linux";
    return "windows";
  };

  const normalizeBaseUrl = (url) => {
    const value = String(url || "").trim();
    if (!value) return "";
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
    if (/\.(exe|msi|deb|dmg|pkg|aab|apk|npm)(\?|#|$)/i.test(withProtocol)) {
      return withProtocol;
    }
    return withProtocol.endsWith("/") ? withProtocol : `${withProtocol}/`;
  };

  const buildDownloadUrl = (baseUrl, key) => {
    const target = installers[key];
    if (!target) return "#";
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) return "#";

    if (normalized.endsWith(target.file)) {
      return normalized;
    }

    if (/\.(exe|msi|deb|dmg|pkg|aab|apk|npm)(\?|#|$)/i.test(normalized)) {
      const directName = normalized.match(/[^/]+\.(exe|msi|deb|dmg|pkg|aab|apk|npm)(?:[?#].*)?$/i)?.[0] || "";
      if (!directName) return normalized;
      if (key === "windowsExe") return normalized;
      if (key === "windowsMsi") {
        return normalized.replace(/\.exe(\?|#|$)/i, ".msi$1");
      }
      if (key === "linuxDeb") {
        return normalized.replace(/\.exe(\?|#|$)/i, ".deb$1");
      }
      return normalized;
    }

    if (normalized.includes("{os}") || normalized.includes("{ext}")) {
      const ext = target.file.split(".").pop();
      return normalized
        .replaceAll("{os}", key)
        .replaceAll("{ext}", ext || "");
    }

    return `${normalized}${target.file}`;
  };

  const resolvePrimaryDownloadUrl = (baseUrl, recommendedKey) => {
    const target = installers[recommendedKey] || installers.windowsExe;
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) return buildDownloadUrl(fallbackReleaseBaseUrl, recommendedKey);
    if (/\.(exe|msi|deb|dmg|pkg|aab|apk|npm)(\?|#|$)/i.test(normalized)) {
      return normalized;
    }
    return buildDownloadUrl(normalized, recommendedKey) || `${normalized}${target.file}`;
  };

  const renderReleaseNotes = (notes) => {
    const cleaned = String(notes || "").trim();
    if (!cleaned) {
      return '<p class="downloads-empty">No release notes were provided for this release.</p>';
    }

    const lines = cleaned
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*]\s*/, ""));

    if (!lines.length) {
      return '<p class="downloads-empty">No release notes were provided for this release.</p>';
    }

    return `
      <ul class="downloads-notes-list">
        ${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
      </ul>
    `;
  };

  const fetchUpdate = async () => {
    const response = await fetch(apiUpdateUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return response.json();
  };

  const normalizeType = (value) => String(value || "").trim().toLowerCase();

  const resolveUrlsFromUpdates = (updatePayload, fallbackBaseUrl) => {
    const updates = Array.isArray(updatePayload?.updates) ? updatePayload.updates : [];
    const latestDownload = String(updatePayload?.download_url || "").trim() || fallbackBaseUrl;

    const byType = new Map();
    updates.forEach((row) => {
      const t = normalizeType(row?.type);
      const u = String(row?.download_url || "").trim();
      if (t && u && !byType.has(t)) {
        byType.set(t, u);
      }
    });

    const exeFromType = byType.get("exe") || "";
    const msiFromType = byType.get("msi") || "";
    const debFromType = byType.get("deb") || byType.get("linux") || "";

    const exeUrl = exeFromType || buildDownloadUrl(latestDownload, "windowsExe");
    const msiUrl = msiFromType || buildDownloadUrl(latestDownload, "windowsMsi");
    const debUrl = debFromType || buildDownloadUrl(latestDownload, "linuxDeb");

    return {
      windowsExe: exeUrl,
      windowsMsi: msiUrl,
      linuxDeb: debUrl,
      debug: {
        picked: {
          exe: exeFromType ? "type=exe row" : "derived fallback",
          msi: msiFromType ? "type=msi row" : "derived fallback",
          deb: debFromType ? "type=deb/linux row" : "derived fallback"
        },
        rows: updates.map((row) => ({
          type: normalizeType(row?.type),
          download_url: String(row?.download_url || "").trim(),
          version: String(row?.version || "").trim()
        }))
      }
    };
  };

  const renderDownloads = (version, urls, recommendedKey, releaseNotes, sourceLabel, sourceDownloadUrl, primaryDownloadUrl, debugInfo, oldVersions) => {
    const recommended = installers[recommendedKey] || installers.windowsExe;
    
    // Group by version and keep only the first record of each version (to avoid duplicates for EXE/MSI)
    const versionMap = new Map();
    if (Array.isArray(oldVersions)) {
      oldVersions.forEach(v => {
        const ver = String(v?.version || "").trim();
        if (ver && !versionMap.has(ver)) {
          versionMap.set(ver, v);
        }
      });
    }
    
    // Convert to array and skip the first version (current release)
    const uniqueVersions = Array.from(versionMap.values());
    const oldVersionsList = uniqueVersions.slice(1);
    console.log("All oldVersions from API:", oldVersions);
    console.log("uniqueVersions after grouping:", uniqueVersions);
    console.log("oldVersionsList after slice(1):", oldVersionsList);
    console.log("oldVersionsList.length:", oldVersionsList.length);
    const items = Object.entries(installers)
      .map(([key, item]) => {
        const isRecommended = key === recommendedKey;
        const installStepItems = item.installSteps
          .map((step) => `<li>${escapeHtml(step)}</li>`)
          .join("");
        const detailItems = item.details
          .map((detail) => `<li>${escapeHtml(detail)}</li>`)
          .join("");

        return `
          <article class="downloads-platform glass ${isRecommended ? "is-featured" : ""}">
            <div class="downloads-platform-top">
              <div>
                <p class="downloads-platform-family">${escapeHtml(item.family)}</p>
                <h3>${escapeHtml(item.label)}</h3>
              </div>
              <span class="downloads-badge">${escapeHtml(item.mode)}</span>
            </div>
            <p class="downloads-platform-summary">${escapeHtml(item.summary)}</p>
            <p class="downloads-platform-file">${escapeHtml(item.file)}</p>
            <ul class="downloads-platform-list">
              ${detailItems}
            </ul>
            <div class="downloads-platform-steps">
              <span class="downloads-platform-steps-title">Install in 3 steps</span>
              <ol>
                ${installStepItems}
              </ol>
            </div>
            <div class="hero-actions">
              <a class="btn ${isRecommended ? "btn-primary" : "btn-ghost"}" href="${escapeHtml(urls[key])}" download>
                Download ${escapeHtml(item.type)}
              </a>
            </div>
          </article>
        `;
      })
      .join("");

    const debugRows = Array.isArray(debugInfo?.rows) ? debugInfo.rows : [];
    const debugRowsHtml = debugRows.length
      ? debugRows.map((row) => `
            <li>
              <strong>${escapeHtml(row.type || "unknown")}</strong>
              <span>${escapeHtml(row.download_url || "(empty url)")}</span>
            </li>
          `).join("")
      : '<li><strong>none</strong><span>No rows returned.</span></li>';

    const pickedExe = String(debugInfo?.picked?.exe || "n/a");
    const pickedMsi = String(debugInfo?.picked?.msi || "n/a");
    const pickedDeb = String(debugInfo?.picked?.deb || "n/a");

    if (summaryHost) {
      const oldVersionsHtml = oldVersionsList.length ? `
        <div class="old-versions">
          <h3>Previous versions</h3>
          <div class="old-versions-list">
            ${oldVersionsList.map((v) => {
              const versionNum = escapeHtml(String(v?.version || "").trim());
              const downloadUrl = escapeHtml(String(v?.download_url || "").trim());
              const notes = escapeHtml(String(v?.release_notes || "").trim().split('\n')[0]);
              return `
                <div class="old-version-item">
                  <div class="old-version-info">
                    <div class="old-version-number">Altarix ${versionNum}</div>
                    <div class="old-version-date">${notes ? `${notes.substring(0, 50)}...` : 'Previous release'}</div>
                  </div>
                  <div class="old-version-actions">
                    ${downloadUrl ? `<a class="old-version-link" href="${downloadUrl}" download>Download</a>` : '<span class="old-version-link" style="opacity: 0.5;">Unavailable</span>'}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : '';

      summaryHost.innerHTML = `
        <div class="downloads-summary-copy">
          <p class="kicker">Latest release</p>
          <h3>Altarix ${escapeHtml(version || "Unknown")}</h3>
          <p>
            Download the installer that matches your system. The release source is the exact
            Windows EXE URL stored in the database update record, and the page resolves the
            matching MSI and Linux links from it.
          </p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="${escapeHtml(urls[recommendedKey])}" download>
              Download recommended package
            </a>
            <a class="btn btn-ghost" href="#downloadSections">
              View all installers
            </a>
          </div>
          ${oldVersionsHtml}
        </div>
        <div class="downloads-summary-meta">
          <div class="downloads-meta-card">
            <span class="downloads-meta-label">Recommended for you</span>
            <strong>${escapeHtml(recommended.label)}</strong>
          </div>
          <div class="downloads-meta-card">
            <span class="downloads-meta-label">Database version</span>
            <strong>${escapeHtml(version || "Unknown")}</strong>
          </div>
          <div class="downloads-meta-card">
            <span class="downloads-meta-label">Update source</span>
            <strong>${escapeHtml(sourceLabel)}</strong>
          </div>
          <div class="downloads-meta-card">
            <span class="downloads-meta-label">Direct download</span>
            <strong>
              <a href="${escapeHtml(primaryDownloadUrl || urls[recommendedKey])}" target="_blank" rel="noreferrer" download>
                Open recommended file
              </a>
            </strong>
          </div>
          <div class="downloads-meta-card">
            <span class="downloads-meta-label">Release source</span>
            <strong>${escapeHtml(sourceDownloadUrl || "Unavailable")}</strong>
          </div>
          <div class="downloads-meta-card downloads-meta-notes">
            <span class="downloads-meta-label">Release notes</span>
            ${renderReleaseNotes(releaseNotes)}
          </div>
          <details class="downloads-debug">
            <summary>Download debug details</summary>
            <div class="downloads-debug-block">
              <p><strong>EXE source:</strong> ${escapeHtml(pickedExe)}</p>
              <p><strong>MSI source:</strong> ${escapeHtml(pickedMsi)}</p>
              <p><strong>DEB source:</strong> ${escapeHtml(pickedDeb)}</p>
              <p><strong>Resolved EXE:</strong> ${escapeHtml(urls.windowsExe || "")}</p>
              <p><strong>Resolved MSI:</strong> ${escapeHtml(urls.windowsMsi || "")}</p>
              <p><strong>Resolved DEB:</strong> ${escapeHtml(urls.linuxDeb || "")}</p>
              <ul class="downloads-debug-rows">${debugRowsHtml}</ul>
            </div>
          </details>
        </div>
      `;
    }

    host.innerHTML = items;
  };

  try {
    const update = await fetchUpdate();
    const version = String(update?.version || "").trim() || fallbackVersion;
    const baseUrl = String(update?.download_url || "").trim() || fallbackReleaseBaseUrl;
    const releaseNotes = String(update?.release_notes || "").trim();
    const osKey = detectOs();
    const resolved = resolveUrlsFromUpdates(update, fallbackReleaseBaseUrl);
    const urls = {
      windowsExe: resolved.windowsExe,
      windowsMsi: resolved.windowsMsi,
      linuxDeb: resolved.linuxDeb
    };
    const recommendedKey = osKey === "linux" ? "linuxDeb" : "windowsExe";
    const primaryDownloadUrl = resolvePrimaryDownloadUrl(baseUrl, recommendedKey);
    const oldVersions = Array.isArray(update?.updates) ? update.updates : [];
    console.log("API Response updates array:", oldVersions);
    console.log("Old versions after slice(1):", oldVersions.slice(1));
    renderDownloads(
      version,
      urls,
      recommendedKey,
      releaseNotes,
      "Database update record",
      baseUrl,
      primaryDownloadUrl,
      resolved.debug,
      oldVersions
    );
  } catch (_error) {
    const osKey = detectOs();
    const urls = {
      windowsExe: buildDownloadUrl(fallbackReleaseBaseUrl, "windowsExe"),
      windowsMsi: buildDownloadUrl(fallbackReleaseBaseUrl, "windowsMsi"),
      linuxDeb: buildDownloadUrl(fallbackReleaseBaseUrl, "linuxDeb")
    };
    const recommendedKey = osKey === "linux" ? "linuxDeb" : "windowsExe";
    const primaryDownloadUrl = resolvePrimaryDownloadUrl(fallbackReleaseBaseUrl, recommendedKey);
    renderDownloads(
      fallbackVersion,
      urls,
      recommendedKey,
      "Windows EXE, Windows MSI, and Linux DEB installers are available in this release.",
      "Fallback release bucket",
      fallbackReleaseBaseUrl,
      primaryDownloadUrl,
      {
        picked: {
          exe: "fallback",
          msi: "fallback",
          deb: "fallback"
        },
        rows: []
      },
      []
    );
  }
}

function initRotatingText() {
  const node = document.querySelector("[data-rotating-text]");
  if (!node) return;
  const words = String(node.getAttribute("data-words") || "")
    .split("|")
    .map((word) => word.trim())
    .filter(Boolean);
  if (!words.length) return;

  const originalText = node.textContent || words[0];
  node.textContent = "";

  const textNode = document.createElement("span");
  textNode.className = "gradient-text-copy";
  textNode.textContent = originalText;

  const caretNode = document.createElement("span");
  caretNode.className = "gradient-text-caret";
  caretNode.setAttribute("aria-hidden", "true");

  node.appendChild(textNode);
  node.appendChild(caretNode);

  const heading = node.closest("h1");
  if (heading) {
    let maxHeight = 0;
    let maxWidth = 0;
    const headingWidth = heading.getBoundingClientRect().width;
    words.forEach((word) => {
      textNode.textContent = word;
      const bounds = textNode.getBoundingClientRect();
      maxHeight = Math.max(maxHeight, heading.getBoundingClientRect().height);
      maxWidth = Math.max(maxWidth, bounds.width);
    });
    if (maxHeight > 0) {
      heading.style.minHeight = `${Math.ceil(maxHeight)}px`;
    }
    if (maxWidth > 0 && headingWidth > 0) {
      node.style.minWidth = `${Math.ceil(Math.min(maxWidth, headingWidth))}px`;
    }
  }
  node.classList.add("is-typing");

  let wordIndex = 0;
  let charIndex = 0;
  let deleting = false;

  const typeDelayMs = 65;
  const deleteDelayMs = 38;
  const holdAfterWordMs = 1250;
  const holdAfterDeleteMs = 250;

  const tick = () => {
    const currentWord = words[wordIndex];

    if (!deleting) {
      charIndex += 1;
      textNode.textContent = currentWord.slice(0, charIndex);
      if (charIndex >= currentWord.length) {
        deleting = true;
        setTimeout(tick, holdAfterWordMs);
        return;
      }
      setTimeout(tick, typeDelayMs);
      return;
    }

    charIndex -= 1;
    textNode.textContent = currentWord.slice(0, Math.max(0, charIndex));
    if (charIndex <= 0) {
      deleting = false;
      wordIndex = (wordIndex + 1) % words.length;
      setTimeout(tick, holdAfterDeleteMs);
      return;
    }
    setTimeout(tick, deleteDelayMs);
  };

  textNode.textContent = "";
  setTimeout(tick, 300);

  window.addEventListener("resize", () => {
    if (!heading) return;
    let maxHeight = 0;
    let maxWidth = 0;
    const headingWidth = heading.getBoundingClientRect().width;
    words.forEach((word) => {
      textNode.textContent = word;
      const bounds = textNode.getBoundingClientRect();
      maxHeight = Math.max(maxHeight, heading.getBoundingClientRect().height);
      maxWidth = Math.max(maxWidth, bounds.width);
    });
    if (maxHeight > 0) {
      heading.style.minHeight = `${Math.ceil(maxHeight)}px`;
    }
    if (maxWidth > 0 && headingWidth > 0) {
      node.style.minWidth = `${Math.ceil(Math.min(maxWidth, headingWidth))}px`;
    }
    textNode.textContent = "";
  });
}

function initCounterCards() {
  const nodes = document.querySelectorAll("[data-countup]");
  if (!nodes.length) return;

  const animate = (node) => {
    const target = Number(node.getAttribute("data-countup") || 0);
    if (!Number.isFinite(target) || target <= 0) {
      node.textContent = "0";
      return;
    }
    const duration = 1400;
    const startTime = performance.now();

    function tick(currentTime) {
      const progress = Math.min(1, (currentTime - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      node.textContent = String(value);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animate(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.35 }
  );

  nodes.forEach((node) => observer.observe(node));
}

function initTypingLine() {
  const line = document.querySelector("[data-typing-line]");
  if (!line) return;
  const text = String(line.getAttribute("data-text") || "").trim();
  if (!text) return;

  let index = 0;
  line.classList.add("typing-line");
  const timer = setInterval(() => {
    index += 1;
    line.textContent = text.slice(0, index);
    if (index >= text.length) {
      clearInterval(timer);
      line.classList.remove("typing-line");
      line.classList.add("typing-complete");
    }
  }, 35);
}

function initTiltCards() {
  const cards = document.querySelectorAll("[data-tilt]");
  if (!cards.length) return;
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  if (isTouch) return;

  cards.forEach((card) => {
    if (card.dataset.tiltBound === "true") return;
    card.dataset.tiltBound = "true";

    card.addEventListener("mousemove", (event) => {
      const bounds = card.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const rotateY = ((x / bounds.width) - 0.5) * 8;
      const rotateX = ((0.5 - y / bounds.height)) * 8;
      card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(
        2
      )}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

function initParticleCanvas() {
  const canvas = document.querySelector("[data-particle-canvas]");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const particleCount = window.innerWidth < 780 ? 20 : 36;
  const particles = [];
  const pointer = { x: -9999, y: -9999 };

  function resetParticle(particle) {
    particle.x = Math.random() * canvas.width;
    particle.y = Math.random() * canvas.height;
    particle.vx = (Math.random() - 0.5) * 0.35;
    particle.vy = (Math.random() - 0.5) * 0.35;
    particle.r = Math.random() * 1.8 + 1.1;
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles.length = 0;
    for (let i = 0; i < particleCount; i += 1) {
      const particle = { x: 0, y: 0, vx: 0, vy: 0, r: 0 };
      resetParticle(particle);
      particles.push(particle);
    }
  }

  function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x < -10 || particle.x > canvas.width + 10 || particle.y < -10 || particle.y > canvas.height + 10) {
        resetParticle(particle);
      }

      const distance = Math.hypot(pointer.x - particle.x, pointer.y - particle.y);
      const alpha = distance < 150 ? 0.75 : 0.35;

      context.beginPath();
      context.fillStyle = `rgba(133, 192, 255, ${alpha})`;
      context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      context.fill();

      for (let j = i + 1; j < particles.length; j += 1) {
        const peer = particles[j];
        const d = Math.hypot(particle.x - peer.x, particle.y - peer.y);
        if (d < 110) {
          context.beginPath();
          context.strokeStyle = `rgba(104, 179, 245, ${(1 - d / 110) * 0.2})`;
          context.lineWidth = 1;
          context.moveTo(particle.x, particle.y);
          context.lineTo(peer.x, peer.y);
          context.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener(
    "mousemove",
    (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    },
    { passive: true }
  );
  window.addEventListener("resize", resize);
  resize();
  draw();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

