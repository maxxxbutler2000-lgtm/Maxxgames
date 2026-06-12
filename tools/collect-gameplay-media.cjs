const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const outDir = path.join(process.cwd(), "assets", "gameplay");
fs.mkdirSync(outDir, { recursive: true });

const games = [
  ["style-studio", "downloads/hosted-games/style-studio/index.html", "screenshot"],
  ["nail-studio", "downloads/hosted-games/nail-studio/index.html", "screenshot"],
  ["sizzle", "https://jet-drift.itch.io/sizzle", "itch"],
  ["cooking-thief", "https://glepmifom.itch.io/cooking-thief", "itch"],
  ["flappy-race", "https://jibby-games.itch.io/flappy-race", "itch"],
  ["skullrush", "https://ohmnivore.github.io/", "page"],
  ["amazing-track", "https://eugenyn.itch.io/amazing-track", "itch"],
  ["openclonk", "https://www.openclonk.org/gallery/", "page"],
  ["xquest", "https://scottrippey.github.io/xquestjs/", "screenshot"],
  ["littlejs-platformer", "https://killedbyapixel.github.io/LittleJS/examples/platformer/", "screenshot"],
  ["littlejs-breakout", "https://killedbyapixel.github.io/LittleJS/examples/breakout/", "screenshot"],
  ["hypersomnia", "https://play.hypersomnia.io/", "screenshot"],
  ["warzone-2100", "https://wz2100.net/media/", "page"],
  ["openhv", "https://www.openhv.net/", "page"],
  ["dmux", "https://www.dmux.me/", "page"],
  ["destination-sol", "https://github.com/MovingBlocks/DestinationSol", "page"],
  ["tuxemon", "https://tuxemon.org/", "page"],
  ["0ad", "https://play0ad.com/media/screenshots/", "page"],
  ["teeworlds", "https://www.teeworlds.com/?page=downloads", "page"],
  ["veraball", "https://veraball.github.io/", "page"],
  ["lix", "https://www.lixgame.com/", "page"],
  ["open-td", "https://lorgan3.github.io/open-td/", "screenshot"],
  ["kimilao-tower-defense", "https://kimilao.itch.io/tower-defense", "itch"],
  ["defense-mania", "https://defensemania.github.io/", "screenshot"],
  ["the-last-stand-td", "https://brainmotiongames.itch.io/the-last-stand", "itch"],
];

function absolutize(url, base) {
  try {
    return new URL(url.replaceAll("&amp;", "&"), base).toString();
  } catch {
    return null;
  }
}

function scoreUrl(url) {
  const lower = url.toLowerCase();
  let score = 0;
  if (lower.includes("screenshot")) score += 10;
  if (lower.includes("screen")) score += 6;
  if (lower.includes("media")) score += 3;
  if (lower.includes("gameplay")) score += 10;
  if (lower.includes("logo")) score -= 20;
  if (lower.includes("icon")) score -= 20;
  if (lower.includes("avatar")) score -= 20;
  if (lower.includes("frog")) score -= 20;
  if (lower.includes("banner")) score -= 8;
  if (lower.endsWith(".gif")) score += 4;
  if (lower.includes("original")) score += 2;
  return score;
}

async function imageFromPage(pageUrl, mode) {
  const res = await fetch(pageUrl);
  if (!res.ok) throw new Error(`${res.status} ${pageUrl}`);
  const html = await res.text();

  if (mode === "itch") {
    const match = html.match(/<div class="screenshot_list">([\s\S]*?)<\/div>/);
    if (match) {
      const href = match[1].match(/href="([^"]+)"/);
      if (href) return href[1].replaceAll("&amp;", "&");
    }
  }

  const urls = new Set();
  const attrRe = /(?:src|href|content|data-src|srcset)="([^"]+\.(?:png|jpe?g|webp|gif)(?:\?[^"]*)?[^"]*)"/gi;
  let m;
  while ((m = attrRe.exec(html))) {
    for (const part of m[1].split(",")) {
      const raw = part.trim().split(/\s+/)[0];
      const abs = absolutize(raw, pageUrl);
      if (abs) urls.add(abs);
    }
  }

  const candidates = [...urls]
    .filter((url) => !url.includes("static.itch.io") && !url.includes("favicon"))
    .sort((a, b) => scoreUrl(b) - scoreUrl(a));

  if (!candidates.length) throw new Error(`No image candidates for ${pageUrl}`);
  return candidates[0];
}

async function downloadImage(url, slug) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const contentType = res.headers.get("content-type") || "";
  const bytes = Buffer.from(await res.arrayBuffer());
  const ext =
    contentType.includes("gif") || url.toLowerCase().includes(".gif") ? "gif" :
    contentType.includes("png") || url.toLowerCase().includes(".png") ? "png" :
    contentType.includes("webp") || url.toLowerCase().includes(".webp") ? "webp" :
    "jpg";
  const original = path.join(outDir, `${slug}.${ext}`);
  fs.writeFileSync(original, bytes);

  if (ext === "gif") return original;

  const finalPath = path.join(outDir, `${slug}.webp`);
  await sharp(bytes)
    .resize(960, 420, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toFile(finalPath);
  if (original !== finalPath) fs.rmSync(original, { force: true });
  return finalPath;
}

async function screenshot(pageTarget, slug) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const url = pageTarget.startsWith("http") ? pageTarget : `file://${path.join(process.cwd(), pageTarget)}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const pngPath = path.join(outDir, `${slug}.png`);
  const finalPath = path.join(outDir, `${slug}.webp`);
  await page.screenshot({ path: pngPath, type: "png", fullPage: false });
  await browser.close();
  await sharp(pngPath)
    .resize(960, 420, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toFile(finalPath);
  fs.rmSync(pngPath, { force: true });
  return finalPath;
}

(async () => {
  const mappings = [];
  for (const [slug, target, mode] of games) {
    try {
      const file = mode === "screenshot"
        ? await screenshot(target, slug)
        : await downloadImage(await imageFromPage(target, mode), slug);
      mappings.push([slug, path.relative(process.cwd(), file)]);
      console.log(`${slug}: ${path.relative(process.cwd(), file)}`);
    } catch (error) {
      console.error(`${slug}: ${error.message}`);
    }
  }
  fs.writeFileSync(path.join(outDir, "mappings.json"), JSON.stringify(mappings, null, 2));
})();
