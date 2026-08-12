# PYQ Atlas — Pathology Paper 1 Frequency Map

A static, filterable dashboard mapping every MCQ / SAQ / LAQ in the MUHS
Pathology Paper 1 verbatim PYQ bank to a topic, showing how many exam
sittings each topic and each individual question has repeated across.

## What's inside

- `index.html` / `style.css` / `app.js` — the site (vanilla JS, no build step)
- `data.json` — the parsed + classified question bank (8 chapters, 394 questions)
- `vercel.json` — static deployment config

## Features

- **Chapter rail** — all 8 chapters with a running frequency count
- **Type filter** — All / LAQ / SAQ / MCQ
- **Order filter** — Textbook order (matches Robbins & Cotran chapter flow) vs.
  Most repeated (topics sorted by summed MCQ+SAQ+LAQ occurrence count)
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

## Regenerating data.json from a new PYQ bank

The classification pipeline that produced `data.json` lives outside this
folder (parse → classify → aggregate). If you hand Claude a new verbatim PYQ
text file in the same `Chapter N: Title` / `MCQ (MUHS)` / `SAQ` / `LAQ`
format, it can re-run the same three-stage pipeline (regex parse → per-chapter
keyword-based topic classification → frequency/recency aggregation) to
produce an updated `data.json` — just ask.

## Notes on the frequency methodology

- **Occurrence count** for a single question = number of exam-sitting codes
  attached to it, e.g. `(W-13,18)` counts as 2, `(S-15)(W-17,20)` counts as 3.
- **Topic frequency** = sum of occurrence counts across every MCQ + SAQ + LAQ
  classified under that topic.
- **"Recent 5-yr surge"** tag = the question has 2+ occurrences in 2020–2024,
  or its most recent occurrence is 2022+ with rising frequency.
- Topic classification was done with a hand-tuned keyword taxonomy per
  chapter (not a generic clustering algorithm), designed to mirror how the
  chapter is actually organized in Robbins & Cotran.
