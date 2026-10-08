// astro.config.mjs
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://dogcarefinder.com",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [],
  build: { format: "directory" },
  compressHTML: true,
});