import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = "http://moldeoncar.com";
const dealerId = process.env.MOLDEON_CONTACT_ID?.trim();
const outputPath = resolve(process.env.OUTPUT_PATH || "data/cars.json");
const concurrency = Math.max(1, Math.min(6, Number(process.env.SYNC_CONCURRENCY || 4)));

if (!dealerId || !/^\d+$/.test(dealerId)) {
  throw new Error("MOLDEON_CONTACT_ID에 몰던카 판매자 미니홈피의 contactID 숫자를 설정하세요.");
}

function decodeEntities(value = "") {
  const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (_, name) => entities[name.toLowerCase()] ?? `&${name};`);
}

function text(value = "") {
  return decodeEntities(value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[\t\r ]+/g, " ").replace(/ *\n */g, "\n").trim();
}

async function fetchLegacy(path) {
  const response = await fetch(new URL(path, ROOT), {
    headers: { "user-agent": "DodreamMotorsInventorySync/1.0 (+https://dodreamcar.com/)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${path} 요청 실패: HTTP ${response.status}`);
  return new TextDecoder("euc-kr").decode(await response.arrayBuffer());
}

function managerPagePath(page) {
  return page === 0
    ? `/manager/?contactID=${dealerId}`
    : `/manager/default.asp?grp=0&page=${page}&contactID=${dealerId}`;
}

async function collectCarIds() {
  const first = await fetchLegacy(managerPagePath(0));
  const title = text(first.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
  if (!title || !first.includes(`contactID=${dealerId}`)) throw new Error("판매자 미니홈피를 확인할 수 없습니다. contactID를 확인하세요.");
  const pageNumbers = [...first.matchAll(/page=(\d+)&(?:amp;)?contactID=/gi)].map((match) => Number(match[1]));
  const maxPage = Math.max(0, ...pageNumbers);
  const pages = [first];
  for (let page = 1; page <= maxPage; page += 1) pages.push(await fetchLegacy(managerPagePath(page)));
  const ids = new Set();
  for (const html of pages) {
    for (const match of html.matchAll(/usedCarID=(\d+)/gi)) ids.add(match[1]);
  }
  return { ids: [...ids], dealerTitle: title.replace(/^몰던카-/, "").replace(/\s*홈$/, "") };
}

function infoMap(html) {
  const table = html.match(/<table[^>]+id=["']info["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] || "";
  const cells = [...table.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => ({ type: match[1].toLowerCase(), value: text(match[2]) }));
  const result = {};
  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index].type === "th" && cells[index + 1]?.type === "td") result[cells[index].value] = cells[index + 1].value;
  }
  return result;
}

function absolute(path) {
  if (!path) return "";
  const decoded = decodeEntities(path);
  const origin = /^\/(?:car_img2|files)\//i.test(decoded) ? "https://encode.moldeoncar.com" : ROOT;
  return new URL(decoded, origin).href;
}

function parseDetail(id, html) {
  const heading = text(html.match(/<div[^>]+id=["']uc_title["'][^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1]);
  const [brand = "", ...nameParts] = heading.split(/\s+-\s+/);
  const fullName = nameParts.join(" - ");
  const model = fullName.match(/^(.+?)(?=\s+(?:\d|[A-Z]\d|디젤|가솔린|LPI|LPG|EV|하이브리드))/)?.[1] || fullName;
  const trim = fullName.slice(model.length).trim();
  const info = infoMap(html);
  const photos = [...new Set([...html.matchAll(/<img[^>]+class=["'][^"']*\bphoto\b[^"']*["'][^>]+rel=["']([^"']+)["']/gi)].map((match) => absolute(match[1])))];
  if (!photos.length) {
    const main = html.match(/id=["']photo_01["'][^>]+src=["']([^"'?]+)/i)?.[1];
    if (main) photos.push(absolute(main));
  }
  const priceText = text(html.match(/<div[^>]+id=["']uc_price["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
  const year = Number(info["연식"]?.match(/(\d{4})/)?.[1] || 0);
  const mileage = Number((info["주행거리"]?.match(/[\d,]+/)?.[0] || "0").replaceAll(",", ""));
  const price = Number((priceText.match(/[\d,]+\s*만원/)?.[0] || "0").replace(/[^\d]/g, ""));
  const registeredAt = text(html.match(/등록일:\s*([^,<]+)/i)?.[1]);
  const memo = text(html.match(/<p[^>]+class=["']cmem["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]);
  const inspection = html.match(/href=["']([^"']*(?:cklist|check)[^"']*)["'][^>]*checked/i)?.[1];
  return {
    id, brand, model, trim, fullName, year, registeredAt, price, mileage,
    fuel: info["연료"] || "", transmission: info["변속기"] || "", color: info["색상"] || "",
    accident: info["사고이력"] || "", location: info["보관장소"] || "광주", vehicleNumber: info["차량번호"] || "",
    memo, photos, sourceUrl: `https://app.mdcar.biz/#/ad/${id}`,
    inspectionUrl: inspection ? new URL(decodeEntities(inspection), `${ROOT}/usedCar/`).href : "",
  };
}

async function mapConcurrent(items, workerCount, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workerCount, items.length || 1) }, run));
  return output;
}

const { ids, dealerTitle } = await collectCarIds();
const cars = await mapConcurrent(ids, concurrency, async (id) => parseDetail(id, await fetchLegacy(`/usedCar/detail.asp?usedCarID=${id}`)));
const payload = { source: "moldeoncar", dealerId, dealerTitle, syncedAt: new Date().toISOString(), count: cars.length, cars };
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`몰던카 ${dealerTitle}: 차량 ${cars.length}대를 ${outputPath}에 저장했습니다.`);


