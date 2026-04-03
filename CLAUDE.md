# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NOVA AUTO** is an automation suite by Massaka SAS that reduces repetitive tasks through AI-powered workflows. The current module — **Veille Actualités** — is a serverless agricultural news monitoring system for African markets.

The entire codebase runs on **Google Apps Script** (no local build or test commands exist). Development happens by editing `.gs` files and deploying/testing them directly in the [Google Apps Script editor](https://script.google.com).

## Architecture

### Current Module: `veille-actualites-claude/`

All logic is in a single file: [veille-actualites-claude/veille_actualites.gs](veille-actualites-claude/veille_actualites.gs) (~1020 lines).

**Pipeline per execution (every N hours, weekdays only):**

```
For each of 7 agricultural rubriques:
  1. fetchActualitesPourRubrique()  → NewsAPI (primary) or RSS feeds (fallback on 426/429)
  2. scorerPertinence()             → Claude JSON API scores articles 1-10, filters ≥ SCORE_MIN
  3. analyserAvecClaude()           → Claude HTML API generates badge-annotated summaries
  4. sauvegarderDansSheets()        → Appends to Google Sheets "Articles" + "Analyses" tabs
```

**Entry points:**
- `main()` — Full pipeline, called by time-based trigger
- `configurerTrigger()` — Installs time-based trigger + initializes Sheets (run once to activate)
- `supprimerTrigger()` — Removes all `main` triggers
- `testerApis()` — Validates NewsAPI and Anthropic credentials

### Configuration

All configuration lives in the `CONFIG` object at the top of `veille_actualites.gs`:

```javascript
const CONFIG = {
  NEWS_API_KEY:      "...",          // newsapi.org
  ANTHROPIC_KEY:     "sk-ant-...",   // console.anthropic.com
  CLAUDE_MODEL:      "claude-sonnet-4-6",
  CLAUDE_MAX_TOKENS: 2500,
  INTERVALLE_HEURES: 4,              // 1 | 2 | 4 | 6 | 8 | 12
  WEEKEND_ACTIF:     false,          // weekdays only when false
  NB_ARTICLES_POOL:  20,             // raw fetch size
  NB_ARTICLES_FINAL: 5,              // kept after scoring
  NB_ARTICLES_JOUR:  5,              // daily quota per rubric
  SCORE_MIN:         6,              // minimum relevance score (out of 10)
  TON:               "professionnel", // "professionnel" | "casual" | "bullet"
  SHEETS_ID:         "",             // Google Sheets ID, leave empty to disable persistence
};
```

### The 7 Rubriques (Agricultural Categories)

Each rubrique has: `id`, `nom`, `description`, `sujets` (NewsAPI keywords), `rss` (fallback RSS URLs).

| ID | Nom | Focus |
|----|-----|-------|
| agri_actu | Agri_Actu | Current African agricultural news |
| agri_story | Agri_Story | Farmer profiles & testimonials |
| agri_climat | Agri_Climat | Climate & weather impacts |
| agri_food | Agri_Food | Food security & local transformation |
| agri_pub | Agri_Pub | Agribusiness & communication |
| agri_astuces | Agri_Astuces | Techniques & best practices |
| agri_techno | Agri_Techno | AgriTech & innovation |

### API Integrations

| API | Purpose | Error handling |
|-----|---------|----------------|
| **NewsAPI** (`/v2/everything`) | Primary news source, 24h lookback | 426/429 → automatic RSS fallback |
| **Anthropic Claude** (`/v1/messages`) | Two-stage: JSON scoring + HTML analysis | Scoring failure → fallback to top-N by position |
| **Google Sheets** (built-in `SpreadsheetApp`) | Persistent storage in two tabs | Optional — skipped if `SHEETS_ID` is empty |

**Claude is called twice per rubrique:**
1. **Scoring**: Returns JSON `{articles: [{url, score, raison}]}` — max 1000 tokens
2. **Analysis**: Returns HTML with badges (`🔥 HOT`, `😊 POSITIVE`, etc.) — max 2500 tokens

### Data Structures

```javascript
// Article object flowing through pipeline
{
  titre: string,
  description: string,
  url: string,         // used as dedup key
  source: string,
  date: string,
  sujet: string,
  score?: number,      // 1-10, added after scoring
  raison?: string      // Claude's reasoning
}
```

**Google Sheets schema:**
- `"Articles"` tab: 8 columns — Date, Rubrique, Titre, Source, Score, URL, Raison, Analyse_Date
- `"Analyses"` tab: 4 columns — Date, Rubrique, Analyse (HTML), NbArticles

## Deployment & Testing (Google Apps Script)

1. Open [script.google.com](https://script.google.com) → New Project
2. Paste/sync `veille_actualites.gs`
3. Fill in `CONFIG` (API keys, SHEETS_ID)
4. Run `testerApis()` to validate credentials
5. Run `main()` manually to test a full pipeline
6. Run `configurerTrigger()` to activate automated scheduling

**GAS execution limits:** 6 min/run, 100 emails/day, 100 NewsAPI requests/day (free tier).

## Roadmap (from `veille-actualites-claude/TODO.md`)

Planned future modules (not yet implemented):
- Meeting transcription → AI summary
- Competitive website monitoring
- Weekly reporting (Sheets → email)
- Dashboard & trend visualization (Data Studio)
