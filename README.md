# MorScout Accuracy Analyzer

MorScout Accuracy Analyzer is a lightweight Python CLI that compares MorScout scouting observations against Statbotics-style benchmark metrics, scores each scouting entry, and produces a ranked scout leaderboard.

## What It Does

- Calculates entry-level and scout-level accuracy percentages.
- Ranks scouts from most accurate to least accurate.
- Flags bias trends like overcounting or undercounting.
- Exports leaderboard, per-entry summaries, and a JSON analysis snapshot.

## Input Model

The MVP uses two CSV files:

- `scouting.csv`: one row per scout observation, including a scout name and match/team identifiers.
- `benchmarks.csv`: one row per benchmark target, using the same identifiers and comparable metric columns.

By default, the analyzer looks for:

- `scout_name` as the scout identifier
- `team_key` and `match_key` as join keys
- shared numeric or boolean-like columns as metrics

You can override those assumptions with `config.example.json`.

## Scoring Model

For each shared metric:

- The tool computes a normalized error using either a configured `scale` or `max(abs(expected), abs(observed), 1)`.
- Metric accuracy is `max(0, 1 - normalized_error) * 100`.
- Entry accuracy is the weighted average across included metrics.
- Scout accuracy is the average of that scout's entry accuracies.
- Bias is based on signed normalized error:
  - positive means overcounting
  - negative means undercounting

## Quick Start

```bash
python3 -m morscout_accuracy \
  --scouting sample_data/scouting.csv \
  --benchmarks sample_data/benchmarks.csv \
  --config config.example.json \
  --output-dir output
```

## Output Files

The CLI writes:

- `output/leaderboard.csv`
- `output/entry_details.csv`
- `output/summary.json`

## Example Config

`config.example.json` shows how to:

- define the scout column
- set join keys
- assign metric weights
- pin metric scales so accuracy is stable across events

## Run Tests

```bash
python3 -m unittest discover -s tests
```

## Next Steps

Good follow-on improvements for a production version:

- add direct Statbotics API ingestion
- add MorScout export adapters for your exact column names
- build a web dashboard for event and season views
- separate auto, teleop, and endgame confidence reporting
