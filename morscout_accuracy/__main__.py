from __future__ import annotations

import argparse

from .analyzer import analyze, render_console_report, write_outputs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="morscout-accuracy",
        description="Evaluate scout accuracy against Statbotics-style benchmark metrics.",
    )
    parser.add_argument("--scouting", required=True, help="Path to MorScout scouting CSV.")
    parser.add_argument("--benchmarks", required=True, help="Path to benchmark CSV.")
    parser.add_argument(
        "--config",
        help="Optional JSON config that defines key columns, scout column, and metric weights/scales.",
    )
    parser.add_argument(
        "--output-dir",
        default="output",
        help="Directory where leaderboard.csv, entry_details.csv, and summary.json will be written.",
    )
    parser.add_argument(
        "--no-write",
        action="store_true",
        help="Print the report without writing output files.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    result = analyze(
        scouting_path=args.scouting,
        benchmark_path=args.benchmarks,
        config_path=args.config,
    )
    print(render_console_report(result))
    if not args.no_write:
        paths = write_outputs(result, args.output_dir)
        print()
        print("Saved outputs:")
        for name, path in paths.items():
            print(f"- {name}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
