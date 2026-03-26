import * as XLSX from "xlsx";
import type { ParsedPoloImport } from "@/lib/polo-import";

/** Map de variações de cabeçalho → campo interno */
const HEADER_MAP: Record<string, keyof RawRow> = {
  cod: "cod", código: "cod", codigo: "cod", code: "cod", "cód": "cod",
  nome: "nome", pap: "nome", name: "nome",
  uf: "uf", estado: "uf",
  cidade: "cidade", municipio: "cidade", município: "cidade", city: "cidade",
  bairro: "bairro", neighborhood: "bairro",
  rua: "rua", endereço: "rua", endereco: "rua", logradouro: "rua", street: "rua",
  agente: "agente", agent: "agente",
  gestor: "gestor", manager: "gestor", coordenador: "gestor",
  tel: "tel", telefone: "tel", fone: "tel", phone: "tel", celular: "tel",
  email: "email", "e-mail": "email",
};

interface RawRow {
  cod?: unknown;
  nome?: unknown;
  uf?: unknown;
  cidade?: unknown;
  bairro?: unknown;
  rua?: unknown;
  agente?: unknown;
  gestor?: unknown;
  tel?: unknown;
  email?: unknown;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function emptyToNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length > 0 && s !== "0" ? s : null;
}

function toStr(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

export function parseExcelImport(buffer: ArrayBuffer): ParsedPoloImport[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Arquivo Excel sem planilhas.");

  const sheet = workbook.Sheets[sheetName];
  // raw: true para pegar os valores originais sem conversão automática
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    blankrows: false,
  });

  if (!rows.length) throw new Error("Planilha vazia ou sem dados.");

  // Mapear cabeçalhos da primeira linha
  const firstRow = rows[0];
  const colMap: Record<string, keyof RawRow> = {};

  for (const key of Object.keys(firstRow)) {
    const normalized = normalizeHeader(key);
    const mapped = HEADER_MAP[normalized];
    if (mapped) colMap[key] = mapped;
  }

  const requiredFields: Array<keyof RawRow> = ["cod", "nome", "uf", "cidade"];
  const foundFields = new Set(Object.values(colMap));
  const missing = requiredFields.filter((f) => !foundFields.has(f));

  if (missing.length > 0) {
    throw new Error(
      `Colunas obrigatórias não encontradas: ${missing.join(", ")}.\n` +
      `Colunas detectadas: ${Object.keys(firstRow).join(", ")}`
    );
  }

  const result: ParsedPoloImport[] = [];

  for (const row of rows) {
    // Mapear para estrutura interna
    const mapped: RawRow = {};
    for (const [excelCol, internalKey] of Object.entries(colMap)) {
      mapped[internalKey] = row[excelCol];
    }

    const code = Number(mapped.cod);
    if (!Number.isFinite(code) || code <= 0) continue; // pula linhas inválidas

    const name = toStr(mapped.nome);
    const uf = toStr(mapped.uf).toUpperCase().slice(0, 2);
    const city = toStr(mapped.cidade);

    if (!name || !uf || !city) continue;

    result.push({
      code,
      name,
      uf,
      city,
      neighborhood: emptyToNull(mapped.bairro),
      street: emptyToNull(mapped.rua),
      agent: emptyToNull(mapped.agente),
      manager: emptyToNull(mapped.gestor),
      phone: emptyToNull(mapped.tel),
      email: emptyToNull(mapped.email),
    });
  }

  if (result.length === 0) {
    throw new Error("Nenhum polo válido encontrado no arquivo Excel.");
  }

  return result;
}
