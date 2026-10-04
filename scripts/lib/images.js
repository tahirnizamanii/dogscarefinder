// scripts/lib/images.js

export const IMAGE_POOL = {
  Grooming: ["photo-1596492784531-6e6eb5ea9993","photo-1587300003388-59208cc962cb","photo-1601758228041-f3b2795255f1","photo-1583511655857-d19b40a7a54e","photo-1611003228941-98852ba62227","photo-1560807707-8cc77767d783","photo-1583512603805-3cc6b41f3edb","photo-1591946614720-90a587da4a36","photo-1548767797-d8c844163c4c","photo-1601758124510-52d02ddb7cbd","photo-1583337130417-3346a1be7dee","photo-1596492784531-6e6eb5ea9993"],
  Training: ["photo-1568572933382-74d440642117","photo-1548199973-03cce0bbc87b","photo-1450778869180-41d0601e046e","photo-1518717758536-85ae29035b6d","photo-1601758124510-52d02ddb7cbd","photo-1537151608828-ea2b11777ee8","photo-1552053831-71594a27632d","photo-1477884213360-7e9d7dcc1e48","photo-1507146426996-ef05306b995a","photo-1583511655857-d19b40a7a54e","photo-1576201836106-db1758fd1c97","photo-1601758282298-3ff6b1b7d3a1"],
  Boarding: ["photo-1601758228041-f3b2795255f1","photo-1560807707-8cc77767d783","photo-1583337130417-3346a1be7dee","photo-1543466835-00a7907e9de1","photo-1589924691995-400dc9ecc119","photo-1568640347023-a616a30bc3bd","photo-1552053831-71594a27632d","photo-1587300003388-59208cc962cb","photo-1518717758536-85ae29035b6d","photo-1548199973-03cce0bbc87b","photo-1583512603805-3cc6b41f3edb","photo-1477884213360-7e9d7dcc1e48"],
  Health: ["photo-1583337130417-3346a1be7dee","photo-1601758228041-f3b2795255f1","photo-1587300003388-59208cc962cb","photo-1450778869180-41d0601e046e","photo-1560807707-8cc77767d783","photo-1548199973-03cce0bbc87b","photo-1518717758536-85ae29035b6d","photo-1583511655857-d19b40a7a54e","photo-1601758124510-52d02ddb7cbd","photo-1596492784531-6e6eb5ea9993","photo-1537151608828-ea2b11777ee8","photo-1576201836106-db1758fd1c97"],
  Nutrition: ["photo-1568640347023-a616a30bc3bd","photo-1589924691995-400dc9ecc119","photo-1596492784531-6e6eb5ea9993","photo-1552053831-71594a27632d","photo-1601758228041-f3b2795255f1","photo-1583337130417-3346a1be7dee","photo-1537151608828-ea2b11777ee8","photo-1560807707-8cc77767d783","photo-1548199973-03cce0bbc87b","photo-1601758124510-52d02ddb7cbd","photo-1583512603805-3cc6b41f3edb","photo-1507146426996-ef05306b995a"],
  Lifestyle: ["photo-1548199973-03cce0bbc87b","photo-1450778869180-41d0601e046e","photo-1518717758536-85ae29035b6d","photo-1601758228041-f3b2795255f1","photo-1477884213360-7e9d7dcc1e48","photo-1507146426996-ef05306b995a","photo-1576201836106-db1758fd1c97","photo-1601758282298-3ff6b1b7d3a1","photo-1560807707-8cc77767d783","photo-1583337130417-3346a1be7dee","photo-1543466835-00a7907e9de1","photo-1583511655857-d19b40a7a54e"],
  Behavior: ["photo-1450778869180-41d0601e046e","photo-1548199973-03cce0bbc87b","photo-1568572933382-74d440642117","photo-1601758228041-f3b2795255f1","photo-1518717758536-85ae29035b6d","photo-1477884213360-7e9d7dcc1e48","photo-1576201836106-db1758fd1c97","photo-1507146426996-ef05306b995a","photo-1583337130417-3346a1be7dee","photo-1583511655857-d19b40a7a54e","photo-1560807707-8cc77767d783","photo-1601758282298-3ff6b1b7d3a1"],
  General: ["photo-1601758228041-f3b2795255f1","photo-1548199973-03cce0bbc87b","photo-1450778869180-41d0601e046e","photo-1518717758536-85ae29035b6d","photo-1583337130417-3346a1be7dee","photo-1587300003388-59208cc962cb","photo-1596492784531-6e6eb5ea9993","photo-1560807707-8cc77767d783","photo-1568572933382-74d440642117","photo-1583511655857-d19b40a7a54e","photo-1543466835-00a7907e9de1","photo-1589924691995-400dc9ecc119"],
};

const ALT_POOL = ["Happy healthy dog","Dog with shiny groomed coat","Dog during grooming session","Attentive dog looking at camera","Dog enjoying outdoor play","Well-trained dog sitting","Dog resting comfortably","Playful puppy","Dog with owner","Fluffy dog portrait","Dog being cared for","Smiling dog"];

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash = hash & hash; }
  return Math.abs(hash);
}

export function unsplashUrl(id, width) {
  width = width || 1200;
  return "https://images.unsplash.com/" + id + "?w=" + width + "&q=80&auto=format&fit=crop";
}

export function pickImage(category, index) {
  index = index || 0;
  const pool = IMAGE_POOL[category] || IMAGE_POOL.General;
  const imgId = pool[index % pool.length];
  return { url: unsplashUrl(imgId), thumb: unsplashUrl(imgId, 400), alt: ALT_POOL[index % ALT_POOL.length], id: imgId };
}

export function pickUniqueImage(category, slug, width) {
  width = width || 1200;
  const pool = IMAGE_POOL[category] || IMAGE_POOL.General;
  const h = hashString(slug);
  const imgId = pool[h % pool.length];
  return { url: unsplashUrl(imgId, width), thumb: unsplashUrl(imgId, 400), alt: ALT_POOL[h % ALT_POOL.length], id: imgId };
}

export function pickUniqueSet(category, slug, count) {
  count = count || 3;
  const pool = IMAGE_POOL[category] || IMAGE_POOL.General;
  const baseHash = hashString(slug);
  const images = [];
  const used = new Set();
  let offset = 0;
  while (images.length < count && offset < pool.length * 2) {
    const idx = (baseHash + offset * 7) % pool.length;
    if (!used.has(idx)) {
      used.add(idx);
      const imgId = pool[idx];
      images.push({ url: unsplashUrl(imgId), thumb: unsplashUrl(imgId, 400), alt: ALT_POOL[(baseHash + offset) % ALT_POOL.length], id: imgId });
    }
    offset++;
  }
  return images;
}
