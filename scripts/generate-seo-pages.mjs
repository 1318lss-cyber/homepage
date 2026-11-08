import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SITE_URL = "https://dodreamcar.com";
const root = resolve(process.cwd());
const carsDirectory = resolve(root, "cars");

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;",
})[character]);
const formatNumber = (value) => Number(value || 0).toLocaleString("ko-KR");
const dateOnly = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
};
const jsonLd = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

function header({ active = "", depth = "../" } = {}) {
  return `<header class="header">
    <div class="utility">광주오토파크 두드림모터스 · 허위매물 없는 정직한 거래</div>
    <div class="nav wrap">
      <a class="brand" href="${depth}index.html" aria-label="두드림모터스 홈"><span class="brand-mark">D</span><span>두드림<span>모터스</span></span></a>
      <nav aria-label="주요 메뉴"><a href="${depth}index.html#inventory">전체 매물</a><a href="${depth}cars/index.html"${active === "cars" ? ' aria-current="page"' : ""}>차량 목록</a><a href="${depth}gwangju-used-car.html">구매·판매 가이드</a><a href="${depth}gwangju-sell-my-car.html">내차팔기</a></nav>
      <a class="tel small" href="tel:01049439727">010-4943-9727</a>
    </div>
  </header>`;
}

function footer(depth = "../") {
  return `<footer><div class="wrap footer-grid"><div><b>두드림모터스</b><p>광주광역시 서구 매월1로62번길 12, B동 112호</p><p>사업자등록번호 410-86-57475</p></div><div><b>상담 010-4943-9727</b><p>평일 09:00~19:00 · 주말/공휴일 전화 상담 가능</p><p><a href="${depth}gwangju-used-car-buy.html">광주중고차 구매</a> · <a href="${depth}gwangju-sell-my-car.html">광주 내차팔기</a> · <a href="${depth}gwangju-used-car-dealer.html">딜러 선택 안내</a></p></div></div></footer>`;
}

function vehiclePage(car, modified) {
  const name = [car.brand, car.model, car.trim].filter(Boolean).join(" ");
  const canonical = `${SITE_URL}/cars/${encodeURIComponent(car.id)}.html`;
  const photo = car.photos?.[0] || `${SITE_URL}/assets/lee-sung-shin.png`;
  const description = `${name} ${car.year || ""}년식, 주행거리 ${formatNumber(car.mileage)}km, 판매가격 ${formatNumber(car.price)}만원, 매물번호 ${car.id}. 광주 두드림모터스 실매물 정보를 확인하세요.`;
  const memo = car.memo || "차량 상태와 세부 옵션은 상담 시 정확하게 안내해 드립니다.";
  const structuredData = {
    "@context":"https://schema.org",
    "@graph":[
      {
        "@type":"Product", "@id":`${canonical}#vehicle`, name, description, image:car.photos?.length ? car.photos : [photo],
        sku:String(car.id), brand:{ "@type":"Brand", name:car.brand || "두드림모터스" },
        offers:{ "@type":"Offer", url:canonical, price:String(Number(car.price || 0) * 10000), priceCurrency:"KRW", availability:"https://schema.org/InStock", itemCondition:"https://schema.org/UsedCondition", seller:{ "@type":"AutoDealer", name:"두드림모터스", url:SITE_URL } },
        additionalProperty:[
          { "@type":"PropertyValue", name:"연식", value:`${car.year || "상세 확인"}년` },
          { "@type":"PropertyValue", name:"주행거리", value:`${formatNumber(car.mileage)}km` },
          { "@type":"PropertyValue", name:"연료", value:car.fuel || "상세 확인" },
          { "@type":"PropertyValue", name:"변속기", value:car.transmission || "상세 확인" },
          { "@type":"PropertyValue", name:"매물번호", value:String(car.id) },
        ],
      },
      { "@type":"BreadcrumbList", itemListElement:[
        { "@type":"ListItem", position:1, name:"두드림모터스", item:`${SITE_URL}/` },
        { "@type":"ListItem", position:2, name:"전체 실매물", item:`${SITE_URL}/cars/` },
        { "@type":"ListItem", position:3, name, item:canonical },
      ] },
    ],
  };

  return `<!doctype html>
<html lang="ko"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"><meta name="description" content="${escapeHtml(description)}"><meta name="theme-color" content="#175243">
  <title>${escapeHtml(name)} ${formatNumber(car.price)}만원 · ${escapeHtml(car.id)} | 광주중고차</title>
  <link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="ko-KR" href="${canonical}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <meta property="og:type" content="product"><meta property="og:locale" content="ko_KR"><meta property="og:site_name" content="두드림모터스"><meta property="og:title" content="${escapeHtml(name)} | 두드림모터스"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${escapeHtml(photo)}">
  <link rel="preconnect" href="https://cdn.jsdelivr.net"><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"><link rel="stylesheet" href="../styles.css?v=20261108-1">
  <script type="application/ld+json">${jsonLd(structuredData)}</script>
</head><body>
  <a class="skip" href="#vehicleContent">본문으로 바로가기</a>${header({ active:"cars" })}
  <main id="vehicleContent" class="vehicle-page"><div class="wrap">
    <nav class="breadcrumbs" aria-label="현재 위치"><a href="../index.html">홈</a><span>›</span><a href="index.html">전체 실매물</a><span>›</span><strong>${escapeHtml(car.model || name)}</strong></nav>
    <article class="vehicle-detail-static">
      <figure class="vehicle-main-photo"><img src="${escapeHtml(photo)}" alt="${escapeHtml(name)} 광주중고차 실매물" width="900" height="675"></figure>
      <div class="vehicle-summary"><span class="kicker">DODREAM REAL VEHICLE · 매물번호 ${escapeHtml(car.id)}</span><h1>${escapeHtml(name)}</h1><p class="vehicle-static-price">${formatNumber(car.price)}<small>만원</small></p>
        <dl class="vehicle-spec-list"><div><dt>연식</dt><dd>${escapeHtml(car.year || "상세 확인")}년</dd></div><div><dt>주행거리</dt><dd>${formatNumber(car.mileage)}km</dd></div><div><dt>연료</dt><dd>${escapeHtml(car.fuel || "상세 확인")}</dd></div><div><dt>변속기</dt><dd>${escapeHtml(car.transmission || "상세 확인")}</dd></div><div><dt>보관장소</dt><dd>${escapeHtml(car.location || "광주 서구")}</dd></div><div><dt>차량번호</dt><dd>${escapeHtml(car.vehicleNumber || "상담 시 확인")}</dd></div></dl>
        <div class="vehicle-cta"><a class="button primary" href="../index.html?car=${encodeURIComponent(car.id)}">전체 사진·최신 정보 보기</a><a class="button outline" href="tel:01049439727">전화 상담</a></div>
      </div>
    </article>
    <section class="vehicle-description"><h2>${escapeHtml(car.model || name)} 차량 안내</h2><p>${escapeHtml(memo)}</p><p>표시된 정보는 매물 등록 시점을 기준으로 하며 계약 또는 판매로 상태가 변경될 수 있습니다. 방문 전 매물번호 <b>${escapeHtml(car.id)}</b>로 판매 여부와 세부 상태를 확인해 주세요.</p></section>
    <section class="vehicle-related-guide"><h2>광주중고차 구매 전 함께 확인하세요</h2><div><a href="../gwangju-used-car-buy.html"><b>실매물 구매 절차</b><span>성능점검기록부와 총비용 확인 방법</span></a><a href="../gwangju-used-car-dealer.html"><b>믿을 수 있는 딜러 기준</b><span>계약 전에 확인할 담당자와 사업장 정보</span></a><a href="../gwangju-sell-my-car.html"><b>광주 내차팔기</b><span>출장 견적부터 명의 이전까지의 과정</span></a></div></section>
    <p class="page-updated">매물 정보 갱신일 ${modified}</p>
  </div></main>${footer()}
</body></html>\n`;
}

function inventoryIndex(cars, modified) {
  const items = cars.map((car) => {
    const name = [car.brand, car.model, car.trim].filter(Boolean).join(" ");
    return `<li><a href="${encodeURIComponent(car.id)}.html"><img src="${escapeHtml(car.photos?.[0] || "../assets/lee-sung-shin.png")}" alt="${escapeHtml(name)}" loading="lazy" width="320" height="240"><span><small>${escapeHtml(car.brand || "두드림모터스")} · ${escapeHtml(car.year || "-")}년 · ${formatNumber(car.mileage)}km</small><b>${escapeHtml(name)}</b><strong>${formatNumber(car.price)}만원</strong></span></a></li>`;
  }).join("");
  const canonical = `${SITE_URL}/cars/`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow,max-image-preview:large"><meta name="description" content="두드림모터스에서 판매 중인 광주중고차 전체 실매물의 가격, 연식, 주행거리와 차량별 상세정보를 확인하세요."><meta name="theme-color" content="#175243"><title>광주중고차 전체 실매물 ${cars.length}대 | 두드림모터스</title><link rel="canonical" href="${canonical}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><meta property="og:type" content="website"><meta property="og:site_name" content="두드림모터스"><meta property="og:title" content="광주중고차 전체 실매물 | 두드림모터스"><meta property="og:description" content="차량별 고유 페이지에서 가격, 연식, 주행거리와 사진을 확인하세요."><meta property="og:url" content="${canonical}"><link rel="preconnect" href="https://cdn.jsdelivr.net"><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"><link rel="stylesheet" href="../styles.css?v=20261108-1"></head><body><a class="skip" href="#staticInventory">본문으로 바로가기</a>${header({ active:"cars" })}<main id="staticInventory" class="static-inventory"><section class="static-inventory-head"><div class="wrap"><span class="eyebrow">DODREAM INVENTORY</span><h1>광주중고차<br><em>전체 실매물 ${cars.length}대</em></h1><p>차량마다 독립된 상세페이지에서 가격과 기본 정보를 확인할 수 있습니다. 계약 또는 판매 여부는 방문 전 매물번호로 확인해 주세요.</p><a class="button primary" href="../index.html#inventory">조건으로 매물 검색하기</a></div></section><div class="wrap"><ul class="static-car-list">${items}</ul><p class="page-updated">매물 목록 갱신일 ${modified}</p></div></main>${footer()}</body></html>\n`;
}

function sitemap(cars, modified) {
  const staticUrls = [
    ["/", "2026-11-08", "daily", "1.0"],
    ["/cars/", modified, "daily", "0.9"],
    ["/gwangju-used-car.html", "2026-11-08", "monthly", "0.8"],
    ["/gwangju-used-car-buy.html", "2026-11-08", "monthly", "0.8"],
    ["/gwangju-sell-my-car.html", "2026-11-08", "monthly", "0.8"],
    ["/gwangju-used-car-dealer.html", "2026-11-08", "monthly", "0.8"],
  ];
  const entries = staticUrls.map(([path, lastmod, changefreq, priority]) => `  <url><loc>${SITE_URL}${path}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`);
  entries.push(...cars.map((car) => `  <url><loc>${SITE_URL}/cars/${encodeURIComponent(car.id)}.html</loc><lastmod>${modified}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

export async function generateSeoPages(dataPath = resolve(root, "data/cars.json")) {
  const payload = JSON.parse(await readFile(dataPath, "utf8"));
  const cars = Array.isArray(payload.cars) ? payload.cars : [];
  const modified = dateOnly(payload.syncedAt);
  await mkdir(carsDirectory, { recursive:true });

  const expected = new Set(cars.map((car) => `${car.id}.html`));
  for (const fileName of await readdir(carsDirectory)) {
    const target = resolve(carsDirectory, fileName);
    if (fileName.endsWith(".html") && fileName !== "index.html" && !expected.has(fileName) && target.startsWith(`${carsDirectory}${sep}`)) {
      await unlink(target);
    }
  }

  await Promise.all(cars.map((car) => writeFile(resolve(carsDirectory, `${car.id}.html`), vehiclePage(car, modified), "utf8")));
  await writeFile(resolve(carsDirectory, "index.html"), inventoryIndex(cars, modified), "utf8");
  await writeFile(resolve(root, "sitemap.xml"), sitemap(cars, modified), "utf8");
  console.log(`검색용 차량 상세페이지 ${cars.length}개와 사이트맵을 생성했습니다.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await generateSeoPages();
}
