// scripts/fix-featured-images.mjs
import "dotenv/config";
import { getPool } from "./db.js";
import { pickUniqueImage, pickUniqueSet } from "./lib/images.js";

function slugify(text) {
  return text.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 200);
}

async function main() {
  const pool = getPool();
  console.log("Fixing featured images for all posts...\n");

  const [posts] = await pool.query(
    "SELECT id, title, slug, category, content FROM blog_posts ORDER BY id"
  );

  console.log(`Found ${posts.length} posts\n`);

  let updated = 0;
  const seen = new Map();

  for (const post of posts) {
    const category = post.category || "General";
    const slug = post.slug || slugify(post.title);

    // Unique featured image
    const featured = pickUniqueImage(category, slug);

    const key = featured.id;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(post.slug);

    // Unique images inside the content
    const images = pickUniqueSet(category, slug, 3);
    let fixedContent = post.content || "";

    const urlRegex = /https:\/\/images\.unsplash\.com\/([^"?]+)\?[^"]*/g;
    let idx = 0;
    fixedContent = fixedContent.replace(urlRegex, (match) => {
      if (idx < images.length) return images[idx++].url;
      return match;
    });

    await pool.query(
      "UPDATE blog_posts SET featured_image = ?, content = ? WHERE id = ?",
      [featured.url, fixedContent, post.id]
    );

    console.log(`  OK [${post.id}] ${post.title.substring(0, 55)}`);
    console.log(`         Featured: ${featured.id}`);
    updated++;
  }

  console.log("\n=== Duplicate check ===");
  let dupes = 0;
  for (const [imgId, slugs] of seen.entries()) {
    if (slugs.length > 1) {
      dupes++;
      console.log(`  ${imgId} used by ${slugs.length} posts`);
    }
  }

  if (dupes === 0) {
    console.log("  All featured images are unique!");
  } else {
    console.log(`  ${dupes} images shared (add more to pool to fix)`);
  }

  console.log(`\nUpdated ${updated} posts`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});