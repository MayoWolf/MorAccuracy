# MorScout Accuracy Analyzer

MorScout Accuracy Analyzer is a Netlify-ready web app that uploads a MorScout scouting export, fetches official event match data from The Blue Alliance through a secure serverless function, and ranks scouts by how closely their objective observations line up with the official benchmark.

## What This Version Scores

Your current CSV schema supports objective benchmarking for:

- `Auto FUEL Scored`
- `Teleop FUEL Scored`
- `Auto TOWER Level 1?`
- `Teleop TOWER Level`

The app intentionally does **not** score comments, defense notes, reliability tags, or other qualitative fields because TBA does not provide ground-truth data for those.

## How The Scoring Works

- The browser parses the uploaded MorScout CSV locally.
- A Netlify function calls TBA using the `X-TBA-Auth-Key` header and returns event + match JSON.
- Qualification matches are matched by `Match Number` and `Team Number`.
- Official alliance metrics are taken from TBA's 2026 score breakdown:
  - hub auto count
  - hub teleop count
  - auto tower completion count
  - endgame tower level sum
- The analyzer estimates each robot's contribution while constraining every alliance total to match the official TBA score breakdown.
- Each scout receives:
  - an accuracy percentage
  - a consistency score
  - an overcounting / undercounting / balanced bias label

## Local Development

Install dependencies:

```bash
npm install
```

Start the Vite dev server:

```bash
npm run dev
```

If you want the Netlify function locally as well, use Netlify CLI instead:

```bash
netlify dev
```

## Deploy To Netlify

1. Push this repo to GitHub.
2. Create a new Netlify site from the repo.
3. Set the build command to `npm run build`.
4. Set the publish directory to `dist`.
5. Add the environment variable `TBA_API_KEY` in Netlify.
6. Deploy.

`netlify.toml` already points Netlify at `netlify/functions` and routes `/api/tba-event-data` to the function.

## TBA Environment Variable

The serverless function checks these names in order:

```text
TBA_API_KEY
TBA_KEY
X_TBA_AUTH_KEY
```

Use `TBA_API_KEY` unless you already have one of the others set. The key stays server-side in Netlify. The browser never receives it.

## Run Tests

```bash
npm test
```

## Notes About Accuracy

TBA provides official alliance-level outcomes, not per-scout truth. To make scout ranking useful anyway, this app estimates per-robot contributions in a way that still honors the official alliance totals. That makes the output practical for training and quality control, while staying grounded in real match results.
