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
        <h1>Turn raw scouting logs into a ranked accuracy board.</h1>
        <p class="lede">
          Upload a MorScout export, point the app at an event on The Blue Alliance,
          and it will score each scout against objective match outcomes for the
          benchmarkable fields in your sheet.
        </p>
      </div>
      <div class="hero-callout">
        <p class="callout-title">Benchmarked fields</p>
        <ul class="metric-list">
          ${benchmarkedMetricLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}
        </ul>
        <p class="callout-note">
          Powered by your MorScout CSV plus official TBA match breakdowns via a Netlify function.
        </p>
      </div>
    </section>
  `;
}

function renderControls() {
  return `
    <section class="panel panel-form">
      <div class="panel-heading">
        <h2>Analyze Event</h2>
        <p>Use the event key from The Blue Alliance, like <code>2026casj</code>.</p>
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
        <label class="field field-upload">
          <span>MorScout CSV</span>
          <input id="csv-file" name="csvFile" type="file" accept=".csv,text/csv" required />
          <small>${state.csvFileName ? `Loaded: ${escapeHtml(state.csvFileName)}` : "Choose your exported scouting CSV."}</small>
        </label>
        <button class="primary-button" type="submit" ${state.loading ? "disabled" : ""}>
          ${state.loading ? "Analyzing..." : "Run Analysis"}
        </button>
      </form>
      ${
        state.error
          ? `<div class="notice notice-error">${escapeHtml(state.error)}</div>`
          : `<div class="notice">The browser keeps your CSV local. Only the event key is sent to the Netlify function for official TBA data.</div>`
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
          <span>Most reliable</span>
          <strong>${escapeHtml(summary.topScout || "N/A")}</strong>
        </article>
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
              <th>Accuracy</th>
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
          <h2>Metric Coverage</h2>
          <p>Only objective fields with an official TBA equivalent are benchmarked.</p>
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

  if (form) {
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
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Unable to fetch TBA event data.");
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
