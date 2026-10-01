import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { collection, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js?v=20260929-1";

const state = { all: [], filtered: [], current: null, visibleCount: 24, overrides: new Map(), suppressUrlSync: false };
const $ = (selector) => document.querySelector(selector);
const fmt = (value) => Number(value || 0).toLocaleString("ko-KR");
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const normalizeSearch = (value = "") => String(value).toLowerCase().replace(/[\s-]/g, "");
const API_ROOT = "https://encode.moldeoncar.com/api";
const API_KEY = "22227bbf-66ad-4196-aa43-e50056411aa5";
const COMPANY_ID = "1321";
const SEARCH_BODY = {
  carType:"all", optValues:[], keyword:"", isKr:true, brand:"", modelGroup:"", model:[], classGroup:[], carClass:[],
  year:[], month:[], yearType:"year", price:[], mileage:[0,0], fuel:[], trans:[], option:[], sido:"5", complex:["127"],
  company:[COMPANY_ID], color:[], spc:[], isNoAcc:false, isPrivate:false, isLease:false, isFixed:false,
  isAdminCheck:false, isOffPrice:false, itemCount:30, zid:"116", order:"modify",
};
const fuelName = (code) => ({ 0:"알 수 없음", 1:"가솔린", 2:"디젤", 3:"LPG", 4:"가솔린/LPG", 5:"CNG", 6:"하이브리드", 7:"전기/LPG", 8:"가솔린/CNG", 9:"전기", 10:"수소", 11:"전기/디젤" })[code] || "기타";
const transmissionName = (code) => ({ 0:"알 수 없음", 1:"오토", 2:"수동", 3:"세미오토", 4:"CVT" })[code] || "기타";
let vehicleSearchTimer;
let vehicleSearchSerial = 0;

function applyOverride(car) {
  const override = state.overrides.get(String(car.id));
  if (!override) return car;
  if (Number.isFinite(Number(override.price)) && Number(override.price) >= 0) car.price = Number(override.price);
  if (typeof override.description === "string") car.memo = override.description;
  return car;
}

async function loadOverrides() {
  state.overrides = new Map();
  if (!isFirebaseConfigured()) return;
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const snapshot = await getDocs(collection(getFirestore(app), "carOverrides"));
    snapshot.forEach((document) => state.overrides.set(document.id, document.data()));
  } catch (error) {
    console.warn("차량 수정값을 불러오지 못했습니다.", error);
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: { "x-api-key": API_KEY, ...(options.body ? { "content-type":"application/json" } : {}), ...options.headers },
  });
  if (!response.ok) throw new Error(`차량 정보 연결 오류 (${response.status})`);
  const payload = await response.json();
  if (payload.status !== "OK") throw new Error("차량 정보를 확인할 수 없습니다.");
  return payload.data;
}

function normalizeList(car) {
  return {
    id:String(car.id), brand:car.brand || "", model:car.model || "", trim:car.clss || "",
    fullName:[car.model, car.clss].filter(Boolean).join(" "), year:Number(car.year || 0), registeredAt:car.reg || "",
    price:Number(car.price || 0), mileage:Number(car.mileage || 0), fuel:fuelName(String(car.fuel)),
    transmission:transmissionName(String(car.trans)), color:"", accident:"상세 확인", location:car.sido || "광주 서구",
    vehicleNumber:car.no || car.carNo || car.vehicleNumber || "", memo:car.memo || "", photos:car.photo ? [car.photo] : [],
    inspectionUrl:"", detailLoaded:false,
  };
}

function mergeDetail(car, detail) {
  return Object.assign(car, {
    year:Number(detail.date_model || car.year), registeredAt:detail.date_reg || car.registeredAt,
    price:Number(detail.price?.price || car.price), mileage:Number(detail.mileage || car.mileage),
    fuel:fuelName(String(detail.fuel)), transmission:transmissionName(String(detail.trans)), color:detail.color || "",
    accident:detail.accident ? "있음" : "무사고", vehicleNumber:detail.no || "",
    location:detail.user?.xname ? `${detail.user.xname}${detail.zone ? ` (${detail.zone})` : ""}` : (detail.zone || car.location),
    memo:detail.memo || detail.memo_s || car.memo || "등록된 상세설명이 없습니다.",
    photos:Array.isArray(detail.photo) && detail.photo.length ? detail.photo.filter(Boolean) : car.photos,
    inspectionUrl:detail.check?.value || "", detailLoaded:true,
  });
}

async function fetchCompanyCars() {
  const first = await api("/search/", { method:"POST", body:JSON.stringify({ ...SEARCH_BODY, page:1 }) });
  const cars = first.list.map(normalizeList);
  for (let page = 2; page <= Math.ceil(first.total / SEARCH_BODY.itemCount); page += 1) {
    const result = await api("/search/", { method:"POST", body:JSON.stringify({ ...SEARCH_BODY, page }) });
    cars.push(...result.list.map(normalizeList));
  }
  return cars;
}

async function loadCars() {
  $("#syncStatus").textContent = "두드림모터스 전체 실매물을 확인하고 있습니다…";
  await loadOverrides();
  try {
    state.all = await fetchCompanyCars();
    state.all.forEach(applyOverride);
    $("#syncStatus").textContent = `전체 실매물 최신 확인 · ${new Date().toLocaleString("ko-KR")}`;
  } catch (error) {
    try {
      const response = await fetch(`data/cars.json?v=${Date.now()}`, { cache:"no-store" });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      state.all = Array.isArray(payload.cars) ? payload.cars : [];
      state.all.forEach(applyOverride);
      $("#syncStatus").textContent = "연결 지연 · 저장된 최근 매물을 표시합니다";
    } catch {
      $("#syncStatus").textContent = error.message;
      render([]);
      return;
    }
  }
  populateFilters();
  applyFilters();
  openDetailFromUrl();
}

function populateFilters() {
  const fill = (id, values) => {
    const select = $(id);
    select.length = 1;
    values.forEach((value) => select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`));
  };
  fill("#brandFilter", [...new Set(state.all.map((car) => car.brand).filter(Boolean))].sort());
  fill("#fuelFilter", [...new Set(state.all.map((car) => car.fuel).filter(Boolean))].sort());
}

function applyFilters() {
  window.clearTimeout(vehicleSearchTimer);
  const searchSerial = ++vehicleSearchSerial;
  state.visibleCount = 24;
  const rawQuery = $("#query").value.trim();
  const query = normalizeSearch(rawQuery);
  const brand = $("#brandFilter").value;
  const fuel = $("#fuelFilter").value;
  const sort = $("#sortFilter").value;
  const list = state.all.filter((car) => {
    const haystack = normalizeSearch(`${car.brand} ${car.model} ${car.trim} ${car.memo} ${car.vehicleNumber} ${car.id}`);
    return (!query || haystack.includes(query)) && (!brand || car.brand === brand) && (!fuel || car.fuel === fuel);
  });
  const sorters = {
    new:(a,b) => String(b.id).localeCompare(String(a.id)), priceAsc:(a,b) => a.price - b.price,
    priceDesc:(a,b) => b.price - a.price, mileage:(a,b) => a.mileage - b.mileage,
  };
  state.filtered = list.sort(sorters[sort]);
  renderVisible();
  if (query && /\d/.test(query) && list.length === 0) {
    vehicleSearchTimer = window.setTimeout(() => searchVehicleNumber(rawQuery, { brand, fuel, sort, searchSerial }), 350);
  }
}

async function searchVehicleNumber(query, { brand, fuel, sort, searchSerial }) {
  try {
    const result = await api("/search/", {
      method:"POST",
      body:JSON.stringify({ ...SEARCH_BODY, keyword:query, page:1 }),
    });
    if (searchSerial !== vehicleSearchSerial || normalizeSearch($("#query").value) !== normalizeSearch(query)) return;
    const matches = result.list.map((item) => state.all.find((car) => String(car.id) === String(item.id)) || normalizeList(item));
    const filtered = matches.filter((car) => (!brand || car.brand === brand) && (!fuel || car.fuel === fuel));
    const sorters = {
      new:(a,b) => String(b.id).localeCompare(String(a.id)), priceAsc:(a,b) => a.price - b.price,
      priceDesc:(a,b) => b.price - a.price, mileage:(a,b) => a.mileage - b.mileage,
    };
    state.filtered = filtered.sort(sorters[sort]);
    renderVisible();
  } catch (error) {
    console.warn("차량번호 검색을 완료하지 못했습니다.", error);
  }
}

function renderVisible() {
  render(state.filtered.slice(0, state.visibleCount));
  const more = $("#loadMore");
  more.hidden = state.visibleCount >= state.filtered.length;
  more.textContent = `매물 더 보기 (${Math.min(state.visibleCount, state.filtered.length)} / ${state.filtered.length})`;
}

function render(cars) {
  const grid = $("#carGrid");
  const template = $("#carTemplate");
  grid.replaceChildren();
  $("#count").textContent = state.filtered.length || state.all.length;
  $("#emptyState").hidden = cars.length > 0;
  cars.forEach((car) => {
    const node = template.content.cloneNode(true);
    const image = node.querySelector("img");
    image.src = car.photos?.[0] || "";
    image.alt = `${car.brand || ""} ${car.model || ""}`.trim();
    node.querySelector(".photo-count").textContent = car.detailLoaded ? `사진 ${car.photos?.length || 0}` : "상세 사진";
    node.querySelector(".car-brand").textContent = car.brand || "두드림모터스";
    node.querySelector(".car-name").textContent = [car.model, car.trim].filter(Boolean).join(" ");
    node.querySelector(".car-spec").textContent = `${car.year || "-"}년 · ${fmt(car.mileage)}km · ${car.fuel || "-"}`;
    node.querySelector(".car-price").innerHTML = `${fmt(car.price)}<small>만원</small>`;
    node.querySelector(".card-open").addEventListener("click", () => openDetail(car));
    grid.append(node);
  });
}

function renderDetail(car, loading = false) {
  const photos = car.photos?.length ? car.photos : [""];
  $("#detailContent").innerHTML = `
    <div class="detail-wrap">
      <div class="gallery-main"><img id="mainPhoto" src="${escapeHtml(photos[0])}" alt="${escapeHtml(car.model)}"></div>
      <div class="thumbs">${photos.map((photo, index) => `<button class="${index === 0 ? "active" : ""}" data-photo="${escapeHtml(photo)}" type="button"><img src="${escapeHtml(photo)}" alt="차량 사진 ${index + 1}"></button>`).join("")}</div>
      <div class="detail-copy">
        <span class="kicker">${escapeHtml(car.brand)}</span><h2>${escapeHtml([car.model, car.trim].filter(Boolean).join(" "))}</h2>
        <div class="detail-price">${fmt(car.price)}만원</div>${loading ? '<p class="detail-loading">차량 상세정보와 사진을 불러오고 있습니다…</p>' : ""}
        <div class="spec-grid">
          <div><span>연식</span><b>${escapeHtml(car.year)}년</b></div><div><span>주행거리</span><b>${fmt(car.mileage)}km</b></div>
          <div><span>연료</span><b>${escapeHtml(car.fuel)}</b></div><div><span>변속기</span><b>${escapeHtml(car.transmission)}</b></div>
          <div><span>색상</span><b>${escapeHtml(car.color || "상세 확인")}</b></div><div><span>사고이력</span><b>${escapeHtml(car.accident || "상담 문의")}</b></div>
          <div><span>보관장소</span><b>${escapeHtml(car.location || "광주")}</b></div><div><span>차량번호</span><b>${escapeHtml(car.vehicleNumber || "상세 확인")}</b></div>
          <div><span>매물번호</span><b>${escapeHtml(car.id)}</b></div>
        </div>
        ${car.memo ? `<p class="memo">${escapeHtml(car.memo)}</p>` : ""}
        <div class="detail-actions"><a href="tel:01049439727">전화 상담</a><a href="sms:01049439727?body=${encodeURIComponent(`[두드림모터스] ${car.brand} ${car.model} 매물번호 ${car.id} 문의드립니다.`)}">문자 문의</a><button class="share-detail secondary" type="button">차량 링크 공유</button>${car.inspectionUrl ? `<a class="secondary" href="${escapeHtml(car.inspectionUrl)}" target="_blank" rel="noopener noreferrer">성능점검 보기</a>` : ""}</div>
        <p class="share-status" role="status" aria-live="polite"></p>
      </div>
    </div>`;
  $("#detailContent").querySelectorAll(".thumbs button").forEach((button) => button.addEventListener("click", () => {
    $("#mainPhoto").src = button.dataset.photo;
    $("#detailContent").querySelectorAll(".thumbs button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  }));
  $("#detailContent .share-detail").addEventListener("click", () => shareCar(car));
}

function carUrl(car) {
  const url = new URL(window.location.href);
  url.searchParams.set("car", car.id);
  url.hash = "";
  return url.toString();
}

function setCarUrl(car) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("car") === String(car.id)) return;
  url.searchParams.set("car", car.id);
  url.hash = "";
  window.history.pushState({ carId:car.id }, "", url);
}

function clearCarUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("car")) return;
  url.searchParams.delete("car");
  window.history.replaceState({}, "", url);
}

async function shareCar(car) {
  const url = carUrl(car);
  const title = `${car.brand} ${car.model} ${car.trim}`.trim();
  const status = $("#detailContent .share-status");
  try {
    if (navigator.share) {
      await navigator.share({ title, text:`두드림모터스 ${title} 차량 정보`, url });
      status.textContent = "차량 링크 공유 창을 열었습니다.";
      return;
    }
    await navigator.clipboard.writeText(url);
    status.textContent = "차량 링크를 복사했습니다. 문자나 카카오톡에 붙여넣으세요.";
  } catch (error) {
    if (error?.name !== "AbortError") {
      status.innerHTML = `링크를 복사해 보내주세요: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
    }
  }
}

async function openDetail(car, { updateUrl = true } = {}) {
  state.current = car;
  renderDetail(car, !car.detailLoaded);
  if (!$("#detailDialog").open) $("#detailDialog").showModal();
  if (updateUrl) setCarUrl(car);
  if (car.detailLoaded) return;
  try {
    mergeDetail(car, await api(`/ad/detail.mdc?id=${car.id}&zid=`));
    applyOverride(car);
    if (state.current === car) renderDetail(car);
  } catch {
    const loading = $(".detail-loading");
    if (loading) loading.textContent = "상세정보 연결이 지연되고 있습니다. 전화 또는 문자로 문의해 주세요.";
  }
}

function openDetailFromUrl() {
  const carId = new URL(window.location.href).searchParams.get("car");
  if (!carId) return;
  const car = state.all.find((item) => String(item.id) === carId);
  if (car && state.current !== car) openDetail(car, { updateUrl:false });
}

function closeDetail({ updateUrl = true } = {}) {
  if (!$("#detailDialog").open) return;
  state.suppressUrlSync = !updateUrl;
  $("#detailDialog").close();
}

["#query", "#brandFilter", "#fuelFilter", "#sortFilter"].forEach((id) => $(id).addEventListener(id === "#query" ? "input" : "change", applyFilters));
$("#resetFilters").addEventListener("click", () => { $("#query").value = ""; $("#brandFilter").value = ""; $("#fuelFilter").value = ""; $("#sortFilter").value = "new"; applyFilters(); });
$("#loadMore").addEventListener("click", () => { state.visibleCount += 24; renderVisible(); });
$(".detail-dialog .dialog-close").addEventListener("click", () => closeDetail());
$("#detailDialog").addEventListener("click", (event) => { if (event.target === $("#detailDialog")) closeDetail(); });
$("#detailDialog").addEventListener("close", () => {
  state.current = null;
  if (state.suppressUrlSync) state.suppressUrlSync = false;
  else clearCarUrl();
});
window.addEventListener("popstate", () => {
  const carId = new URL(window.location.href).searchParams.get("car");
  if (!carId) closeDetail({ updateUrl:false });
  else openDetailFromUrl();
});
loadCars();
setInterval(loadCars, 30 * 60 * 1000);
