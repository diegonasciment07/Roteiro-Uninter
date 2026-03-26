"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  Database,
  FileSpreadsheet,
  KeyRound,
  Settings,
  UploadCloud,
  XCircle,
} from "lucide-react";

type ImportTab = "excel" | "json";

export default function ImportarPolosPage() {
  const [tab, setTab] = useState<ImportTab>("excel");
  const [rawText, setRawText] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetResult() { setMessage(null); setError(null); }

  async function handleExcelSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedFile) { setError("Selecione um arquivo Excel (.xlsx ou .xls)."); return; }
    setSubmitting(true);
    resetResult();
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/admin/import-polos/excel", {
        method: "POST",
        headers: token ? { "x-import-token": token } : {},
        body: formData,
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao importar.");
      setMessage(data.message ?? "Importação concluída.");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJsonSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    resetResult();
    try {
      const res = await fetch("/api/admin/import-polos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-import-token": token } : {}),
        },
        body: JSON.stringify({ rawText }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao importar.");
      setMessage(data.message ?? "Importação concluída.");
      setRawText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }

  return (
    <main className="admin-shell" style={{ alignItems: "flex-start", padding: "24px" }}>
      <div style={{ width: "min(780px, 100%)", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          border: "1px solid var(--border)", borderRadius: "var(--radius-xl)",
          background: "rgba(15,26,46,0.90)", backdropFilter: "blur(20px)",
          boxShadow: "var(--shadow)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "linear-gradient(135deg,var(--brand),#0f4ec0)",
              display: "grid", placeItems: "center", boxShadow: "var(--glow)",
            }}>
              <Database size={20} color="white" />
            </div>
            <div>
              <p className="eyebrow">Administração</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>
                Importar base de polos
              </h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/admin/polos" className="btn btn-ghost">
              <Settings size={14} /> Gerenciar
            </Link>
            <Link href="/" className="btn btn-secondary">
              <ArrowLeft size={14} /> Voltar
            </Link>
          </div>
        </div>

        {/* Token */}
        <div style={{
          padding: "16px 20px",
          border: "1px solid var(--border)", borderRadius: "var(--radius-xl)",
          background: "rgba(15,26,46,0.88)",
        }}>
          <label className="field-block">
            <span><KeyRound size={12} style={{ display: "inline", marginRight: 4 }} />Token de importação</span>
            <input
              className="field"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ADMIN_IMPORT_TOKEN (deixe vazio se não configurado)"
            />
          </label>
        </div>

        {/* Tabs de formato */}
        <div style={{
          border: "1px solid var(--border)", borderRadius: "var(--radius-xl)",
          background: "rgba(15,26,46,0.88)", overflow: "hidden",
        }}>
          {/* Tab headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            borderBottom: "1px solid var(--border)",
          }}>
            {([
              { id: "excel", icon: <FileSpreadsheet size={15} />, label: "Planilha Excel", sub: ".xlsx / .xls" },
              { id: "json", icon: <Code2 size={15} />, label: "Array JSON", sub: "colar código" },
            ] as { id: ImportTab; icon: React.ReactNode; label: string; sub: string }[]).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTab(t.id); resetResult(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "14px 20px", border: "none", cursor: "pointer",
                  background: tab === t.id ? "rgba(21,101,232,0.10)" : "rgba(7,13,26,0.40)",
                  color: tab === t.id ? "var(--text)" : "var(--muted)",
                  borderBottom: tab === t.id ? "2px solid var(--brand)" : "2px solid transparent",
                  transition: "all 150ms",
                }}
              >
                <span style={{ color: tab === t.id ? "var(--brand-h)" : "var(--muted-2)" }}>{t.icon}</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{t.label}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted-2)" }}>{t.sub}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Conteúdo da aba */}
          <div style={{ padding: "20px" }}>

            {/* Excel */}
            {tab === "excel" && (
              <form onSubmit={handleExcelSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: 0 }}>
                  Faça upload de uma planilha Excel com os polos. A primeira aba será usada.
                  Os cabeçalhos reconhecidos são:
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    ["cod / código", "obrigatório"],
                    ["nome / pap", "obrigatório"],
                    ["uf / estado", "obrigatório"],
                    ["cidade / município", "obrigatório"],
                    ["bairro", ""],
                    ["rua / endereço", ""],
                    ["agente", ""],
                    ["gestor / coordenador", ""],
                    ["tel / telefone / fone", ""],
                    ["email / e-mail", ""],
                  ].map(([col, note]) => (
                    <span key={col} style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: note ? "var(--brand-dim)" : "rgba(7,13,26,0.60)",
                      border: `1px solid ${note ? "rgba(21,101,232,0.24)" : "var(--border)"}`,
                      borderRadius: 99, padding: "3px 10px",
                      fontSize: "0.75rem", color: note ? "#93c5fd" : "var(--muted)",
                    }}>
                      <code style={{ fontFamily: "monospace" }}>{col}</code>
                      {note && <span style={{ opacity: 0.7 }}>• {note}</span>}
                    </span>
                  ))}
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? "var(--brand)" : selectedFile ? "var(--green)" : "var(--border-2)"}`,
                    borderRadius: "var(--radius-lg)",
                    padding: "32px 20px",
                    background: dragOver ? "var(--brand-dim)" : selectedFile ? "var(--green-dim)" : "rgba(7,13,26,0.40)",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                    cursor: "pointer", transition: "all 150ms",
                    textAlign: "center",
                  }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: selectedFile ? "var(--green-dim)" : "var(--brand-dim)",
                    border: `1px solid ${selectedFile ? "rgba(34,197,94,0.3)" : "rgba(21,101,232,0.24)"}`,
                    display: "grid", placeItems: "center",
                  }}>
                    <FileSpreadsheet size={22} color={selectedFile ? "var(--green)" : "var(--brand-h)"} />
                  </div>
                  {selectedFile ? (
                    <>
                      <p style={{ fontWeight: 700, color: "var(--text)" }}>{selectedFile.name}</p>
                      <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                        {(selectedFile.size / 1024).toFixed(1)} KB — clique para trocar
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontWeight: 600, color: "var(--text-2)" }}>
                        Arraste o arquivo aqui ou clique para selecionar
                      </p>
                      <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                        Aceita .xlsx e .xls (Excel)
                      </p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }}
                  />
                </div>

                {selectedFile && (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    style={{ alignSelf: "flex-start" }}
                  >
                    <XCircle size={14} /> Remover arquivo
                  </button>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-primary" type="submit" disabled={submitting || !selectedFile}>
                    {submitting ? "Importando…" : <><UploadCloud size={15} /> Importar planilha</>}
                  </button>
                </div>

                {message && (
                  <p className="notice notice-success" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle2 size={16} /> {message}
                  </p>
                )}
                {error && (
                  <p className="notice notice-error" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <XCircle size={16} />
                    <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
                  </p>
                )}
              </form>
            )}

            {/* JSON */}
            {tab === "json" && (
              <form onSubmit={handleJsonSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ color: "var(--muted)", fontSize: "0.84rem", margin: 0 }}>
                  Cole o array JavaScript da base de polos. Aceita tanto o array puro{" "}
                  <code style={{ background: "rgba(21,101,232,0.14)", padding: "1px 6px", borderRadius: 4, fontSize: "0.84em" }}>
                    [...]
                  </code>{" "}
                  quanto o trecho completo{" "}
                  <code style={{ background: "rgba(21,101,232,0.14)", padding: "1px 6px", borderRadius: 4, fontSize: "0.84em" }}>
                    const POLOS_RAW = [...]
                  </code>.
                </p>

                <label className="field-block">
                  <span>Conteúdo</span>
                  <textarea
                    className="field field-textarea import-textarea"
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder={'[\n  { "cod": 1, "nome": "PAP EXEMPLO - SP", "uf": "SP", "cidade": "São Paulo", ... },\n  ...\n]'}
                    required
                    style={{ minHeight: 340, fontFamily: "monospace", fontSize: "0.82rem" }}
                  />
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-primary" type="submit" disabled={submitting || !rawText.trim()}>
                    {submitting ? "Importando…" : <><UploadCloud size={15} /> Importar JSON</>}
                  </button>
                </div>

                {message && (
                  <p className="notice notice-success" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle2 size={16} /> {message}
                  </p>
                )}
                {error && (
                  <p className="notice notice-error" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <XCircle size={16} />
                    <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Dica: após importar */}
        <div style={{
          padding: "12px 16px", borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          background: "rgba(7,13,26,0.40)",
          display: "flex", alignItems: "center", gap: 10,
          fontSize: "0.82rem", color: "var(--muted)",
        }}>
          <Settings size={13} color="var(--brand-h)" style={{ flexShrink: 0 }} />
          Após importar, vá em{" "}
          <Link href="/admin/polos" style={{ color: "var(--brand-h)", fontWeight: 600 }}>
            Gerenciar Polos
          </Link>{" "}
          para corrigir endereços e geocodificar coordenadas salvas no banco.
        </div>
      </div>
    </main>
  );
}
