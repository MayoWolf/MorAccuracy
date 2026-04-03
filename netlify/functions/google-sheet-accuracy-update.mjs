import {
  batchUpdateGoogleSpreadsheet,
  fetchGoogleSheetMetadata,
  fetchGoogleSheetValues,
  updateGoogleSheetValues,
} from "./_google-sheets-client.mjs";
import { buildMatchScoutSource } from "./_sheet-source-config.mjs";

const COMMENTS_HEADER = "General Comments";
const ACCURACY_HEADER = "Accuracy";

export default async (request) => {
  if (request.method !== "POST") {
    return json(
      {
        error: "Use POST to update sheet accuracy values.",
      },
      405,
      {
        Allow: "POST",
      },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(
      {
        error: "Request body must be valid JSON.",
      },
      400,
    );
  }

  const sourceKey = String(body?.sourceKey || "").trim();
  const updates = Array.isArray(body?.updates) ? body.updates : null;

  if (!sourceKey) {
    return json(
      {
        error: "Provide a sourceKey for the selected MS(...) tab.",
      },
      400,
    );
  }

  if (!updates) {
    return json(
      {
        error: "Provide an updates array with rowNumber and accuracy values.",
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
    const metadata = await fetchGoogleSheetMetadata(
      source.spreadsheetId,
      "sheets.properties(title,sheetId,gridProperties.columnCount)",
    );
    const sheetInfo = (metadata.sheets || []).find(
      (sheet) => sheet?.properties?.title === source.tabTitle,
    )?.properties;

    if (!sheetInfo?.sheetId) {
      throw new Error(`Could not find tab ${source.tabTitle} in the configured spreadsheet.`);
    }

    const headerPayload = await fetchGoogleSheetValues(source.spreadsheetId, `${quoteSheetName(source.tabTitle)}!1:1`);
    const headers = headerPayload.values?.[0] || [];
    const commentsIndex = headers.findIndex((header) => String(header || "").trim() === COMMENTS_HEADER);
    const existingAccuracyIndex = headers.findIndex((header) => String(header || "").trim() === ACCURACY_HEADER);

    let accuracyColumnIndex = existingAccuracyIndex;
    if (accuracyColumnIndex === -1) {
      accuracyColumnIndex = commentsIndex >= 0 ? commentsIndex + 1 : headers.length;

      // If another used header already occupies the target slot, shift it right first.
      if (accuracyColumnIndex < headers.length) {
        await batchUpdateGoogleSpreadsheet(source.spreadsheetId, [
          {
            insertDimension: {
              range: {
                sheetId: sheetInfo.sheetId,
                dimension: "COLUMNS",
                startIndex: accuracyColumnIndex,
                endIndex: accuracyColumnIndex + 1,
              },
              inheritFromBefore: accuracyColumnIndex > 0,
            },
          },
        ]);
      }
    }

    const columnLetter = columnIndexToLetter(accuracyColumnIndex);
    const sanitizedUpdates = updates
      .map((update) => ({
        rowNumber: Number(update?.rowNumber),
        accuracy: String(update?.accuracy ?? ""),
      }))
      .filter((update) => Number.isInteger(update.rowNumber) && update.rowNumber >= 2);

    if (!sanitizedUpdates.length) {
      throw new Error("No valid row updates were provided.");
    }

    const maxRowNumber = Math.max(...sanitizedUpdates.map((update) => update.rowNumber));
    const updateByRowNumber = new Map(sanitizedUpdates.map((update) => [update.rowNumber, update.accuracy]));
    const values = [[ACCURACY_HEADER]];

    for (let rowNumber = 2; rowNumber <= maxRowNumber; rowNumber += 1) {
      values.push([updateByRowNumber.get(rowNumber) ?? ""]);
    }

    await updateGoogleSheetValues(
      source.spreadsheetId,
      `${quoteSheetName(source.tabTitle)}!${columnLetter}1:${columnLetter}${maxRowNumber}`,
      values,
    );

    return json({
      sourceKey: source.key,
      tabTitle: source.tabTitle,
      columnLetter,
      updatedRows: sanitizedUpdates.length,
      headerInserted: existingAccuracyIndex === -1,
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unable to write accuracy values to Google Sheets.",
      },
      500,
    );
  }
};

function quoteSheetName(sheetName) {
  return `'${String(sheetName).replaceAll("'", "''")}'`;
}

function columnIndexToLetter(index) {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
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
