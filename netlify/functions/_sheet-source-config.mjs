const MATCH_SCOUT_TAB_PATTERN = /^MS\(([^)]+)\)$/i;

export function getSheetConfig() {
  const spreadsheetId =
    String(process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEET_ID || "").trim();
  const label = String(process.env.GOOGLE_SHEETS_LABEL || "MorScout Sheet").trim();
  const seasonYear = Number(
    process.env.GOOGLE_SHEETS_SEASON_YEAR || new Date().getFullYear(),
  );

  if (!spreadsheetId) {
    throw new Error("Set GOOGLE_SHEETS_SPREADSHEET_ID in Netlify.");
  }

  if (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 3000) {
    throw new Error("GOOGLE_SHEETS_SEASON_YEAR must be a valid four-digit year.");
  }

  return { spreadsheetId, label, seasonYear };
}

export function parseSheetTabTitle(title) {
  const normalizedTitle = String(title || "").trim();
  const match = normalizedTitle.match(MATCH_SCOUT_TAB_PATTERN);

  if (!match) {
    return null;
  }

  const rawId = match[1].trim();
  const eventCode = normalizeEventCode(rawId);
  if (!eventCode) {
    return null;
  }

  return {
    key: normalizedTitle,
    tabTitle: normalizedTitle,
    rawId,
    eventCode,
  };
}

export function buildMatchScoutSource(tabTitle) {
  const config = getSheetConfig();
  const parsed = parseSheetTabTitle(tabTitle);

  if (!parsed) {
    throw new Error(`Tab ${tabTitle} is not a valid match-scout tab. Expected MS(EVENTCODE).`);
  }

  return {
    key: parsed.key,
    label: `${config.label} · ${parsed.tabTitle}`,
    spreadsheetId: config.spreadsheetId,
    range: parsed.tabTitle,
    tabTitle: parsed.tabTitle,
    eventCode: parsed.eventCode,
    eventCodeRaw: parsed.rawId,
    seasonYear: config.seasonYear,
  };
}

export function getDefaultSourceKey(sources) {
  const configuredDefault = String(process.env.GOOGLE_SHEETS_DEFAULT_SOURCE_KEY || "").trim();
  if (configuredDefault && sources.some((source) => source.key === configuredDefault)) {
    return configuredDefault;
  }
  return sources[0]?.key || null;
}

function normalizeEventCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
