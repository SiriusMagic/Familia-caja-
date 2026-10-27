import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:4173/",
    // Fuera de CI se puede usar un Chromium ya instalado: PW_CHROMIUM=/ruta/al/navegador
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "yarn build && yarn vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
