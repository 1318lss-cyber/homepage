const state = { all: [], filtered: [], current: null };
const $ = (selector) => document.querySelector(selector);
const fmt = (value) => Number(value || 0).toLocaleString("ko-KR");
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
const API_ROOT = "https://encode.moldeoncar.com/api";
const API_KEY = "22227bbf-66ad-4196-aa43-e50056411aa5";
const DEALER_ID = "65818";
const fuelName = (code) => ({ 0:"알 수 없음", 1:"가솔린", 2:"디젤", 3:"LPG", 4:"가솔린/LPG", 5:"CNG", 6:"하이브리드", 7:"전기/LPG", 8:"가솔린/CNG", 9:"전기", 10:"수소", 11:"전기/디젤" })[code] || "기타";
const transmissionName = (code) => ({ 0:"알 수 없음", 1:"오토", 2:"수동", 3:"세미오토", 4:"CVT" })[code] || "기타";

async function api(path) {
  const response = await fetch(`${API_ROOT}${path}`, { headers: { "x-api-key": API_KEY } });
  if (!response.ok) throw new Error(`몰던카 연결 오류 (${response.status})`);
  const payload = await response.json();
  if (payload.status !== "OK") throw new Error("몰던카 데이터를 확인할 수 없습니다.");
  return payload.data;
}

function normalize(detail, id) {
  return {
    id: String(id), brand: detail.brand || "", model: detail.model || "", trim: detail.clss || "",
    fullName: [detail.model, detail.clss].filter(Boolean).join(" "), year: Number(detail.date_model || 0),
    registeredAt: detail.date_reg || "", price: Number(detail.price?.price || 0), mileage: Number(detail.mileage || 0),
    fuel: fuelName(String(detail.fuel)), transmission: transmissionName(String(detail.trans)), color: detail.color || "",
    accident: detail.accident ? "있음" : "무사고", vehicleNumber: detail.no || "",
    location: detail.user?.xname ? `${detail.user.xname}${detail.zone ? ` (${detail.zone})` : ""}` : (detail.zone || "광주"),
    memo: detail.memo || detail.memo_s || "등록된 상세설명이 없습니다.",
    photos: Array.isArray(detail.photo) ? detail.photo.filter(Boolean) : [],
    sourceUrl: `https://app.mdcar.biz/#/ad/${id}`, inspectionUrl: detail.check?.value || "",
  };
}

async function fetchLiveCars() {
  const first = await api(`/home/seller.mdc?id=${DEALER_ID}&page=1&itemCount=30&keyword=`);
  const ids = first.list.map((car) => String(car.id));
  for (let page = 2; page <= Math.ceil(first.total / 30); page += 1) {
    const result = await api(`/home/seller.mdc?id=${DEALER_ID}&page=${page}&itemCount=30&keyword=`);
    ids.push(...result.list.map((car) => String(car.id)));
  }
  const cars = new Array(ids.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(5, ids.length || 1) }, async () => {
    while (cursor < ids.length) {
      const index = cursor++;
      cars[index] = normalize(await api(`/ad/detail.mdc?id=${ids[index]}&zid=`), ids[index]);
    }
  }));
  return cars;
}

async function loadCars() {
  $("#syncStatus").textContent = "몰던카 최신 매물을 확인하고 있습니다…";
  try {
    state.all = await fetchLiveCars();
    $("#syncStatus").textContent = `몰던카 실시간 연동 · ${new Date().toLocaleString("ko-KR")}`;
    populateFilters();
    applyFilters();
  } catch (error) {
    try {
      const response = await fetch(`data/cars.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      state.all = Array.isArray(payload.cars) ? payload.cars : [];
      $("#syncStatus").textContent = "몰던카 연결 지연 · 저장된 최근 매물을 표시합니다";
      populateFilters();
      applyFilters();
    } catch {
      $("#syncStatus").textContent = error.message;
      render([]);
    }
  }
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
  const query = $("#query").value.trim().toLowerCase();
  const brand = $("#brandFilter").value;
  const fuel = $("#fuelFilter").value;
  const sort = $("#sortFilter").value;
  const list = state.all.filter((car) => {
    const haystack = `${car.brand} ${car.model} ${car.trim} ${car.memo}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!brand || car.brand === brand) && (!fuel || car.fuel === fuel);
  });
  const sorters = {
    new: (a, b) => String(b.registeredAt || b.id).localeCompare(String(a.registeredAt || a.id)),
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    mileage: (a, b) => a.mileage - b.mileage,
  };
  state.filtered = list.sort(sorters[sort]);
  render(state.filtered);
}

function render(cars) {
  const grid = $("#carGrid");
  const template = $("#carTemplate");
  grid.replaceChildren();
  $("#count").textContent = cars.length;
  $("#emptyState").hidden = cars.length > 0;
  cars.forEach((car) => {
    const node = template.content.cloneNode(true);
    const image = node.querySelector("img");
    image.src = car.photos?.[0] || "";
    image.alt = `${car.brand || ""} ${car.model || ""}`.trim();
    node.querySelector(".photo-count").textContent = `사진 ${car.photos?.length || 0}`;
    node.querySelector(".car-brand").textContent = car.brand || "두드림모터스";
    node.querySelector(".car-name").textContent = [car.model, car.trim].filter(Boolean).join(" ");
    node.querySelector(".car-spec").textContent = `${car.year || "-"}년 · ${fmt(car.mileage)}km · ${car.fuel || "-"}`;
    node.querySelector(".car-price").innerHTML = `${fmt(car.price)}<small>만원</small>`;
    node.querySelector(".card-open").addEventListener("click", () => openDetail(car));
    grid.append(node);
  });
}

function openDetail(car) {
  state.current = car;
  const photos = car.photos?.length ? car.photos : [""];
  $("#detailContent").innerHTML = `
    <div class="detail-wrap">
      <div class="gallery-main"><img id="mainPhoto" src="${escapeHtml(photos[0])}" alt="${escapeHtml(car.model)}"></div>
      <div class="thumbs">${photos.map((photo, index) => `<button class="${index === 0 ? "active" : ""}" data-photo="${escapeHtml(photo)}" type="button"><img src="${escapeHtml(photo)}" alt="사진 ${index + 1}"></button>`).join("")}</div>
      <div class="detail-copy">
        <span class="kicker">${escapeHtml(car.brand)}</span>
        <h2>${escapeHtml([car.model, car.trim].filter(Boolean).join(" "))}</h2>
        <div class="detail-price">${fmt(car.price)}만원</div>
        <div class="spec-grid">
          <div><span>연식</span><b>${escapeHtml(car.year)}년</b></div><div><span>주행거리</span><b>${fmt(car.mileage)}km</b></div>
          <div><span>연료</span><b>${escapeHtml(car.fuel)}</b></div><div><span>변속기</span><b>${escapeHtml(car.transmission)}</b></div>
          <div><span>색상</span><b>${escapeHtml(car.color || "-")}</b></div><div><span>사고이력</span><b>${escapeHtml(car.accident || "상담문의")}</b></div>
          <div><span>보관장소</span><b>${escapeHtml(car.location || "광주")}</b></div><div><span>매물번호</span><b>${escapeHtml(car.id)}</b></div>
        </div>
        ${car.memo ? `<p class="memo">${escapeHtml(car.memo)}</p>` : ""}
        <div class="detail-actions"><a href="tel:01049439727">전화 상담</a><a href="sms:01049439727?body=${encodeURIComponent(`[두드림모터스] ${car.brand} ${car.model} 매물번호 ${car.id} 문의드립니다.`)}">문자 문의</a><a class="secondary" href="${escapeHtml(car.sourceUrl)}" target="_blank" rel="noopener noreferrer">몰던카 원본 보기</a>${car.inspectionUrl ? `<a class="secondary" href="${escapeHtml(car.inspectionUrl)}" target="_blank" rel="noopener noreferrer">성능점검 보기</a>` : ""}</div>
      </div>
    </div>`;
  $("#detailContent").querySelectorAll(".thumbs button").forEach((button) => button.addEventListener("click", () => {
    $("#mainPhoto").src = button.dataset.photo;
    $("#detailContent").querySelectorAll(".thumbs button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  }));
  $("#detailDialog").showModal();
}

["#query", "#brandFilter", "#fuelFilter", "#sortFilter"].forEach((id) => $(id).addEventListener(id === "#query" ? "input" : "change", applyFilters));
$("#resetFilters").addEventListener("click", () => { $("#query").value = ""; $("#brandFilter").value = ""; $("#fuelFilter").value = ""; $("#sortFilter").value = "new"; applyFilters(); });
$(".dialog-close").addEventListener("click", () => $("#detailDialog").close());
$("#detailDialog").addEventListener("click", (event) => { if (event.target === $("#detailDialog")) $("#detailDialog").close(); });
loadCars();
setInterval(loadCars, 30 * 60 * 1000);

