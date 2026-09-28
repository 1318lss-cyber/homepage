import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, deleteDoc, doc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { deleteObject, getStorage, ref } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";
import { adminEmail, firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
let auth;
let db;
let storage;
let reviews = [];
let filter = "all";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
}

function render() {
  const list = $("#adminReviewList");
  const items = filter === "all" ? reviews : reviews.filter((review) => review.status === filter);
  if (!items.length) { list.innerHTML = '<div class="admin-empty">표시할 후기가 없습니다.</div>'; return; }
  list.innerHTML = items.map((review) => `
    <article class="admin-review" data-id="${review.id}">
      ${review.photoUrl ? `<img src="${escapeHtml(review.photoUrl)}" alt="거래 후기 사진">` : '<div></div>'}
      <div><small>${review.status === "published" ? "공개" : "승인 대기"} · ${escapeHtml(review.vehicle)}</small><h3>${escapeHtml(review.title)}</h3><p>${escapeHtml(review.content)}</p><p><b>${escapeHtml(review.author)}</b></p></div>
      <div class="admin-actions"><button data-action="edit">수정</button>${review.status !== "published" ? '<button data-action="publish">공개하기</button>' : '<button data-action="pending">비공개</button>'}<button class="danger" data-action="delete">삭제</button></div>
    </article>`).join("");
}

function openEdit(review) {
  const form = $("#editForm");
  ["id", "author", "vehicle", "title", "content", "status"].forEach((name) => { form.elements[name].value = review[name] || ""; });
  $("#editStatus").textContent = "";
  $("#editDialog").showModal();
}

async function initializeAdmin() {
  if (!isFirebaseConfigured()) { $("#loginStatus").textContent = "Firebase 설정과 관리자 이메일 등록이 필요합니다."; return; }
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app); db = getFirestore(app); storage = getStorage(app);
  onAuthStateChanged(auth, (user) => {
    const allowed = user?.email?.toLowerCase() === adminEmail.toLowerCase();
    $("#loginPanel").hidden = allowed;
    $("#managePanel").hidden = !allowed;
    if (!allowed || window.reviewUnsubscribe) return;
    window.reviewUnsubscribe = onSnapshot(query(collection(db, "reviews"), orderBy("createdAt", "desc")), (snapshot) => {
      reviews = snapshot.docs.map((document) => ({ id:document.id, ...document.data() }));
      render();
    });
  });
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth) return;
  const data = new FormData(event.currentTarget);
  $("#loginStatus").textContent = "로그인 중…";
  try {
    const credential = await signInWithEmailAndPassword(auth, String(data.get("email")), String(data.get("password")));
    if (credential.user.email?.toLowerCase() !== adminEmail.toLowerCase()) { await signOut(auth); throw new Error("관리자 계정이 아닙니다."); }
    $("#loginStatus").textContent = "";
  } catch (error) { $("#loginStatus").textContent = error.message.includes("관리자") ? error.message : "이메일 또는 비밀번호를 확인하세요."; }
});

$("#logoutButton").addEventListener("click", () => signOut(auth));
$(".admin-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button"); if (!button) return;
  document.querySelectorAll(".admin-tabs button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active"); filter = button.dataset.filter; render();
});
$("#adminReviewList").addEventListener("click", async (event) => {
  const button = event.target.closest("button"); const card = event.target.closest(".admin-review");
  if (!button || !card) return;
  const review = reviews.find((item) => item.id === card.dataset.id); if (!review) return;
  const action = button.dataset.action;
  if (action === "edit") { openEdit(review); return; }
  if (action === "publish" || action === "pending") { await updateDoc(doc(db, "reviews", review.id), { status:action === "publish" ? "published" : "pending", updatedAt:serverTimestamp() }); return; }
  if (action === "delete") {
    if (!window.confirm("이 후기를 삭제하시겠습니까? 삭제하면 복구할 수 없습니다.")) return;
    if (review.photoPath) { try { await deleteObject(ref(storage, review.photoPath)); } catch (error) { console.warn(error); } }
    await deleteDoc(doc(db, "reviews", review.id));
  }
});

$("#editForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  $("#editStatus").textContent = "저장 중…";
  try {
    await updateDoc(doc(db, "reviews", String(data.get("id"))), {
      author:String(data.get("author")).trim(), vehicle:String(data.get("vehicle")).trim(), title:String(data.get("title")).trim(),
      content:String(data.get("content")).trim(), status:String(data.get("status")), updatedAt:serverTimestamp(),
    });
    $("#editDialog").close();
  } catch { $("#editStatus").textContent = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."; }
});
$(".edit-close").addEventListener("click", () => $("#editDialog").close());

initializeAdmin();
