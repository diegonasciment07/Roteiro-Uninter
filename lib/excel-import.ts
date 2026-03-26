import * as XLSX from "xlsx";
import type { ParsedPoloImport } from "@/lib/polo-import";

/**
 * Map de variações de cabeçalho → campo interno.
 * As chaves já estão no formato normalizado (sem acentos, sem pontuação, minúsculas).
 * A planilha "Carteira de Polos" da UNINTER usa cabeçalhos como:
 *   CÓD. LOCAL, NOME DO CA, UF, RUA, BAIRRO, CIDADE, TELEFONE, CELULAR,
 *   EMAIL, AGENTE NOME, GESTOR, etc.
 */
const HEADER_MAP: Record<string, keyof RawRow> = {
  // Código
  "cod": "cod", "codigo": "cod", "code": "cod",
  "cod local": "cod", "codigo local": "cod",
  "cdlocal": "cod", "cd local": "cod",
  "num": "cod", "numero": "cod", "número": "cod",

  // Nome do polo
  "nome": "nome", "pap": "nome", "name": "nome",
  "nome do ca": "nome", "nome ca": "nome",
  "nome polo": "nome", "nomepolo": "nome",
  "denominacao": "nome", "denominação": "nome",
  "descricao": "nome", "descrição": "nome",

  // UF
  "uf": "uf", "estado": "uf", "state": "uf",
  "uf 1": "uf", "uf1": "uf",

  // Cidade
  "cidade": "cidade", "municipio": "cidade",
  "city": "cidade",

  // Bairro
  "bairro": "bairro", "neighborhood": "bairro", "distrito": "bairro",

  // Rua / Endereço
  "rua": "rua", "endereco": "rua", "logradouro": "rua", "street": "rua",
  "rua correspondencia": "rua", "endereco correspondencia": "rua",
  "logradouro correspondencia": "rua",

  // CEP
  "cep": "cep", "codigo postal": "cep", "codigopostal": "cep",
  "cep correspondencia": "cep", "postal code": "cep", "zip": "cep",

  // Agente
  "agente": "agente", "agent": "agente",
  "agente nome": "agente", "nome agente": "agente",
  "agente responsavel": "agente", "responsavel": "agente",

  // Gestor / Coordenador
  "gestor": "gestor", "manager": "gestor",
  "coordenador": "gestor", "gerente": "gestor",
  "gestor polo": "gestor", "nome gestor": "gestor",

  // Telefone (prioriza TELEFONE sobre CELULAR — a segunda ocorrência não sobrescreve)
  "tel": "tel", "telefone": "tel", "fone": "tel",
  "phone": "tel", "celular": "tel", "cel": "tel",
  "telefone responsavel recebimento": "tel",
  "telfeone responsavel recebimento": "tel",

  // E-mail
  "email": "email", "e mail": "email", "e-mail": "email",
  "agente email": "email",
};

interface RawRow {
  cod?: unknown;
  nome?: unknown;
  uf?: unknown;
  cidade?: unknown;
  bairro?: unknown;
  rua?: unknown;
  cep?: unknown;
  agente?: unknown;
  gestor?: unknown;
  tel?: unknown;
  email?: unknown;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .replace(/[^a-z0-9\s]/g, " ")    // substitui pontuação (pontos, hífen, _) por espaço
    .replace(/\s+/g, " ")            // colapsa espaços múltiplos
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
    // Só mapeia se o campo interno ainda não foi mapeado (evita sobrescrever
    // com colunas secundárias: ex. UF_1 não sobrescreve UF, CELULAR não sobrescreve TELEFONE)
    if (mapped && !Object.values(colMap).includes(mapped)) {
      colMap[key] = mapped;
    }
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
      postalCode: emptyToNull(mapped.cep),
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
