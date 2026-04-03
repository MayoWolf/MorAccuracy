import "./styles.css";

import {
  analyzeScoutingData,
  benchmarkedMetricLabels,
  parseMorScoutCsv,
} from "./modules/analyzer.js";

const state = {
  sources: [],
  selectedSourceKey: "",
  sourceInfo: null,
  result: null,
  threshold: 85,
  loading: false,
  loadingSources: true,
  error: "",
};

const app = document.querySelector("#app");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function thresholdStats(result) {
  const matchedRows = result?.entries?.length ?? 0;
  const atOrAbove = result?.entries?.filter((entry) => entry.accuracy >= state.threshold).length ?? 0;
  const share = matchedRows > 0 ? (atOrAbove / matchedRows) * 100 : 0;
  return { matchedRows, atOrAbove, share };
}

function buildApiPath(path, params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (String(value || "").trim()) {
      search.set(key, String(value).trim());
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function fetchJsonOrThrow(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const rawText = await response.text();
    let payload = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = {};
    }
    throw new Error(payload.error || rawText || `Request failed. HTTP ${response.status}.`);
  }
  return response.json();
}

function getSelectedSource() {
  return state.sources.find((source) => source.key === state.selectedSourceKey) || null;
}

function renderHero() {
  const selectedSource = getSelectedSource();

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">MorScout Accuracy Analyzer</p>
        <h1>Scout accuracy, auto-discovered from match tabs.</h1>
        <p class="lede">
          The app scans your configured Google Sheet for tabs named like <code>MS(CALAS)</code>,
          ignores pit-scout tabs such as <code>PS(...)</code>, derives the event code from the tab
          name, resolves the real TBA event, and ranks scouts by objective accuracy.
        </p>
        <div class="hero-strip">
          <span class="hero-chip">${selectedSource ? escapeHtml(selectedSource.tabTitle) : "Choose an MS(...) tab"}</span>
          <span class="hero-chip">${selectedSource ? `Event code ${escapeHtml(selectedSource.eventCodeRaw)}` : "Event code comes from tab name"}</span>
          <span class="hero-chip">${state.sources.length} match tab${state.sources.length === 1 ? "" : "s"} found</span>
        </div>
      </div>
      <div class="hero-callout">
        <p class="callout-title">Benchmarked Right Now</p>
        <ul class="metric-list">
          ${benchmarkedMetricLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}
        </ul>
        <p class="callout-note">
          Netlify vars: <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code>, <code>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code>, <code>GOOGLE_SHEETS_SPREADSHEET_ID</code>, <code>TBA_API_KEY</code>
        </p>
      </div>
    </section>
  `;
}

function renderControls() {
  const selectedSource = getSelectedSource();
  const sourceLabel = state.sourceInfo
    ? `Last pull: ${escapeHtml(state.sourceInfo.rowCount)} rows from ${escapeHtml(state.sourceInfo.tabTitle)}`
    : state.loadingSources
      ? "Scanning Google Sheet tabs"
      : selectedSource
        ? `Ready: ${escapeHtml(selectedSource.tabTitle)}`
        : "No match-scout tabs found";

  return `
    <section class="panel panel-form">
      <div class="panel-heading">
        <div>
          <h2>Run Event Analysis</h2>
          <p>Pick one of the discovered <code>MS(...)</code> tabs. <code>PS(...)</code> tabs are ignored.</p>
        </div>
        <div class="status-block">
          <span class="status-kicker">Source Status</span>
          <strong>${sourceLabel}</strong>
        </div>
      </div>
      <form id="analysis-form" class="form-grid form-grid-preset">
        <label class="field">
          <span>Match scout tab</span>
          <select id="source-key" name="sourceKey" ${state.loadingSources ? "disabled" : ""}>
            ${
              state.sources.length
                ? state.sources
                    .map(
                      (source) => `
                        <option value="${escapeHtml(source.key)}" ${source.key === state.selectedSourceKey ? "selected" : ""}>
                          ${escapeHtml(source.tabTitle)} · ${escapeHtml(source.eventCodeRaw)}
                        </option>
                      `,
                    )
                    .join("")
                : '<option value="">No MS(...) tabs available</option>'
            }
          </select>
        </label>
        <div class="source-preview">
          <span class="status-kicker">Derived Event</span>
          <strong>${selectedSource ? `${escapeHtml(String(selectedSource.seasonYear))}${escapeHtml(selectedSource.eventCode)}` : "Waiting for tab selection"}</strong>
          <small>${selectedSource ? `From tab ${escapeHtml(selectedSource.tabTitle)}. TBA will resolve the real event key from this code.` : "Set GOOGLE_SHEETS_SPREADSHEET_ID and add tabs named like MS(CALAS)."}</small>
        </div>
        <div class="action-cell">
          <button class="primary-button" type="submit" ${
            state.loading || state.loadingSources || !selectedSource ? "disabled" : ""
          }>
            ${state.loading ? "Pulling Tab..." : "Run Analysis"}
          </button>
        </div>
      </form>
      ${
        state.error
          ? `<div class="notice notice-error">${escapeHtml(state.error)}</div>`
          : `<div class="notice">You no longer need <code>GOOGLE_SHEETS_RANGE</code> or <code>GOOGLE_SHEETS_EVENT_KEY</code>. The app discovers tabs and derives the TBA event from the <code>MS(...)</code> name.</div>`
      }
    </section>
  `;
}

function renderSummary(result) {
  const { summary } = result;
  const threshold = thresholdStats(result);
  const sourceLine = state.sourceInfo
    ? `${state.sourceInfo.tabTitle} · ${state.sourceInfo.rowCount} rows pulled · resolved TBA key ${state.sourceInfo.resolvedEventKey}`
    : "Source range unavailable";

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2>Event Snapshot</h2>
          <p>${escapeHtml(summary.eventName || summary.eventKey)}</p>
        </div>
        <div class="status-block status-block-soft">
          <span class="status-kicker">Source</span>
          <strong>${escapeHtml(sourceLine)}</strong>
        </div>
      </div>
      <div class="stat-grid">
        <article class="stat-card">
          <span>Scouts ranked</span>
          <strong>${summary.totalScouts}</strong>
        </article>
        <article class="stat-card">
          <span>Rows benchmarked</span>
          <strong>${summary.matchedRows}/${summary.totalRows}</strong>
        </article>
        <article class="stat-card">
          <span>Average scout accuracy</span>
          <strong>${formatPercent(summary.averageAccuracy)}</strong>
        </article>
        <article class="stat-card">
          <span>${state.threshold}%+ data points</span>
          <strong>${threshold.atOrAbove}/${threshold.matchedRows}</strong>
        </article>
      </div>
      <div class="threshold-panel">
        <div class="threshold-copy">
          <span class="status-kicker">Accuracy Threshold</span>
          <strong>${state.threshold}% or better</strong>
          <p>${formatPercent(threshold.share)} of benchmarked entries meet this mark.</p>
        </div>
        <label class="threshold-slider">
          <input
            id="threshold-range"
            type="range"
            min="50"
            max="100"
            step="1"
            value="${state.threshold}"
          />
          <div class="threshold-ticks">
            <span>50</span>
            <span>75</span>
            <span>85</span>
            <span>95</span>
            <span>100</span>
          </div>
        </label>
      </div>
      <div class="mini-leaders">
        <span>Most Reliable: <strong>${escapeHtml(summary.topScout || "N/A")}</strong></span>
        <span>${state.threshold}%+ Share: <strong>${formatPercent(threshold.share)}</strong></span>
        <span>Best Fuel: <strong>${escapeHtml(summary.topGroupScouts.fuel || "N/A")}</strong></span>
        <span>Best Auto: <strong>${escapeHtml(summary.topGroupScouts.auto || "N/A")}</strong></span>
        <span>Best Tower: <strong>${escapeHtml(summary.topGroupScouts.tower || "N/A")}</strong></span>
        <span>Best Endgame: <strong>${escapeHtml(summary.topGroupScouts.endgame || "N/A")}</strong></span>
      </div>
    </section>
  `;
}

function renderLeaderboard(result) {
  const rows = result.leaderboard
    .map(
      (entry) => `
        <tr>
          <td>${entry.rank}</td>
          <td>
            <div class="table-name">${escapeHtml(entry.scoutName)}</div>
            <div class="table-sub">${entry.entries} matched entries</div>
          </td>
          <td>${formatPercent(entry.accuracy)}</td>
          <td>${formatPercent(entry.groupScores.fuel)}</td>
          <td>${formatPercent(entry.groupScores.auto)}</td>
          <td>${formatPercent(entry.groupScores.tower)}</td>
          <td>${formatPercent(entry.groupScores.endgame)}</td>
          <td>${formatPercent(entry.consistency)}</td>
          <td class="bias-${escapeHtml(entry.bias)}">${escapeHtml(entry.bias)}</td>
          <td>${entry.averageSignedError > 0 ? "+" : ""}${entry.averageSignedError.toFixed(2)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Scout Leaderboard</h2>
        <p>Ranked by average accuracy, then consistency, with bias called out separately.</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Scout</th>
              <th>Overall</th>
              <th>Fuel</th>
              <th>Auto</th>
              <th>Tower</th>
              <th>Endgame</th>
              <th>Consistency</th>
              <th>Bias</th>
              <th>Avg Signed Error</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderCoverage(result) {
  const coverageCards = result.metricCoverage
    .map(
      (metric) => `
        <article class="coverage-card">
          <h3>${escapeHtml(metric.label)}</h3>
          <p>${metric.matchedRows} matched rows</p>
          <strong>${formatPercent(metric.averageAccuracy)}</strong>
        </article>
      `,
    )
    .join("");

  const warnings = result.warnings.length
    ? result.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")
    : "<li>No structural warnings. The selected MS(...) tab mapped cleanly to TBA match data.</li>";

  return `
    <section class="two-up">
      <div class="panel">
        <div class="panel-heading">
          <h2>Benchmark Lines</h2>
          <p>Overall ranking now includes fuel, auto, tower, and endgame sub-scores.</p>
        </div>
        <div class="coverage-grid">${coverageCards}</div>
      </div>
      <div class="panel">
        <div class="panel-heading">
          <h2>Warnings</h2>
          <p>These are the rows the analyzer could not benchmark or had to correct.</p>
        </div>
        <ul class="warning-list">${warnings}</ul>
      </div>
    </section>
  `;
}

function renderDetails(result) {
  const detailRows = result.entries
    .slice(0, 24)
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.scoutName)}</td>
          <td>${entry.matchNumber}</td>
          <td>${escapeHtml(entry.teamNumber)}</td>
          <td>${escapeHtml(entry.allianceLabel)}</td>
          <td>${formatPercent(entry.accuracy)}</td>
          <td>${escapeHtml(entry.bias)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Sample Entry Detail</h2>
        <p>Showing the first 24 benchmarked rows after Google Sheets normalization and TBA matching.</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Scout</th>
              <th>Match</th>
              <th>Team</th>
              <th>Alliance</th>
              <th>Accuracy</th>
              <th>Bias</th>
            </tr>
          </thead>
          <tbody>${detailRows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFooter() {
  return `
    <footer class="footer">
      <p>Powered by The Blue Alliance official match APIs and discovered Google Sheets match-scout tabs.</p>
      <p>
        Pit-scout tabs are ignored for this workflow, and qualitative observations can still live in the sheet
        but are not scored because TBA does not provide an objective truth source for them.
      </p>
    </footer>
  `;
}

function render() {
  app.innerHTML = `
    <main class="shell">
      ${renderHero()}
      ${renderControls()}
      ${state.result ? renderSummary(state.result) : ""}
      ${state.result ? renderLeaderboard(state.result) : ""}
      ${state.result ? renderCoverage(state.result) : ""}
      ${state.result ? renderDetails(state.result) : ""}
      ${renderFooter()}
    </main>
  `;

  const form = document.querySelector("#analysis-form");
  const sourceSelect = document.querySelector("#source-key");
  const thresholdRange = document.querySelector("#threshold-range");

  if (sourceSelect) {
    sourceSelect.addEventListener("change", (event) => {
      state.selectedSourceKey = event.target.value;
    });
  }

  if (thresholdRange) {
    thresholdRange.addEventListener("input", (event) => {
      state.threshold = Number(event.target.value);
      render();
    });
  }

  if (form) {
    form.noValidate = true;
    form.addEventListener("submit", handleSubmit);
  }
}

async function loadSources() {
  state.loadingSources = true;
  state.error = "";
  render();

  try {
    const payload = await fetchJsonOrThrow("/api/google-sheet-sources");
    state.sources = payload.sources || [];
    state.selectedSourceKey = payload.defaultSourceKey || state.sources[0]?.key || "";

    if (!state.sources.length) {
      throw new Error("No match-scout tabs were discovered in the configured Google Sheet.");
    }
  } catch (error) {
    state.sources = [];
    state.selectedSourceKey = "";
    state.error = error instanceof Error ? error.message : "Unable to load source presets.";
  } finally {
    state.loadingSources = false;
    render();
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  state.error = "";

  const selectedSource = getSelectedSource();
  if (!selectedSource) {
    state.error = "Select a discovered MS(...) tab before running analysis.";
    render();
    return;
  }

  state.loading = true;
  render();

  try {
    const [sheetPayload, tbaPayload] = await Promise.all([
      fetchJsonOrThrow(
        buildApiPath("/api/google-sheet-data", {
          sourceKey: selectedSource.key,
        }),
      ),
      fetchJsonOrThrow(
        buildApiPath("/api/tba-event-data", {
          eventCode: selectedSource.eventCode,
          seasonYear: selectedSource.seasonYear,
        }),
      ),
    ]);

    const scoutingRows = parseMorScoutCsv(sheetPayload.rows || []);
    state.sourceInfo = {
      key: sheetPayload.sourceKey,
      label: sheetPayload.label,
      tabTitle: sheetPayload.tabTitle,
      eventCode: sheetPayload.eventCode,
      eventCodeRaw: sheetPayload.eventCodeRaw,
      seasonYear: sheetPayload.seasonYear,
      rowCount: sheetPayload.rowCount || scoutingRows.length,
      resolvedEventKey: tbaPayload.resolvedEventKey,
    };
    state.result = analyzeScoutingData({
      scoutingRows,
      tbaPayload,
      eventKey: tbaPayload.resolvedEventKey || `${selectedSource.seasonYear}${selectedSource.eventCode}`,
    });
  } catch (error) {
    state.result = null;
    state.sourceInfo = null;
    state.error = error instanceof Error ? error.message : "Unexpected analysis failure.";
  } finally {
    state.loading = false;
    render();
  }
}

render();
loadSources();
