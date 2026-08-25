import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

export default defineConfig((configEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      test: {
        clearMocks: true,
        environment: "jsdom",
        restoreMocks: true,
        setupFiles: "./src/test/setup.js",
      },
    })
  )
);
