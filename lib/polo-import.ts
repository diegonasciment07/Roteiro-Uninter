import { poloImportItemSchema } from "@/lib/validators";
import { normalizeNullableText, normalizePostalCode } from "@/lib/polo-validation";

export interface ParsedPoloImport {
  code: number;
  name: string;
  uf: string;
  city: string;
  neighborhood: string | null;
  street: string | null;
  postalCode: string | null;
  agent: string | null;
  manager: string | null;
  phone: string | null;
  email: string | null;
}

function normalizeImportSource(rawText: string) {
  const trimmed = rawText.trim();

  if (trimmed.startsWith("[")) {
    return trimmed;
  }

  const assignmentIndex = trimmed.indexOf("POLOS_RAW");
  if (assignmentIndex >= 0) {
    const arrayStart = trimmed.indexOf("[", assignmentIndex);
    const arrayEnd = trimmed.lastIndexOf("]");

    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return trimmed.slice(arrayStart, arrayEnd + 1);
    }
  }

  const fallbackStart = trimmed.indexOf("[");
  const fallbackEnd = trimmed.lastIndexOf("]");

  if (fallbackStart >= 0 && fallbackEnd > fallbackStart) {
    return trimmed.slice(fallbackStart, fallbackEnd + 1);
  }

  throw new Error("Nao foi possivel localizar um array valido para importacao.");
}

function emptyToNull(value: string | number | null | undefined) {
  return normalizeNullableText(value != null ? String(value) : null);
}

export function parsePoloImport(rawText: string) {
  const jsonText = normalizeImportSource(rawText);
  const parsed = JSON.parse(jsonText);

  if (!Array.isArray(parsed)) {
    throw new Error("O conteudo importado nao e um array.");
  }

  return parsed.map((item) => {
    const normalized = poloImportItemSchema.parse(item);

      const mapped: ParsedPoloImport = {
        code: normalized.cod,
        name: normalized.nome.trim(),
        uf: normalized.uf.trim().toUpperCase(),
        city: normalized.cidade.trim(),
        neighborhood: emptyToNull(normalized.bairro),
        street: emptyToNull(normalized.rua),
        postalCode: normalizePostalCode(emptyToNull(normalized.cep)),
        agent: emptyToNull(normalized.agente),
        manager: emptyToNull(normalized.gestor),
        phone: emptyToNull(normalized.tel),
        email: emptyToNull(normalized.email)?.toLowerCase() ?? null,
      };

    return mapped;
  });
}
