export const ADMIN_TOKEN_HEADER = "x-import-token";
export const ADMIN_TOKEN_STORAGE_KEY = "roteirosuninter:admin-token";

export function buildAdminTokenHeaders(token?: string | null) {
  const value = token?.trim();
  const headers: Record<string, string> = {};
  if (value) headers[ADMIN_TOKEN_HEADER] = value;
  return headers;
}

export function readStoredAdminToken() {
  if (typeof window === "undefined") return "";

  try {
    return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function storeAdminToken(token: string) {
  if (typeof window === "undefined") return;

  try {
    const value = token.trim();
    if (value) window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, value);
    else window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore localStorage failures.
  }
}

export function requireAdminToken(request: Request) {
  const expected = process.env.ADMIN_IMPORT_TOKEN?.trim();
  if (!expected) return null;

  const provided = request.headers.get(ADMIN_TOKEN_HEADER)?.trim();
  if (provided === expected) return null;

  return Response.json({ error: "Token administrativo invalido." }, { status: 401 });
}
