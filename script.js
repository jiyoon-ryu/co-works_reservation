import { initializeApp as initializeFirebaseApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { APPS_SCRIPT_CONFIG } from "./emailConfig.js";

const firebaseConfig = {
  apiKey: "AIzaSyAGnd4rPDvFcBd-RNYSPHj7djKndnsR2rM",
  authDomain: "co-works-reservation-system.firebaseapp.com",
  projectId: "co-works-reservation-system",
  storageBucket: "co-works-reservation-system.firebasestorage.app",
  messagingSenderId: "930423603530",
  appId: "1:930423603530:web:035571e20cc0af2c6b41b3",
  measurementId: "G-YL5DRYZR2M"
};

const firebaseApp = initializeFirebaseApp(firebaseConfig);
const db = getFirestore(firebaseApp);

async function callEmailWebApp(payload) {
  await fetch(APPS_SCRIPT_CONFIG.webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: APPS_SCRIPT_CONFIG.secret, ...payload })
  });
}

async function sendReservationEmail(reservation) {
  try {
    await callEmailWebApp({
      type: "reservation_confirmed",
      to: reservation.email,
      name: reservation.name,
      studentId: reservation.studentId,
      date: reservation.date,
      timeRange: `${reservation.time} ~ ${reservation.endTime}`,
      purpose: reservation.purpose
    });
  } catch (error) {
    console.error("[reservation email]", error);
  }
}

async function sendCancellationEmail(details) {
  try {
    await callEmailWebApp({
      type: "reservation_cancelled",
      to: details.email,
      name: details.name,
      studentId: details.studentId,
      date: details.date,
      timeRange: details.hoursText,
      reason: details.reason || "미입력",
      cancelledBy: details.cancelledBy
    });
  } catch (error) {
    console.error("[cancellation email]", error);
  }
}

function formatHourRanges(hours) {
  const sorted = [...hours].sort((a, b) => a - b);
  const ranges = [];
  let rangeStart = null;
  let prev = null;

  sorted.forEach(hour => {
    if (rangeStart === null) {
      rangeStart = hour;
    } else if (hour !== prev + 1) {
      ranges.push([rangeStart, prev]);
      rangeStart = hour;
    }
    prev = hour;
  });

  if (rangeStart !== null) {
    ranges.push([rangeStart, prev]);
  }

  return ranges
    .map(([start, end]) => `${makeHourTime(start)} ~ ${makeHourTime(end + 1)}`)
    .join(", ");
}

const calendarPage = document.getElementById("calendarPage");
const timePage = document.getElementById("timePage");
const calendar = document.getElementById("calendar");
const monthTitle = document.getElementById("monthTitle");

const selectedDateTitle = document.getElementById("selectedDateTitle");
const availableTimeSummary = document.getElementById("availableTimeSummary");
const amBlocks = document.getElementById("amBlocks");
const pmBlocks = document.getElementById("pmBlocks");

const backBtn = document.getElementById("backBtn");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");

const modal = document.getElementById("modal");
const reservationForm = document.getElementById("reservationForm");
const modalTimeText = document.getElementById("modalTimeText");
const cancelBtn = document.getElementById("cancelBtn");

let today = new Date();
let currentYear = today.getFullYear();
let currentMonth = today.getMonth();

let selectedDate = null;
let selectedStartTime = null;
let selectedEndTime = null;

let isDragging = false;
let dragMode = null;
let dragStartHour = null;
let dragEndHour = null;
let activePointerId = null;

let reservations = [];

const amTimes = [
  "00:00", "01:00", "02:00", "03:00", "04:00", "05:00",
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00"
];

const pmTimes = [
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"
];

async function requestApi(path, options = {}) {
  throw new Error("Legacy API is disabled. Firestore is used directly.");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...options.headers
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "요청을 처리하지 못했습니다.");
  }

  return data;
}

async function loadReservations() {
  const snapshot = await getDocs(collection(db, "reservations"));

  reservations = snapshot.docs
    .map(toReservation)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

async function refreshReservationViews() {
  await loadReservations();
  renderCalendar();

  if (selectedDate) {
    renderTimeBlocks();
  }
}

function makeDateString(year, month, date) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
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
    passwordHash: data.passwordHash,
    createdAt: data.createdAt
  };
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getSlotId(date, hour) {
  return `${date}_${String(hour).padStart(2, "0")}`;
}

async function createReservation(data) {
  const start = Number(data.time.slice(0, 2));
  const end = Number(data.endTime.slice(0, 2));
  const reservationRef = doc(collection(db, "reservations"));
  const slotRefs = [];

  for (let hour = start; hour < end; hour++) {
    slotRefs.push(doc(db, "reservationSlots", getSlotId(data.date, hour)));
  }

  await runTransaction(db, async transaction => {
    for (const slotRef of slotRefs) {
      const slotSnapshot = await transaction.get(slotRef);

      if (slotSnapshot.exists()) {
        throw new Error("?대? ?덉빟???쒓컙???ы븿?섏뼱 ?덉뒿?덈떎.");
      }
    }

    transaction.set(reservationRef, {
      ...data,
      createdAt: serverTimestamp()
    });

    slotRefs.forEach(slotRef => {
      transaction.set(slotRef, {
        reservationId: reservationRef.id,
        date: data.date
      });
    });
  });
}

async function cancelReservationsBySelectedHours(
  reservationsToCancel,
  selectedHours,
  credentials
) {
  const passwordHash = await hashPassword(credentials.cancelPassword);
  const selectedHourSet = new Set(selectedHours);

  const reservationRefs = reservationsToCancel.map(reservation =>
    doc(db, "reservations", reservation.id)
  );

  await runTransaction(db, async transaction => {
    // 1. 취소하려는 기존 예약과 각 시간 슬롯을 먼저 읽는다.
    const reservationSnapshots = await Promise.all(
      reservationRefs.map(reservationRef => transaction.get(reservationRef))
    );

    const plans = reservationSnapshots.map(snapshot => {
      if (!snapshot.exists()) {
        throw new Error("예약을 찾을 수 없습니다.");
      }

      const data = snapshot.data();

      if (
        data.studentId !== credentials.studentId ||
        data.passwordHash !== passwordHash
      ) {
        throw new Error("학번 또는 취소 비밀번호가 일치하지 않습니다.");
      }

      const start = Number(data.time.slice(0, 2));
      const end = Number(data.endTime.slice(0, 2));

      const slotRefs = [];
      const remainingSegments = [];
      let segmentStart = null;

      for (let hour = start; hour < end; hour++) {
        slotRefs.push(
          doc(db, "reservationSlots", getSlotId(data.date, hour))
        );

        const isCancelled = selectedHourSet.has(hour);

        // 취소되지 않은 구간의 시작
        if (!isCancelled && segmentStart === null) {
          segmentStart = hour;
        }

        // 취소 구간을 만나거나, 예약의 마지막 시간에 도달하면 구간 저장
        if (
          segmentStart !== null &&
          (isCancelled || hour === end - 1)
        ) {
          remainingSegments.push({
            start: segmentStart,
            end: isCancelled ? hour : hour + 1
          });

          segmentStart = null;
        }
      }

      return {
        reservationRef: snapshot.ref,
        reservationId: snapshot.id,
        data,
        slotRefs,
        remainingSegments
      };
    });

    const allSlotRefs = plans.flatMap(plan => plan.slotRefs);

    const slotSnapshots = await Promise.all(
      allSlotRefs.map(slotRef => transaction.get(slotRef))
    );

    let slotIndex = 0;

    for (const plan of plans) {
      for (const slotRef of plan.slotRefs) {
        const slotSnapshot = slotSnapshots[slotIndex++];

        if (
          !slotSnapshot.exists() ||
          slotSnapshot.data().reservationId !== plan.reservationId
        ) {
          throw new Error(
            "예약 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요."
          );
        }
      }
    }

    // 2. 기존 예약과 기존 시간 슬롯을 삭제한다.
    for (const plan of plans) {
      transaction.delete(plan.reservationRef);

      for (const slotRef of plan.slotRefs) {
        transaction.delete(slotRef);
      }
    }

    // 3. 취소되지 않은 시간대만 새 예약으로 다시 만든다.
    for (const plan of plans) {
      for (const segment of plan.remainingSegments) {
        const newReservationRef = doc(collection(db, "reservations"));

        transaction.set(newReservationRef, {
          ...plan.data,
          time: makeHourTime(segment.start),
          endTime: makeHourTime(segment.end),
          createdAt: serverTimestamp(),
          splitFrom: plan.reservationId
        });

        for (let hour = segment.start; hour < segment.end; hour++) {
          transaction.set(
            doc(
              db,
              "reservationSlots",
              getSlotId(plan.data.date, hour)
            ),
            {
              reservationId: newReservationRef.id,
              date: plan.data.date
            }
          );
        }
      }
    }
  });
}

function getTodayString() {
  return makeDateString(today.getFullYear(), today.getMonth(), today.getDate());
}

function isPastDate(dateStr) {
  return dateStr < getTodayString();
}

function getReservedHours(dateStr) {
  return reservations
    .filter(r => r.date === dateStr)
    .reduce((sum, r) => {
      const start = Number(r.time.slice(0, 2));
      const end = Number(r.endTime.slice(0, 2));
      return sum + (end - start);
    }, 0);
}

function getDateStatus(dateStr) {
  const reservedHours = getReservedHours(dateStr);

  if (reservedHours === 0) return "empty-day";
  if (reservedHours < 12) return "low-day";
  if (reservedHours < 24) return "mid-day";
  return "full-day";
}

function updateAvailableTimeSummary() {
  if (!availableTimeSummary || !selectedDate) return;

  const reservedHours = getReservedHours(selectedDate);
  const availableHours = Math.max(0, 24 - reservedHours);

  availableTimeSummary.textContent =
    `예약 가능 시간 ${availableHours}시간 / 전체 24시간`;
}

function maskName(name) {
  if (!name) return "예약자";
  if (name.length === 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*" + name[name.length - 1];
}

function renderCalendar() {
  calendar.innerHTML = "";

  monthTitle.textContent = `${currentYear}년 ${currentMonth + 1}월`;

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

  dayNames.forEach(day => {
    const div = document.createElement("div");
    div.className = "day-name";
    div.textContent = day;
    calendar.appendChild(div);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "date-cell empty";
    calendar.appendChild(empty);
  }

  for (let date = 1; date <= lastDate; date++) {
    const dateStr = makeDateString(currentYear, currentMonth, date);
    const reservedHours = getReservedHours(dateStr);

    const todayStr = makeDateString(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const pastDate = isPastDate(dateStr);

    const div = document.createElement("div");
    div.className = `date-cell ${getDateStatus(dateStr)}`;

    if (dateStr === todayStr) {
      div.classList.add("today");
    }

    if (pastDate) {
      div.classList.add("past");
    }

    div.innerHTML = `
      <div class="date-number">${date}</div>
      <div class="reserved-hour-text">${reservedHours}/24시간</div>
      <span class="date-status-dot"></span>
    `;

    if (!pastDate) {
      div.addEventListener("click", () => {
        selectedDate = dateStr;
        showTimePage();
      });
    }

    calendar.appendChild(div);
  }
}

function showTimePage() {
  calendarPage.classList.remove("active");
  timePage.classList.add("active");

  selectedDateTitle.textContent = `${selectedDate} 예약 현황`;
  updateAvailableTimeSummary();
  renderTimeBlocks();
}

function renderTimeBlocks() {
  amBlocks.innerHTML = "";
  pmBlocks.innerHTML = "";
  updateAvailableTimeSummary();

  amTimes.forEach(time => {
    amBlocks.appendChild(createTimeBlock(time));
  });

  pmTimes.forEach(time => {
    pmBlocks.appendChild(createTimeBlock(time));
  });
}

function createTimeBlock(time) {
  const button = document.createElement("button");
  const hour = Number(time.slice(0, 2));

  button.className = "time-block";
  button.dataset.hour = hour;
  button.type = "button";

  const reservation = findReservationByHour(hour);

  if (reservation) {
    button.classList.add("reserved");
    button.textContent = `${time} 예약됨 / ${maskName(reservation.name)}`;

    button.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      e.preventDefault();

      activePointerId = e.pointerId;

      startDrag(hour, "cancel");
    });

    return button;
  }

  const disabled = isPastTimeBlock(time);

  if (disabled) {
    button.classList.add("disabled");
    button.textContent = `${time} 지난 시간`;
    button.disabled = true;
    return button;
  }

  button.textContent = `${time} 예약 가능`;

  button.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();

    activePointerId = e.pointerId;

    startDrag(hour, "reserve");
  });

  return button;
}

function findReservationByHour(hour) {
  return reservations.find(r => {
    if (r.date !== selectedDate) return false;

    const start = Number(r.time.slice(0, 2));
    const end = Number(r.endTime.slice(0, 2));

    return hour >= start && hour < end;
  });
}

function isPastTimeBlock(time) {
  if (!selectedDate) return false;

  const todayStr = getTodayString();
  if (selectedDate !== todayStr) return false;

  const now = new Date();
  const hour = Number(time.slice(0, 2));

  if (hour < now.getHours()) return true;
  if (hour === now.getHours() && now.getMinutes() > 0) return true;
  return false;
}

function startDrag(hour, mode) {
  isDragging = true;
  dragMode = mode;
  dragStartHour = hour;
  dragEndHour = hour;
  updateDragSelection();
}

function continueDrag(hour) {
  if (!isDragging) return;

  dragEndHour = hour;
  updateDragSelection();
}

function finishDrag() {
  if (!isDragging) return;

  const mode = dragMode;
  isDragging = false;
  dragMode = null;

  if (mode === "cancel") {
    cancelSelectedReservationHours();
    return;
  }

  openReservationModal();
}

function makeHourTime(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function cancelReservationHour(reservation, hour) {
  const start = Number(reservation.time.slice(0, 2));
  const end = Number(reservation.endTime.slice(0, 2));

  reservations = reservations.filter(r => r !== reservation);

  if (hour > start) {
    reservations.push({
      ...reservation,
      time: makeHourTime(start),
      endTime: makeHourTime(hour)
    });
  }

  if (hour + 1 < end) {
    reservations.push({
      ...reservation,
      time: makeHourTime(hour + 1),
      endTime: makeHourTime(end)
    });
  }
}

function getCancelCredentials() {
  const studentId = prompt("예약할 때 입력한 학번을 입력하세요.");

  if (studentId === null) return null;

  const cancelPassword = prompt("예약할 때 설정한 취소 비밀번호를 입력하세요.");

  if (cancelPassword === null) return null;

  const cancelReason = prompt("취소 사유를 입력해주세요. (선택 사항)");

  return {
    studentId: studentId.trim(),
    cancelPassword: cancelPassword.trim(),
    cancelReason: (cancelReason || "").trim()
  };
}

function getUniqueReservationsByHours(hours) {
  return hours.reduce((items, hour) => {
    const reservation = findReservationByHour(hour);

    if (reservation && !items.some(item => item.id === reservation.id)) {
      items.push(reservation);
    }

    return items;
  }, []);
}

async function cancelSelectedReservationHours() {
  const start = Math.min(dragStartHour, dragEndHour);
  const end = Math.max(dragStartHour, dragEndHour) + 1;
  const hours = [];

  for (let hour = start; hour < end; hour++) {
    if (findReservationByHour(hour)) {
      hours.push(hour);
    }
  }

  if (hours.length === 0) {
    clearSelectedBlocks();
    return;
  }

  const timeText = hours
    .map(hour => `${makeHourTime(hour)} ~ ${makeHourTime(hour + 1)}`)
    .join("\n");

  const credentials = getCancelCredentials();

  if (!credentials) {
    clearSelectedBlocks();
    return;
  }

  const cancelReservations = getUniqueReservationsByHours(hours);

  const ok = confirm(
    `선택한 ${hours.length}시간 예약을 취소할까요?\n\n${timeText}`
  );

  if (!ok) {
    clearSelectedBlocks();
    return;
  }

  try {
    await cancelReservationsBySelectedHours(
      cancelReservations,
      hours,
      credentials
    );

    await Promise.all(
      cancelReservations.map(reservation => {
        const start = Number(reservation.time.slice(0, 2));
        const end = Number(reservation.endTime.slice(0, 2));
        const reservationHours = hours.filter(hour => hour >= start && hour < end);

        return sendCancellationEmail({
          email: reservation.email,
          name: reservation.name,
          studentId: reservation.studentId,
          date: reservation.date,
          hoursText: formatHourRanges(reservationHours),
          reason: credentials.cancelReason,
          cancelledBy: "예약자 본인"
        });
      })
    );

    await refreshReservationViews();
  } catch (error) {
    alert(error.message);
    clearSelectedBlocks();
  }
}

function updateDragSelection() {
  clearSelectedBlocks();

  let start = Math.min(dragStartHour, dragEndHour);
  let end = Math.max(dragStartHour, dragEndHour) + 1;

  if (dragMode === "reserve" && end - start > 6) {
    if (dragEndHour > dragStartHour) {
      dragEndHour = dragStartHour + 5;
    } else {
      dragEndHour = dragStartHour - 5;
    }
  }

  start = Math.min(dragStartHour, dragEndHour);
  end = Math.max(dragStartHour, dragEndHour) + 1;

  document.querySelectorAll(".time-block").forEach(block => {
    const hour = Number(block.dataset.hour);
    const isReserved = block.classList.contains("reserved");
    const isDisabled = block.classList.contains("disabled");
    const isSelectable =
      dragMode === "cancel" ? isReserved : !isReserved && !isDisabled;

    if (hour >= start && hour < end && isSelectable) {
      block.classList.add("selected");
    }
  });
}

function clearSelectedBlocks() {
  document.querySelectorAll(".time-block").forEach(block => {
    block.classList.remove("selected");
  });
}

function openReservationModal() {
  const start = Math.min(dragStartHour, dragEndHour);
  const end = Math.max(dragStartHour, dragEndHour) + 1;

  if (isPastDate(selectedDate)) {
    alert("오늘 이전 날짜는 예약할 수 없습니다.");
    clearSelectedBlocks();
    return;
  }

  if (end - start > 6) {
    alert("최대 6시간까지만 예약할 수 있습니다.");
    clearSelectedBlocks();
    return;
  }

  const duplicated = reservations.some(r => {
    if (r.date !== selectedDate) return false;

    const reservedStart = Number(r.time.slice(0, 2));
    const reservedEnd = Number(r.endTime.slice(0, 2));

    return start < reservedEnd && end > reservedStart;
  });

  if (duplicated) {
    alert("선택한 시간 안에 이미 예약된 시간이 있습니다.");
    clearSelectedBlocks();
    return;
  }

  selectedStartTime = `${String(start).padStart(2, "0")}:00`;
  selectedEndTime = `${String(end).padStart(2, "0")}:00`;

  if (selectedDate === getTodayString() && isPastTimeBlock(selectedStartTime)) {
    alert("현재 시간 이전의 예약은 할 수 없습니다.");
    clearSelectedBlocks();
    return;
  }

  modalTimeText.textContent = `${selectedDate} ${selectedStartTime} ~ ${selectedEndTime}`;
  modal.classList.remove("hidden");
}

reservationForm.addEventListener("submit", async e => {
  e.preventDefault();

  const studentId = document.getElementById("studentId").value.trim();
  const cancelPassword = document.getElementById("cancelPassword").value.trim();
  const studentName = document.getElementById("studentName").value;
  const emailId = document.getElementById("emailId").value;
  const purpose = document.getElementById("purpose").value;

  const start = Number(selectedStartTime.slice(0, 2));
  const end = Number(selectedEndTime.slice(0, 2));

  const studentReservedHours = reservations
    .filter(r => r.date === selectedDate && r.studentId === studentId)
    .reduce((sum, r) => {
      const rStart = Number(r.time.slice(0, 2));
      const rEnd = Number(r.endTime.slice(0, 2));
      return sum + (rEnd - rStart);
    }, 0);

  if (studentReservedHours + (end - start) > 6) {
    alert("한 사람은 하루 최대 6시간까지만 예약할 수 있습니다.");
    return;
  }

  const duplicated = reservations.some(r => {
    if (r.date !== selectedDate) return false;

    const reservedStart = Number(r.time.slice(0, 2));
    const reservedEnd = Number(r.endTime.slice(0, 2));

    return start < reservedEnd && end > reservedStart;
  });

  if (duplicated) {
    alert("이미 예약된 시간이 포함되어 있습니다.");
    return;
  }

  try {
    const email = `${emailId}@gmail.com`;

    await createReservation({
      date: selectedDate,
      time: selectedStartTime,
      endTime: selectedEndTime,
      studentId,
      passwordHash: await hashPassword(cancelPassword),
      name: studentName,
      email,
      purpose
    });

    await sendReservationEmail({
      date: selectedDate,
      time: selectedStartTime,
      endTime: selectedEndTime,
      studentId,
      name: studentName,
      email,
      purpose
    });

    alert("예약이 완료되었습니다.");

    reservationForm.reset();
    modal.classList.add("hidden");
    clearSelectedBlocks();

    await refreshReservationViews();
  } catch (error) {
    alert(error.message);
  }
});

cancelBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
  clearSelectedBlocks();
});

backBtn.addEventListener("click", () => {
  timePage.classList.remove("active");
  calendarPage.classList.add("active");
  renderCalendar();
});

prevMonthBtn.addEventListener("click", () => {
  currentMonth--;

  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }

  renderCalendar();
});

nextMonthBtn.addEventListener("click", () => {
  currentMonth++;

  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }

  renderCalendar();
});

document.addEventListener(
  "pointermove",
  e => {
    if (!isDragging) return;

    e.preventDefault();

    const element = document.elementFromPoint(
      e.clientX,
      e.clientY
    );

    const block = element?.closest(".time-block");

    if(!block) return;

    const hour = Number(block.dataset.hour);

    if(Number.isNaN(hour)) return;

    continueDrag(hour);
  },
  { passive: false }
);

function getTimeBlockAtPoint(x, y) {
  const blocks = [
    ...document.querySelectorAll(".time-block")
  ];

  for (const block of blocks) {
    const rect = block.getBoundingClientRect();

    const gapPadding = 8;

    const insideX =
      x >= rect.left &&
      x <= rect.right;

    const insideY =
      y >= rect.top - gapPadding &&
      y <= rect.bottom + gapPadding;

    if (insideX && insideY) {
      return block;
    }
  }

  return null;
}

document.addEventListener(
  "pointermove",
  e => {
    if (!isDragging) return;

    if (
      activePointerId !== null &&
      e.pointerId !== activePointerId
    ) {
      return;
    }

    e.preventDefault();

    const block = getTimeBlockAtPoint(
      e.clientX,
      e.clientY
    );

    if (!block) return;

    const hour = Number(block.dataset.hour);

    if (Number.isNaN(hour)) return;

    continueDrag(hour);
  },
  { passive: false }
);

document.addEventListener("pointerup", e => {
  if (!isDragging) return;

  if (
    activePointerId !== null &&
    e.pointerId !== activePointerId
  ) {
    return;
  }

  activePointerId = null;

  finishDrag();
});

document.addEventListener("pointercancel", e => {
  if (
    activePointerId !== null &&
    e.pointerId !== activePointerId
  ) {
    return;
  }

  activePointerId = null;
  isDragging = false;
  dragMode = null;

  clearSelectedBlocks();
});

document.addEventListener("pointercancel", () => {
  if (!isDragging) return;

  isDragging = false;
  dragMode = null;
  clearSelectedBlocks();
});

async function initializeApp() {
  try {
    await loadReservations();
    renderCalendar();
  } catch (error) {
    alert(`예약 정보를 불러오지 못했습니다.\n\n${error.message}`);
    renderCalendar();
  }
}

initializeApp();