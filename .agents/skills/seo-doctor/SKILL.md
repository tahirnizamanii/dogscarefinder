---
name: seo-doctor
description: Audit AND fix DogCareFinder's SEO. Runs 7 fixers in sequence — dedupes listings, fills missing data, syncs Google reviews, prunes thin pages, generates sitemap, builds internal links. Auto-repairs at the source (MySQL + config). Use when the user asks to "fix SEO", "rank the site", or "improve rankings".
---

# SEO Doctor — Audit + Auto-Fix

## Purpose
The ultimate goal is ranking. This skill doesn't just find issues — it fixes them.

## Fixer pipeline

1. **dedupe-listings** — Merges duplicate businesses (by normalized name + address)
2. **fill-missing-fields** — Fills missing zip, state, or city from existing data
3. **enrich-google-places** — Fetches missing phone/website/hours via Google Places API
4. **sync-google-reviews** — Populates `reviews_json` and `rating` from Google
5. **prune-thin-pages** — Writes `config/pruned-pages.json`; Astro skips these pages
6. **build-internal-links** — Writes `config/related-providers.json`; templates use it
7. **generate-sitemap** — Writes `dist/sitemap.xml` and `dist/robots.txt`

## Run
