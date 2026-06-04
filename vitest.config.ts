// ABOUTME: Vitest configuration for unit and integration tests.
// ABOUTME: Uses the Node environment so native modules (better-sqlite3) load correctly.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
