// Relógio do Copiloto: a cada 15 minutos chama o app para ver se há rotina da IA para rodar
// (SDR a cada 15 min; noite e Follow-up de hora em hora, sem duplicar: o app reserva o período).
// Só chama das 06h à meia-noite (horário de Brasília); de madrugada não há trabalho de IA.
const URL_ = process.env.TICK_URL || "http://copiloto-app:3000/api/jobs/tick";
const TOKEN = process.env.JOBS_TOKEN || "";
const FROM = Number(process.env.WINDOW_FROM ?? 6);
const TO = Number(process.env.WINDOW_TO ?? 24);
if (TOKEN.length < 32) { console.error("JOBS_TOKEN ausente ou curto demais"); process.exit(1); }

const hourSP = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date())) % 24;
const stamp = () => new Date().toISOString();

async function tick() {
  const h = hourSP();
  const eff = h === 0 ? 24 : h;
  if (eff < FROM || eff > TO) { console.log(stamp(), `hora ${h}: fora da janela ${FROM}-${TO}, não chamo`); return; }
  try {
    const r = await fetch(URL_, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(60_000) });
    console.log(stamp(), `hora ${h}: tick ${r.status}`, (await r.text()).slice(0, 300));
  } catch (e) {
    console.error(stamp(), "tick falhou:", e instanceof Error ? e.message : e);
  }
}

function loop() {
  const now = new Date();
  const wait = (15 - (now.getMinutes() % 15)) * 60_000 - now.getSeconds() * 1000 + 30_000; // próximo quarto de hora + 30 s
  setTimeout(async () => { await tick(); loop(); }, wait);
  console.log(stamp(), `relógio ligado: janela ${FROM}h-${TO}h, próxima checagem em ${Math.round(wait / 60000)} min (a cada 15 min)`);
}
loop();
