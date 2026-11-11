// Pre-renders emoji profile tiles as PNGs into public/posters/.
// Run with: node scripts/build-posters.mjs   (only needed if EMOJI or COLOURS change)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { EMOJI, COLOURS, emojiCode } from "../src/emoji.js";

const require = createRequire(import.meta.url);
const svgDir = require.resolve("@twemoji/svg/1f436.svg").replace(/1f436\.svg$/, "");
const out = new URL("../public/posters/", import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let n = 0;
for (const e of EMOJI) {
  const code = emojiCode(e);
  const raw = readFileSync(svgDir + code + ".svg", "utf8");
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  for (const c of COLOURS) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#${c}"/>
<svg x="106" y="106" width="300" height="300" viewBox="0 0 36 36">${inner}</svg></svg>`;
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 512 } }).render().asPng();
    writeFileSync(new URL(`${code}-${c}.png`, out), png);
    n++;
  }
}
console.log(`rendered ${n} posters`);
