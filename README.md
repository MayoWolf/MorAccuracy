# MorScout Accuracy Analyzer

MorScout Accuracy Analyzer is a Netlify-ready web app that reads MorScout scouting rows from Google Sheets with a Google service account, discovers match-scout tabs named like `MS(CALAS)`, resolves the corresponding TBA event from the code inside the tab name, ranks scouts by how closely their objective observations line up with official match data, and writes each row's accuracy back into the sheet.

## Required Netlify Variables

Set these in Netlify:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
GOOGLE_SHEETS_SPREADSHEET_ID
TBA_API_KEY
```

Optional:

```text
GOOGLE_SHEETS_LABEL
GOOGLE_SHEETS_SEASON_YEAR
GOOGLE_SHEETS_DEFAULT_SOURCE_KEY
```

You do **not** need:

```text
GOOGLE_SHEETS_RANGE
GOOGLE_SHEETS_EVENT_KEY
```

## How The Sheet Is Interpreted

- The app looks at every tab in the configured spreadsheet.
- Tabs named like `MS(CALAS)` are treated as match-scout tabs.
- Tabs named like `PS(CAVEN)` are ignored by this workflow.
- The code inside `MS(...)` is normalized and used as the TBA event code.
- The selected tab title itself is used as the Google Sheets range, so no separate range variable is needed.
- After analysis, the app adds or reuses an `Accuracy` column immediately to the right of `General Comments` and fills in the row accuracy percentage.

Example:

- `MS(CALAS)` becomes event code `calas`
- With `GOOGLE_SHEETS_SEASON_YEAR=2026`, the app first tries `2026calas`
- If needed, it also searches TBA's event list for that season to resolve the final event key

## What Each Variable Does

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: the Google service account email from IAM
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: the private key for that service account
- `GOOGLE_SHEETS_SPREADSHEET_ID`: the Google Sheet that contains all the `MS(...)` and `PS(...)` tabs
- `TBA_API_KEY`: your The Blue Alliance API key
- `GOOGLE_SHEETS_LABEL`: optional display name shown in the app
- `GOOGLE_SHEETS_SEASON_YEAR`: optional season year used when resolving TBA event keys; defaults to the current year
- `GOOGLE_SHEETS_DEFAULT_SOURCE_KEY`: optional default tab title to preselect, such as `MS(CALAS)`

## Google Sheets Setup

1. Create or choose a Google Cloud project.
2. Enable the Google Sheets API.
3. Create a service account in IAM.
4. Create a key for that service account.
5. Copy the service account email into `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
6. Copy the private key into `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
7. Share your Google Sheet with the service account email as an editor.
8. Copy the spreadsheet ID from the Google Sheet URL into `GOOGLE_SHEETS_SPREADSHEET_ID`.
9. Add `TBA_API_KEY`.
10. Optionally set `GOOGLE_SHEETS_SEASON_YEAR` if you want to pin the season instead of using the current year.

Example spreadsheet URL:

```text
https://docs.google.com/spreadsheets/d/1abcDEFghiJKLmnopQRstuVWxyz1234567890/edit
```

The spreadsheet ID is:

```text
1abcDEFghiJKLmnopQRstuVWxyz1234567890
```

## What This Version Scores

Each `MS(...)` tab must expose MorScout-style headers for these benchmarked fields:

- `Scout Name`
- `Match Number`
- `Team Number`
- `Auto FUEL Scored`
- `Teleop FUEL Scored`
- `Auto TOWER Level 1?`
- `Teleop TOWER Level`

The analyzer intentionally does **not** score comments, defense notes, reliability tags, or other qualitative fields because TBA does not provide ground-truth data for those.

## Accuracy Write-Back

- The app writes an `Accuracy` header next to `General Comments` if it does not already exist.
- Each analyzed row gets its overall row accuracy written back as a percentage like `87.4%`.
- Rows that are present in the sheet but cannot be benchmarked are left blank in the `Accuracy` column.

## Local Development

Install dependencies:

```bash
npm install
```

Start the Vite dev server:

```bash
npm run dev
```

If you want the Netlify functions locally as well, use Netlify CLI instead:

```bash
netlify dev
```

## Deploy To Netlify

1. Push this repo to GitHub.
2. Create a new Netlify site from the repo.
3. Set the build command to `npm run build`.
4. Set the publish directory to `dist`.
5. Add the required Netlify environment variables.
6. Deploy.

`netlify.toml` already routes:

- `/api/tba-event-data`
- `/api/google-sheet-data`
- `/api/google-sheet-sources`
- `/api/google-sheet-accuracy-update`

## Run Tests

```bash
npm test
```
