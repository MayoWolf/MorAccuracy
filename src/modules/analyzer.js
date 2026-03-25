const OBJECTIVE_METRICS = [
  {
    key: "autoHubCount",
    label: "Auto fuel scored",
    weight: 1.2,
    lowerBound: 0,
    scaleFloor: 6,
  },
  {
    key: "teleopHubCount",
    label: "Teleop fuel scored",
    weight: 1.6,
    lowerBound: 0,
    scaleFloor: 10,
  },
  {
    key: "autoTowerCount",
    label: "Auto tower success",
    weight: 1.0,
    lowerBound: 0,
    upperBound: 1,
    scaleFloor: 1,
  },
  {
    key: "endgameTowerLevel",
    label: "Teleop tower level",
    weight: 1.1,
    lowerBound: 0,
    upperBound: 3,
    scaleFloor: 2,
  },
];

const towerLevelMap = {
  None: 0,
  "Level 1": 1,
  "Level 2": 2,
  "Level 3": 3,
};

const officialTowerLevelMap = {
  None: 0,
  Level1: 1,
  Level2: 2,
  Level3: 3,
};

export const benchmarkedMetricLabels = OBJECTIVE_METRICS.map((metric) => metric.label);

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toBinary(value) {
  return String(value || "").trim().toLowerCase() === "yes" ? 1 : 0;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values) {
  if (values.length <= 1) {
    return 0;
  }
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function quantile(values, q) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function groupBy(items, getKey) {
  const grouped = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  }
  return grouped;
}

function projectToBoundedSimplex(values, target, lowerBound = 0, upperBound = Number.POSITIVE_INFINITY) {
  const projected = new Array(values.length).fill(0);
  const lowerTotal = lowerBound * values.length;
  const upperTotal = Number.isFinite(upperBound) ? upperBound * values.length : Number.POSITIVE_INFINITY;
  const clippedTarget = Math.max(lowerTotal, Math.min(target, upperTotal));

  let active = values.map((_, index) => index);
  let fixedTotal = 0;

  while (active.length) {
    const adjustedTarget = clippedTarget - fixedTotal - lowerBound * active.length;
    const shiftedValues = active.map((index) => values[index] - lowerBound);
    const simplexProjection = projectToSimplex(shiftedValues, Math.max(0, adjustedTarget));

    let violated = false;
    for (let offset = 0; offset < active.length; offset += 1) {
      const index = active[offset];
      const candidate = simplexProjection[offset] + lowerBound;
      if (candidate < lowerBound - 1e-9) {
        projected[index] = lowerBound;
        fixedTotal += lowerBound;
        active = active.filter((item) => item !== index);
        violated = true;
        break;
      }
      if (candidate > upperBound + 1e-9) {
        projected[index] = upperBound;
        fixedTotal += upperBound;
        active = active.filter((item) => item !== index);
        violated = true;
        break;
      }
    }

    if (!violated) {
      for (let offset = 0; offset < active.length; offset += 1) {
        projected[active[offset]] = simplexProjection[offset] + lowerBound;
      }
      return projected;
    }
  }

  return projected;
}

function projectToSimplex(values, target) {
  if (!values.length) {
    return [];
  }
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => right.value - left.value);

  let running = 0;
  let rho = -1;
  for (let index = 0; index < sorted.length; index += 1) {
    running += sorted[index].value;
    const theta = (running - target) / (index + 1);
    if (sorted[index].value - theta > 0) {
      rho = index;
    }
  }

  const threshold =
    rho >= 0
      ? (sorted.slice(0, rho + 1).reduce((total, item) => total + item.value, 0) - target) / (rho + 1)
      : 0;

  const projected = new Array(values.length).fill(0);
  for (const item of sorted) {
    projected[item.index] = Math.max(item.value - threshold, 0);
  }
  return projected;
}

function computeBiasDirection(normalizedError) {
  if (normalizedError >= 0.08) {
    return "overcounting";
  }
  if (normalizedError <= -0.08) {
    return "undercounting";
  }
  return "balanced";
}

function officialAutoTowerCount(allianceBreakdown) {
  return ["autoTowerRobot1", "autoTowerRobot2", "autoTowerRobot3"].filter(
    (key) => allianceBreakdown[key] && allianceBreakdown[key] !== "None",
  ).length;
}

function officialEndgameTowerLevel(allianceBreakdown) {
  return sum(
    ["endGameTowerRobot1", "endGameTowerRobot2", "endGameTowerRobot3"].map(
      (key) => officialTowerLevelMap[allianceBreakdown[key]] || 0,
    ),
  );
}

function buildOfficialAllianceIndex(matches) {
  const allianceIndex = new Map();
  const matchIndex = new Map();

  for (const match of matches) {
    if (match.comp_level !== "qm" || !match.score_breakdown) {
      continue;
    }

    const matchNumber = Number(match.match_number);
    matchIndex.set(matchNumber, match);

    for (const color of ["red", "blue"]) {
      const breakdown = match.score_breakdown[color];
      if (!breakdown?.hubScore) {
        continue;
      }

      const allianceKey = `${matchNumber}-${color}`;
      allianceIndex.set(allianceKey, {
        matchNumber,
        alliance: color,
        allianceLabel: color === "red" ? "Red" : "Blue",
        teams: match.alliances[color].team_keys.map((teamKey) => teamKey.replace("frc", "")),
        metrics: {
          autoHubCount: toNumber(breakdown.hubScore.autoCount),
          teleopHubCount: toNumber(breakdown.hubScore.teleopCount),
          autoTowerCount: officialAutoTowerCount(breakdown),
          endgameTowerLevel: officialEndgameTowerLevel(breakdown),
        },
      });
    }
  }

  return { allianceIndex, matchIndex };
}

function metricScale(rows, metric) {
  const values = rows.map((row) => row.metrics[metric.key]);
  return Math.max(metric.scaleFloor, quantile(values, 0.9));
}

function inferTruthForMetric(metric, rows, allianceIndex) {
  const eligibleRows = rows.filter((row) => allianceIndex.has(row.allianceKey));
  const rowsByAlliance = groupBy(eligibleRows, (row) => row.allianceKey);
  const scoutBias = new Map();

  for (const row of eligibleRows) {
    scoutBias.set(row.scoutName, 0);
  }

  const truthByRowId = new Map();
  const lambda = 2.5;

  for (let iteration = 0; iteration < 30; iteration += 1) {
    let maxBiasChange = 0;

    for (const [allianceKey, allianceRows] of rowsByAlliance.entries()) {
      const official = allianceIndex.get(allianceKey).metrics[metric.key];
      const adjustedObservations = allianceRows.map(
        (row) => row.metrics[metric.key] - (scoutBias.get(row.scoutName) || 0),
      );
      const projected = projectToBoundedSimplex(
        adjustedObservations,
        official,
        metric.lowerBound ?? 0,
        metric.upperBound ?? Number.POSITIVE_INFINITY,
      );

      for (let index = 0; index < allianceRows.length; index += 1) {
        truthByRowId.set(allianceRows[index].id, projected[index]);
      }
    }

    const rowsByScout = groupBy(eligibleRows, (row) => row.scoutName);
    for (const [scoutName, scoutRows] of rowsByScout.entries()) {
      const residuals = scoutRows.map((row) => row.metrics[metric.key] - (truthByRowId.get(row.id) ?? 0));
      const nextBias = (mean(residuals) * scoutRows.length) / (scoutRows.length + lambda);
      maxBiasChange = Math.max(maxBiasChange, Math.abs(nextBias - (scoutBias.get(scoutName) || 0)));
      scoutBias.set(scoutName, nextBias);
    }

    if (maxBiasChange < 0.0001) {
      break;
    }
  }

  return { truthByRowId, scoutBias };
}

export function parseMorScoutCsv(rawRows) {
  return rawRows
    .filter((row) => row["Scout Name"] && row["Match Number"] && row["Team Number"])
    .map((row, index) => ({
      id: `row-${index + 1}`,
      scoutName: String(row["Scout Name"]).trim(),
      matchNumber: Number(row["Match Number"]),
      alliance: String(row["Alliance"] || "").trim().toLowerCase(),
      allianceLabel: String(row["Alliance"] || "").trim() || "Unknown",
      teamNumber: String(row["Team Number"]).trim(),
      station: String(row["Station"] || "").trim(),
      comments: String(row["General Comments"] || "").trim(),
      metrics: {
        autoHubCount: toNumber(row["Auto FUEL Scored"]),
        teleopHubCount: toNumber(row["Teleop FUEL Scored"]),
        autoTowerCount: toBinary(row["Auto TOWER Level 1?"]),
        endgameTowerLevel: towerLevelMap[String(row["Teleop TOWER Level"] || "").trim()] || 0,
      },
      raw: row,
    }));
}

export function analyzeScoutingData({ scoutingRows, tbaPayload, eventKey }) {
  const warnings = [];
  const { allianceIndex, matchIndex } = buildOfficialAllianceIndex(tbaPayload.matches);

  const matchedRows = scoutingRows
    .map((row) => {
      const match = matchIndex.get(row.matchNumber);
      if (!match) {
        warnings.push(`Match ${row.matchNumber} is not available in TBA qualification data.`);
        return { ...row, matched: false, allianceKey: null };
      }

      const possibleAlliance = ["red", "blue"].find((color) =>
        match.alliances[color].team_keys.some((teamKey) => teamKey === `frc${row.teamNumber}`),
      );

      if (!possibleAlliance) {
        warnings.push(`Team ${row.teamNumber} in match ${row.matchNumber} was not found in TBA alliance assignments.`);
        return { ...row, matched: false, allianceKey: null };
      }

      if (row.alliance && row.alliance !== possibleAlliance) {
        warnings.push(
          `Alliance corrected for team ${row.teamNumber} in match ${row.matchNumber}: CSV said ${row.allianceLabel}, TBA said ${possibleAlliance}.`,
        );
      }

      return {
        ...row,
        matched: allianceIndex.has(`${row.matchNumber}-${possibleAlliance}`),
        alliance: possibleAlliance,
        allianceLabel: possibleAlliance === "red" ? "Red" : "Blue",
        allianceKey: `${row.matchNumber}-${possibleAlliance}`,
      };
    })
    .filter((row) => row.matched);

  const rowEntries = matchedRows.map((row) => ({
    ...row,
    metricResults: [],
    accuracy: 0,
    signedError: 0,
    bias: "balanced",
  }));

  const entryById = new Map(rowEntries.map((entry) => [entry.id, entry]));
  const metricCoverage = [];

  for (const metric of OBJECTIVE_METRICS) {
    const scale = metricScale(matchedRows, metric);
    const { truthByRowId } = inferTruthForMetric(metric, matchedRows, allianceIndex);
    const accuracies = [];

    for (const row of matchedRows) {
      const entry = entryById.get(row.id);
      const truth = truthByRowId.get(row.id);
      if (entry === undefined || truth === undefined) {
        continue;
      }

      const observed = row.metrics[metric.key];
      const signedError = observed - truth;
      const normalizedError = signedError / scale;
      const accuracy = Math.max(0, (1 - Math.abs(normalizedError)) * 100);
      accuracies.push(accuracy);

      entry.metricResults.push({
        key: metric.key,
        label: metric.label,
        observed,
        benchmark: truth,
        signedError,
        normalizedError,
        accuracy,
        weight: metric.weight,
      });
    }

    metricCoverage.push({
      key: metric.key,
      label: metric.label,
      matchedRows: accuracies.length,
      averageAccuracy: mean(accuracies),
    });
  }

  for (const entry of rowEntries) {
    const totalWeight = sum(entry.metricResults.map((metric) => metric.weight)) || 1;
    const weightedAccuracy =
      sum(entry.metricResults.map((metric) => metric.accuracy * metric.weight)) / totalWeight;
    const meanSignedError = mean(entry.metricResults.map((metric) => metric.normalizedError));

    entry.accuracy = weightedAccuracy;
    entry.signedError = meanSignedError;
    entry.bias = computeBiasDirection(meanSignedError);
  }

  const byScout = groupBy(rowEntries, (entry) => entry.scoutName);
  const leaderboard = [...byScout.entries()]
    .map(([scoutName, entries]) => {
      const accuracies = entries.map((entry) => entry.accuracy);
      const normalizedErrors = entries.map((entry) => entry.signedError);
      return {
        rank: 0,
        scoutName,
        entries: entries.length,
        accuracy: mean(accuracies),
        consistency: Math.max(0, 100 - standardDeviation(accuracies) * 2),
        averageSignedError: mean(normalizedErrors),
        bias: computeBiasDirection(mean(normalizedErrors)),
      };
    })
    .sort((left, right) => {
      if (right.accuracy !== left.accuracy) {
        return right.accuracy - left.accuracy;
      }
      if (right.consistency !== left.consistency) {
        return right.consistency - left.consistency;
      }
      return left.scoutName.localeCompare(right.scoutName);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return {
    summary: {
      eventKey,
      eventName: tbaPayload.event?.name || eventKey,
      totalRows: scoutingRows.length,
      matchedRows: rowEntries.length,
      totalScouts: leaderboard.length,
      averageAccuracy: mean(leaderboard.map((entry) => entry.accuracy)),
      topScout: leaderboard[0]?.scoutName ?? null,
    },
    leaderboard,
    entries: rowEntries.sort((left, right) => right.accuracy - left.accuracy),
    metricCoverage,
    warnings: [...new Set(warnings)].slice(0, 12),
  };
}
