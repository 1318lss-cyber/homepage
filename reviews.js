import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { addDoc, collection, getFirestore, limit, onSnapshot, query, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getDownloadURL, getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js?v=20260928-1";

const $ = (selector) => document.querySelector(selector);
const dialog = $("#reviewDialog");
const form = $("#reviewForm");
const status = $("#reviewStatus");
let services;

$("#openReviewForm").addEventListener("click", () => dialog.showModal());
$(".review-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

function renderReviews(items) {
  const grid = $("#reviewGrid");
  const template = $("#reviewTemplate");
  grid.replaceChildren();
  $("#reviewEmpty").hidden = items.length > 0;
  items.forEach((review) => {
    const node = template.content.cloneNode(true);
    const photo = node.querySelector(".review-photo");
    if (review.photoUrl) { photo.src = review.photoUrl; photo.hidden = false; }
    node.querySelector(".review-vehicle").textContent = review.vehicle;
    node.querySelector("time").textContent = review.createdAt?.toDate?.().toLocaleDateString("ko-KR") || "최근 등록";
    node.querySelector("h3").textContent = review.title;
    node.querySelector(".review-content").textContent = review.content;
    node.querySelector(".review-author").textContent = `${review.author} 고객님`;
    grid.append(node);
  });
}

async function initializeReviews() {
  if (!isFirebaseConfigured()) {
    status.textContent = "후기 게시판 서버 설정 후 등록 기능이 활성화됩니다.";
    return;
  }
  const app = initializeApp(firebaseConfig);
  services = { auth:getAuth(app), db:getFirestore(app), storage:getStorage(app) };
  await signInAnonymously(services.auth);
  const reviewsQuery = query(collection(services.db, "reviews"), where("status", "==", "published"), limit(50));
  onSnapshot(reviewsQuery, (snapshot) => {
    const reviews = snapshot.docs
      .map((document) => ({ id:document.id, ...document.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    renderReviews(reviews);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!services) { status.textContent = "후기 게시판 서버 설정이 필요합니다."; return; }
  const button = form.querySelector("button[type=submit]");
  const data = new FormData(form);
  const photo = data.get("photo");
  if (photo?.size > 5 * 1024 * 1024) { status.textContent = "사진은 5MB 이하만 등록할 수 있습니다."; return; }
  button.disabled = true;
  status.textContent = "후기를 등록하고 있습니다…";
  try {
    let photoUrl = "";
    let photoPath = "";
    if (photo?.size) {
      const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      photoPath = `reviewUploads/${services.auth.currentUser.uid}/${Date.now()}-${safeName}`;
      const photoRef = ref(services.storage, photoPath);
      await uploadBytes(photoRef, photo, { contentType:photo.type });
      photoUrl = await getDownloadURL(photoRef);
    }
    await addDoc(collection(services.db, "reviews"), {
      author:String(data.get("author")).trim(), vehicle:String(data.get("vehicle")).trim(),
      title:String(data.get("title")).trim(), content:String(data.get("content")).trim(),
      photoUrl, photoPath, status:"pending", createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
    });
    form.reset();
    status.textContent = "등록되었습니다. 관리자 확인 후 홈페이지에 공개됩니다.";
    setTimeout(() => dialog.close(), 1800);
  } catch (error) {
    console.error(error);
    status.textContent = "등록 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  } finally {
    button.disabled = false;
  }
});

initializeReviews().catch((error) => { console.error(error); status.textContent = "후기 게시판 연결을 확인하고 있습니다."; });
