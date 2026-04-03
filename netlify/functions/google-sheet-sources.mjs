import { fetchGoogleSheetMetadata } from "./_google-sheets-client.mjs";
import {
  buildMatchScoutSource,
  getDefaultSourceKey,
  getSheetConfig,
  parseSheetTabTitle,
} from "./_sheet-source-config.mjs";

export default async () => {
  try {
    const { spreadsheetId } = getSheetConfig();
    const metadata = await fetchGoogleSheetMetadata(spreadsheetId);
    const sources = (metadata.sheets || [])
      .map((sheet) => sheet?.properties?.title || "")
      .map((title) => parseSheetTabTitle(title))
      .filter(Boolean)
      .map((parsed) => buildMatchScoutSource(parsed.tabTitle))
      .sort((left, right) => left.tabTitle.localeCompare(right.tabTitle));

    if (!sources.length) {
      throw new Error("No match-scout tabs found. Add tabs named like MS(CALAS) to the configured sheet.");
    }

    const defaultSourceKey = getDefaultSourceKey(sources);

    return json({
      defaultSourceKey,
      sources: sources.map((source) => ({
        key: source.key,
        label: source.label,
        tabTitle: source.tabTitle,
        eventCode: source.eventCode,
        eventCodeRaw: source.eventCodeRaw,
        seasonYear: source.seasonYear,
        isDefault: source.key === defaultSourceKey,
      })),
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unable to load Google Sheet sources.",
      },
      500,
    );
  }
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
