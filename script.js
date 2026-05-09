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

const API_BASE_URL = "https://entrench-backstab-coke.ngrok-free.dev";


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
  reservations = await requestApi("/api/reservations");
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

  const reservation = findReservationByHour(hour);

  if (reservation) {
    button.classList.add("reserved");
    button.textContent = `${time} 예약됨 / ${maskName(reservation.name)}`;

    button.addEventListener("mousedown", () => {
      startDrag(hour, "cancel");
    });

    button.addEventListener("mouseenter", () => {
      continueDrag(hour);
    });

    button.addEventListener("mouseup", () => {
      finishDrag();
    });

    return button;
  }

  button.textContent = `${time} 예약 가능`;

  button.addEventListener("mousedown", () => {
    startDrag(hour, "reserve");
  });

  button.addEventListener("mouseenter", () => {
    continueDrag(hour);
  });

  button.addEventListener("mouseup", () => {
    finishDrag();
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

  return {
    studentId: studentId.trim(),
    cancelPassword: cancelPassword.trim()
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

function isFullReservationSelected(reservation, hours) {
  const start = Number(reservation.time.slice(0, 2));
  const end = Number(reservation.endTime.slice(0, 2));

  for (let hour = start; hour < end; hour++) {
    if (!hours.includes(hour)) return false;
  }

  return true;
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
  const hasPartiallySelectedReservation = cancelReservations.some(
    reservation => !isFullReservationSelected(reservation, hours)
  );

  if (hasPartiallySelectedReservation) {
    alert("DB 연결 버전에서는 예약된 시간 전체를 선택해야 취소할 수 있습니다.");
    clearSelectedBlocks();
    return;
  }

  const ok = confirm(
    `선택한 ${hours.length}시간 예약을 취소할까요?\n\n${timeText}`
  );

  if (!ok) {
    clearSelectedBlocks();
    return;
  }

  try {
    await Promise.all(
      cancelReservations.map(reservation =>
        requestApi(`/api/reservations/${reservation.id}`, {
          method: "DELETE",
          body: JSON.stringify(credentials)
        })
      )
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
    const isSelectable =
      dragMode === "cancel" ? isReserved : !isReserved;

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
    await requestApi("/api/reservations", {
      method: "POST",
      body: JSON.stringify({
        date: selectedDate,
        time: selectedStartTime,
        endTime: selectedEndTime,
        studentId,
        cancelPassword,
        name: studentName,
        email: `${emailId}@gmail.com`,
        purpose
      })
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

document.addEventListener("mouseup", () => {
  if (isDragging) {
    finishDrag();
  }
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
