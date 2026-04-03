const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

export default async (request) => {
  const url = new URL(request.url);
  const requestedEventKey = url.searchParams.get("eventKey");
  const requestedEventCode = normalizeEventCode(url.searchParams.get("eventCode"));
  const requestedSeasonYear = Number(
    url.searchParams.get("seasonYear") || process.env.GOOGLE_SHEETS_SEASON_YEAR || new Date().getFullYear(),
  );
  const authKey = process.env.TBA_API_KEY || process.env.TBA_KEY || process.env.X_TBA_AUTH_KEY;

  if (!authKey) {
    return json(
      {
        error: "Missing TBA API key in Netlify. Set TBA_API_KEY, TBA_KEY, or X_TBA_AUTH_KEY.",
      },
      500,
    );
  }

  if (!requestedEventKey && !requestedEventCode) {
    return json(
      {
        error: "Provide an eventKey or an eventCode query parameter.",
      },
      400,
    );
  }

  if (!Number.isInteger(requestedSeasonYear) || requestedSeasonYear < 2000 || requestedSeasonYear > 3000) {
    return json(
      {
        error: "seasonYear must be a valid four-digit year.",
      },
      400,
    );
  }

  try {
    const headers = {
      "X-TBA-Auth-Key": authKey,
      Accept: "application/json",
    };

    const eventKey =
      requestedEventKey || (await resolveEventKey({ eventCode: requestedEventCode, seasonYear: requestedSeasonYear, headers }));

    const [eventResponse, matchesResponse] = await Promise.all([
      fetch(`${TBA_BASE_URL}/event/${encodeURIComponent(eventKey)}`, { headers }),
      fetch(`${TBA_BASE_URL}/event/${encodeURIComponent(eventKey)}/matches`, { headers }),
    ]);

    if (eventResponse.status === 404 || matchesResponse.status === 404) {
      return json({ error: `TBA could not find event ${eventKey}.` }, 404);
    }

    if (!eventResponse.ok || !matchesResponse.ok) {
      return json(
        {
          error: `TBA request failed with status ${eventResponse.status}/${matchesResponse.status}.`,
        },
        502,
      );
    }

    const [event, matches] = await Promise.all([eventResponse.json(), matchesResponse.json()]);

    return json(
      {
        event,
        matches,
        resolvedEventKey: eventKey,
      },
      200,
      {
        "Cache-Control": "public, max-age=300",
      },
    );
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unexpected TBA proxy failure.",
      },
      500,
    );
  }
};

async function resolveEventKey({ eventCode, seasonYear, headers }) {
  if (!eventCode) {
    throw new Error("Unable to resolve a TBA event without an eventCode.");
  }

  const directKey = `${seasonYear}${eventCode}`;
  const directResponse = await fetch(`${TBA_BASE_URL}/event/${encodeURIComponent(directKey)}`, { headers });
  if (directResponse.ok) {
    return directKey;
  }

  const eventsResponse = await fetch(`${TBA_BASE_URL}/events/${seasonYear}`, { headers });
  if (!eventsResponse.ok) {
    throw new Error(`TBA event lookup failed with status ${eventsResponse.status}.`);
  }

  const events = await eventsResponse.json();
  const exactEventCodeMatch = events.find(
    (event) => normalizeEventCode(event.event_code) === eventCode,
  );
  if (exactEventCodeMatch?.key) {
    return exactEventCodeMatch.key;
  }

  const exactKeyMatch = events.find((event) => normalizeEventCode(event.key).endsWith(eventCode));
  if (exactKeyMatch?.key) {
    return exactKeyMatch.key;
  }

  throw new Error(`TBA could not resolve event code ${eventCode} for ${seasonYear}.`);
}

function normalizeEventCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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
