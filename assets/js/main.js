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
  if (!host) return;

  const normalizeDownloadUrl = (url) => {
    const raw = String(url || "").trim();
    if (!raw) return "#";
    if (/^https?:\/\//i.test(raw)) return raw;
    return raw.replace(/^\/+/, "");
  };

  const extensionFor = (fileName) => {
    const name = String(fileName || "").toLowerCase();
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot) : "";
  };

  const formatType = (fileName) => {
    const ext = extensionFor(fileName).replace(".", "").toUpperCase();
    return ext || "--";
  };

  const renderRows = (files) =>
    files
      .map(
        (file) => {
          const sizeText =
            Number.isFinite(Number(file.size)) && Number(file.size) > 0
              ? window.AltarixWeb.formatBytes(Number(file.size))
              : "--";
          const updatedText = file.updatedAt
            ? window.AltarixWeb.formatDate(file.updatedAt)
            : "--";
          return `
        <tr>
          <td>${escapeHtml(file.name)}</td>
          <td>${escapeHtml(formatType(file.name))}</td>
          <td data-download-size="${escapeHtml(file.name)}">${escapeHtml(sizeText)}</td>
          <td class="col-updated" data-download-updated="${escapeHtml(file.name)}">${escapeHtml(updatedText)}</td>
          <td><a class="btn btn-primary btn-sm" href="${escapeHtml(normalizeDownloadUrl(file.downloadUrl))}">Download</a></td>
        </tr>
      `;
        }
      )
      .join("");

  const platformDefs = [
    {
      key: "windows",
      title: "Windows",
      subtitle: "EXE and MSI installers",
      extensions: [".exe", ".msi"]
    },
    {
      key: "linux",
      title: "Linux",
      subtitle: "DEB and RPM packages",
      extensions: [".deb", ".rpm", ".rmp"]
    },
    {
      key: "mac",
      title: "macOS",
      subtitle: "PKG and DMG installers",
      extensions: [".pkg", ".dmg"]
    },
    {
      key: "other",
      title: "Other",
      subtitle: "Additional package formats",
      extensions: []
    }
  ];

  const normalizePlatformKey = (value) => {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (["windows", "win"].includes(normalized)) return "windows";
    if (["linux", "ubuntu", "debian"].includes(normalized)) return "linux";
    if (["mac", "macos", "osx"].includes(normalized)) return "mac";
    if (["other", "misc"].includes(normalized)) return "other";
    return normalized || "other";
  };

  const inferPlatformFromFileName = (fileName) => {
    const ext = extensionFor(fileName);
    if (platformDefs[0].extensions.includes(ext)) return "windows";
    if (platformDefs[1].extensions.includes(ext) || [".appimage", ".snap", ".npm"].includes(ext)) {
      return "linux";
    }
    if (platformDefs[2].extensions.includes(ext)) return "mac";
    return "other";
  };

  const parseCatalogMarkdown = (raw) => {
    const sections = [];
    const lines = String(raw || "").split(/\r?\n/);
    let current = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const headingMatch = trimmed.match(/^#{2,6}\s*(.+?)\s*$/);
      if (headingMatch) {
        const key = normalizePlatformKey(headingMatch[1]);
        const platformMatch = platformDefs.find((item) => item.key === key);
        current = {
          key,
          title: platformMatch?.title || headingMatch[1].trim(),
          subtitle: platformMatch?.subtitle || "Available packages",
          files: []
        };
        sections.push(current);
        continue;
      }

      const bulletMatch = trimmed.match(/^[-*]\s*(.+?)\s*$/);
      if (bulletMatch && current) {
        const fileName = bulletMatch[1].trim();
        current.files.push({
          name: fileName,
          size: null,
          updatedAt: null,
          downloadUrl: `downloads/${encodeURIComponent(fileName)}`,
          platform: current.key || inferPlatformFromFileName(fileName)
        });
      }
    }

    return sections.filter((section) => section.files.length);
  };

  const groupByPlatform = (files) => {
    const grouped = {
      windows: [],
      linux: [],
      mac: [],
      other: []
    };

    files.forEach((file) => {
      const ext = extensionFor(file.name);
      if (platformDefs[0].extensions.includes(ext)) {
        grouped.windows.push(file);
        return;
      }
      if (platformDefs[1].extensions.includes(ext)) {
        grouped.linux.push(file);
        return;
      }
      if (platformDefs[2].extensions.includes(ext)) {
        grouped.mac.push(file);
        return;
      }
      grouped.other.push(file);
    });

    return grouped;
  };

  const renderSections = (files) => {
    const grouped = groupByPlatform(files);
    host.innerHTML = platformDefs
      .map((platform) => {
        const rows = grouped[platform.key] || [];
        const tableRows = rows.length
          ? renderRows(rows)
          : `
            <tr>
              <td colspan="5">No ${escapeHtml(platform.title)} package available yet.</td>
            </tr>
          `;
        return `
          <article class="downloads-platform glass">
            <h3>${escapeHtml(platform.title)}</h3>
            <p>${escapeHtml(platform.subtitle)}</p>
            <div class="downloads-table-wrap">
              <table class="downloads-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th class="col-updated">Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
          </article>
        `;
      })
      .join("");
  };

  const renderCatalogSections = (sections) => {
    host.innerHTML = sections
      .map((section) => {
        const rows = Array.isArray(section.files) ? section.files : [];
        const tableRows = rows.length
          ? renderRows(rows)
          : `
            <tr>
              <td colspan="5">No ${escapeHtml(section.title || "downloads")} available yet.</td>
            </tr>
          `;
        return `
          <article class="downloads-platform glass">
            <h3>${escapeHtml(section.title || "Downloads")}</h3>
            <p>${escapeHtml(section.subtitle || "Available packages")}</p>
            <div class="downloads-table-wrap">
              <table class="downloads-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th class="col-updated">Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
          </article>
        `;
      })
      .join("");
  };

  const hydrateCatalogMetadata = async (sections) => {
    const uniqueFiles = [];
    const seenNames = new Set();

    sections.forEach((section) => {
      (section.files || []).forEach((file) => {
        const normalizedName = String(file.name || "").trim().toLowerCase();
        if (!normalizedName || seenNames.has(normalizedName)) return;
        seenNames.add(normalizedName);
        uniqueFiles.push(file);
      });
    });

    await Promise.all(
      uniqueFiles.map(async (file) => {
        const candidates = [
          normalizeDownloadUrl(file.downloadUrl),
          `downloads/${encodeURIComponent(file.name)}`
        ];

        for (const candidate of candidates) {
          try {
            let response = await fetch(candidate, { method: "HEAD", cache: "no-store" });
            if (response.status === 405) {
              response = await fetch(candidate, { method: "GET", cache: "no-store" });
            }
            if (!response.ok) {
              continue;
            }

            const contentLength = Number(response.headers.get("content-length") || 0);
            const lastModified = response.headers.get("last-modified");
            const sizeNode = host.querySelector(
              `[data-download-size="${CSS.escape(String(file.name))}"]`
            );
            const updatedNode = host.querySelector(
              `[data-download-updated="${CSS.escape(String(file.name))}"]`
            );

            if (sizeNode && Number.isFinite(contentLength) && contentLength > 0) {
              sizeNode.textContent = window.AltarixWeb.formatBytes(contentLength);
            }
            if (updatedNode && lastModified) {
              const iso = new Date(lastModified).toISOString();
              updatedNode.textContent = window.AltarixWeb.formatDate(iso);
            }
            break;
          } catch (_error) {
            // Try the next path.
          }
        }
      })
    );
  };

  const buildFallbackFiles = async () => {
    const fallbackNames = [
      "Altarix-1.5.1-installer.exe",
      "Altarix-1.5.1-installer.msi",
      "Altarix-1.5.1.exe",
      "Altarix-1.5.1.msi",
      "Altarix-1.2.1-installer.exe",
      "Altarix-1.2.1-installer.msi",
      "Altarix-1.0.msi",
      "Altarix-1.5.1.deb",
      "Altarix-1.5.1.rpm",
      "Altarix-1.5.1.pkg",
      "Altarix-1.5.1.dmg"
    ];
    const prefixes = ["downloads/"];
    const discovered = [];

    for (const name of fallbackNames) {
      let found = null;
      for (const prefix of prefixes) {
        const candidate = normalizeDownloadUrl(`${prefix}${encodeURIComponent(name)}`);
        try {
          let response = await fetch(candidate, { method: "HEAD" });
          if (response.status === 405) {
            response = await fetch(candidate, { method: "GET" });
          }
          if (!response.ok) continue;
          const sizeHeader = Number(response.headers.get("content-length") || 0);
          found = {
            name,
            size: Number.isFinite(sizeHeader) && sizeHeader > 0 ? sizeHeader : null,
            updatedAt: null,
            downloadUrl: candidate
          };
          break;
        } catch (_error) {
          // Try the next fallback path.
        }
      }
      if (found) {
        discovered.push(found);
      }
    }

    return discovered;
  };

  try {
    try {
      const catalogResponse = await fetch("downloads/download-catalog.md", {
        cache: "no-store"
      });
      if (catalogResponse.ok) {
        const catalogRaw = await catalogResponse.text();
        const catalogSections = parseCatalogMarkdown(catalogRaw);
        if (catalogSections.length) {
          renderCatalogSections(catalogSections);
          void hydrateCatalogMetadata(catalogSections);
          return;
        }
      }
    } catch (_error) {
      // Fall back to API/static probing below.
    }

    let data = null;
    let apiError = null;
    try {
      data = await window.AltarixWeb.api("/api/downloads");
    } catch (error) {
      if (error?.status === 404) {
        try {
          data = await window.AltarixWeb.api("api/downloads");
        } catch (nestedError) {
          apiError = nestedError;
        }
      } else {
        apiError = error;
      }
    }

    let files = Array.isArray(data?.files) ? data.files : [];
    let sections = Array.isArray(data?.sections) ? data.sections : [];
    if (!files.length) {
      files = await buildFallbackFiles();
    }

    if (!files.length) {
      host.innerHTML = `
        <article class="downloads-platform glass">
          <h3>No installers found</h3>
          <p>Put installer files in <code>downloads/</code>.</p>
        </article>
      `;
      if (apiError) {
        console.warn("Download API fallback used due:", apiError.message || apiError);
      }
      return;
    }

    if (sections.length) {
      const known = new Set();
      sections = sections.map((section) => {
        const key = normalizePlatformKey(section.key || section.title);
        const sectionFiles = (Array.isArray(section.files) ? section.files : []).map((file) => {
          known.add(String(file.name || "").toLowerCase());
          return file;
        });
        return {
          key,
          title: section.title || platformDefs.find((item) => item.key === key)?.title || "Downloads",
          subtitle:
            section.subtitle ||
            platformDefs.find((item) => item.key === key)?.subtitle ||
            "Available packages",
          files: sectionFiles
        };
      });

      const remainingFiles = files.filter(
        (file) => !known.has(String(file.name || "").toLowerCase())
      );

      if (remainingFiles.length) {
        const grouped = groupByPlatform(remainingFiles);
        platformDefs.forEach((platform) => {
          const extraFiles = grouped[platform.key] || [];
          if (!extraFiles.length) return;
          sections.push({
            key: platform.key,
            title: platform.title,
            subtitle: platform.subtitle,
            files: extraFiles
          });
        });
      }

      renderCatalogSections(sections);
      return;
    }

    renderSections(files);
  } catch (error) {
    host.innerHTML = `
      <article class="downloads-platform glass">
        <h3>Download load failed</h3>
        <p>${escapeHtml(error.message || "Could not load installer list.")}</p>
      </article>
    `;
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

