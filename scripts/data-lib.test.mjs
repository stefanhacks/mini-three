import { describe, expect, it } from "vitest";
import { classifyGatherables, parseCsv, parseCsvRows } from "./data-lib.mjs";

describe("parseCsvRows", () => {
  it("keeps commas, escaped quotes and newlines inside quoted fields", () => {
    const text = "a,b,c\n1,\"x, y\",\"say \"\"hi\"\"\"\n2,\"line one\nline two\",z\n";
    expect(parseCsvRows(text)).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", "say \"hi\""],
      ["2", "line one\nline two", "z"],
    ]);
  });

  it("handles CRLF, empty fields and a missing final newline", () => {
    expect(parseCsvRows("a,b\r\n,2\r\n3,")).toEqual([["a", "b"], ["", "2"], ["3", ""]]);
  });
});

describe("parseCsv", () => {
  it("maps rows to header names, skips blank lines and the BOM", () => {
    const text = "﻿ID,Name\n1,Silverleaf\n\n2,\"Copper, Bar\"\n";
    expect(parseCsv(text)).toEqual([
      { ID: "1", Name: "Silverleaf" },
      { ID: "2", Name: "Copper, Bar" },
    ]);
  });
});

describe("classifyGatherables", () => {
  const item = (classId, subclassId) => ({ classId, subclassId });
  const items = new Map([
    [1, item(7, 9)], // herb
    [2, item(7, 7)], // metal and stone
    [3, item(7, 6)], // leather
    [4, item(7, 5)], // cloth
    [5, item(7, 7)], // bar, created by a recipe
    [6, item(7, 8)], // meat or fish: not classified
    [7, item(2, 9)], // not trade goods
    [8, item(7, 5)], // bolt of cloth, created by a recipe
  ]);
  const recipe = (profession, reagentIds, created) => ({
    profession,
    ...(created ? { item: created } : {}),
    reagents: reagentIds.map((id) => ({ item: id })),
  });

  it("assigns uncrafted reagents to the profession that collects them", () => {
    const recipes = [recipe("alchemy", [1, 6, 7]), recipe("blacksmithing", [2, 3], 99)];
    expect(classifyGatherables(items, recipes)).toEqual({ herbalism: [1], mining: [2], skinning: [3] });
  });

  it("puts cloth under its own group whichever profession uses it, once", () => {
    const recipes = [recipe("tailoring", [4, 4]), recipe("first-aid", [4]), recipe("tailoring", [4])];
    expect(classifyGatherables(items, recipes)).toEqual({ cloth: [4] });
  });

  it("leaves out anything a recipe creates, even when another recipe uses it", () => {
    const recipes = [recipe("mining", [2], 5), recipe("blacksmithing", [5]), recipe("tailoring", [8]),
      recipe("tailoring", [4], 8)];
    expect(classifyGatherables(items, recipes)).toEqual({ mining: [2], cloth: [4] });
  });

  it("assigns allow-listed ids whatever their class, but never ones a recipe creates", () => {
    const recipes = [recipe("cooking", [6, 7, 5]), recipe("mining", [2], 5)];
    expect(classifyGatherables(items, recipes, { fishing: [6], herbalism: [7, 5] }))
      .toEqual({ fishing: [6], herbalism: [7], mining: [2] });
  });

  it("ignores reagents missing from the item table", () => {
    expect(classifyGatherables(items, [recipe("alchemy", [404])])).toEqual({});
  });
});
