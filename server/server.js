import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import {
  deleteReservationCalendarEvent,
  ensureReservationCalendarEvent,
  exchangeGoogleAuthorizationCode,
  getGoogleAuthorizationUrl,
  isGoogleCalendarConfigured
} from "./googleCalendar.js";

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST,
  port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
  user: process.env.MYSQLUSER || process.env.DB_USER,
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
  database: process.env.MYSQLDATABASE || process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "ngrok-skip-browser-warning"]
}));
app.options("*", cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function toApiReservation(row) {
  return {
    id: row.id,
    date: row.date,
    time: row.time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    studentId: row.student_id,
    name: row.name,
    email: row.email,
    purpose: row.purpose,
    googleEventId: row.google_event_id,
    createdAt: row.created_at
  };
}

function getRequiredFields(body) {
  return [
    "date",
    "time",
    "endTime",
    "studentId",
    "cancelPassword",
    "name",
    "email",
    "purpose"
  ].filter(field => !String(body[field] || "").trim());
}

function getCalendarErrorMessage(error) {
  return String(
    error?.response?.data?.error?.message ||
      error?.message ||
      "Google Calendar 동기화 실패"
  ).slice(0, 1000);
}

async function getReservationById(id) {
  const [rows] = await pool.query(
    "SELECT * FROM reservations WHERE id = ?",
    [id]
  );

  return rows[0] || null;
}

async function markCalendarSyncFailure(id, syncStatus, error) {
  await pool.query(
    `UPDATE reservations
     SET calendar_sync_status = ?,
         calendar_last_error = ?,
         calendar_sync_attempts = calendar_sync_attempts + 1
     WHERE id = ?`,
    [syncStatus, getCalendarErrorMessage(error), id]
  );
}

async function synchronizeReservationCalendar(reservationId) {
  const reservation = await getReservationById(reservationId);

  if (!reservation) {
    return { ok: true, skipped: true };
  }

  if (reservation.reservation_status === "active") {
    try {
      const googleEventId =
        await ensureReservationCalendarEvent(reservation);

      await pool.query(
        `UPDATE reservations
         SET google_event_id = ?,
             calendar_sync_status = 'confirmed',
             calendar_last_error = NULL,
             calendar_sync_attempts = calendar_sync_attempts + 1
         WHERE id = ?
           AND reservation_status = 'active'`,
        [googleEventId, reservation.id]
      );

      return {
        ok: true,
        googleEventId
      };
    } catch (error) {
      await markCalendarSyncFailure(
        reservation.id,
        "create_failed",
        error
      );

      return {
        ok: false,
        error
      };
    }
  }

  if (reservation.reservation_status === "cancelling") {
    try {
      await deleteReservationCalendarEvent(reservation);

      await pool.query(
        `UPDATE reservations
         SET reservation_status = 'cancelled',
             calendar_sync_status = 'deleted',
             calendar_last_error = NULL,
             calendar_sync_attempts = calendar_sync_attempts + 1
         WHERE id = ?`,
        [reservation.id]
      );

      return { ok: true };
    } catch (error) {
      await markCalendarSyncFailure(
        reservation.id,
        "delete_failed",
        error
      );

      return {
        ok: false,
        error
      };
    }
  }

  return { ok: true, skipped: true };
}

async function retryFailedCalendarSynchronizations() {
  if (!isGoogleCalendarConfigured()) {
    return;
  }

  const [rows] = await pool.query(
    `SELECT id
     FROM reservations
     WHERE
       (
         reservation_status = 'active'
         AND calendar_sync_status IN ('pending_create', 'create_failed')
       )
       OR
       (
         reservation_status = 'cancelling'
         AND calendar_sync_status IN ('pending_delete', 'delete_failed')
       )
     ORDER BY id
     LIMIT 30`
  );

  for (const row of rows) {
    try {
      await synchronizeReservationCalendar(row.id);
    } catch (error) {
      console.error(
        `Calendar sync retry failed for reservation ${row.id}:`,
        error
      );
    }
  }
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      db: true,
      message: "Co-works reservation server is running."
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      db: false,
      message: "Server is running, but the database connection failed."
    });
  }
});

app.get("/api/reservations", async (req, res) => {
  const { date } = req.query;
  const params = [];
  let sql = `
  SELECT *
  FROM reservations
  WHERE reservation_status <> 'cancelled'
`;

if (date) {
  sql += " AND date = ?";
  params.push(date);
}

  sql += " ORDER BY date, time";

  const [rows] = await pool.query(sql, params);

  res.json(rows.map(toApiReservation));
});

app.post("/api/reservations", async (req, res) => {
  const missingFields = getRequiredFields(req.body);

  if (missingFields.length > 0) {
    res.status(400).json({
      message: `Missing required fields: ${missingFields.join(", ")}`
    });
    return;
  }

  const {
    date,
    time,
    endTime,
    studentId,
    cancelPassword,
    name,
    email,
    purpose
  } = req.body;

  const now = new Date();
  const [year, month, day] = date.split("-").map(Number);
  const reservationStart = new Date(year, month - 1, day, Number(time.slice(0, 2)), Number(time.slice(3, 5)), 0, 0);
  const isSameLocalDay = now.getFullYear() === year && now.getMonth() === month - 1 && now.getDate() === day;

  if (isSameLocalDay && reservationStart <= now) {
    res.status(400).json({ message: "Cannot reserve a time that has already passed today." });
    return;
  }

  const startHour = Number(time.slice(0, 2));
  const endHour = Number(endTime.slice(0, 2));
  const requestedHours = endHour - startHour;

  if (requestedHours <= 0 || requestedHours > 6) {
    res.status(400).json({ message: "Reservation must be between 1 and 6 hours." });
    return;
  }

  const [overlaps] = await pool.query(
    `SELECT id
     FROM reservations
     WHERE date = ?
       AND time < ?
       AND end_time > ?
     LIMIT 1`,
    [date, endTime, time]
  );

  if (overlaps.length > 0) {
    res.status(409).json({ message: "Selected time already has a reservation." });
    return;
  }

  const [studentTotals] = await pool.query(
    `SELECT COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(end_time, time)) / 3600), 0) AS reserved_hours
     FROM reservations
     WHERE date = ?
       AND student_id = ?`,
    [date, studentId]
  );

  const reservedHours = Number(studentTotals[0].reserved_hours);

  if (reservedHours + requestedHours > 6) {
    res.status(400).json({ message: "A student can reserve up to 6 hours per day." });
    return;
  }

  const cancelPasswordHash = await bcrypt.hash(cancelPassword, 10);

  const [result] = await pool.query(
    `INSERT INTO reservations
      (
        date,
        time, 
        end_time, 
        student_id, 
        cancel_password_hash, 
        name, 
        email, 
        purpose,
        reservation_status,
        calendar_sync_status
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'pending_create')`,
    [
      date, 
      time, 
      endTime, 
      studentId, 
      cancelPasswordHash, 
      name, 
      email, 
      purpose
    ]
  );

  let calendarSynced = false;

  if (isGoogleCalendarConfigured()) {
    const syncResult = await synchronizeReservationCalendar(result.insertId);
    calendarSynced = syncResult.ok;
  } else {
    await markCalendarSyncFailure(
      result.insertId,
      "create_failed",
      new Error("Google Calendar가 아직 연결되지 않았습니다.")
    );
  }

  const reservation = await getReservationById(result.insertId);

  res.status(calendarSynced ? 201 : 202).json({
    ...toApiReservation(reservation),
    calendarSynced
  });

app.delete("/api/reservations/:id", async (req, res) => {
  const { studentId, cancelPassword } = req.body;

  if (!studentId || !cancelPassword) {
    res.status(400).json({ message: "studentId and cancelPassword are required." });
    return;
  }

  const [rows] = await pool.query(
    "SELECT * FROM reservations WHERE id = ?",
    [req.params.id]
  );

  if (rows.length === 0) {
    res.status(404).json({ message: "Reservation not found." });
    return;
  }

  const reservation = rows[0];
  const passwordMatches = await bcrypt.compare(
    cancelPassword,
    reservation.cancel_password_hash
  );

  if (reservation.student_id !== studentId || !passwordMatches) {
    res.status(403).json({ message: "Student ID or cancel password does not match." });
    return;
  }

  await pool.query(
  `UPDATE reservations
   SET reservation_status = 'cancelling',
       calendar_sync_status = 'pending_delete',
       calendar_last_error = NULL
   WHERE id = ?`,
  [reservation.id]
);

let calendarSynced = false;

if (isGoogleCalendarConfigured()) {
  const syncResult = await synchronizeReservationCalendar(reservation.id);
  calendarSynced = syncResult.ok;
} else {
  await markCalendarSyncFailure(
    reservation.id,
    "delete_failed",
    new Error("Google Calendar가 아직 연결되지 않았습니다.")
  );
}

res.status(calendarSynced ? 200 : 202).json({
  ok: true,
  calendarSynced,
  message: calendarSynced
    ? "예약이 취소되었습니다."
    : "취소 요청은 저장되었습니다. Google Calendar 반영은 자동 재시도됩니다."
});

app.get("/admin/google/connect", (req, res) => {
  const setupKey = String(req.query.key || "");

  if (
    !process.env.GOOGLE_SETUP_KEY ||
    setupKey !== process.env.GOOGLE_SETUP_KEY
  ) {
    res.status(403).send("Google Calendar 연결 권한이 없습니다.");
    return;
  }

  res.redirect(getGoogleAuthorizationUrl(setupKey));
});
  
app.get("/admin/google/callback", async (req, res, next) => {
  try {
    const state = String(req.query.state || "");
    const code = String(req.query.code || "");

    if (
      !process.env.GOOGLE_SETUP_KEY ||
      state !== process.env.GOOGLE_SETUP_KEY
    ) {
      res.status(403).send("Google OAuth state 검증에 실패했습니다.");
      return;
    }

    if (!code) {
      res.status(400).send("Google authorization code가 없습니다.");
      return;
    }

    const { managerEmail, refreshToken } =
      await exchangeGoogleAuthorizationCode(code);

    res.type("text/plain").send(
`Google Calendar 연결 완료

연결된 관리자 계정: ${managerEmail}

아래 값을 서버 환경변수에 저장하세요.

GOOGLE_REFRESH_TOKEN=${refreshToken}

저장 후 서버를 재시작하세요.`
    );
  } catch (error) {
    next(error);
  }
});

  
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);

  if (isGoogleCalendarConfigured()) {
    console.log("Google Calendar synchronization is enabled.");

    retryFailedCalendarSynchronizations().catch(error => {
      console.error("Initial Calendar sync retry failed:", error);
    });
  } else {
    console.log("Google Calendar is not connected yet.");
  }
});

setInterval(() => {
  retryFailedCalendarSynchronizations().catch(error => {
    console.error("Calendar retry worker failed:", error);
  });
}, 5 * 60 * 1000).unref();
