import { describe, expect, it } from "vitest";
import { defaultTests } from "@/context/TestDataContext";
import { ALLOWED_TEST_KEYS, isTestAllowed } from "@/lib/recordTestWizard";

/**
 * The frontend must offer exactly the 12 tests the laboratory runs, and no
 * others. Two lists carry that catalogue when `test_definitions` has not loaded
 * yet: `defaultTests` (what the Record and Dashboard pages render) and
 * `ALLOWED_TEST_KEYS` (what the record wizard lets you pick). They are checked
 * against each other here so a test cannot be added to one and forgotten in the
 * other, and so a retired test cannot creep back onto the page.
 */
const LEGACY_TEST_KEYS = [
  "cbr",
  "shear",
  "consolidation",
  "upvt",
  "cubes",
  "porosity",
  "dcp",
  "schmidt",
];

const catalogueKeys = Object.keys(defaultTests);

const allowedKeys = Object.entries(ALLOWED_TEST_KEYS)
  .filter(([material]) => material !== "special")
  .flatMap(([, keys]) => [...(keys ?? [])]);

describe("frontend test catalogue", () => {
  it("lists exactly the 12 tests the laboratory offers", () => {
    expect(catalogueKeys.sort()).toEqual([...allowedKeys].sort());
    expect(catalogueKeys).toHaveLength(12);
  });

  it("splits them into 5 soil, 4 concrete and 3 rock tests", () => {
    const byCategory = catalogueKeys.reduce<Record<string, string[]>>((acc, key) => {
      const category = defaultTests[key].category;
      (acc[category] ||= []).push(key);
      return acc;
    }, {});

    expect(byCategory.soil.sort()).toEqual(["atterberg", "cpt", "grading", "proctor", "spt"]);
    expect(byCategory.concrete.sort()).toEqual(["compressive", "coring", "ndt", "slump"]);
    expect(byCategory.rock.sort()).toEqual(["pointload", "schmidt_rock", "ucs"]);
    expect(byCategory.special).toBeUndefined();
  });

  it("keeps every retired test off the page", () => {
    for (const key of LEGACY_TEST_KEYS) {
      expect(catalogueKeys).not.toContain(key);
    }
  });

  it("marks every offered test enabled and lists it under an offered class", () => {
    for (const key of catalogueKeys) {
      const test = defaultTests[key];
      expect(test.enabled, `${key} must be enabled`).toBe(true);
      expect(["soil", "concrete", "rock"]).toContain(test.category);
      expect(test.name.trim().length, `${key} needs a name`).toBeGreaterThan(0);
      expect(isTestAllowed(test.category as "soil" | "concrete" | "rock", key)).toBe(true);
    }
  });

  it("numbers each class from 1 so the page order matches the catalogue", () => {
    for (const category of ["soil", "concrete", "rock"]) {
      const orders = catalogueKeys
        .filter((key) => defaultTests[key].category === category)
        .map((key) => defaultTests[key].sortOrder)
        .sort((a, b) => (a ?? 0) - (b ?? 0));

      expect(orders, `${category} must be numbered from 1`).toEqual(
        orders.map((_, index) => index + 1),
      );
    }
  });
});
