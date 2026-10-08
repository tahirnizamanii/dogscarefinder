// .agents/skills/seo-doctor/fixers/generate-sitemap.mjs
// Generates dist/sitemap.xml + dist/robots.txt (excludes pruned pages)

import fs from "fs";
import path from "path";

const SITE_URL = "https://dogcarefinder.com";
const DIST = path.resolve("dist");
const CONFIG_DIR = path.resolve("config");

export default async function generateSitemap({ dry }) {
  if (!fs.existsSync(DIST)) {
    return { message: "dist/ not built yet - run npm run build first", fixed: 0 };
  }

  let pruned = [];
  const prunedPath = path.join(CONFIG_DIR, "pruned-pages.json");
  if (fs.existsSync(prunedPath)) {
    pruned = JSON.parse(fs.readFileSync(prunedPath, "utf-8"));
  }
  const prunedSet = new Set(
    pruned.map((p) => "/" + p.state + "/" + p.city + "/" + p.category)
  );

  const urls = [];
  const EXCLUDE = ["/admin", "/dashboard", "/login", "/signup", "/api", "/claim"];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "index.html") {
        const rel = path.relative(DIST, full).replace(/\\/g, "/");
        let url = "/" + rel.replace(/index\.html$/, "").replace(/\/$/, "");

        if (EXCLUDE.some((p) => url.startsWith(p))) continue;
        if (prunedSet.has(url)) continue;

        const segments = url.split("/").filter(Boolean);
        let priority = 0.5;
        let changefreq = "monthly";

        if (url === "/") { priority = 1.0; changefreq = "daily"; }
        else if (segments.length === 1) { priority = 0.9; changefreq = "weekly"; }
        else if (segments.length === 2) { priority = 0.8; changefreq = "weekly"; }
        else if (segments.length === 3 && segments[0] !== "provider" && segments[0] !== "blog") {
          priority = 0.7; changefreq = "weekly";
        }
        else if (segments[0] === "provider") { priority = 0.6; changefreq = "monthly"; }
        else if (segments[0] === "blog") { priority = 0.6; changefreq = "monthly"; }

        urls.push({
          loc: SITE_URL + (url === "/" ? "/" : url + "/"),
          lastmod: new Date().toISOString().split("T")[0],
          changefreq,
          priority: priority.toFixed(1),
        });
      }
    }
  }

  walk(DIST);
  urls.sort((a, b) => parseFloat(b.priority) - parseFloat(a.priority));

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const u of urls) {
    xml += "  <url>\n";
    xml += "    <loc>" + u.loc + "</loc>\n";
    xml += "    <lastmod>" + u.lastmod + "</lastmod>\n";
    xml += "    <changefreq>" + u.changefreq + "</changefreq>\n";
    xml += "    <priority>" + u.priority + "</priority>\n";
    xml += "  </url>\n";
  }
  xml += "</urlset>\n";

  const robots = "User-agent: *\n" +
    "Allow: /\n\n" +
    "Disallow: /admin/\n" +
    "Disallow: /dashboard/\n" +
    "Disallow: /login/\n" +
    "Disallow: /signup/\n" +
    "Disallow: /claim/\n" +
    "Disallow: /api/\n\n" +
    "Sitemap: " + SITE_URL + "/sitemap.xml\n";

  if (!dry) {
    fs.writeFileSync(path.join(DIST, "sitemap.xml"), xml);
    fs.writeFileSync(path.join(DIST, "robots.txt"), robots);
  }

  return {
    message: urls.length + " URLs" + (pruned.length > 0 ? " (" + pruned.length + " pruned)" : ""),
    fixed: urls.length,
  };
}