const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

export default async (request) => {
  const url = new URL(request.url);
  const eventKey = url.searchParams.get("eventKey");
  const authKey = process.env.TBA_API_KEY || process.env.TBA_KEY || process.env.X_TBA_AUTH_KEY;

  if (!authKey) {
    return json(
      {
        error: "Missing TBA API key in Netlify. Set TBA_API_KEY, TBA_KEY, or X_TBA_AUTH_KEY.",
      },
      500,
    );
  }

  if (!eventKey) {
    return json(
      {
        error: "Provide an eventKey query parameter.",
      },
      400,
    );
  }

  try {
    const headers = {
      "X-TBA-Auth-Key": authKey,
      Accept: "application/json",
    };

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

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}
