

## Fix TypeScript Build Errors

The `listRecords` function is generic (`listRecords<T>`) but both call sites use it without specifying the type parameter, so `T` defaults to `unknown`.

### Changes

**1. `src/components/admin/TestDefinitionsManager.tsx` (line ~54)**

Add type parameter to the `listRecords` call:
```ts
const response = await listRecords<TestDefinition>("test_definitions", { ... });
```

**2. `src/context/TestDataContext.tsx` (line ~195)**

Define an inline type and pass it to `listRecords`:
```ts
interface TestDefinitionRecord {
  test_key: string;
  name: string;
  category: string;
  enabled: boolean | number;
  sort_order: number;
}

const response = await listRecords<TestDefinitionRecord>("test_definitions", { limit: 1000 });
```

Then the `for (const record of response.data)` loop will have proper typing and all property accesses will resolve.

These are two small, isolated fixes — no logic changes, just adding generic type arguments.

