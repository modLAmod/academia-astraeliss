const { Client, GatewayIntentBits } = require("discord.js");
const http = require("http");
 
const BOT_TOKEN  = process.env.BOT_TOKEN;
const SECRET_KEY = process.env.SECRET_KEY;
const PORT       = process.env.PORT || 3000;
 
const GUILD_ID = "1505865987478650940";
 
// Roles que se ELIMINAN al aprobar la ficha
const ROLES_QUITAR = [
  "1505931430176231585",
  "1505931614600040640"
];
 
// Roles que se AÑADEN al aprobar cualquier ficha
const ROLES_PONER = [
  "1505931434282451096",
  "1505931432420446359"
];
 
// Roles de casas (alumnos)
const ROLES_CASAS = {
  "Caraxe":    "1505866683548438538",
  "Elenarë":   "1505866764179738656",
  "Varnëthir": "1505866767187050586"
};
 
// Rol de profesor
const ROL_PROFESOR = "1505930912146260078";
 
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
 
client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});
 
client.login(BOT_TOKEN);
 
async function getMember(discordId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  return await guild.members.fetch(discordId);
}
 
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
 
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method !== "POST") { res.writeHead(404); res.end(JSON.stringify({ error: "No encontrado" })); return; }
 
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", async () => {
    try {
      const data = JSON.parse(body);
      const { discordId, secret } = data;
 
      if (secret !== SECRET_KEY) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: "Clave secreta incorrecta" }));
        return;
      }
 
      if (!discordId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Falta discordId" }));
        return;
      }
 
      // ── ENDPOINT: /aprobar-ficha ──────────────────────────────
      if (req.url === "/aprobar-ficha") {
        const member = await getMember(discordId);
        for (const rolId of ROLES_QUITAR) {
          if (member.roles.cache.has(rolId)) await member.roles.remove(rolId);
        }
        for (const rolId of ROLES_PONER) {
          await member.roles.add(rolId);
        }
        console.log(`✅ Ficha aprobada — roles actualizados para ${member.user.username}`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, usuario: member.user.username }));
 
      // ── ENDPOINT: /asignar-casa ───────────────────────────────
      } else if (req.url === "/asignar-casa") {
        const { casa } = data;
        const rolCasa = ROLES_CASAS[casa];
        if (!rolCasa) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `Casa desconocida: ${casa}` }));
          return;
        }
        const member = await getMember(discordId);
        await member.roles.add(rolCasa);
        console.log(`🏠 Casa ${casa} asignada a ${member.user.username}`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, usuario: member.user.username, casa }));
 
      // ── ENDPOINT: /asignar-profesor ───────────────────────────
      } else if (req.url === "/asignar-profesor") {
        const member = await getMember(discordId);
        await member.roles.add(ROL_PROFESOR);
        console.log(`📚 Rol profesor asignado a ${member.user.username}`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, usuario: member.user.username }));
 
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Ruta no encontrada" }));
      }
 
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
