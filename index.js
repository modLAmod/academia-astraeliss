const { Client, GatewayIntentBits } = require("discord.js");
const http = require("http");

// ============================================================
//  CONFIGURACIÓN (los valores reales van en Railway como variables de entorno)
// ============================================================
const BOT_TOKEN  = process.env.BOT_TOKEN;
const SECRET_KEY = process.env.SECRET_KEY;   // Una contraseña que tú inventas, p.ej. "reinoarcano2024"
const PORT       = process.env.PORT || 3000;

const GUILD_ID = "1505865987478650940";

const ROLES_QUITAR = [
  "1505931430176231585",
  "1505931614600040640"
];

const ROLES_PONER = [
  "1505931434282451096",
  "1505931432420446359"
];

// ============================================================
//  CLIENTE DE DISCORD
// ============================================================
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.login(BOT_TOKEN);

// ============================================================
//  SERVIDOR HTTP — recibe las peticiones desde la web
// ============================================================
const server = http.createServer(async (req, res) => {

  // CORS: permite peticiones desde cualquier origen (tu web)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Solo aceptamos POST a /aprobar-ficha
  if (req.method !== "POST" || req.url !== "/aprobar-ficha") {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Ruta no encontrada" }));
    return;
  }

  // Leer el body
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      const { discordId, secret } = data;

      // 1. Verificar la clave secreta
      if (secret !== SECRET_KEY) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: "Clave secreta incorrecta" }));
        return;
      }

      // 2. Verificar que nos pasaron un ID
      if (!discordId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Falta discordId" }));
        return;
      }

      // 3. Obtener el servidor y el miembro
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(discordId);

      if (!member) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Usuario no encontrado en el servidor" }));
        return;
      }

      // 4. Quitar roles viejos (solo si los tiene)
      for (const rolId of ROLES_QUITAR) {
        if (member.roles.cache.has(rolId)) {
          await member.roles.remove(rolId);
          console.log(`➖ Rol ${rolId} eliminado de ${member.user.username}`);
        }
      }

      // 5. Añadir roles nuevos
      for (const rolId of ROLES_PONER) {
        await member.roles.add(rolId);
        console.log(`➕ Rol ${rolId} añadido a ${member.user.username}`);
      }

      console.log(`✅ Roles actualizados para ${member.user.username} (${discordId})`);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, usuario: member.user.username }));

    } catch (e) {
      console.error("❌ Error:", e.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`🌐 Servidor HTTP escuchando en puerto ${PORT}`);
});
