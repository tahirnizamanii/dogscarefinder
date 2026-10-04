import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://dogscarefinder.pages.dev",
  output: "static",
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