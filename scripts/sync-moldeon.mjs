import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_ROOT = "https://encode.moldeoncar.com/api";
// 몰던카 웹앱이 공개 조회에 사용하는 브라우저용 키입니다.
const API_KEY = process.env.MOLDEON_API_KEY || "22227bbf-66ad-4196-aa43-e50056411aa5";
const dealerId = process.env.MOLDEON_CONTACT_ID?.trim();
const outputPath = resolve(process.env.OUTPUT_PATH || "data/cars.json");
const concurrency = Math.max(1, Math.min(6, Number(process.env.SYNC_CONCURRENCY || 4)));

if (!dealerId || !/^\d+$/.test(dealerId)) {
  throw new Error("MOLDEON_CONTACT_ID에 몰던카 판매자 미니홈피의 contactID 숫자를 설정하세요.");
}

async function fetchApi(path, attempt = 1) {
  try {
    const response = await fetch(new URL(path.replace(/^\//, ""), `${API_ROOT}/`), {
      headers: {
        "x-api-key": API_KEY,
        "user-agent": "DodreamMotorsInventorySync/2.0 (+https://dodreamcar.com/)",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.status !== "OK") throw new Error(`몰던카 응답 상태: ${body.status || "알 수 없음"}`);
    return body.data;
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1_500));
      return fetchApi(path, attempt + 1);
    }
    throw new Error(`${path} 요청 실패: ${error.message}`, { cause: error });
  }
}

async function collectCarIds() {
  const itemCount = 30;
  const first = await fetchApi(`/home/seller.mdc?id=${dealerId}&page=1&itemCount=${itemCount}&keyword=`);
  const ids = first.list.map((car) => String(car.id));
  const pages = Math.ceil(first.total / itemCount);
  for (let page = 2; page <= pages; page += 1) {
    const result = await fetchApi(`/home/seller.mdc?id=${dealerId}&page=${page}&itemCount=${itemCount}&keyword=`);
    ids.push(...result.list.map((car) => String(car.id)));
  }
  return [...new Set(ids)];
}

function fuelName(code) {
  return ({
    0: "알 수 없음", 1: "가솔린", 2: "디젤", 3: "LPG", 4: "가솔린/LPG",
    5: "CNG", 6: "하이브리드", 7: "전기/LPG", 8: "가솔린/CNG",
    9: "전기", 10: "수소", 11: "전기/디젤",
  })[code] || "기타";
}

function transmissionName(code) {
  return ({ 0: "알 수 없음", 1: "오토", 2: "수동", 3: "세미오토", 4: "CVT" })[code] || "기타";
}

function normalizeDetail(detail) {
  const price = detail.price || {};
  return {
    id: String(detail.id),
    brand: detail.brand || "",
    model: detail.model || "",
    trim: detail.clss || "",
    fullName: [detail.model, detail.clss].filter(Boolean).join(" "),
    year: Number(detail.date_model || 0),
    registeredAt: detail.date_reg || "",
    price: Number(price.price || 0),
    mileage: Number(detail.mileage || 0),
    fuel: fuelName(String(detail.fuel)),
    transmission: transmissionName(String(detail.trans)),
    color: detail.color || "",
    accident: detail.accident ? "있음" : "무사고",
    location: detail.user?.xname
      ? `${detail.user.xname}${detail.zone ? ` (${detail.zone})` : ""}`
      : (detail.zone || "광주"),
    vehicleNumber: detail.no || "",
    memo: detail.memo || detail.memo_s || "등록된 상세설명이 없습니다.",
    photos: Array.isArray(detail.photo) ? detail.photo.filter(Boolean) : [],
    sourceUrl: `https://app.mdcar.biz/#/ad/${detail.id}`,
    inspectionUrl: detail.check?.value || "",
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

const ids = await collectCarIds();
const details = await mapConcurrent(ids, concurrency, async (id) => {
  const data = await fetchApi(`/ad/detail.mdc?id=${id}&zid=`);
  return { ...data, id };
});
const cars = details.map(normalizeDetail);
const dealerTitle = details[0]?.user?.name || dealerId;

let previous;
try {
  previous = JSON.parse(await readFile(outputPath, "utf8"));
} catch {
  previous = undefined;
}
const sameInventory = previous
  && previous.dealerId === dealerId
  && JSON.stringify(previous.cars) === JSON.stringify(cars);
const payload = {
  source: "moldeoncar-api",
  dealerId,
  dealerTitle,
  syncedAt: sameInventory ? previous.syncedAt : new Date().toISOString(),
  count: cars.length,
  cars,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`몰던카 ${dealerTitle}: 차량 ${cars.length}대를 ${outputPath}에 저장했습니다.`);
