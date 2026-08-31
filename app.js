(function () {
  "use strict";

  let DATA = [];
  let META = { minYear: 2000, maxYear: 2024 };
  let activeChapter = null;
  let activeSubject = null;   // pathology | microbiology | pharmacology
  let typeFilter = "all";     // all | laq | saq | mcq
  let viewMode = "normal";    // normal | bullet
  let sortMode = "textbook";  // textbook | frequency
  let recencyFilter = "all";  // all | recent
  let recencyN = 5;           // customizable "last N years"
  const collapsedTopics = new Set(); // topic keys collapsed by user

  const chapterListEl = document.getElementById("chapter-list");
  const subjectTabsEl = document.getElementById("subject-tabs");
  const subjectDropdownEl = document.getElementById("subject-dropdown");
  const subjectDropdownBtnEl = document.getElementById("subject-dropdown-btn");
  const subjectDropdownLabelEl = document.getElementById("subject-dropdown-label");
  const subjectDropdownPanelEl = document.getElementById("subject-dropdown-panel");
  const chapterDropdownEl = document.getElementById("chapter-dropdown");
  const chapterDropdownBtnEl = document.getElementById("chapter-dropdown-btn");
  const chapterDropdownLabelEl = document.getElementById("chapter-dropdown-label");
  const chapterDropdownPanelEl = document.getElementById("chapter-dropdown-panel");
  const topicListEl = document.getElementById("topic-list");
  const chapterEyebrowEl = document.getElementById("chapter-eyebrow");
  const chapterTitleEl = document.getElementById("chapter-title");
  const globalStatsEl = document.getElementById("global-stats");
  const sliderWrapEl = document.getElementById("recency-slider-wrap");
  const sliderEl = document.getElementById("recency-slider");
  const sliderLabelEl = document.getElementById("recency-slider-label");
  const sliderRangeEl = document.getElementById("recency-slider-range");

  // ---------- checkbox persistence (localStorage) ----------
  const CHECK_STORAGE_KEY = "pyqAtlasChecked";
  let checkedState = {};
  try {
    checkedState = JSON.parse(localStorage.getItem(CHECK_STORAGE_KEY) || "{}");
  } catch (e) {
    checkedState = {};
  }
  function saveCheckedState() {
    try {
      localStorage.setItem(CHECK_STORAGE_KEY, JSON.stringify(checkedState));
    } catch (e) {
      /* storage unavailable — fail silently */
    }
  }
  function itemId(chNum, topicOrder, type, item) {
    return `ch${chNum}-tp${topicOrder}-${type}-${item.n}`;
  }

  // computes { checked, total, percent } for a chapter, counting every
  // MCQ+SAQ+LAQ item across all its topics against the persisted checkbox
  // state (not filtered by the current type/recency filters -- progress is
  // meant to be a stable measure of the whole chapter)
  function computeChapterProgress(ch) {
    let total = 0;
    let checked = 0;
    ch.topics.forEach((t, topicIdx) => {
      ["mcq", "saq", "laq"].forEach((type) => {
        t[type].forEach((item) => {
          total++;
          if (checkedState[itemId(ch.num, topicIdx, type, item)]) checked++;
        });
      });
    });
    const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
    return { checked, total, percent };
  }

  function progressPillHtml(ch) {
    const { total, percent } = computeChapterProgress(ch);
    if (total === 0) return "";
    const cls = percent === 100 ? "progress-pill complete" : percent > 0 ? "progress-pill has-progress" : "progress-pill";
    return `<span class="${cls}">${percent}%</span>`;
  }

  // ---------- recency preference persistence (localStorage) ----------
  const PREFS_STORAGE_KEY = "pyqAtlasPrefs";
  let prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) || "{}");
  } catch (e) {
    prefs = {};
  }
  if (Number.isFinite(prefs.recencyN) && prefs.recencyN >= 1) {
    recencyN = prefs.recencyN;
  }
  if (prefs.recencyFilter === "recent" || prefs.recencyFilter === "all") {
    recencyFilter = prefs.recencyFilter;
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({ recencyN, recencyFilter }));
    } catch (e) {
      /* storage unavailable — fail silently */
    }
  }

  // maps the fine-grained "paper" tag on each chapter to a top-level subject
  // used for the subject tab switcher (Pathology bundles papers 1, 2, and the appendix)
  const SUBJECT_MAP = {
    1: "pathology",
    2: "pathology",
    appendix: "pathology",
    microbiology: "microbiology",
    pharmacology: "pharmacology",
  };
  const SUBJECT_LABELS = {
    pathology: "Pathology",
    microbiology: "Microbiology",
    pharmacology: "Pharmacology",
  };
  const SUBJECT_ORDER = ["pathology", "microbiology", "pharmacology"];

  function chapterSubject(ch) {
    return SUBJECT_MAP[ch.paper] || "pathology";
  }

  fetch("data.json")
    .then((r) => r.json())
    .then((data) => {
      DATA = data.chapters || data; // backward compatible with flat-array shape
      META = data.meta || META;
      activeSubject = chapterSubject(DATA[0]);
      activeChapter = DATA[0].num;
      setupRecencySlider();
      renderSubjectTabs();
      renderChapterRail();
      renderMobileNav();
      renderGlobalStats();
      renderChapter();
    })
    .catch((err) => {
      topicListEl.innerHTML = `<div class="empty-state">Could not load data.json — ${err}</div>`;
    });

  function renderSubjectTabs() {
    subjectTabsEl.innerHTML = "";
    SUBJECT_ORDER.forEach((subj) => {
      const chaptersInSubject = DATA.filter((c) => chapterSubject(c) === subj);
      if (chaptersInSubject.length === 0) return;
      const freqSum = chaptersInSubject.reduce((s, c) => s + chapterFilteredFreq(c), 0);
      const btn = document.createElement("button");
      btn.className = "subject-tab" + (subj === activeSubject ? " active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", subj === activeSubject ? "true" : "false");
      btn.innerHTML = `<span>${SUBJECT_LABELS[subj]}</span><span class="subject-tab-count">${chaptersInSubject.length} ch · ${freqSum}×</span>`;
      btn.addEventListener("click", () => {
        if (subj === activeSubject) return;
        activeSubject = subj;
        const firstInSubject = DATA.find((c) => chapterSubject(c) === subj);
        if (firstInSubject) activeChapter = firstInSubject.num;
        renderSubjectTabs();
        renderChapterRail();
        renderMobileNav();
        renderChapter();
      });
      subjectTabsEl.appendChild(btn);
    });
  }

  // ---------- recency slider setup ----------
  function setupRecencySlider() {
    const span = Math.max(1, META.maxYear - META.minYear + 1);
    sliderEl.min = "1";
    sliderEl.max = String(span);
    sliderEl.value = String(Math.min(recencyN, span));
    recencyN = parseInt(sliderEl.value, 10);
    sliderRangeEl.textContent = `(data spans ${META.minYear}–${META.maxYear})`;
    updateSliderLabel();

    // apply a restored "recent" preference to the toggle + slider visibility
    if (recencyFilter === "recent") {
      const recentBtn = document.querySelector('#recency-filter .seg-btn[data-recency="recent"]');
      if (recentBtn) setActiveButton("recency-filter", recentBtn);
      sliderWrapEl.hidden = false;
    }

    sliderEl.addEventListener("input", () => {
      recencyN = parseInt(sliderEl.value, 10);
      updateSliderLabel();
      savePrefs();
      renderSubjectTabs();
      renderChapterRail();
      renderMobileNav();
      renderChapter();
    });
  }

  function updateSliderLabel() {
    const since = sinceYear();
    sliderLabelEl.textContent = `${recencyN} yr${recencyN === 1 ? "" : "s"} (${since}–${META.maxYear})`;
  }

  function sinceYear() {
    return META.maxYear - recencyN + 1;
  }

  // an item counts as "recent" under the current N-year window if it has
  // at least one exam-sitting year >= sinceYear()
  function itemRecentCount(item) {
    const cutoff = sinceYear();
    return (item.years || []).filter((y) => y >= cutoff).length;
  }
  function itemIsRecent(item) {
    return itemRecentCount(item) > 0;
  }

  function renderGlobalStats() {
    const totalFreq = DATA.reduce((s, c) => s + c.total_freq, 0);
    const totalTopics = DATA.reduce((s, c) => s + c.topics.length, 0);
    globalStatsEl.innerHTML = `<b>${DATA.length}</b> chapters · <b>${totalTopics}</b> topics · <b>${totalFreq}</b> tracked repeats`;
  }

  const PAPER_LABELS = {
    1: "Paper 1 — General Pathology",
    2: "Paper 2 — Systemic Pathology",
    appendix: "Appendix",
    microbiology: "Microbiology",
    pharmacology: "Pharmacology",
  };

  // computes the badge count for a chapter under the currently active
  // type + recency filters (sum of occurrences, matching the "×N" semantics
  // used everywhere else in the UI)
  function chapterFilteredFreq(ch) {
    const types = typeFilter === "all" ? ["mcq", "saq", "laq"] : [typeFilter];
    let sum = 0;
    ch.topics.forEach((t) => {
      types.forEach((typ) => {
        t[typ].forEach((item) => {
          if (recencyFilter === "recent") {
            sum += itemRecentCount(item);
          } else {
            sum += item.occurrences;
          }
        });
      });
    });
    return sum;
  }

  function renderChapterRail() {
    chapterListEl.innerHTML = "";
    let currentPaper = null;
    DATA.filter((ch) => chapterSubject(ch) === activeSubject).forEach((ch) => {
      if (ch.paper !== currentPaper) {
        currentPaper = ch.paper;
        const sectionLabel = document.createElement("li");
        sectionLabel.className = "rail-section-label";
        sectionLabel.textContent = PAPER_LABELS[currentPaper] || `Paper ${currentPaper}`;
        chapterListEl.appendChild(sectionLabel);
      }
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "chapter-item" + (ch.num === activeChapter ? " active" : "");
      const chLabel = ch.paper === "appendix" ? `Appx. ${ch.num}` : (ch.paper === "microbiology" || ch.paper === "pharmacology") ? `${ch.num}` : `Ch. ${ch.num}`;
      const freqShown = chapterFilteredFreq(ch);
      btn.innerHTML = `<span class="ch-num">${chLabel}</span>${escapeHtml(ch.title)}<span class="ch-badges">${progressPillHtml(ch)}<span class="ch-freq">${freqShown}×</span></span>`;
      btn.addEventListener("click", () => {
        activeChapter = ch.num;
        renderChapterRail();
        renderMobileNav();
        renderChapter();
        topicListEl.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      li.appendChild(btn);
      chapterListEl.appendChild(li);
    });
  }

  // ---------- mobile nav (custom-styled dropdowns, no horizontal scroll) ----------
  function closeAllDropdowns() {
    [subjectDropdownEl, chapterDropdownEl].forEach((el) => {
      el.classList.remove("open");
      el.querySelector(".mobile-dropdown-btn").setAttribute("aria-expanded", "false");
      el.querySelector(".mobile-dropdown-panel").hidden = true;
    });
  }

  function toggleDropdown(dropdownEl) {
    const isOpen = dropdownEl.classList.contains("open");
    closeAllDropdowns();
    if (!isOpen) {
      dropdownEl.classList.add("open");
      dropdownEl.querySelector(".mobile-dropdown-btn").setAttribute("aria-expanded", "true");
      dropdownEl.querySelector(".mobile-dropdown-panel").hidden = false;
    }
  }

  subjectDropdownBtnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown(subjectDropdownEl);
  });
  chapterDropdownBtnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown(chapterDropdownEl);
  });
  document.addEventListener("click", (e) => {
    if (!subjectDropdownEl.contains(e.target) && !chapterDropdownEl.contains(e.target)) {
      closeAllDropdowns();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns();
  });

  function renderMobileNav() {
    subjectDropdownLabelEl.textContent = SUBJECT_LABELS[activeSubject] || "Subject";

    // subject panel: build once (options don't change)
    if (!subjectDropdownPanelEl.dataset.populated) {
      subjectDropdownPanelEl.innerHTML = "";
      SUBJECT_ORDER.forEach((subj) => {
        const has = DATA.some((c) => chapterSubject(c) === subj);
        if (!has) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dropdown-option" + (subj === activeSubject ? " active" : "");
        btn.setAttribute("role", "option");
        btn.dataset.subj = subj;
        btn.textContent = SUBJECT_LABELS[subj];
        btn.addEventListener("click", () => {
          closeAllDropdowns();
          if (subj === activeSubject) return;
          activeSubject = subj;
          const firstInSubject = DATA.find((c) => chapterSubject(c) === subj);
          if (firstInSubject) activeChapter = firstInSubject.num;
          renderSubjectTabs();
          renderChapterRail();
          renderMobileNav();
          renderChapter();
        });
        subjectDropdownPanelEl.appendChild(btn);
      });
      subjectDropdownPanelEl.dataset.populated = "true";
    }
    // keep the active-highlight synced even though the panel is only built once
    subjectDropdownPanelEl.querySelectorAll(".dropdown-option").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.subj === activeSubject);
    });

    // chapter panel: rebuild whenever this runs (cheap: at most ~27 options),
    // grouped by paper section, matching the desktop rail's grouping
    chapterDropdownPanelEl.innerHTML = "";
    let currentPaper = null;
    let activeLabel = "Chapter";
    DATA.filter((ch) => chapterSubject(ch) === activeSubject).forEach((ch) => {
      if (ch.paper !== currentPaper) {
        currentPaper = ch.paper;
        const groupLabel = document.createElement("div");
        groupLabel.className = "dropdown-group-label";
        groupLabel.textContent = PAPER_LABELS[currentPaper] || `Paper ${currentPaper}`;
        chapterDropdownPanelEl.appendChild(groupLabel);
      }
      const chLabel = ch.paper === "appendix" ? `Appx. ${ch.num}` : (ch.paper === "microbiology" || ch.paper === "pharmacology") ? `${ch.num}` : `Ch. ${ch.num}`;
      const fullLabel = `${chLabel} — ${ch.title}`;
      const isActive = ch.num === activeChapter;
      if (isActive) activeLabel = fullLabel;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dropdown-option" + (isActive ? " active" : "");
      btn.setAttribute("role", "option");
      btn.innerHTML = `<span class="dropdown-option-label">${escapeHtml(fullLabel)}</span>${progressPillHtml(ch)}`;
      btn.addEventListener("click", () => {
        closeAllDropdowns();
        activeChapter = ch.num;
        renderChapterRail();
        renderMobileNav();
        renderChapter();
      });
      chapterDropdownPanelEl.appendChild(btn);
    });
    chapterDropdownLabelEl.textContent = activeLabel;
  }

  // ---------- filter controls ----------
  document.getElementById("type-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    typeFilter = btn.dataset.type;
    setActiveButton("type-filter", btn);
    renderSubjectTabs();
    renderChapterRail();
    renderChapter();
  });

  document.getElementById("sort-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    sortMode = btn.dataset.sort;
    setActiveButton("sort-filter", btn);
    renderChapter();
  });

  document.getElementById("recency-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    recencyFilter = btn.dataset.recency;
    setActiveButton("recency-filter", btn);
    sliderWrapEl.hidden = recencyFilter !== "recent";
    savePrefs();
    renderSubjectTabs();
    renderChapterRail();
    renderChapter();
  });

  function setActiveButton(groupId, btn) {
    document.querySelectorAll(`#${groupId} .seg-btn`).forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  }

  // ---------- main render ----------
  function renderChapter() {
    const ch = DATA.find((c) => c.num === activeChapter);
    if (!ch) return;

    const chFreqShown = chapterFilteredFreq(ch);
    const eyebrowPrefix = ch.paper === "appendix" ? "Appendix" : (ch.paper === "microbiology" || ch.paper === "pharmacology") ? "Section" : "Chapter";
    chapterEyebrowEl.textContent = `${eyebrowPrefix} ${ch.num} · ${chFreqShown} tracked repeats`;
    chapterTitleEl.textContent = ch.title;

    let topics = getFilteredSortedTopics(ch);

    if (topics.length === 0) {
      const scopeLabel = recencyFilter === "recent" ? ` in the last ${recencyN} year${recencyN === 1 ? "" : "s"}` : "";
      topicListEl.innerHTML = `<div class="empty-state">No ${typeFilter.toUpperCase()} questions recorded for this chapter${scopeLabel}.</div>`;
      return;
    }

    if (viewMode === "bullet") {
      renderChapterBulletMode(ch, topics);
      return;
    }

    const maxFreq = Math.max(...topics.map((t) => t.freq), 1);

    topicListEl.innerHTML = "";
    topics.forEach((topic) => {
      topicListEl.appendChild(renderTopicCard(ch.num, topic, maxFreq));
    });
  }

  // returns a shallow-filtered copy of a topic: when recencyFilter is "recent",
  // keeps only items with at least one occurrence in the last N academic years,
  // and swaps the displayed frequency to the recent-window count.
  function applyRecencyFilter(topic) {
    if (recencyFilter !== "recent") return topic;
    const mcq = topic.mcq.filter(itemIsRecent);
    const saq = topic.saq.filter(itemIsRecent);
    const laq = topic.laq.filter(itemIsRecent);
    const freq =
      mcq.reduce((s, i) => s + itemRecentCount(i), 0) +
      saq.reduce((s, i) => s + itemRecentCount(i), 0) +
      laq.reduce((s, i) => s + itemRecentCount(i), 0);
    return { ...topic, mcq, saq, laq, freq };
  }

  // ---------- export (share sheet on mobile / download on desktop) ----------
  const exportBtnEl = document.getElementById("export-btn");
  const exportBtnLabelEl = document.getElementById("export-btn-label");

  if (exportBtnLabelEl) {
    exportBtnLabelEl.textContent = isMobileDevice() ? "Share" : "Export";
  }

  function sanitizeFilename(s) {
    return String(s)
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 70);
  }

  // builds the same filtered + sorted topic list currently on screen,
  // using the exact same pipeline renderChapter() uses, so the export
  // always matches what's visible
  function getFilteredSortedTopics(ch) {
    let topics = ch.topics.map((t) => applyRecencyFilter(t));
    if (typeFilter !== "all") {
      topics = topics.filter((t) => t[typeFilter] && t[typeFilter].length > 0);
    }
    topics = topics.filter((t) => t.mcq.length + t.saq.length + t.laq.length > 0);
    if (sortMode === "frequency") {
      topics = topics.slice().sort((a, b) => b.freq - a.freq);
    } else {
      topics = topics.slice().sort((a, b) => a.textbook_order - b.textbook_order);
    }
    return topics;
  }

  // ============================================================
  // BULLET MODE — a separate, non-destructive rendering path.
  // Reuses getFilteredSortedTopics() so it automatically respects
  // whatever Type/Order/Recency filters are active (including the
  // live recency slider -- this is what makes the bulleting
  // "dynamic year depending" without any extra plumbing). Never
  // reads or writes anything Normal mode depends on.
  // ============================================================

  // shared child-concept vocabulary across all three subjects. A "child"
  // here means a recurring exam-answer concept (mechanism, test, feature)
  // that shows up inside a topic's own question text -- not a new parent,
  // since the parent is always the topic itself (already curated).
  const BULLET_CHILD_CONCEPTS = [
    // shared across subjects
    "pathogenesis", "pathogenicity", "etiology", "aetiology", "epidemiology",
    "classification", "morphology", "clinical features", "clinical presentation",
    "diagnosis", "laboratory diagnosis", "differential diagnosis", "treatment",
    "management", "prevention", "prophylaxis", "chemoprophylaxis",
    "complications", "prognosis", "risk factors", "types", "definition",
    "life cycle", "mode of transmission", "transmission", "incubation period",
    "immunity", "vaccine", "vaccination", "carrier state",
    // pathology-specific
    "gross features", "microscopic features", "special stains", "staging",
    "grading", "immunohistochemistry", "differences", "complications and prognosis",
    "morphological features", "radiological features", "biopsy",
    // pharmacology-specific
    "mechanism of action", "adverse effects", "adverse drug reactions",
    "therapeutic uses", "indications", "contraindications", "dose",
    "drug interactions", "pharmacokinetics", "precautions", "uses",
    // microbiology-specific tests/media (kept short -- broad list already
    // covered by "laboratory diagnosis" above for most cases)
    "blood culture", "stool culture", "widal test", "elisa", "pcr",
    "gram stain", "acid-fast stain", "koh mount", "culture media",
  ];
  const BULLET_GAZETTEER = Array.from(new Set(BULLET_CHILD_CONCEPTS.map((s) => s.toLowerCase()))).sort(
    (a, b) => b.length - a.length
  );

  function bulletDisplayCase(term) {
    const small = new Set(["of", "and", "the", "in", "due", "to"]);
    return term
      .split(" ")
      .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" ");
  }

  // finds all BULLET_GAZETTEER terms mentioned across a topic's questions,
  // ranked by how many distinct questions mention each one. Respects the
  // active Type filter (All/LAQ/SAQ/MCQ), same convention Normal mode uses.
  function extractBulletChildren(topic) {
    const occurrences = {}; // term -> count of distinct questions
    const typesToScan = typeFilter === "all" ? ["mcq", "saq", "laq"] : [typeFilter];
    typesToScan.forEach((typ) => {
      (topic[typ] || []).forEach((item) => {
        const lower = item.q.toLowerCase().replace(/-/g, " ");
        const foundInThisQ = new Set();
        BULLET_GAZETTEER.forEach((term) => {
          if (term.length < 4) return;
          const idx = lower.indexOf(term);
          if (idx === -1) return;
          const beforeOk = idx === 0 || !/[a-z0-9]/.test(lower[idx - 1]);
          const afterEnd = idx + term.length;
          const afterOk = afterEnd >= lower.length || !/[a-z0-9]/.test(lower[afterEnd]);
          if (beforeOk && afterOk) foundInThisQ.add(term);
        });
        foundInThisQ.forEach((term) => {
          occurrences[term] = (occurrences[term] || 0) + 1;
        });
      });
    });
    return Object.entries(occurrences)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([term, count]) => ({ label: bulletDisplayCase(term), count }));
  }

  function bulletSlug(s) {
    return String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // ---------- bullet-mode checkbox persistence (own localStorage key,
  // completely separate from Normal mode's question-level checkboxes) ----------
  const BULLET_CHECK_KEY = "pyqAtlasBulletChecked";
  let bulletCheckedState = {};
  try {
    bulletCheckedState = JSON.parse(localStorage.getItem(BULLET_CHECK_KEY) || "{}");
  } catch (e) {
    bulletCheckedState = {};
  }
  function saveBulletCheckedState() {
    try {
      localStorage.setItem(BULLET_CHECK_KEY, JSON.stringify(bulletCheckedState));
    } catch (e) {
      /* storage unavailable -- fail silently */
    }
  }

  function renderChapterBulletMode(ch, topics) {
    topicListEl.innerHTML = "";
    let cardIndex = 0;
    topics.forEach((topic) => {
      const card = document.createElement("article");
      card.className = "bullet-topic-card";
      card.style.animationDelay = Math.min(cardIndex * 90, 1400) + "ms";
      cardIndex++;

      const header = document.createElement("div");
      header.className = "bullet-topic-header";
      header.innerHTML = `
        <h3 class="bullet-topic-name">${escapeHtml(topic.name)}</h3>
        <span class="bullet-topic-freq">${topic.freq}×</span>
      `;
      card.appendChild(header);

      const children = extractBulletChildren(topic);
      const childrenWrap = document.createElement("div");
      childrenWrap.className = "bullet-children";

      if (children.length === 0) {
        // "if one topic alone" -- no sub-concepts detected, so the checkbox
        // goes on the topic itself instead of leaving it unchecked-able
        const id = `bullet-ch${ch.num}-tp${topic.textbook_order}-topic`;
        childrenWrap.appendChild(buildBulletRow(id, topic.name, topic.freq, true));
      } else {
        children.forEach((child) => {
          const id = `bullet-ch${ch.num}-tp${topic.textbook_order}-${bulletSlug(child.label)}`;
          childrenWrap.appendChild(buildBulletRow(id, child.label, child.count, false));
        });
      }

      card.appendChild(childrenWrap);
      topicListEl.appendChild(card);
    });
  }

  function buildBulletRow(id, label, count, isFallback) {
    const row = document.createElement("div");
    row.className = "bullet-row" + (isFallback ? " fallback" : "");
    const checked = !!bulletCheckedState[id];
    if (checked) row.classList.add("checked");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "bullet-check";
    cb.id = id;
    cb.checked = checked;
    cb.addEventListener("change", () => {
      bulletCheckedState[id] = cb.checked;
      saveBulletCheckedState();
      row.classList.toggle("checked", cb.checked);
    });

    const lbl = document.createElement("label");
    lbl.className = "bullet-label";
    lbl.htmlFor = id;
    lbl.textContent = label;

    const countEl = document.createElement("span");
    countEl.className = "bullet-count";
    countEl.textContent = `${count}×`;

    row.appendChild(cb);
    row.appendChild(lbl);
    row.appendChild(countEl);
    return row;
  }

  // ---------- mode toggle ----------
  document.getElementById("mode-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    viewMode = btn.dataset.mode;
    setActiveButton("mode-filter", btn);
    renderChapter();
  });

  function buildNormalExportText() {
    const ch = DATA.find((c) => c.num === activeChapter);
    if (!ch) return "";

    const typeLabel = typeFilter === "all" ? "All (LAQ + SAQ + MCQ)" : typeFilter.toUpperCase();
    const sortLabel = sortMode === "frequency" ? "Most repeated first" : "Textbook order";
    const recencyLabel =
      recencyFilter === "recent"
        ? `Last ${recencyN} year${recencyN === 1 ? "" : "s"} only (${sinceYear()}–${META.maxYear})`
        : "All years";

    const lines = [];
    lines.push("PYQ ATLAS — EXPORTED QUESTION SET");
    lines.push("=".repeat(48));
    lines.push(`Subject:  ${SUBJECT_LABELS[activeSubject] || activeSubject}`);
    lines.push(`Chapter:  ${ch.title}`);
    lines.push(`Filters applied to produce this file —`);
    lines.push(`  Type:     ${typeLabel}`);
    lines.push(`  Order:    ${sortLabel}`);
    lines.push(`  Recency:  ${recencyLabel}`);
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push("=".repeat(48));
    lines.push("");

    const topics = getFilteredSortedTopics(ch);

    if (topics.length === 0) {
      lines.push("(No questions match the current filters.)");
      return lines.join("\n");
    }

    const order = typeFilter === "all" ? ["laq", "saq", "mcq"] : [typeFilter];

    topics.forEach((topic) => {
      const freqSuffix = recencyFilter === "recent" ? `in last ${recencyN} yr${recencyN === 1 ? "" : "s"}` : "total";
      lines.push(`## ${topic.name}  (${topic.freq}× ${freqSuffix})`);
      lines.push("");
      order.forEach((type) => {
        const items = topic[type];
        if (!items || items.length === 0) return;
        lines.push(`--- ${type.toUpperCase()} ---`);
        items.forEach((item, idx) => {
          const freqLabel =
            recencyFilter === "recent"
              ? `${itemRecentCount(item)}× in last ${recencyN} yr${recencyN === 1 ? "" : "s"}`
              : item.occurrences > 1
              ? `${item.occurrences}× repeated`
              : "asked once";
          lines.push(`${idx + 1}. ${item.q}`);
          lines.push(`   [${freqLabel} — ${item.codes.join(", ")}]`);
          if (type === "mcq") {
            Object.entries(item.options).forEach(([letter, text]) => {
              lines.push(`   ${letter}) ${text}`);
            });
            lines.push(`   Answer: ${item.answer}`);
            lines.push(`   Explanation: ${item.explanation}`);
          }
          lines.push("");
        });
      });
      lines.push("");
    });

    return lines.join("\n");
  }

  // mirrors renderChapterBulletMode()'s exact logic (same extractBulletChildren
  // call, same topic-vs-child fallback rule, same checkbox IDs) so the export
  // can never drift from whatever's actually shown on screen in Bullet mode
  function buildBulletExportText() {
    const ch = DATA.find((c) => c.num === activeChapter);
    if (!ch) return "";

    const typeLabel = typeFilter === "all" ? "All (LAQ + SAQ + MCQ)" : typeFilter.toUpperCase();
    const sortLabel = sortMode === "frequency" ? "Most repeated first" : "Textbook order";
    const recencyLabel =
      recencyFilter === "recent"
        ? `Last ${recencyN} year${recencyN === 1 ? "" : "s"} only (${sinceYear()}–${META.maxYear})`
        : "All years";

    const lines = [];
    lines.push("PYQ ATLAS — EXPORTED BULLET-MODE OVERVIEW");
    lines.push("=".repeat(48));
    lines.push(`Subject:  ${SUBJECT_LABELS[activeSubject] || activeSubject}`);
    lines.push(`Chapter:  ${ch.title}`);
    lines.push(`Mode:     Bullet (concept overview, not full Q&A text)`);
    lines.push(`Filters applied to produce this file —`);
    lines.push(`  Type:     ${typeLabel}`);
    lines.push(`  Order:    ${sortLabel}`);
    lines.push(`  Recency:  ${recencyLabel}`);
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push("=".repeat(48));
    lines.push("");

    const topics = getFilteredSortedTopics(ch);

    if (topics.length === 0) {
      lines.push("(No questions match the current filters.)");
      return lines.join("\n");
    }

    const freqSuffix = recencyFilter === "recent" ? `in last ${recencyN} yr${recencyN === 1 ? "" : "s"}` : "total";

    topics.forEach((topic) => {
      lines.push(`## ${topic.name}  (${topic.freq}× ${freqSuffix})`);
      const children = extractBulletChildren(topic);
      if (children.length === 0) {
        // same "topic stands alone" fallback rule used on screen
        const id = `bullet-ch${ch.num}-tp${topic.textbook_order}-topic`;
        const mark = bulletCheckedState[id] ? "[x]" : "[ ]";
        lines.push(`  ${mark} ${topic.name} (${topic.freq}×)`);
      } else {
        children.forEach((child) => {
          const id = `bullet-ch${ch.num}-tp${topic.textbook_order}-${bulletSlug(child.label)}`;
          const mark = bulletCheckedState[id] ? "[x]" : "[ ]";
          lines.push(`  ${mark} ${child.label} (${child.count}×)`);
        });
      }
      lines.push("");
    });

    return lines.join("\n");
  }

  // dispatcher: keeps the single call site in shareOrDownloadExport() simple,
  // and guarantees the export always matches whichever mode is on screen
  function buildExportText() {
    return viewMode === "bullet" ? buildBulletExportText() : buildNormalExportText();
  }

  // desktop browsers (Edge on Windows, Safari on macOS) increasingly expose
  // navigator.share too, which would wrongly pop the share sheet on a PC.
  // Only treat it as "mobile" using a real signal, not just API presence.
  function isMobileDevice() {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
      return navigator.userAgentData.mobile;
    }
    return /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(navigator.userAgent || "");
  }

  async function shareOrDownloadExport() {
    const ch = DATA.find((c) => c.num === activeChapter);
    const text = buildExportText();
    const namePart = ch ? `${SUBJECT_LABELS[activeSubject] || ""}_${ch.title}` : "export";
    const modeSuffix = viewMode === "bullet" ? "_bullet-mode" : "";
    const filename = `PYQ-Atlas_${sanitizeFilename(namePart)}${modeSuffix}.txt`;
    const blob = new Blob([text], { type: "text/plain" });

    if (isMobileDevice() && typeof navigator.share === "function") {
      try {
        const file = new File([blob], filename, { type: "text/plain" });
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
        // some mobile browsers support share() but not file sharing -- fall
        // back to sharing as plain text so the sheet still opens
        await navigator.share({ title: filename, text });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return; // user cancelled, don't also download
        // any other failure -- fall through to download
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (exportBtnEl) {
    exportBtnEl.addEventListener("click", () => {
      shareOrDownloadExport();
    });
  }

  function renderTopicCard(chNum, topic, maxFreq) {
    const key = `${chNum}::${topic.name}`;
    const collapsed = collapsedTopics.has(key);

    const card = document.createElement("article");
    card.className = "topic-card" + (collapsed ? " collapsed" : "");

    const barPct = Math.max(6, Math.round((topic.freq / maxFreq) * 100));

    const counts = [
      ["laq", topic.laq.length],
      ["saq", topic.saq.length],
      ["mcq", topic.mcq.length],
    ].filter(([, n]) => n > 0)
      .map(([type, n]) => `<span class="type-count"><b>${n}</b> ${type.toUpperCase()}</span>`)
      .join("");

    const head = document.createElement("div");
    head.className = "topic-head";
    const freqLabel = recencyFilter === "recent" ? `last ${recencyN} yr${recencyN === 1 ? "" : "s"}` : "total";
    head.innerHTML = `
      <div class="topic-heading">
        <h3 class="topic-name">${escapeHtml(topic.name)}</h3>
        <div class="topic-meta">${counts}</div>
      </div>
      <div class="freq-block">
        <div class="freq-bar-wrap"><div class="freq-bar-fill" style="width:${barPct}%"></div></div>
        <span class="freq-number">${topic.freq}× <small>${freqLabel}</small></span>
        <span class="chevron">▾</span>
      </div>
    `;
    head.addEventListener("click", () => {
      if (collapsedTopics.has(key)) collapsedTopics.delete(key);
      else collapsedTopics.add(key);
      renderChapter();
    });

    const body = document.createElement("div");
    body.className = "topic-body";

    const order = typeFilter === "all" ? ["laq", "saq", "mcq"] : [typeFilter];
    order.forEach((type) => {
      const items = topic[type];
      if (!items || items.length === 0) return;
      body.appendChild(renderTypeSection(chNum, topic.textbook_order, type, items));
    });

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  function renderTypeSection(chNum, topicOrder, type, items) {
    const section = document.createElement("div");
    section.className = "type-section";

    const label = document.createElement("div");
    label.className = `type-section-label ${type}`;
    label.textContent = type.toUpperCase();
    section.appendChild(label);

    items.forEach((item) => {
      section.appendChild(type === "mcq" ? renderMcqItem(chNum, topicOrder, item) : renderPlainItem(chNum, topicOrder, type, item));
    });

    return section;
  }

  function buildCheckbox(id, row) {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "q-check";
    cb.checked = !!checkedState[id];
    cb.setAttribute("aria-label", "Mark question as reviewed");
    if (cb.checked) row.classList.add("checked");
    cb.addEventListener("change", () => {
      checkedState[id] = cb.checked;
      saveCheckedState();
      row.classList.toggle("checked", cb.checked);
      renderChapterRail();
      renderMobileNav();
    });
    return cb;
  }

  function renderPlainItem(chNum, topicOrder, type, item) {
    const id = itemId(chNum, topicOrder, type, item);
    const row = document.createElement("div");
    row.className = "q-item";

    const rowInner = document.createElement("div");
    rowInner.className = "q-row";

    const cb = buildCheckbox(id, row);
    const textEl = document.createElement("div");
    textEl.className = "q-text";
    textEl.textContent = item.q;

    rowInner.appendChild(cb);
    rowInner.appendChild(textEl);
    rowInner.insertAdjacentHTML("beforeend", renderTags(item));

    row.appendChild(rowInner);
    return row;
  }

  function renderMcqItem(chNum, topicOrder, item) {
    const id = itemId(chNum, topicOrder, "mcq", item);
    const row = document.createElement("div");
    row.className = "q-item";

    const top = document.createElement("div");
    top.className = "q-row";

    const cb = buildCheckbox(id, row);
    const textEl = document.createElement("div");
    textEl.className = "q-text";
    textEl.textContent = item.q;

    top.appendChild(cb);
    top.appendChild(textEl);
    top.insertAdjacentHTML("beforeend", renderTags(item));
    row.appendChild(top);

    const block = document.createElement("div");
    block.className = "mcq-block";

    const optsWrap = document.createElement("div");
    optsWrap.className = "mcq-options";

    const correctLetter = (item.answer.match(/^([a-dA-D])\)/) || [])[1];
    const correctLetterLower = correctLetter ? correctLetter.toLowerCase() : null;

    const explainEl = document.createElement("div");
    explainEl.className = "mcq-explain";
    explainEl.style.display = "none";
    explainEl.innerHTML = `<b>Explanation:</b> ${escapeHtml(item.explanation)}`;

    Object.entries(item.options).forEach(([letter, text]) => {
      const btn = document.createElement("button");
      btn.className = "opt-btn";
      btn.innerHTML = `<span class="opt-letter">${letter})</span><span>${escapeHtml(text)}</span>`;
      btn.addEventListener("click", () => {
        const allBtns = optsWrap.querySelectorAll(".opt-btn");
        allBtns.forEach((b) => (b.disabled = true));
        allBtns.forEach((b) => {
          const l = b.querySelector(".opt-letter").textContent.replace(")", "");
          if (l.toLowerCase() === correctLetterLower) b.classList.add("correct");
          else b.classList.add("dim");
        });
        if (letter !== correctLetterLower) btn.classList.add("incorrect");
        explainEl.style.display = "block";
      });
      optsWrap.appendChild(btn);
    });

    block.appendChild(optsWrap);
    block.appendChild(explainEl);
    row.appendChild(block);
    return row;
  }

  function renderTags(item) {
    const trending = item.trending
      ? `<span class="tag tag-trending">▲ recent 5-yr surge</span>`
      : "";
    let freqLabel;
    if (recencyFilter === "recent") {
      const n = itemRecentCount(item);
      freqLabel = n > 1 ? `${n}× in last ${recencyN} yr${recencyN === 1 ? "" : "s"}` : `once in last ${recencyN} yr${recencyN === 1 ? "" : "s"}`;
    } else {
      freqLabel = item.occurrences > 1 ? `${item.occurrences}× repeated` : `asked once`;
    }
    return `
      <div class="q-tags">
        <span class="tag tag-freq">${freqLabel}</span>
        ${trending}
        <span class="tag-codes">${escapeHtml(item.codes.join(" · "))}</span>
      </div>
    `;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
