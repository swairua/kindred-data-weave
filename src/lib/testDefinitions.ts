import type { TestDefinition } from "@/context/TestDataContext";

/**
 * The laboratory's test catalogue.
 *
 * `test_definitions` is the single source of truth for which tests exist, which
 * material each one belongs to and the order they are listed in. `enabled`
 * decides whether a test is offered: a disabled test is not selectable, and
 * its results and projects are not listed.
 *
 * The API returns `enabled` as 0/1, but it can also be a boolean depending on
 * where the row came from, so both forms are accepted here.
 */
export const isTestEnabled = (
  definition: { enabled?: boolean | number } | null | undefined,
): boolean => definition?.enabled !== false && definition?.enabled !== 0;

/** The test keys that are currently offered. */
export const enabledTestKeys = (definitions: TestDefinition[]): Set<string> =>
  new Set(
    definitions
      .filter((definition) => isTestEnabled(definition))
      .map((definition) => definition.test_key)
      .filter(Boolean),
  );

/** The test keys that are switched off, and so must not be listed anywhere. */
export const disabledTestKeys = (definitions: TestDefinition[]): Set<string> =>
  new Set(
    definitions
      .filter((definition) => !isTestEnabled(definition))
      .map((definition) => definition.test_key)
      .filter(Boolean),
  );
