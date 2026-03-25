from __future__ import annotations

import csv
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import mean, pstdev
from typing import Any, Iterable


DEFAULT_SCOUT_COLUMN = "scout_name"
DEFAULT_KEYS = ["team_key", "match_key"]


@dataclass(frozen=True)
class MetricDefinition:
    name: str
    weight: float = 1.0
    scale: float | None = None


def load_config(config_path: str | None) -> dict[str, Any]:
    if not config_path:
        return {}
    with Path(config_path).open(newline="", encoding="utf-8") as handle:
        return json.load(handle)


def parse_scalar(value: str) -> float | None:
    cleaned = value.strip()
    if cleaned == "":
        return None
    lowered = cleaned.lower()
    if lowered in {"true", "yes", "y"}:
        return 1.0
    if lowered in {"false", "no", "n"}:
        return 0.0
    try:
        return float(cleaned)
    except ValueError:
        return None


def load_csv(path: str) -> list[dict[str, str]]:
    with Path(path).open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [dict(row) for row in reader]


def infer_metrics(
    scouting_rows: list[dict[str, str]],
    benchmark_rows: list[dict[str, str]],
    keys: Iterable[str],
    scout_column: str,
) -> list[MetricDefinition]:
    scouting_columns = set(scouting_rows[0].keys()) if scouting_rows else set()
    benchmark_columns = set(benchmark_rows[0].keys()) if benchmark_rows else set()
    excluded = set(keys) | {scout_column}
    shared = sorted((scouting_columns & benchmark_columns) - excluded)
    metrics: list[MetricDefinition] = []
    for column in shared:
        scouting_values = [parse_scalar(row.get(column, "")) for row in scouting_rows]
        benchmark_values = [parse_scalar(row.get(column, "")) for row in benchmark_rows]
        if any(value is not None for value in scouting_values) and any(
            value is not None for value in benchmark_values
        ):
            metrics.append(MetricDefinition(name=column))
    return metrics


def config_metrics(config: dict[str, Any]) -> list[MetricDefinition]:
    metrics: list[MetricDefinition] = []
    for item in config.get("metrics", []):
        metrics.append(
            MetricDefinition(
                name=item["name"],
                weight=float(item.get("weight", 1.0)),
                scale=float(item["scale"]) if "scale" in item else None,
            )
        )
    return metrics


def build_index(
    rows: list[dict[str, str]],
    keys: list[str],
) -> dict[tuple[str, ...], dict[str, str]]:
    index: dict[tuple[str, ...], dict[str, str]] = {}
    for row in rows:
        index[tuple(row.get(key, "").strip() for key in keys)] = row
    return index


def fallback_key_sets(keys: list[str]) -> list[list[str]]:
    if len(keys) <= 1:
        return [keys]
    return [keys, [keys[0]]]


def matched_benchmark(
    scouting_row: dict[str, str],
    benchmark_indexes: dict[tuple[str, ...], dict[str, str]],
    key_sets: list[list[str]],
) -> dict[str, str] | None:
    for key_set in key_sets:
        key = tuple(scouting_row.get(column, "").strip() for column in key_set)
        if key in benchmark_indexes:
            return benchmark_indexes[key]
    return None


def metric_scale(observed: float, expected: float, metric: MetricDefinition) -> float:
    if metric.scale is not None:
        return max(metric.scale, 1e-9)
    return max(abs(expected), abs(observed), 1.0)


def accuracy_from_error(error_ratio: float) -> float:
    return max(0.0, (1.0 - error_ratio) * 100.0)


def bias_label(avg_signed_error: float) -> str:
    if avg_signed_error >= 0.08:
        return "overcounting"
    if avg_signed_error <= -0.08:
        return "undercounting"
    return "balanced"


def analyze(
    scouting_path: str,
    benchmark_path: str,
    config_path: str | None = None,
) -> dict[str, Any]:
    config = load_config(config_path)
    scout_column = config.get("scout_column", DEFAULT_SCOUT_COLUMN)
    keys = config.get("key_columns", DEFAULT_KEYS)

    scouting_rows = load_csv(scouting_path)
    benchmark_rows = load_csv(benchmark_path)
    if not scouting_rows:
        raise ValueError("Scouting CSV is empty.")
    if not benchmark_rows:
        raise ValueError("Benchmark CSV is empty.")

    metrics = config_metrics(config) or infer_metrics(
        scouting_rows=scouting_rows,
        benchmark_rows=benchmark_rows,
        keys=keys,
        scout_column=scout_column,
    )
    if not metrics:
        raise ValueError("No comparable numeric metrics found between scouting and benchmark data.")

    key_sets = fallback_key_sets(keys)
    benchmark_index: dict[tuple[str, ...], dict[str, str]] = {}
    for key_set in key_sets:
        benchmark_index.update(build_index(benchmark_rows, key_set))

    entry_results: list[dict[str, Any]] = []
    by_scout: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: {
            "accuracies": [],
            "signed_errors": [],
            "abs_errors": [],
        }
    )

    for scouting_row in scouting_rows:
        benchmark_row = matched_benchmark(scouting_row, benchmark_index, key_sets)
        if benchmark_row is None:
            continue

        metric_results: list[dict[str, float | str]] = []
        weighted_accuracy = 0.0
        weight_total = 0.0
        signed_errors: list[float] = []
        abs_errors: list[float] = []

        for metric in metrics:
            observed = parse_scalar(scouting_row.get(metric.name, ""))
            expected = parse_scalar(benchmark_row.get(metric.name, ""))
            if observed is None or expected is None:
                continue

            scale = metric_scale(observed=observed, expected=expected, metric=metric)
            signed_error = (observed - expected) / scale
            absolute_error = abs(signed_error)
            accuracy = accuracy_from_error(absolute_error)

            metric_results.append(
                {
                    "metric": metric.name,
                    "observed": observed,
                    "expected": expected,
                    "accuracy": round(accuracy, 2),
                    "signed_error": round(signed_error, 4),
                }
            )
            signed_errors.append(signed_error)
            abs_errors.append(absolute_error)
            weighted_accuracy += accuracy * metric.weight
            weight_total += metric.weight

        if not metric_results or weight_total == 0:
            continue

        scout_name = scouting_row.get(scout_column, "").strip() or "Unknown Scout"
        entry_accuracy = weighted_accuracy / weight_total
        average_signed_error = mean(signed_errors)
        average_abs_error = mean(abs_errors)

        by_scout[scout_name]["accuracies"].append(entry_accuracy)
        by_scout[scout_name]["signed_errors"].append(average_signed_error)
        by_scout[scout_name]["abs_errors"].append(average_abs_error)

        entry_results.append(
            {
                "scout_name": scout_name,
                "team_key": scouting_row.get("team_key", ""),
                "match_key": scouting_row.get("match_key", ""),
                "accuracy": round(entry_accuracy, 2),
                "bias": bias_label(average_signed_error),
                "metric_results": metric_results,
            }
        )

    leaderboard: list[dict[str, Any]] = []
    for scout_name, values in by_scout.items():
        scout_accuracy = mean(values["accuracies"])
        avg_signed_error = mean(values["signed_errors"])
        consistency = 100.0 if len(values["accuracies"]) == 1 else max(
            0.0, 100.0 - (pstdev(values["accuracies"]) * 2.0)
        )
        leaderboard.append(
            {
                "rank": 0,
                "scout_name": scout_name,
                "accuracy": round(scout_accuracy, 2),
                "consistency": round(consistency, 2),
                "entries": len(values["accuracies"]),
                "mean_absolute_error": round(mean(values["abs_errors"]) * 100.0, 2),
                "mean_signed_error": round(avg_signed_error * 100.0, 2),
                "bias": bias_label(avg_signed_error),
            }
        )

    leaderboard.sort(
        key=lambda item: (
            -item["accuracy"],
            -item["consistency"],
            item["mean_absolute_error"],
            item["scout_name"],
        )
    )
    for index, item in enumerate(leaderboard, start=1):
        item["rank"] = index

    summary = {
        "metrics_used": [metric.name for metric in metrics],
        "total_entries_analyzed": len(entry_results),
        "total_scouts_ranked": len(leaderboard),
        "overall_accuracy": round(mean(item["accuracy"] for item in leaderboard), 2)
        if leaderboard
        else 0.0,
        "most_reliable_scout": leaderboard[0]["scout_name"] if leaderboard else None,
        "least_reliable_scout": leaderboard[-1]["scout_name"] if leaderboard else None,
    }

    return {
        "summary": summary,
        "leaderboard": leaderboard,
        "entries": entry_results,
    }


def write_csv(path: str, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with Path(path).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def render_console_report(result: dict[str, Any]) -> str:
    summary = result["summary"]
    leaderboard = result["leaderboard"]
    lines = [
        "MorScout Accuracy Analyzer",
        f"Entries analyzed: {summary['total_entries_analyzed']}",
        f"Scouts ranked: {summary['total_scouts_ranked']}",
        f"Overall accuracy: {summary['overall_accuracy']:.2f}%",
        f"Metrics: {', '.join(summary['metrics_used'])}",
        "",
        "Leaderboard",
    ]
    for item in leaderboard:
        lines.append(
            (
                f"{item['rank']}. {item['scout_name']} | accuracy {item['accuracy']:.2f}% | "
                f"consistency {item['consistency']:.2f}% | bias {item['bias']} | "
                f"entries {item['entries']}"
            )
        )
    return "\n".join(lines)


def write_outputs(
    result: dict[str, Any],
    output_dir: str,
) -> dict[str, str]:
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    leaderboard_path = out_path / "leaderboard.csv"
    entries_path = out_path / "entry_details.csv"
    summary_path = out_path / "summary.json"

    write_csv(
        str(leaderboard_path),
        result["leaderboard"],
        [
            "rank",
            "scout_name",
            "accuracy",
            "consistency",
            "entries",
            "mean_absolute_error",
            "mean_signed_error",
            "bias",
        ],
    )

    flattened_entries = []
    for entry in result["entries"]:
        flattened_entries.append(
            {
                "scout_name": entry["scout_name"],
                "team_key": entry["team_key"],
                "match_key": entry["match_key"],
                "accuracy": entry["accuracy"],
                "bias": entry["bias"],
            }
        )
    write_csv(
        str(entries_path),
        flattened_entries,
        ["scout_name", "team_key", "match_key", "accuracy", "bias"],
    )

    summary_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return {
        "leaderboard": str(leaderboard_path),
        "entries": str(entries_path),
        "summary": str(summary_path),
    }
