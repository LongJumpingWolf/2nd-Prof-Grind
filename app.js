(function () {
  "use strict";

  let DATA = [];
  let activeChapter = null;
  let typeFilter = "all";     // all | laq | saq | mcq
  let sortMode = "textbook";  // textbook | frequency
  const collapsedTopics = new Set(); // topic keys collapsed by user

  const chapterListEl = document.getElementById("chapter-list");
  const topicListEl = document.getElementById("topic-list");
  const chapterEyebrowEl = document.getElementById("chapter-eyebrow");
  const chapterTitleEl = document.getElementById("chapter-title");
  const globalStatsEl = document.getElementById("global-stats");

  fetch("data.json")
    .then((r) => r.json())
    .then((data) => {
      DATA = data;
      activeChapter = DATA[0].num;
      renderChapterRail();
      renderGlobalStats();
      renderChapter();
    })
    .catch((err) => {
      topicListEl.innerHTML = `<div class="empty-state">Could not load data.json — ${err}</div>`;
    });

  function renderGlobalStats() {
    const totalFreq = DATA.reduce((s, c) => s + c.total_freq, 0);
    const totalTopics = DATA.reduce((s, c) => s + c.topics.length, 0);
    globalStatsEl.innerHTML = `<b>${DATA.length}</b> chapters · <b>${totalTopics}</b> topics · <b>${totalFreq}</b> tracked repeats`;
  }

  function renderChapterRail() {
    chapterListEl.innerHTML = "";
    DATA.forEach((ch) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "chapter-item" + (ch.num === activeChapter ? " active" : "");
      btn.innerHTML = `<span class="ch-num">Ch. ${ch.num}</span>${escapeHtml(ch.title)}<span class="ch-freq">${ch.total_freq}×</span>`;
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
    renderChapter();
  });

  document.getElementById("sort-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    sortMode = btn.dataset.sort;
    setActiveButton("sort-filter", btn);
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

    chapterEyebrowEl.textContent = `Chapter ${ch.num} · ${ch.total_freq} tracked repeats`;
    chapterTitleEl.textContent = ch.title;

    let topics = ch.topics.slice();

    // filter out topics with zero items in the selected type
    if (typeFilter !== "all") {
      topics = topics.filter((t) => t[typeFilter] && t[typeFilter].length > 0);
    }

    // sort
    if (sortMode === "frequency") {
      topics = topics.slice().sort((a, b) => b.freq - a.freq);
    } else {
      topics = topics.slice().sort((a, b) => a.textbook_order - b.textbook_order);
    }

    if (topics.length === 0) {
      topicListEl.innerHTML = `<div class="empty-state">No ${typeFilter.toUpperCase()} questions recorded for this chapter.</div>`;
      return;
    }

    const maxFreq = Math.max(...ch.topics.map((t) => t.freq), 1);

    topicListEl.innerHTML = "";
    topics.forEach((topic) => {
      topicListEl.appendChild(renderTopicCard(ch.num, topic, maxFreq));
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
    head.innerHTML = `
      <div class="topic-heading">
        <h3 class="topic-name">${escapeHtml(topic.name)}</h3>
        <div class="topic-meta">${counts}</div>
      </div>
      <div class="freq-block">
        <div class="freq-bar-wrap"><div class="freq-bar-fill" style="width:${barPct}%"></div></div>
        <span class="freq-number">${topic.freq}× <small>total</small></span>
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
      body.appendChild(renderTypeSection(type, items));
    });

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  function renderTypeSection(type, items) {
    const section = document.createElement("div");
    section.className = "type-section";

    const label = document.createElement("div");
    label.className = `type-section-label ${type}`;
    label.textContent = type.toUpperCase();
    section.appendChild(label);

    items.forEach((item) => {
      section.appendChild(type === "mcq" ? renderMcqItem(item) : renderPlainItem(item));
    });

    return section;
  }

  function renderPlainItem(item) {
    const row = document.createElement("div");
    row.className = "q-item";
    row.innerHTML = `
      <div class="q-row">
        <div class="q-text">${escapeHtml(item.q)}</div>
        ${renderTags(item)}
      </div>
    `;
    return row;
  }

  function renderMcqItem(item) {
    const row = document.createElement("div");
    row.className = "q-item";

    const top = document.createElement("div");
    top.className = "q-row";
    top.innerHTML = `
      <div class="q-text">${escapeHtml(item.q)}</div>
      ${renderTags(item)}
    `;
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
    const freqLabel = item.occurrences > 1 ? `${item.occurrences}× repeated` : `asked once`;
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
