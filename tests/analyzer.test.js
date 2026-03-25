import test from "node:test";
import assert from "node:assert/strict";

import { analyzeScoutingData, parseMorScoutCsv } from "../src/modules/analyzer.js";

test("analyzeScoutingData ranks scouts and computes summary", () => {
  const scoutingRows = parseMorScoutCsv([
    {
      "Scout Name": "Alex",
      "Match Number": "1",
      Alliance: "Red",
      "Team Number": "111",
      Station: "1",
      "Auto FUEL Scored": "2",
      "Teleop FUEL Scored": "9",
      "Auto TOWER Level 1?": "Yes",
      "Teleop TOWER Level": "Level 2",
    },
    {
      "Scout Name": "Blair",
      "Match Number": "1",
      Alliance: "Red",
      "Team Number": "222",
      Station: "2",
      "Auto FUEL Scored": "1",
      "Teleop FUEL Scored": "8",
      "Auto TOWER Level 1?": "No",
      "Teleop TOWER Level": "Level 1",
    },
    {
      "Scout Name": "Casey",
      "Match Number": "1",
      Alliance: "Red",
      "Team Number": "333",
      Station: "3",
      "Auto FUEL Scored": "0",
      "Teleop FUEL Scored": "7",
      "Auto TOWER Level 1?": "No",
      "Teleop TOWER Level": "None",
    },
    {
      "Scout Name": "Alex",
      "Match Number": "2",
      Alliance: "Blue",
      "Team Number": "111",
      Station: "1",
      "Auto FUEL Scored": "3",
      "Teleop FUEL Scored": "10",
      "Auto TOWER Level 1?": "Yes",
      "Teleop TOWER Level": "Level 3",
    },
    {
      "Scout Name": "Blair",
      "Match Number": "2",
      Alliance: "Blue",
      "Team Number": "444",
      Station: "2",
      "Auto FUEL Scored": "1",
      "Teleop FUEL Scored": "6",
      "Auto TOWER Level 1?": "No",
      "Teleop TOWER Level": "Level 1",
    },
    {
      "Scout Name": "Casey",
      "Match Number": "2",
      Alliance: "Blue",
      "Team Number": "555",
      Station: "3",
      "Auto FUEL Scored": "1",
      "Teleop FUEL Scored": "5",
      "Auto TOWER Level 1?": "No",
      "Teleop TOWER Level": "None",
    },
  ]);

  const result = analyzeScoutingData({
    scoutingRows,
    eventKey: "2026test",
    tbaPayload: {
      event: { name: "Test Event" },
      matches: [
        {
          comp_level: "qm",
          match_number: 1,
          alliances: {
            red: { team_keys: ["frc111", "frc222", "frc333"] },
            blue: { team_keys: ["frc900", "frc901", "frc902"] },
          },
          score_breakdown: {
            red: {
              hubScore: { autoCount: 3, teleopCount: 24 },
              autoTowerRobot1: "Level1",
              autoTowerRobot2: "None",
              autoTowerRobot3: "None",
              endGameTowerRobot1: "Level2",
              endGameTowerRobot2: "Level1",
              endGameTowerRobot3: "None",
            },
            blue: {
              hubScore: { autoCount: 0, teleopCount: 0 },
              autoTowerRobot1: "None",
              autoTowerRobot2: "None",
              autoTowerRobot3: "None",
              endGameTowerRobot1: "None",
              endGameTowerRobot2: "None",
              endGameTowerRobot3: "None",
            },
          },
        },
        {
          comp_level: "qm",
          match_number: 2,
          alliances: {
            red: { team_keys: ["frc700", "frc701", "frc702"] },
            blue: { team_keys: ["frc111", "frc444", "frc555"] },
          },
          score_breakdown: {
            red: {
              hubScore: { autoCount: 0, teleopCount: 0 },
              autoTowerRobot1: "None",
              autoTowerRobot2: "None",
              autoTowerRobot3: "None",
              endGameTowerRobot1: "None",
              endGameTowerRobot2: "None",
              endGameTowerRobot3: "None",
            },
            blue: {
              hubScore: { autoCount: 5, teleopCount: 21 },
              autoTowerRobot1: "Level1",
              autoTowerRobot2: "None",
              autoTowerRobot3: "None",
              endGameTowerRobot1: "Level3",
              endGameTowerRobot2: "Level1",
              endGameTowerRobot3: "None",
            },
          },
        },
      ],
    },
  });

  assert.equal(result.summary.totalScouts, 3);
  assert.equal(result.summary.matchedRows, 6);
  assert.equal(result.summary.eventName, "Test Event");
  assert.equal(result.leaderboard[0].scoutName, "Alex");
  assert.ok(result.leaderboard[0].accuracy >= result.leaderboard[1].accuracy);
});
