import { type ComponentType } from "react";

// Test component type
type TestComponent = ComponentType<Record<string, unknown>>;

interface TestRegistryEntry {
  component: TestComponent;
  key: string;
}

class TestRegistry {
  private tests: Map<string, TestRegistryEntry> = new Map();

  /**
   * Register a test component with a key
   */
  registerTest(key: string, component: TestComponent): void {
    this.tests.set(key, { component, key });
  }

  /**
   * Get a test component by key
   */
  getTest(key: string): TestComponent | null {
    const entry = this.tests.get(key);
    return entry ? entry.component : null;
  }

  /**
   * Get all registered test keys
   */
  getAllKeys(): string[] {
    return Array.from(this.tests.keys());
  }

  /**
   * Check if a test is registered
   */
  hasTest(key: string): boolean {
    return this.tests.has(key);
  }

  /**
   * Get all registered tests
   */
  getAllTests(): Map<string, TestComponent> {
    const result = new Map<string, TestComponent>();
    for (const [key, entry] of this.tests.entries()) {
      result.set(key, entry.component);
    }
    return result;
  }
}

// Global registry instance
const registry = new TestRegistry();

// Export registry instance
export { registry };

// Export type
export type { TestComponent, TestRegistryEntry };
