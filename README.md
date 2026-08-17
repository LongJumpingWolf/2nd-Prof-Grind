# PYQ Atlas — Pathology + Microbiology + Pharmacology Frequency Map

A static, filterable dashboard mapping every MCQ / SAQ / LAQ across the MUHS
Pathology verbatim PYQ banks (Paper 1 — General Pathology, chapters 1–8;
Paper 2 — Systemic Pathology, chapters 9–26 + Appendix I), the Microbiology
bank (9 organ-system sections, ~64 textbook chapters, MCQ+SAQ+LAQ), and the
Pharmacology bank (14 subject areas, ~70 textbook subtopics, MCQ+SAQ+LAQ) to
a topic, showing how many exam sittings each topic and each individual
question has repeated across.

## What's inside

- `index.html` / `style.css` / `app.js` — the site (vanilla JS, no build step)
- `data.json` — the parsed + classified question bank: 50 chapters, 4,691 questions
- `vercel.json` — static deployment config

## Features

- **Chapter rail** — all 50 chapters, grouped under "Paper 1 — General
  Pathology," "Paper 2 — Systemic Pathology," "Appendix," "Microbiology," and
  "Pharmacology," each with a running frequency count
- **Type filter** — All / LAQ / SAQ / MCQ (all three subjects now have SAQ and
  LAQ coverage alongside MCQs)
- **Order filter** — Textbook order (matches the source chapter flow) vs.
  Most repeated (topics sorted by summed MCQ+SAQ+LAQ occurrence count)
- **Recency filter with a customizable window** — All years vs. Last N yrs
  only, where N is set with a slider bounded by the actual year range in the
  data (currently 1970–2024, so the slider runs 1 to 55). Narrows both the
  topic list and each topic's questions down to what's actually appeared in
  that window, and swaps every frequency badge (topic cards, per-question
  tags, and the chapter sidebar counts) to show the recent-window count
  instead of the all-time count.
- **Chapter sidebar counts update live** — the "×N" badge next to each
  chapter reflects whatever Type + Recency filters are currently active, not
  a fixed all-time total.
- **Checkboxes with persistent memory** — every question has a checkbox to
  mark it reviewed. Checked questions grey out and get struck through, and
  the state is saved to the browser's local storage, so it survives page
  reloads and browser restarts (it's per-browser, not synced across devices).

## Deploying to Vercel

```bash
cd pyq-atlas
vercel deploy --prod
```

Or drag-and-drop the folder into the Vercel dashboard — it's a static site,
no build command or environment variables needed.

## Regenerating / extending data.json

The classification pipeline that produced `data.json` lives outside this
folder (parse → classify → aggregate → merge), one script per subject's
source format:
- Pathology: `Chapter N: Title` / `MCQ (MUHS)` / `SAQ` / `LAQ` plain-text format
- Microbiology: `## Section`, `### Chapter N: Title`, `**N. Question (CODE)**` markdown
- Pharmacology: `NN_Folder_Name`, `N. Subtopic Title.`, `· MCQ N: Question (CODE)` bulleted format

If you hand Claude a new verbatim PYQ file in any of these formats (or a new
subject entirely), it can write or reuse the matching parser and merge the
result into the existing chapter set. Just ask, and attach the new file.

## Notes on the frequency methodology

- **Occurrence count** for a single question = number of exam-sitting codes
  attached to it, e.g. `(W-13,18)` counts as 2, `(S-15)(W-17,20)` counts as 3.
- **Topic frequency** = sum of occurrence counts across every MCQ + SAQ + LAQ
  classified under that topic.
- **"Recent surge"** tag = the question has 2+ occurrences in the most recent
  5 years of its own dataset, or its most recent occurrence is within the
  last 2 years of that window. This badge uses a fixed 5-year definition
  independent of the Recency slider (the slider controls filtering; the
  surge badge is a separate, fixed signal).
- Pathology topic classification was done with a hand-tuned keyword taxonomy
  per chapter, designed to mirror how the chapter is actually organized in
  Robbins & Cotran / Nayak. A few questions cover material that naturally
  overlaps two chapters; these are classified into a chapter-scoped
  "cross-topic" bucket rather than moved to the other chapter, so every
  chapter's item count matches the source PYQ file exactly.
- Microbiology and Pharmacology needed no keyword classification: their
  source material is already organized narrowly enough (Sastry's chapters
  for Microbiology, Tripathi-style subtopics for Pharmacology) that each
  textbook subtopic was used directly as a site "topic," grouped under its
  organ-system section (Microbiology) or subject folder (Pharmacology).
- A tiny number of items in each subject have no exam-sitting code at all
  (verbatim source gap, not a parsing error) — these still count as "asked
  once" but never appear in a recency-filtered view since they have no year
  to filter on.

## Note on checkbox IDs

Question checkbox IDs are `ch{chapter}-tp{topicIndex}-{type}-{n}`, where
`topicIndex` is the topic's position within its chapter. This is required
because question numbering (`n`) restarts within each textbook chapter/
subtopic, and several subtopics live inside one site chapter for both
Microbiology and Pharmacology — without the topic index, two unrelated
questions could share an ID and get checked together.
