import { createSign } from "node:crypto";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";

export async function fetchGoogleSheetMetadata(spreadsheetId, fields = "sheets.properties.title") {
  const accessToken = await getAccessToken(getServiceAccountCredentials());
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE_URL}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent(fields)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `Google Sheets metadata request failed with status ${response.status}.`,
    );
  }

  return payload;
}

export async function fetchGoogleSheetValues(spreadsheetId, range) {
  const accessToken = await getAccessToken(getServiceAccountCredentials());
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `Google Sheets values request failed with status ${response.status}.`,
    );
  }

  return payload;
}

export async function updateGoogleSheetValues(spreadsheetId, range, values, valueInputOption = "USER_ENTERED") {
  const accessToken = await getAccessToken(getServiceAccountCredentials());
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=${encodeURIComponent(valueInputOption)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        range,
        majorDimension: "ROWS",
        values,
      }),
    },
  );

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `Google Sheets update request failed with status ${response.status}.`,
    );
  }

  return payload;
}

export async function batchUpdateGoogleSpreadsheet(spreadsheetId, requests) {
  const accessToken = await getAccessToken(getServiceAccountCredentials());
  const response = await fetch(
    `${GOOGLE_SHEETS_API_BASE_URL}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    },
  );

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `Google Sheets batch update failed with status ${response.status}.`,
    );
  }

  return payload;
}

function getServiceAccountCredentials() {
  const clientEmail = String(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GCP_SERVICE_ACCOUNT_EMAIL || "",
  ).trim();
  const privateKey = normalizePrivateKey(
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY || "",
  );

  if (clientEmail && privateKey) {
    return { clientEmail, privateKey };
  }

  const rawJson =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GCP_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    const fallbackEmail = String(parsed.client_email || "").trim();
    const fallbackPrivateKey = normalizePrivateKey(parsed.private_key);
    if (fallbackEmail && fallbackPrivateKey) {
      return { clientEmail: fallbackEmail, privateKey: fallbackPrivateKey };
    }
  }

  throw new Error(
    "Missing Google service account credentials. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
  );
}

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

async function getAccessToken({ clientEmail, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    {
      alg: "RS256",
      typ: "JWT",
    },
    {
      iss: clientEmail,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      exp: now + 3600,
      iat: now,
    },
    privateKey,
  );

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const payload = await safeJson(response);
  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description || payload?.error || "Google OAuth token exchange failed.",
    );
  }

  return payload.access_token;
}

function signJwt(header, payload, privateKey) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();
  const signature = signer.sign(privateKey, "base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
