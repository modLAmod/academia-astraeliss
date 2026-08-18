const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const SqliteStore = require("better-sqlite3-session-store")(session);
const crypto = require("crypto");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURACIÓN
// ==========================================

const DISCORD_CLIENT_ID =
  process.env.DISCORD_CLIENT_ID || "1506739511969714237";

const DISCORD_CLIENT_SECRET =
  process.env.DISCORD_CLIENT_SECRET;

const BASE_URL =
  process.env.BASE_URL || `http://localhost:${PORT}`;

const DISCORD_REDIRECT_URI =
  `${BASE_URL}/auth/discord/callback`;

const SESSION_SECRET =
  process.env.SESSION_SECRET || "solo-desarrollo-cambia-esto";

// Puedes poner varios Discord IDs separados por comas.
// EJEMPLO:
// ADMIN_DISCORD_IDS=123456789,987654321
const ADMIN_DISCORD_IDS = (
  process.env.ADMIN_DISCORD_IDS || ""
)
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

// ==========================================
// BASE DE DATOS
// ==========================================

const db = new Database("database.sqlite");

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    discord_id TEXT UNIQUE NOT NULL,

    username TEXT NOT NULL,

    global_name TEXT,

    avatar TEXT,

    role TEXT NOT NULL DEFAULT 'user',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    character_name TEXT NOT NULL,

    age INTEGER NOT NULL,

    race TEXT NOT NULL,

    birthplace TEXT NOT NULL,

    personality TEXT NOT NULL,

    story TEXT NOT NULL,

    goals TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (
        status IN (
          'pending',
          'approved',
          'rejected'
        )
      ),

    rejection_reason TEXT,

    reviewed_by INTEGER,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id),

    FOREIGN KEY (reviewed_by)
      REFERENCES users(id)
  );
`);

// ==========================================
// EXPRESS
// ==========================================

app.set("trust proxy", 1);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(
  session({
    store: new SqliteStore({
      client: db,

      expired: {
        clear: true,

        intervalMs:
          15 * 60 * 1000
      }
    }),

    secret: SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    name: "lore.sid",

    cookie: {
      httpOnly: true,

      sameSite: "lax",

      secure:
        process.env.NODE_ENV === "production",

      // 30 días
      maxAge:
        1000 *
        60 *
        60 *
        24 *
        30
    }
  })
);

app.use(
  express.static(
    path.join(__dirname)
  )
);

// ==========================================
// FUNCIONES
// ==========================================

function requireLogin(
  req,
  res,
  next
) {

  if (!req.session.user) {

    return res.status(401).json({
      error:
        "Debes iniciar sesión con Discord."
    });

  }

  next();
}

function requireAdmin(
  req,
  res,
  next
) {

  if (!req.session.user) {

    return res.status(401).json({
      error:
        "Debes iniciar sesión."
    });

  }

  if (
    req.session.user.role !==
    "admin"
  ) {

    return res.status(403).json({
      error:
        "No tienes permisos de administrador."
    });

  }

  next();
}

function isAdminDiscordId(
  discordId
) {

  return ADMIN_DISCORD_IDS.includes(
    String(discordId)
  );
}

function getAvatarURL(
  discordId,
  avatar
) {

  if (!avatar) {
    return null;
  }

  return (
    `https://cdn.discordapp.com/avatars/` +
    `${discordId}/${avatar}.png?size=128`
  );
}

// ==========================================
// LOGIN DISCORD
// ==========================================

app.get(
  "/auth/discord",

  (req, res) => {

    if (!DISCORD_CLIENT_SECRET) {

      return res
        .status(500)
        .send(
          "Falta configurar DISCORD_CLIENT_SECRET."
        );
    }

    const state =
      crypto
        .randomBytes(32)
        .toString("hex");

    req.session.oauthState =
      state;

    const params =
      new URLSearchParams({

        client_id:
          DISCORD_CLIENT_ID,

        response_type:
          "code",

        redirect_uri:
          DISCORD_REDIRECT_URI,

        scope:
          "identify",

        state:
          state,

        prompt:
          "none"
      });

    res.redirect(
      "https://discord.com/oauth2/authorize?" +
      params.toString()
    );
  }
);

// ==========================================
// CALLBACK DISCORD
// ==========================================

app.get(
  "/auth/discord/callback",

  async (req, res) => {

    try {

      const {
        code,
        state,
        error
      } = req.query;

      if (error) {

        return res.redirect(
          "/?discord=cancelled"
        );

      }

      if (!code) {

        return res.redirect(
          "/?discord=error"
        );

      }

      if (
        !state ||
        state !==
          req.session.oauthState
      ) {

        return res
          .status(403)
          .send(
            "Solicitud OAuth inválida."
          );
      }

      delete req.session.oauthState;

      // ==================================
      // CODE -> ACCESS TOKEN
      // ==================================

      const tokenResponse =
        await fetch(
          "https://discord.com/api/v10/oauth2/token",

          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              new URLSearchParams({

                client_id:
                  DISCORD_CLIENT_ID,

                client_secret:
                  DISCORD_CLIENT_SECRET,

                grant_type:
                  "authorization_code",

                code:
                  String(code),

                redirect_uri:
                  DISCORD_REDIRECT_URI
              })
          }
        );

      const tokenData =
        await tokenResponse.json();

      if (!tokenResponse.ok) {

        console.error(
          "Discord token error:",
          tokenData
        );

        return res.redirect(
          "/?discord=error"
        );
      }

      // ==================================
      // OBTENER USUARIO DE DISCORD
      // ==================================

      const discordResponse =
        await fetch(
          "https://discord.com/api/v10/users/@me",

          {
            headers: {

              Authorization:
                `Bearer ${tokenData.access_token}`
            }
          }
        );

      const discordUser =
        await discordResponse.json();

      if (!discordResponse.ok) {

        console.error(
          "Discord user error:",
          discordUser
        );

        return res.redirect(
          "/?discord=error"
        );
      }

      // ==================================
      // ADMIN O USER
      // ==================================

      const role =
        isAdminDiscordId(
          discordUser.id
        )
          ? "admin"
          : "user";

      // ==================================
      // BUSCAR USUARIO
      // ==================================

      let user =
        db.prepare(`
          SELECT *
          FROM users
          WHERE discord_id = ?
        `).get(
          discordUser.id
        );

      // ==================================
      // CREAR
      // ==================================

      if (!user) {

        const result =
          db.prepare(`
            INSERT INTO users
            (
              discord_id,
              username,
              global_name,
              avatar,
              role
            )

            VALUES
            (?, ?, ?, ?, ?)
          `).run(

            discordUser.id,

            discordUser.username,

            discordUser.global_name ||
              discordUser.username,

            discordUser.avatar ||
              null,

            role
          );

        user =
          db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
          `).get(
            result.lastInsertRowid
          );

      } else {

        // ==================================
        // ACTUALIZAR
        // ==================================

        db.prepare(`
          UPDATE users

          SET
            username = ?,
            global_name = ?,
            avatar = ?,
            role = ?,
            updated_at =
              CURRENT_TIMESTAMP

          WHERE discord_id = ?
        `).run(

          discordUser.username,

          discordUser.global_name ||
            discordUser.username,

          discordUser.avatar ||
            null,

          role,

          discordUser.id
        );

        user =
          db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
          `).get(
            discordUser.id
          );
      }

      // ==================================
      // CREAR SESIÓN
      // ==================================

      req.session.user = {

        id:
          user.id,

        discordId:
          user.discord_id,

        username:
          user.username,

        globalName:
          user.global_name,

        avatar:
          user.avatar,

        avatarUrl:
          getAvatarURL(
            user.discord_id,
            user.avatar
          ),

        role:
          user.role
      };

      req.session.save(
        error => {

          if (error) {

            console.error(
              error
            );

            return res.redirect(
              "/?discord=error"
            );
          }

          res.redirect(
            "/"
          );
        }
      );

    } catch (error) {

      console.error(
        "Discord OAuth:",
        error
      );

      res.redirect(
        "/?discord=error"
      );
    }
  }
);

// ==========================================
// USUARIO ACTUAL
// ==========================================

app.get(
  "/api/me",

  (req, res) => {

    res.json(
      req.session.user ||
      null
    );
  }
);

// ==========================================
// CERRAR SESIÓN
// ==========================================

app.post(
  "/api/logout",

  (req, res) => {

    req.session.destroy(
      error => {

        if (error) {

          return res
            .status(500)
            .json({
              error:
                "No se pudo cerrar sesión."
            });
        }

        res.clearCookie(
          "lore.sid"
        );

        res.json({
          ok: true
        });
      }
    );
  }
);

// ==========================================
// MI FICHA
// ==========================================

app.get(
  "/api/my-application",

  requireLogin,

  (req, res) => {

    const application =
      db.prepare(`
        SELECT *
        FROM applications

        WHERE user_id = ?

        ORDER BY id DESC

        LIMIT 1
      `).get(
        req.session.user.id
      );

    res.json(
      application ||
      null
    );
  }
);

// ==========================================
// ENVIAR FICHA
// ==========================================

app.post(
  "/api/applications",

  requireLogin,

  (req, res) => {

    const latest =
      db.prepare(`
        SELECT *
        FROM applications

        WHERE user_id = ?

        ORDER BY id DESC

        LIMIT 1
      `).get(
        req.session.user.id
      );

    // Pendiente
    if (
      latest &&
      latest.status ===
        "pending"
    ) {

      return res
        .status(409)
        .json({

          error:
            "Ya tienes una ficha pendiente de revisión."
        });
    }

    // Aprobada
    if (
      latest &&
      latest.status ===
        "approved"
    ) {

      return res
        .status(409)
        .json({

          error:
            "Tu ficha ya está aprobada y no puedes enviar otra."
        });
    }

    // Si está rejected,
    // sí permitimos volver a enviar.

    const {
      character_name,
      age,
      race,
      birthplace,
      personality,
      story,
      goals
    } = req.body;

    if (
      !character_name ||
      !age ||
      !race ||
      !birthplace ||
      !personality ||
      !story ||
      !goals
    ) {

      return res
        .status(400)
        .json({

          error:
            "Debes completar todos los campos."
        });
    }

    const parsedAge =
      Number(age);

    if (
      !Number.isInteger(
        parsedAge
      ) ||
      parsedAge <= 0
    ) {

      return res
        .status(400)
        .json({

          error:
            "La edad no es válida."
        });
    }

    const result =
      db.prepare(`
        INSERT INTO applications
        (
          user_id,
          character_name,
          age,
          race,
          birthplace,
          personality,
          story,
          goals,
          status
        )

        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(

        req.session.user.id,

        character_name.trim(),

        parsedAge,

        race.trim(),

        birthplace.trim(),

        personality.trim(),

        story.trim(),

        goals.trim()
      );

    res.status(201).json({

      ok: true,

      applicationId:
        result.lastInsertRowid,

      status:
        "pending"
    });
  }
);

// ==========================================
// ADMIN - VER FICHAS
// ==========================================

app.get(
  "/api/admin/applications",

  requireAdmin,

  (req, res) => {

    const status =
      req.query.status;

    let query = `
      SELECT
        applications.*,

        users.username,

        users.global_name,

        users.discord_id,

        users.avatar,

        reviewer.username
          AS reviewer_username,

        reviewer.global_name
          AS reviewer_global_name

      FROM applications

      JOIN users
        ON users.id =
          applications.user_id

      LEFT JOIN users reviewer
        ON reviewer.id =
          applications.reviewed_by
    `;

    const values = [];

    if (
      status &&
      [
        "pending",
        "approved",
        "rejected"
      ].includes(status)
    ) {

      query += `
        WHERE applications.status = ?
      `;

      values.push(
        status
      );
    }

    query += `
      ORDER BY
        applications.created_at DESC
    `;

    const applications =
      db
        .prepare(query)
        .all(...values)
        .map(application => ({

          ...application,

          avatar_url:
            getAvatarURL(
              application.discord_id,
              application.avatar
            )
        }));

    res.json(
      applications
    );
  }
);

// ==========================================
// ADMIN - APROBAR
// ==========================================

app.patch(
  "/api/admin/applications/:id/approve",

  requireAdmin,

  (req, res) => {

    const application =
      db.prepare(`
        SELECT *
        FROM applications
        WHERE id = ?
      `).get(
        req.params.id
      );

    if (!application) {

      return res
        .status(404)
        .json({
          error:
            "Ficha no encontrada."
        });
    }

    if (
      application.status !==
      "pending"
    ) {

      return res
        .status(409)
        .json({
          error:
            "Esta ficha ya ha sido revisada."
        });
    }

    db.prepare(`
      UPDATE applications

      SET
        status =
          'approved',

        rejection_reason =
          NULL,

        reviewed_by = ?,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `).run(

      req.session.user.id,

      req.params.id
    );

    res.json({
      ok: true,

      status:
        "approved"
    });
  }
);

// ==========================================
// ADMIN - DENEGAR
// ==========================================

app.patch(
  "/api/admin/applications/:id/reject",

  requireAdmin,

  (req, res) => {

    const {
      reason
    } = req.body;

    if (
      !reason ||
      !reason.trim()
    ) {

      return res
        .status(400)
        .json({

          error:
            "Debes escribir un motivo de denegación."
        });
    }

    const application =
      db.prepare(`
        SELECT *
        FROM applications
        WHERE id = ?
      `).get(
        req.params.id
      );

    if (!application) {

      return res
        .status(404)
        .json({
          error:
            "Ficha no encontrada."
        });
    }

    if (
      application.status !==
      "pending"
    ) {

      return res
        .status(409)
        .json({

          error:
            "Esta ficha ya ha sido revisada."
        });
    }

    db.prepare(`
      UPDATE applications

      SET
        status =
          'rejected',

        rejection_reason = ?,

        reviewed_by = ?,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `).run(

      reason.trim(),

      req.session.user.id,

      req.params.id
    );

    res.json({
      ok: true,

      status:
        "rejected"
    });
  }
);

// ==========================================
// INDEX
// ==========================================

app.get(
  "*",

  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);

// ==========================================
// INICIAR
// ==========================================

app.listen(
  PORT,

  () => {

    console.log(
      `Web iniciada en ${BASE_URL}`
    );

    console.log(
      `Discord Client ID: ${DISCORD_CLIENT_ID}`
    );

    console.log(
      `Callback: ${DISCORD_REDIRECT_URI}`
    );
  }
);
