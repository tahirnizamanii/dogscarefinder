import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  site: "https://dogcarefinder.com",
  build: { format: "directory" },
  compressHTML: true,
});