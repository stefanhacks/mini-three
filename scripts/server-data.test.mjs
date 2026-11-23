import { describe, expect, it } from "vitest";
import {
  fishingAreas, lootChances, orderFishZones, poolYields, readSqlTable, trainerSkillLevels,
} from "./server-data.mjs";

const loot = (entry, item, chance, group = 0, ref = 1) =>
  ({ entry, item, ChanceOrQuestChance: chance, groupid: group, mincountOrRef: ref });

describe("readSqlTable", () => {
  const sql = [
    "CREATE TABLE `t` (\n  `id` int NOT NULL,\n  `name` varchar(10),\n  `note` text,",
    "  PRIMARY KEY (`id`)\n) ENGINE=x;",
    "CREATE TABLE `other` (\n  `id` int\n) ENGINE=x;",
    "INSERT INTO `other` VALUES (9);",
    "INSERT INTO `t` VALUES (1,'it\\'s (a), b;',NULL),(2,'',-3.5);",
    "INSERT INTO `t` VALUES (3,'x\\\\y','z');",
  ].join("\n");

  it("reads every insert of the table by column name: quotes, escapes, commas, NULL and numbers", () => {
    expect(readSqlTable(sql, "t")).toEqual([
      { id: 1, name: "it's (a), b;", note: null },
      { id: 2, name: "", note: -3.5 },
      { id: 3, name: "x\\y", note: "z" },
    ]);
  });

  it("fails on a table the dump doesn't have", () => {
    expect(() => readSqlTable(sql, "missing")).toThrow(/missing/);
  });
});

describe("lootChances", () => {
  it("shares a group's leftover between its zero-chance rows, scales through references, skips dead rows", () => {
    const rows = [loot(1, 10, 40, 1), loot(1, 11, 0, 1), loot(1, 12, 0, 1), loot(1, 13, 0), loot(1, 0, 50, 0, -7)];
    const references = new Map([[7, [loot(7, 20, 30), loot(7, 10, 100)]]]);
    expect(lootChances(rows, references)).toEqual(new Map([[10, 50], [11, 30], [12, 30], [20, 15]]));
  });
});

describe("fishingAreas and poolYields", () => {
  const references = [loot(500, 6522, 30), loot(500, 2770, 70)];

  it("lists the areas each wanted fish is caught in, skipping the junk entry 0", () => {
    const fishing = [loot(17, 0, 100, 1, -500), loot(718, 6522, 25), loot(0, 6522, 100)];
    expect(fishingAreas(fishing, references, [6522])).toEqual(new Map([[6522, new Map([[17, 30], [718, 25]])]]));
  });

  it("reads only fishing pools, and only the wanted fish they yield", () => {
    const templates = [
      { entry: 1, type: 25, data1: 90 }, { entry: 2, type: 3, data1: 90 }, { entry: 3, type: 25, data1: 0 },
    ];
    const poolLoot = [loot(90, 0, 100, 0, -500), loot(90, 3820, 50)];
    expect(poolYields(templates, poolLoot, references, [6522])).toEqual(new Map([[1, [6522]]]));
  });
});

describe("trainerSkillLevels", () => {
  it("takes the lowest level over trainers, through teaching spells, for the given skill lines only", () => {
    const rows = [
      { spell: 3184, reqskill: 171, reqskillvalue: 20 }, // teaching spell for 3170
      { spell: 3170, reqskill: 171, reqskillvalue: 15 }, // another trainer lists the recipe itself, lower
      { spell: 2339, reqskill: 171, reqskillvalue: 0 }, // counts as 1
      { spell: 9999, reqskill: 164, reqskillvalue: 5 }, // Blacksmithing: ignored
    ];
    const learns = new Map([[3184, [3170]], [2339, [2331]]]);
    const levels = trainerSkillLevels(rows, learns, new Set([171]));
    expect([levels.get(3170), levels.get(2331), levels.has(9999)]).toEqual([15, 1, false]);
  });
});

describe("orderFishZones", () => {
  it("puts fished zones by chance first, then pool-only zones by spawns", () => {
    const chances = new Map([["Westfall", 18], ["The Barrens", 30], ["Durotar", 30]]);
    const spawns = new Map([["The Barrens", 16], ["Ashenvale", 2], ["Hillsbrad Foothills", 9]]);
    expect(orderFishZones(chances, spawns))
      .toEqual(["Durotar", "The Barrens", "Westfall", "Hillsbrad Foothills", "Ashenvale"]);
  });
});
