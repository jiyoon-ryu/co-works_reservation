import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAGnd4rPDvFcBd-RNYSPHj7djKndnsR2rM",
  authDomain: "co-works-reservation-system.firebaseapp.com",
  projectId: "co-works-reservation-system",
  storageBucket: "co-works-reservation-system.firebasestorage.app",
  messagingSenderId: "930423603530",
  appId: "1:930423603530:web:035571e20cc0af2c6b41b3",
  measurementId: "G-YL5DRYZR2M"
};

// 관리자로 지정할 이메일을 여기에 추가하세요. firestore.rules의 isAdmin() 목록과 동일하게 유지해야 합니다.
const ADMIN_EMAILS = [
  "jiyoon01746@gmail.com"
];

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const loginPage = document.getElementById("loginPage");
const adminPage = document.getElementById("adminPage");

const loginForm = document.getElementById("loginForm");
const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");

const adminEmailText = document.getElementById("adminEmailText");
const logoutBtn = document.getElementById("logoutBtn");

const adminStats = document.getElementById("adminStats");
const adminTableBody = document.getElementById("adminTableBody");

const filterDate = document.getElementById("filterDate");
const filterName = document.getElementById("filterName");
const filterStudentId = document.getElementById("filterStudentId");
const filterResetBtn = document.getElementById("filterResetBtn");

const cancelModal = document.getElementById("cancelModal");
const cancelModalText = document.getElementById("cancelModalText");
const cancelReasonInput = document.getElementById("cancelReason");
const cancelModalCancelBtn = document.getElementById("cancelModalCancelBtn");
const cancelModalConfirmBtn = document.getElementById("cancelModalConfirmBtn");

let reservations = [];
let pendingCancelReservation = null;

function isAdminEmail(email) {
  const normalized = (email || "").toLowerCase();
  return ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase() === normalized);
}

function getSlotId(date, hour) {
  return `${date}_${String(hour).padStart(2, "0")}`;
}

function toReservation(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    date: data.date,
    time: data.time,
    endTime: data.endTime,
    studentId: data.studentId,
    name: data.name,
    email: data.email,
    purpose: data.purpose,
    createdAt: data.createdAt
  };
}

async function loadReservations() {
  const snapshot = await getDocs(collection(db, "reservations"));

  reservations = snapshot.docs
    .map(toReservation)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatCreatedAt(createdAt) {
  if (!createdAt?.toDate) return "-";
  return createdAt.toDate().toLocaleString("ko-KR");
}

function renderStats(list) {
  const todayStr = getTodayString();
  const monthPrefix = todayStr.slice(0, 7);

  const total = list.length;
  const todayCount = list.filter(r => r.date === todayStr).length;
  const monthCount = list.filter(r => r.date.startsWith(monthPrefix)).length;

  const perDate = list.reduce((map, r) => {
    map.set(r.date, (map.get(r.date) || 0) + 1);
    return map;
  }, new Map());

  const topDates = [...perDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 10);

  adminStats.innerHTML = "";

  const cards = [
    { label: "전체 예약", value: `${total}건` },
    { label: "오늘 예약", value: `${todayCount}건` },
    { label: "이번 달 예약", value: `${monthCount}건` }
  ];

  cards.forEach(cardInfo => {
    const card = document.createElement("div");
    card.className = "stat-card";

    const label = document.createElement("span");
    label.className = "stat-label";
    label.textContent = cardInfo.label;

    const value = document.createElement("span");
    value.className = "stat-value";
    value.textContent = cardInfo.value;

    card.append(label, value);
    adminStats.appendChild(card);
  });

  const listCard = document.createElement("div");
  listCard.className = "stat-card stat-card-list";

  const listLabel = document.createElement("span");
  listLabel.className = "stat-label";
  listLabel.textContent = "최근 날짜별 예약 수";

  const list = document.createElement("ul");
  list.className = "stat-date-list";

  if (topDates.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "예약 없음";
    list.appendChild(emptyItem);
  } else {
    topDates.forEach(([date, count]) => {
      const item = document.createElement("li");

      const dateSpan = document.createElement("span");
      dateSpan.textContent = date;

      const countSpan = document.createElement("span");
      countSpan.textContent = `${count}건`;

      item.append(dateSpan, countSpan);
      list.appendChild(item);
    });
  }

  listCard.append(listLabel, list);
  adminStats.appendChild(listCard);
}

function getFilteredReservations() {
  const dateValue = filterDate.value;
  const nameValue = filterName.value.trim();
  const studentIdValue = filterStudentId.value.trim();

  return reservations.filter(r => {
    if (dateValue && r.date !== dateValue) return false;
    if (nameValue && !(r.name || "").includes(nameValue)) return false;
    if (studentIdValue && !(r.studentId || "").includes(studentIdValue)) return false;
    return true;
  });
}

function createCell(text) {
  const td = document.createElement("td");
  td.textContent = text ?? "";
  return td;
}

function renderTable() {
  renderStats(reservations);

  const filtered = getFilteredReservations();
  adminTableBody.innerHTML = "";

  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "empty-row";
    td.textContent = "예약이 없습니다.";
    tr.appendChild(td);
    adminTableBody.appendChild(tr);
    return;
  }

  filtered.forEach(reservation => {
    const tr = document.createElement("tr");

    tr.append(
      createCell(reservation.date),
      createCell(`${reservation.time} ~ ${reservation.endTime}`),
      createCell(reservation.studentId),
      createCell(reservation.name),
      createCell(reservation.email),
      createCell(reservation.purpose),
      createCell(formatCreatedAt(reservation.createdAt))
    );

    const actionCell = document.createElement("td");
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "force-cancel-btn";
    cancelButton.textContent = "강제 취소";
    cancelButton.addEventListener("click", () => openCancelModal(reservation));
    actionCell.appendChild(cancelButton);
    tr.appendChild(actionCell);

    adminTableBody.appendChild(tr);
  });
}

function openCancelModal(reservation) {
  pendingCancelReservation = reservation;
  cancelModalText.textContent =
    `${reservation.date} ${reservation.time} ~ ${reservation.endTime} / ${reservation.name} (${reservation.studentId})`;
  cancelReasonInput.value = "";
  cancelModal.classList.remove("hidden");
}

function closeCancelModal() {
  pendingCancelReservation = null;
  cancelModal.classList.add("hidden");
}

async function forceCancelReservation(reservation, reason) {
  const start = Number(reservation.time.slice(0, 2));
  const end = Number(reservation.endTime.slice(0, 2));

  const reservationRef = doc(db, "reservations", reservation.id);
  const slotRefs = [];

  for (let hour = start; hour < end; hour++) {
    slotRefs.push(doc(db, "reservationSlots", getSlotId(reservation.date, hour)));
  }

  const logRef = doc(collection(db, "cancellationLogs"));

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reservationRef);

    if (!snapshot.exists()) {
      throw new Error("이미 취소되었거나 존재하지 않는 예약입니다.");
    }

    transaction.delete(reservationRef);
    slotRefs.forEach(slotRef => transaction.delete(slotRef));

    transaction.set(logRef, {
      reservationId: reservation.id,
      date: reservation.date,
      time: reservation.time,
      endTime: reservation.endTime,
      studentId: reservation.studentId,
      name: reservation.name,
      email: reservation.email,
      purpose: reservation.purpose,
      reason,
      cancelledBy: auth.currentUser?.email || "unknown",
      cancelledAt: serverTimestamp()
    });
  });
}

cancelModalCancelBtn.addEventListener("click", () => {
  closeCancelModal();
});

cancelModalConfirmBtn.addEventListener("click", async () => {
  if (!pendingCancelReservation) return;

  const reason = cancelReasonInput.value.trim();

  if (!reason) {
    alert("취소 사유를 입력해주세요.");
    return;
  }

  const ok = confirm("정말로 이 예약을 강제 취소할까요? 이 작업은 되돌릴 수 없습니다.");
  if (!ok) return;

  try {
    await forceCancelReservation(pendingCancelReservation, reason);
    closeCancelModal();
    await loadReservations();
    renderTable();
  } catch (error) {
    alert(error.message);
  }
});

[filterDate, filterName, filterStudentId].forEach(input => {
  input.addEventListener("input", renderTable);
});

filterResetBtn.addEventListener("click", () => {
  filterDate.value = "";
  filterName.value = "";
  filterStudentId.value = "";
  renderTable();
});

loginForm.addEventListener("submit", async e => {
  e.preventDefault();

  loginError.classList.add("hidden");

  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    loginError.textContent = "로그인에 실패했습니다. 이메일/비밀번호를 확인해주세요.";
    loginError.classList.remove("hidden");
  }
});

logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

function showLoginPage() {
  loginPage.classList.add("active");
  adminPage.classList.remove("active");
}

function showAdminPage() {
  loginPage.classList.remove("active");
  adminPage.classList.add("active");
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    showLoginPage();
    return;
  }

  if (!isAdminEmail(user.email)) {
    alert("관리자 권한이 없는 계정입니다.");
    await signOut(auth);
    return;
  }

  adminEmailText.textContent = user.email;
  showAdminPage();

  try {
    await loadReservations();
    renderTable();
  } catch (error) {
    alert(`예약 정보를 불러오지 못했습니다.\n\n${error.message}`);
  }
});
