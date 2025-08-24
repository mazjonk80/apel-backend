const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Database SQLite (file in the same folder)
const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

// Tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nip TEXT UNIQUE,
      name TEXT,
      password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS presensi(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      jenis TEXT,    -- 'pagi' atau 'sore'
      waktu TEXT,
      tanggal TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Seed a default user if not exists
  db.get("SELECT * FROM users WHERE nip = ?", ["12345"], (err, row) => {
    if (!row) {
      db.run("INSERT INTO users(nip, name, password) VALUES (?,?,?)", ["12345", "User Demo", "123"]);
      console.log("Seeded default user -> NIP: 12345, Password: 123");
    }
  });
});

// Health check
app.get("/health", (req, res) => res.json({ ok: true }));

// Login
app.post("/login", (req, res) => {
  const { nip, password } = req.body;
  db.get("SELECT id, nip, name FROM users WHERE nip=? AND password=?", [nip, password], (err, row) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (row) res.json({ success: true, user: row });
    else res.json({ success: false, message: "Login gagal" });
  });
});

// Presensi (apel pagi/sore)
app.post("/presensi", (req, res) => {
  const { user_id, jenis } = req.body;
  if (!["pagi", "sore"].includes(jenis)) return res.status(400).json({ success: false, message: "Jenis tidak valid" });

  const now = new Date();
  const tanggal = new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,10); // YYYY-MM-DD (local-ish)
  const waktu = now.toLocaleTimeString("id-ID");

  db.run("INSERT INTO presensi(user_id, jenis, waktu, tanggal) VALUES(?,?,?,?)",
    [user_id, jenis, waktu, tanggal],
    function (err) {
      if (err) return res.status(500).json({ success: false, message: err.message });
      return res.json({ success: true, waktu, tanggal, id: this.lastID });
    }
  );
});

// Riwayat per user
app.get("/riwayat/:user_id", (req, res) => {
  const { user_id } = req.params;
  db.all("SELECT id, jenis, waktu, tanggal FROM presensi WHERE user_id=? ORDER BY id DESC", [user_id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json(rows);
  });
});

// Rekap harian sederhana (admin)
app.get("/rekap/:tanggal", (req, res) => {
  const { tanggal } = req.params;
  db.all(`
    SELECT u.nip, u.name,
      MAX(CASE WHEN p.jenis='pagi' THEN p.waktu END) AS apel_pagi,
      MAX(CASE WHEN p.jenis='sore' THEN p.waktu END) AS apel_sore
    FROM users u
    LEFT JOIN presensi p ON u.id = p.user_id AND p.tanggal = ?
    GROUP BY u.id
    ORDER BY u.nip
  `, [tanggal], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json(rows);
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`));