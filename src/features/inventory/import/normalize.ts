/** Funções puras de importação de estoque (sem dependências), testáveis isoladamente. */

export const TARGET_FIELDS = [
  { key: "stock_code", label: "Código de estoque", synonyms: ["codigo", "código", "cod", "id", "estoque", "ref", "referencia", "referência"] },
  { key: "brand", label: "Marca *", synonyms: ["marca", "fabricante", "montadora"] },
  { key: "model", label: "Modelo *", synonyms: ["modelo", "veiculo", "veículo", "carro"] },
  { key: "version", label: "Versão", synonyms: ["versao", "versão", "descricao modelo", "descrição"] },
  { key: "year", label: "Ano (fab/mod)", synonyms: ["ano", "ano/modelo", "ano fab/mod", "ano modelo", "anomodelo"] },
  { key: "km", label: "Km", synonyms: ["km", "quilometragem", "kilometragem", "hodometro", "hodômetro"] },
  { key: "color", label: "Cor", synonyms: ["cor"] },
  { key: "fuel", label: "Combustível", synonyms: ["combustivel", "combustível"] },
  { key: "transmission", label: "Câmbio", synonyms: ["cambio", "câmbio", "transmissao", "transmissão"] },
  { key: "plate", label: "Placa", synonyms: ["placa"] },
  { key: "sale_price", label: "Preço de venda", synonyms: ["preco", "preço", "valor", "preco venda", "preço de venda", "valor venda"] },
  { key: "purchase_price", label: "Preço de compra", synonyms: ["preco compra", "preço de compra", "custo", "valor compra"] },
  { key: "store", label: "Loja", synonyms: ["loja", "filial", "unidade"] },
  { key: "features", label: "Opcionais", synonyms: ["opcionais", "itens", "acessorios", "acessórios"] },
  { key: "description", label: "Observações", synonyms: ["obs", "observacoes", "observações", "descricao completa"] },
] as const;
export type TargetKey = (typeof TARGET_FIELDS)[number]["key"];
export type Mapping = Partial<Record<TargetKey, number>>; // campo → índice da coluna

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();

export function detectMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  // correspondência exata primeiro, depois "contém"
  for (const pass of ["exact", "contains"] as const) {
    for (const f of TARGET_FIELDS) {
      if (m[f.key] !== undefined) continue;
      const idx = headers.findIndex((h, i) => {
        if (used.has(i)) return false;
        const nh = norm(h);
        return f.synonyms.some((s) => (pass === "exact" ? nh === norm(s) : nh.includes(norm(s))));
      });
      if (idx >= 0) { m[f.key] = idx; used.add(idx); }
    }
  }
  return m;
}

export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  const s = String(v ?? "").replace(/[R$\s]/g, "");
  if (!s) return null;
  const cleaned = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/[.,](?=\d{3}(\D|$))/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseYears(v: unknown): { yf: number | null; ym: number | null } {
  const years = String(v ?? "").match(/\b(19|20)\d{2}\b/g)?.map(Number) ?? [];
  if (!years.length) return { yf: null, ym: null };
  return { yf: years[0], ym: years[1] ?? years[0] };
}

export function parseKm(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

export function normTransmission(v: unknown): string | null {
  const s = norm(String(v ?? ""));
  if (!s) return null;
  if (/automatiz|dualog|i-motion|imotion|easytronic/.test(s)) return "automatizado";
  if (/cvt/.test(s)) return "cvt";
  if (/aut/.test(s)) return "automatico";
  if (/man|mec/.test(s)) return "manual";
  return null;
}

export function normFuel(v: unknown): string | null {
  const s = norm(String(v ?? ""));
  if (!s) return null;
  if (/flex|alc.*gas|gas.*alc/.test(s)) return "flex";
  if (/hibr/.test(s)) return "híbrido";
  if (/eletr/.test(s)) return "elétrico";
  if (/diesel/.test(s)) return "diesel";
  if (/gasol/.test(s)) return "gasolina";
  if (/etanol|alcool/.test(s)) return "etanol";
  return s.slice(0, 20);
}

export type ImportRow = {
  line: number;
  data: {
    stock_code: string | null; brand: string; model: string; version: string | null; year_manufacture: number | null; year_model: number | null;
    km: number | null; color: string | null; fuel: string | null; transmission: string | null; plate: string | null;
    sale_price: number | null; purchase_price: number | null; store: string | null; description: string | null; features: string[];
  } | null;
  errors: string[];
};

const txt = (v: unknown, max = 120) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };

export function buildRow(cells: unknown[], m: Mapping, line: number): ImportRow {
  const get = (k: TargetKey) => (m[k] === undefined ? undefined : cells[m[k]!]);
  const errors: string[] = [];
  const brand = txt(get("brand"), 60);
  const model = txt(get("model"), 80);
  if (!brand) errors.push("sem marca");
  if (!model) errors.push("sem modelo");
  const { yf, ym } = parseYears(get("year"));
  if (get("year") !== undefined && txt(get("year")) && !ym) errors.push("ano inválido");
  const sale = parseMoney(get("sale_price"));
  if (get("sale_price") !== undefined && txt(get("sale_price")) && sale === null) errors.push("preço inválido");
  if (errors.length || !brand || !model) return { line, data: null, errors };
  const plate = txt(get("plate"), 10)?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
  return {
    line, errors,
    data: {
      stock_code: txt(get("stock_code"), 20), brand, model, version: txt(get("version")), year_manufacture: yf, year_model: ym,
      km: parseKm(get("km")), color: txt(get("color"), 40), fuel: normFuel(get("fuel")), transmission: normTransmission(get("transmission")),
      plate, sale_price: sale, purchase_price: parseMoney(get("purchase_price")), store: txt(get("store"), 60), description: txt(get("description"), 4000),
      features: String(get("features") ?? "").split(/[,;\n|]/).map((f) => f.trim()).filter(Boolean).slice(0, 60),
    },
  };
}

const BODY: [string, RegExp][] = [
  ["suv", /^(compass|renegade|kicks|creta|tracker|hr-?v|ecosport|tucson|ix-?35|duster|2008|3008|t-?cross|nivus|taos|tiguan|sportage|sorento|santa ?f[eé]|rav-?4|tr-?4|pajero|outlander|asx|equinox|aircross|c4 cactus|pulse|fastback|q3|q5|x1|x3|evoque|discovery|cherokee|corolla cross|commander|song|tera|sw4|range rover|freelander|countryman|captur|territory|haval|tiggo)/i],
  ["picape", /^(amarok|saveiro|strada|toro|hilux|ranger|frontier|montana|rampage|ram|s-?10|l200|f-?250|hoggar|oroch|maverick)/i],
  ["sedan", /^(jetta|virtus|voyage|cronos|siena|grand siena|corolla$|civic|city|versa|sentra|prisma|cruze|onix plus|hb-?20s|logan|fusion|focus sed|fiesta sed|classic|cobalt|c-?180|c-?200|a4|320i|vectra|omega)/i],
  ["minivan", /^(spin|zafira|doblo|idea|meriva|picasso|xsara|scenic|spacefox|weekend|variant|livina)/i],
  ["utilitario", /^(fiorino|jumpy|expert|transit|master|ducato|sprinter|kangoo|daily)/i],
];
/** Carroceria provável pelo nome do modelo (o usuário pode corrigir na ficha). */
export function guessBodyType(model: string): string | null {
  const m = model.trim();
  for (const [body, re] of BODY) if (re.test(m)) return body;
  return m ? "hatch" : null;
}
