# Dot to Deal

A free bonus app for the ProfitMaps AI launch. Three modules, nine tools:

- **Shortlist** — Prospect Scorecard, Keyword Pair Picker, Credit-Safe Scan Queue
- **Replies** — Objection Responder, Follow-Up Cadence Builder, Five-Minute Map Walk
- **Rate Card** — Fix Price Calculator, Clients-to-Goal Planner, One-Page Offer Sheet

Fully static: plain HTML, CSS and JS, no build step, no API calls, no accounts. Everything a user enters is saved in their own browser (`localStorage`).

The access password is a soft deterrent only: the page checks a SHA-256 hash client-side, which keeps it out of search engines and casual hands but is not real security. The plaintext password is not stored in this repo.

Hosted on GitHub Pages at https://dottodeal.misanmorrison.com. Pushes to `main` deploy via `.github/workflows/pages.yml`.

Powered by [Misan Morrison](https://misanmorrison.com/).
