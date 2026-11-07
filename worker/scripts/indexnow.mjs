// Tells Bing (and other IndexNow engines; Google doesn't use it) that pages changed. Bing also
// feeds ChatGPT search and Copilot. Run after a deploy is live:
//   node scripts/indexnow.mjs                    every URL in the live sitemap
//   node scripts/indexnow.mjs /guides/new-page   only these paths
const SITE = "https://skwirl.parthakholkar.com";
const KEY = "0b091bd2c19ecf0059f52ff2f613c780"; // public/0b091bd2c19ecf0059f52ff2f613c780.txt proves ownership

const paths = process.argv.slice(2);
const urls = paths.length
  ? paths.map((p) => new URL(p, SITE).href)
  : [...(await (await fetch(`${SITE}/sitemap.xml`)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
});
console.log(`IndexNow: ${res.status} for ${urls.length} URL(s)`);
if (!res.ok) process.exit(1);
