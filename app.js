const state = { all: [], filtered: [], current: null };
const $ = (selector) => document.querySelector(selector);
const fmt = (value) => Number(value || 0).toLocaleString("ko-KR");
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);

async function loadCars() {
  try {
    const response = await fetch(`data/cars.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("차량 데이터를 불러오지 못했습니다.");
    const payload = await response.json();
    state.all = Array.isArray(payload.cars) ? payload.cars : [];
    const synced = payload.syncedAt ? new Date(payload.syncedAt).toLocaleString("ko-KR") : "아직 동기화되지 않음";
    $("#syncStatus").textContent = `최근 동기화 ${synced}`;
    populateFilters();
    applyFilters();
  } catch (error) {
    $("#syncStatus").textContent = error.message;
    render([]);
  }
}

function populateFilters() {
  const fill = (id, values) => {
    const select = $(id);
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


