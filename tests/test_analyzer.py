from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from morscout_accuracy.analyzer import analyze, write_outputs


ROOT = Path(__file__).resolve().parents[1]


class AnalyzerTests(unittest.TestCase):
    def test_analyze_ranks_scouts_by_accuracy(self) -> None:
        result = analyze(
            scouting_path=str(ROOT / "sample_data" / "scouting.csv"),
            benchmark_path=str(ROOT / "sample_data" / "benchmarks.csv"),
            config_path=str(ROOT / "config.example.json"),
        )

        self.assertEqual(result["summary"]["total_entries_analyzed"], 8)
        self.assertEqual(result["leaderboard"][0]["scout_name"], "Jordan")
        self.assertEqual(result["leaderboard"][-1]["scout_name"], "Avery")
        self.assertEqual(result["leaderboard"][0]["bias"], "balanced")

    def test_write_outputs_creates_expected_files(self) -> None:
        result = analyze(
            scouting_path=str(ROOT / "sample_data" / "scouting.csv"),
            benchmark_path=str(ROOT / "sample_data" / "benchmarks.csv"),
            config_path=str(ROOT / "config.example.json"),
        )

        with TemporaryDirectory() as temp_dir:
            paths = write_outputs(result, temp_dir)
            self.assertTrue(Path(paths["leaderboard"]).exists())
            self.assertTrue(Path(paths["entries"]).exists())
            self.assertTrue(Path(paths["summary"]).exists())


if __name__ == "__main__":
    unittest.main()
