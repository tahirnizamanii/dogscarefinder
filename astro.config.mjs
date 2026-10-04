// astro.config.mjs
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://dogscarefinder.pages.dev",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes("/admin") &&
        !page.includes("/dashboard") &&
        !page.includes("/login") &&
        !page.includes("/signup") &&
        !page.includes("/api/"),
    }),
  ],
  build: { format: "directory" },
  compressHTML: true,
});