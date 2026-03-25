import "./styles.css";
import Papa from "papaparse";

import {
  analyzeScoutingData,
  benchmarkedMetricLabels,
  parseMorScoutCsv,
} from "./modules/analyzer.js";

const state = {
  csvFileName: "",
  eventKey: "",
  csvText: "",
  result: null,
  loading: false,
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

function renderHero() {
  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">MorScout Accuracy Analyzer</p>
        <h1>Scout accuracy, shown like a match board.</h1>
        <p class="lede">
          Your CSV stays in the browser. The app pulls official event results from TBA,
          estimates per-robot ground truth for objective fields, and ranks scouts by
          overall accuracy plus phase-specific lines.
        </p>
        <div class="hero-strip">
          <span class="hero-chip">${state.csvText ? "CSV locked in" : "CSV needed"}</span>
          <span class="hero-chip">${state.eventKey ? `Event ${escapeHtml(state.eventKey)}` : "Enter event key"}</span>
        </div>
      </div>
      <div class="hero-callout">
        <p class="callout-title">Benchmarked Right Now</p>
        <ul class="metric-list">
          ${benchmarkedMetricLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}
        </ul>
        <p class="callout-note">
          Netlify env var: <code>TBA_API_KEY</code>
        </p>
      </div>
    </section>
  `;
}

function renderControls() {
  return `
    <section class="panel panel-form">
      <div class="panel-heading">
        <div>
          <h2>Run Event Analysis</h2>
          <p>Use the event key from The Blue Alliance, like <code>2026casj</code>.</p>
        </div>
        <div class="status-block">
          <span class="status-kicker">Upload State</span>
          <strong>${state.csvText ? "CSV already loaded" : "Waiting for CSV"}</strong>
        </div>
      </div>
      <form id="analysis-form" class="form-grid">
        <label class="field">
          <span>Event key</span>
          <input
            id="event-key"
            name="eventKey"
            type="text"
            placeholder="2026casj"
            value="${escapeHtml(state.eventKey)}"
            required
          />
        </label>
        <div class="field field-upload">
          <span>MorScout CSV</span>
          <input id="csv-file" name="csvFile" type="file" accept=".csv,text/csv" class="sr-only" />
          <label for="csv-file" class="upload-card ${state.csvText ? "is-loaded" : ""}">
            <span class="upload-badge">${state.csvText ? "Loaded" : "Upload"}</span>
            <strong>${escapeHtml(state.csvFileName || "Choose your exported MorScout CSV")}</strong>
            <small>${
              state.csvText
                ? "This file is already stored in browser memory. You do not need to pick it again for reruns."
                : "Pick the file once. After that, you can rerun analysis without reselecting it."
            }</small>
          </label>
          <div class="upload-actions">
            ${
              state.csvText
                ? '<button id="clear-file" type="button" class="ghost-button">Clear loaded file</button>'
                : '<span class="upload-hint">The browser will keep the parsed CSV while this page stays open.</span>'
            }
          </div>
        </div>
        <div class="action-cell">
          <button class="primary-button" type="submit" ${state.loading ? "disabled" : ""}>
            ${state.loading ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>
      </form>
      ${
        state.error
          ? `<div class="notice notice-error">${escapeHtml(state.error)}</div>`
          : `<div class="notice">Only the event key goes to the Netlify function. Your CSV content stays in the browser.</div>`
      }
    </section>
  `;
}

function renderSummary(result) {
  const { summary } = result;
  return `
    <section class="panel">
      <div class="panel-heading">
        <h2>Event Snapshot</h2>
        <p>${escapeHtml(summary.eventName || summary.eventKey)}</p>
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
          <span>85%+ hit rate</span>
          <strong>${formatPercent(summary.average85Rate)}</strong>
        </article>
      </div>
      <div class="mini-leaders">
        <span>Most Reliable: <strong>${escapeHtml(summary.topScout || "N/A")}</strong></span>
        <span>Best 85%+ Rate: <strong>${escapeHtml(summary.top85RateScout || "N/A")}</strong></span>
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
          <td>${formatPercent(entry.accurate85Rate)}</td>
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
              <th>85%+ Rate</th>
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
    : "<li>No structural warnings. The uploaded CSV mapped cleanly to TBA match data.</li>";

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
        <p>Showing the first 24 benchmarked rows after normalization and TBA matching.</p>
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
      <p>Powered by The Blue Alliance official match APIs and your MorScout export.</p>
      <p>
        Fields like comments, defense notes, reliability tags, and other qualitative observations stay visible in your CSV
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
  const fileInput = document.querySelector("#csv-file");
  const eventInput = document.querySelector("#event-key");
  const clearFileButton = document.querySelector("#clear-file");

  if (eventInput) {
    eventInput.addEventListener("input", (event) => {
      state.eventKey = event.target.value.trim();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", async (event) => {
      const [file] = event.target.files;
      if (!file) {
        return;
      }
      state.csvFileName = file.name;
      state.csvText = await file.text();
      state.error = "";
      render();
    });
  }

  if (clearFileButton) {
    clearFileButton.addEventListener("click", () => {
      state.csvFileName = "";
      state.csvText = "";
      state.result = null;
      state.error = "";
      render();
    });
  }

  if (form) {
    form.noValidate = true;
    form.addEventListener("submit", handleSubmit);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  state.error = "";

  if (!state.csvText) {
    state.error = "Upload a MorScout CSV before running the analysis.";
    render();
    return;
  }

  if (!state.eventKey) {
    state.error = "Enter a TBA event key, such as 2026casj.";
    render();
    return;
  }

  state.loading = true;
  render();

  try {
    const parsed = Papa.parse(state.csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    if (parsed.errors.length) {
      throw new Error(parsed.errors[0].message);
    }

    const scoutingRows = parseMorScoutCsv(parsed.data);
    const response = await fetch(`/api/tba-event-data?eventKey=${encodeURIComponent(state.eventKey)}`);
    if (!response.ok) {
      const rawText = await response.text();
      let payload = {};
      try {
        payload = rawText ? JSON.parse(rawText) : {};
      } catch {
        payload = {};
      }
      throw new Error(
        payload.error ||
          rawText ||
          `Unable to fetch TBA event data. HTTP ${response.status}.`,
      );
    }

    const tbaPayload = await response.json();
    state.result = analyzeScoutingData({
      scoutingRows,
      tbaPayload,
      eventKey: state.eventKey,
      csvFileName: state.csvFileName,
    });
  } catch (error) {
    state.result = null;
    state.error = error instanceof Error ? error.message : "Unexpected analysis failure.";
  } finally {
    state.loading = false;
    render();
  }
}

render();
