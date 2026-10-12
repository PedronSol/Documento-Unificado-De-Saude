import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";


function exists(relativePath) {
  return existsSync(fileURLToPath(new URL(relativePath, import.meta.url)));
}


describe("organização por feature", () => {
  it.each([
    "../components/health-passport",
    "../mocks",
    "../components/identity/authenticated-home.jsx",
  ])("não mantém o legado sem consumidor %s", (path) => {
    expect(exists(path)).toBe(false);
  });
});
