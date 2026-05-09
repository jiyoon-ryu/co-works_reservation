import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientRoot = path.resolve(__dirname, "..");

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
app.use(express.static(clientRoot));

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
  let sql = "SELECT * FROM reservations";

  if (date) {
    sql += " WHERE date = ?";
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
      (date, time, end_time, student_id, cancel_password_hash, name, email, purpose)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [date, time, endTime, studentId, cancelPasswordHash, name, email, purpose]
  );

  const [rows] = await pool.query(
    "SELECT * FROM reservations WHERE id = ?",
    [result.insertId]
  );

  res.status(201).json(toApiReservation(rows[0]));
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

  await pool.query("DELETE FROM reservations WHERE id = ?", [req.params.id]);

  res.json({ ok: true });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
