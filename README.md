# PYQ Atlas — Pathology Paper 1 & 2 Frequency Map

A static, filterable dashboard mapping every MCQ / SAQ / LAQ in the MUHS
Pathology verbatim PYQ banks (Paper 1 — General Pathology, chapters 1–8, and
Paper 2 — Systemic Pathology, chapters 9–26 + Appendix I) to a topic, showing
how many exam sittings each topic and each individual question has repeated
across.

## What's inside

- `index.html` / `style.css` / `app.js` — the site (vanilla JS, no build step)
- `data.json` — the parsed + classified question bank: 27 chapters, 1,481 questions
- `vercel.json` — static deployment config

## Features

- **Chapter rail** — all 27 chapters (grouped under "Paper 1 — General
  Pathology", "Paper 2 — Systemic Pathology", and "Appendix"), each with a
  running frequency count
- **Type filter** — All / LAQ / SAQ / MCQ
- **Order filter** — Textbook order (matches Robbins & Cotran chapter flow) vs.
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
- **Interactive MCQs** — tap an option to reveal the correct answer and a short
  explanation, inline
- **Frequency tags** — each question shows how many sittings it has repeated
  in, plus a "▲ recent 5-yr surge" tag for questions concentrated in the last
  five academic years (2020–2024)

## Deploying to Vercel

```bash
cd pyq-atlas
vercel deploy --prod
```

Or drag-and-drop the folder into the Vercel dashboard — it's a static site,
no build command or environment variables needed.

## Regenerating / extending data.json

The classification pipeline that produced `data.json` lives outside this
folder (parse → classify → aggregate → merge). If you hand Claude a new
verbatim PYQ text file in the same `Chapter N: Title` / `MCQ (MUHS)` / `SAQ` /
`LAQ` format (e.g. a Paper 3, or a revised Paper 1/2), it can re-run the same
pipeline — regex parse → per-chapter keyword-based topic classification →
frequency/recency aggregation → merge with the existing chapters — to produce
an updated `data.json`. Just ask, and attach the new file.

## Notes on the frequency methodology

- **Occurrence count** for a single question = number of exam-sitting codes
  attached to it, e.g. `(W-13,18)` counts as 2, `(S-15)(W-17,20)` counts as 3.
- **Topic frequency** = sum of occurrence counts across every MCQ + SAQ + LAQ
  classified under that topic.
- **"Recent surge"** tag = the question has 2+ occurrences in 2020–2024,
  or its most recent occurrence is 2022+ with rising frequency. This badge
  uses a fixed 5-year definition regardless of the Recency slider setting
  (the slider controls filtering; the surge badge is a separate, fixed signal).
- Topic classification was done with a hand-tuned keyword taxonomy per
  chapter (not a generic clustering algorithm), designed to mirror how the
  chapter is actually organized in Robbins & Cotran / Nayak.
- A few questions cover material that naturally overlaps two chapters (e.g. a
  Rheumatic Heart Disease MCQ appearing in the Haematopoietic System bank);
  these are classified into a chapter-scoped "cross-topic" bucket rather than
  moved to the other chapter, so every chapter's item count matches the
  source PYQ file exactly.

