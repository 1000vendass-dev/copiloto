/**
 * Interpreta buscas livres de estoque em filtros estruturados (sem IA).
 * Ex.: "onix até 80 mil" → { terms:["onix"], priceMax:80000 }
 *      "suv automático 2020 a 2023 até 120.000" → { bodyType:"suv", transmission:"automatico", yearMin:2020, yearMax:2023, priceMax:120000 }
 */
export type VehicleQuery = {
  terms: string[];
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  kmMax?: number;
  transmission?: "automatico" | "manual";
  bodyType?: string;
  fuel?: string;
  category?: "carro" | "moto";
};

const BODY: Record<string, string> = {
  suv: "suv", suvs: "suv", hatch: "hatch", hatchs: "hatch", sedan: "sedan", "sedã": "sedan", seda: "sedan", sedas: "sedan",
  picape: "picape", pickup: "picape", "pick-up": "picape", caminhonete: "picape", minivan: "minivan", perua: "minivan",
  utilitario: "utilitario", "utilitário": "utilitario", furgao: "utilitario", "furgão": "utilitario",
};
const FUEL: Record<string, string> = { flex: "flex", diesel: "diesel", gasolina: "gasolina", hibrido: "híbrido", "híbrido": "híbrido", eletrico: "elétrico", "elétrico": "elétrico" };
const STOP = new Set(["de", "do", "da", "dos", "das", "e", "com", "um", "uma", "o", "a", "os", "as", "carro", "carros", "tem", "quais", "qual", "cadê", "cade", "disponivel", "disponiveis", "disponível", "disponíveis", "no", "na", "em", "estoque", "ano", "reais", "r$", "por", "pra", "para", "me", "mostra", "mostre", "busca", "buscar", "quero", "tenho", "ate", "até"]);

function num(raw: string, unit?: string): number {
  let n = Number(raw.replace(/\./g, "").replace(",", "."));
  if (unit && /^(mil|k)$/i.test(unit)) n *= 1000;
  else if (n > 0 && n < 1000 && !unit) n *= 1000; // "até 80" → 80 mil
  return n;
}

export function parseVehicleQuery(input: string): VehicleQuery {
  let s = ` ${input.toLowerCase().normalize("NFC")} `;
  const q: VehicleQuery = { terms: [] };
  const money = String.raw`r?\$?\s*([\d.,]+)\s*(mil|k)?`;

  const between = s.match(new RegExp(String.raw`entre\s+${money}\s+e\s+${money}`));
  if (between) { q.priceMin = num(between[1], between[2]); q.priceMax = num(between[3], between[4]); s = s.replace(between[0], " "); }

  const yearMaxM = s.match(/(?:até|ate)\s+(19[89]\d|20[0-4]\d)\b(?!\s*(?:mil|k|km|\.))/);
  if (yearMaxM) { q.yearMax = +yearMaxM[1]; s = s.replace(yearMaxM[0], " "); }

  const max = s.match(new RegExp(String.raw`(?:até|ate|abaixo de|menos de|no máximo|no maximo|max)\s+${money}`));
  if (max) { q.priceMax = num(max[1], max[2]); s = s.replace(max[0], " "); }

  const min = s.match(new RegExp(String.raw`(?:acima de|mais de|a partir de|mínimo|minimo)\s+${money}`));
  if (min) { q.priceMin = num(min[1], min[2]); s = s.replace(min[0], " "); }

  const kmM = s.match(/(?:até|ate|menos de)?\s*([\d.]+)\s*(mil)?\s*km/);
  if (kmM) { q.kmMax = num(kmM[1], kmM[2] ?? "x"); s = s.replace(kmM[0], " "); }

  const yearRange = s.match(/\b(19[89]\d|20[0-4]\d)\s*(?:a|até|ate|-)\s*(19[89]\d|20[0-4]\d)\b/);
  if (yearRange) { q.yearMin = +yearRange[1]; q.yearMax = +yearRange[2]; s = s.replace(yearRange[0], " "); }
  const yearFrom = s.match(/(?:a partir de|acima de|depois de)\s+(19[89]\d|20[0-4]\d)\b/);
  if (yearFrom) { q.yearMin = +yearFrom[1]; s = s.replace(yearFrom[0], " "); }
  const year = s.match(/\b(19[89]\d|20[0-4]\d)\b/);
  if (year && q.yearMin === undefined && q.yearMax === undefined) { q.yearMin = +year[1]; q.yearMax = +year[1]; s = s.replace(year[0], " "); }

  if (/\bautom[aá]tic[oa]s?\b|\bautom\b|\bcvt\b/.test(s)) { q.transmission = "automatico"; s = s.replace(/\bautom[aá]tic[oa]s?\b|\bautom\b|\bcvt\b/g, " "); }
  else if (/\bmanua(l|is)\b|\bmec[aâ]nic[oa]\b/.test(s)) { q.transmission = "manual"; s = s.replace(/\bmanua(l|is)\b|\bmec[aâ]nic[oa]\b/g, " "); }
  if (/\bmotos?\b/.test(s)) { q.category = "moto"; s = s.replace(/\bmotos?\b/g, " "); }

  for (const word of s.split(/\s+/).filter(Boolean)) {
    const w = word.replace(/[?!,;]/g, "");
    if (!w) continue;
    if (BODY[w]) q.bodyType = BODY[w];
    else if (FUEL[w]) q.fuel = FUEL[w];
    else if (!STOP.has(w) && !/^\d+$/.test(w) && w !== "mil") q.terms.push(w);
  }
  return q;
}

/** Descrição legível dos filtros aplicados (mostrada acima dos resultados). */
export function describeQuery(q: VehicleQuery): string[] {
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const out: string[] = [];
  if (q.terms.length) out.push(`“${q.terms.join(" ")}”`);
  if (q.bodyType) out.push(q.bodyType.toUpperCase() === "SUV" ? "SUV" : q.bodyType);
  if (q.transmission) out.push(q.transmission === "automatico" ? "automático" : "manual");
  if (q.fuel) out.push(q.fuel);
  if (q.category) out.push(q.category);
  if (q.yearMin && q.yearMax && q.yearMin === q.yearMax) out.push(`ano ${q.yearMin}`);
  else {
    if (q.yearMin) out.push(`a partir de ${q.yearMin}`);
    if (q.yearMax) out.push(`até ${q.yearMax}`);
  }
  if (q.priceMin) out.push(`acima de ${brl(q.priceMin)}`);
  if (q.priceMax) out.push(`até ${brl(q.priceMax)}`);
  if (q.kmMax) out.push(`até ${q.kmMax.toLocaleString("pt-BR")} km`);
  return out;
}
