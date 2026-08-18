const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database("database.sqlite");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "clave-desarrollo",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.static(__dirname));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    character_name TEXT NOT NULL,
    age INTEGER NOT NULL,
    race TEXT NOT NULL,
    story TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

function createUser(username, role) {
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

  if (!user) {
    db.prepare(
      "INSERT INTO users (username, role) VALUES (?, ?)"
    ).run(username, role);
  }
}

createUser("jugador", "user");
createUser("admin", "admin");

app.post("/api/login", (req, res) => {
  const { username } = req.body;

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

  if (!user) {
    return res.status(401).json({
      error: "Usuario no encontrado",
    });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
  };

  res.json(req.session.user);
});

app.get("/api/me", (req, res) => {
  res.json(req.session.user || null);
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/my-application", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      error: "No has iniciado sesión",
    });
  }

  const application = db.prepare(`
    SELECT *
    FROM applications
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(req.session.user.id);

  res.json(application || null);
});

app.post("/api/applications", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      error: "No has iniciado sesión",
    });
  }

  const latest = db.prepare(`
    SELECT *
    FROM applications
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(req.session.user.id);

  if (latest && latest.status === "pending") {
    return res.status(400).json({
      error: "Ya tienes una ficha pendiente",
    });
  }

  if (latest && latest.status === "approved") {
    return res.status(400).json({
      error: "Tu ficha ya está aprobada",
    });
  }

  const {
    character_name,
    age,
    race,
    story,
  } = req.body;

  if (!character_name || !age || !race || !story) {
    return res.status(400).json({
      error: "Completa todos los campos",
    });
  }

  db.prepare(`
    INSERT INTO applications
    (
      user_id,
      character_name,
      age,
      race,
      story,
      status
    )
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(
    req.session.user.id,
    character_name,
    age,
    race,
    story
  );

  res.json({
    ok: true,
  });
});

app.get("/api/admin/applications", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({
      error: "No tienes permisos",
    });
  }

  const applications = db.prepare(`
    SELECT
      applications.*,
      users.username
    FROM applications
    JOIN users ON users.id = applications.user_id
    ORDER BY applications.id DESC
  `).all();

  res.json(applications);
});

app.patch("/api/admin/applications/:id/approve", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({
      error: "No tienes permisos",
    });
  }

  db.prepare(`
    UPDATE applications
    SET
      status = 'approved',
      rejection_reason = NULL
    WHERE id = ?
  `).run(req.params.id);

  res.json({
    ok: true,
  });
});

app.patch("/api/admin/applications/:id/reject", (req, res) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({
      error: "No tienes permisos",
    });
  }

  const { reason } = req.body;

  db.prepare(`
    UPDATE applications
    SET
      status = 'rejected',
      rejection_reason = ?
    WHERE id = ?
  `).run(reason || "Sin motivo", req.params.id);

  res.json({
    ok: true,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Web iniciada en puerto ${PORT}`);
});
