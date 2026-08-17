(function () {
  "use strict";

  let DATA = [];
  let META = { minYear: 2000, maxYear: 2024 };
  let activeChapter = null;
  let activeSubject = null;   // pathology | microbiology | pharmacology
  let typeFilter = "all";     // all | laq | saq | mcq
  let sortMode = "textbook";  // textbook | frequency
  let recencyFilter = "all";  // all | recent
  let recencyN = 5;           // customizable "last N years"
  const collapsedTopics = new Set(); // topic keys collapsed by user

  const chapterListEl = document.getElementById("chapter-list");
  const subjectTabsEl = document.getElementById("subject-tabs");
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

    sliderEl.addEventListener("input", () => {
      recencyN = parseInt(sliderEl.value, 10);
      updateSliderLabel();
      renderSubjectTabs();
      renderChapterRail();
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
      btn.innerHTML = `<span class="ch-num">${chLabel}</span>${escapeHtml(ch.title)}<span class="ch-freq">${freqShown}×</span>`;
      btn.addEventListener("click", () => {
        activeChapter = ch.num;
        renderChapterRail();
        renderChapter();
        topicListEl.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      li.appendChild(btn);
      chapterListEl.appendChild(li);
    });
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

    let topics = ch.topics.map((t) => applyRecencyFilter(t));

    // filter out topics with zero items in the selected type
    if (typeFilter !== "all") {
      topics = topics.filter((t) => t[typeFilter] && t[typeFilter].length > 0);
    }

    // filter out topics with no items at all (can happen after recency filtering)
    topics = topics.filter((t) => t.mcq.length + t.saq.length + t.laq.length > 0);

    // sort
    if (sortMode === "frequency") {
      topics = topics.slice().sort((a, b) => b.freq - a.freq);
    } else {
      topics = topics.slice().sort((a, b) => a.textbook_order - b.textbook_order);
    }

    if (topics.length === 0) {
      const scopeLabel = recencyFilter === "recent" ? ` in the last ${recencyN} year${recencyN === 1 ? "" : "s"}` : "";
      topicListEl.innerHTML = `<div class="empty-state">No ${typeFilter.toUpperCase()} questions recorded for this chapter${scopeLabel}.</div>`;
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
