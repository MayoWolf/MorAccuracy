import { fetchGoogleSheetValues } from "./_google-sheets-client.mjs";
import { buildMatchScoutSource } from "./_sheet-source-config.mjs";

const REQUIRED_HEADERS = [
  "Scout Name",
  "Match Number",
  "Team Number",
  "Auto FUEL Scored",
  "Teleop FUEL Scored",
  "Auto TOWER Level 1?",
  "Teleop TOWER Level",
];

export default async (request) => {
  const url = new URL(request.url);
  const sourceKey = url.searchParams.get("sourceKey");

  if (!sourceKey) {
    return json(
      {
        error: "Provide a sourceKey query parameter for a tab named like MS(CALAS).",
      },
      400,
    );
  }

  let source;
  try {
    source = buildMatchScoutSource(sourceKey);
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unable to resolve Google Sheet tab.",
      },
      400,
    );
  }

  try {
    const payload = await fetchGoogleSheetValues(source.spreadsheetId, source.range);
    const rows = rowsFromSheetValues(payload.values || []);

    return json(
      {
        sourceKey: source.key,
        label: source.label,
        spreadsheetId: source.spreadsheetId,
        range: source.range,
        tabTitle: source.tabTitle,
        eventCode: source.eventCode,
        eventCodeRaw: source.eventCodeRaw,
        seasonYear: source.seasonYear,
        rowCount: rows.length,
        rows,
      },
      200,
      {
        "Cache-Control": "no-store",
      },
    );
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unexpected Google Sheets proxy failure.",
      },
      500,
    );
  }
};

function rowsFromSheetValues(values) {
  if (!values.length) {
    throw new Error("The selected Google Sheet tab is empty.");
  }

  const [headerRow, ...dataRows] = values;
  const headers = headerRow.map((header, index) => {
    const normalized = String(header || "").trim();
    return normalized || `Column ${index + 1}`;
  });

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw new Error(`Google Sheet is missing required columns: ${missingHeaders.join(", ")}.`);
  }

  return dataRows
    .filter((row) => row.some((value) => String(value || "").trim() !== ""))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
    );
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}
