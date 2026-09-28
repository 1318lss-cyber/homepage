import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_ROOT = "https://encode.moldeoncar.com/api";
const API_KEY = process.env.INVENTORY_API_KEY || "22227bbf-66ad-4196-aa43-e50056411aa5";
const COMPANY_ID = process.env.DODREAM_COMPANY_ID || "1321";
const outputPath = resolve(process.env.OUTPUT_PATH || "data/cars.json");
const searchBody = {
  carType:"all", optValues:[], keyword:"", isKr:true, brand:"", modelGroup:"", model:[], classGroup:[], carClass:[],
  year:[], month:[], yearType:"year", price:[], mileage:[0,0], fuel:[], trans:[], option:[], sido:"5", complex:["127"],
  company:[COMPANY_ID], color:[], spc:[], isNoAcc:false, isPrivate:false, isLease:false, isFixed:false,
  isAdminCheck:false, isOffPrice:false, itemCount:30, zid:"116", order:"modify",
};

async function fetchPage(page, attempt = 1) {
  try {
    const response = await fetch(`${API_ROOT}/search/`, {
      method:"POST",
      headers:{ "x-api-key":API_KEY, "content-type":"application/json", "user-agent":"DodreamMotorsInventorySync/3.0 (+https://dodreamcar.com/)" },
      body:JSON.stringify({ ...searchBody, page }),
      signal:AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.status !== "OK") throw new Error(`응답 상태: ${payload.status || "알 수 없음"}`);
    return payload.data;
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1_500));
      return fetchPage(page, attempt + 1);
    }
    throw new Error(`전체 매물 ${page}페이지 요청 실패: ${error.message}`, { cause:error });
  }
}

const fuelName = (code) => ({
  0:"알 수 없음", 1:"가솔린", 2:"디젤", 3:"LPG", 4:"가솔린/LPG", 5:"CNG", 6:"하이브리드",
  7:"전기/LPG", 8:"가솔린/CNG", 9:"전기", 10:"수소", 11:"전기/디젤",
})[code] || "기타";
const transmissionName = (code) => ({ 0:"알 수 없음", 1:"오토", 2:"수동", 3:"세미오토", 4:"CVT" })[code] || "기타";

function normalize(car) {
  return {
    id:String(car.id), brand:car.brand || "", model:car.model || "", trim:car.clss || "",
    fullName:[car.model, car.clss].filter(Boolean).join(" "), year:Number(car.year || 0), registeredAt:car.reg || "",
    price:Number(car.price || 0), mileage:Number(car.mileage || 0), fuel:fuelName(String(car.fuel)),
    transmission:transmissionName(String(car.trans)), color:"", accident:"상세 확인", location:car.sido || "광주 서구",
    vehicleNumber:"", memo:car.memo || "", photos:car.photo ? [car.photo] : [], inspectionUrl:"", detailLoaded:false,
  };
}

const first = await fetchPage(1);
const cars = first.list.map(normalize);
const pageCount = Math.ceil(first.total / searchBody.itemCount);
for (let page = 2; page <= pageCount; page += 1) {
  const result = await fetchPage(page);
  cars.push(...result.list.map(normalize));
}

let previous;
try { previous = JSON.parse(await readFile(outputPath, "utf8")); } catch { previous = undefined; }
const sameInventory = previous && previous.companyId === COMPANY_ID && JSON.stringify(previous.cars) === JSON.stringify(cars);
const payload = {
  source:"company-inventory-api", companyId:COMPANY_ID, companyTitle:"두드림모터스",
  syncedAt:sameInventory ? previous.syncedAt : new Date().toISOString(), count:cars.length, cars,
};

await mkdir(dirname(outputPath), { recursive:true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`두드림모터스 전체 차량 ${cars.length}대를 ${outputPath}에 저장했습니다.`);
