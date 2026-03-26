"use client";

import Link from "next/link";
import { useState } from "react";

export default function ImportarPolosPage() {
  const [rawText, setRawText] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/import-polos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-import-token": token } : {}),
        },
        body: JSON.stringify({ rawText }),
      });

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Nao foi possivel importar os polos.");
      }

      setMessage(data.message ?? "Importacao concluida.");
      setRawText("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Falha ao importar os polos.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-shell">
      <section className="admin-card">
        <div className="admin-header">
          <div>
            <p className="eyebrow">Administracao</p>
            <h1>Importar polos para producao</h1>
          </div>
          <Link href="/" className="btn btn-secondary">
            Voltar ao planejador
          </Link>
        </div>

        <p className="admin-copy">
          Cole aqui o array da base oficial de polos. O parser aceita tanto o
          array puro quanto o trecho completo com <code>const POLOS_RAW = [...]</code>.
        </p>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="field-block">
            <span>Token de importacao</span>
            <input
              className="field"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Use o mesmo valor de ADMIN_IMPORT_TOKEN, se configurado"
            />
          </label>

          <label className="field-block">
            <span>Conteudo da lista de polos</span>
            <textarea
              className="field field-textarea import-textarea"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder='Cole aqui o array ou o trecho "const POLOS_RAW = [...]"'
              required
            />
          </label>

          <div className="admin-actions">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Importando..." : "Importar polos"}
            </button>
          </div>

          {message ? <p className="notice notice-success">{message}</p> : null}
          {error ? <p className="notice notice-error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
