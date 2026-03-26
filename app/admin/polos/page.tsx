"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Filter,
  Globe,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Save,
  Search,
  X,
  XCircle,
} from "lucide-react";

import { clearGeoCache, geocodePoloAddress, setGeoCache, type GeocodePrecision } from "@/lib/geocode";
import type { PoloRecord } from "@/lib/types";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA",
  "MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN",
  "RO","RR","RS","SC","SE","SP","TO",
];

const UF_NAMES: Record<string, string> = {
  AC:"Acre",AL:"Alagoas",AM:"Amazonas",AP:"Amapá",BA:"Bahia",CE:"Ceará",
  DF:"Distrito Federal",ES:"Espírito Santo",GO:"Goiás",MA:"Maranhão",
  MG:"Minas Gerais",MS:"Mato Grosso do Sul",MT:"Mato Grosso",PA:"Pará",
  PB:"Paraíba",PE:"Pernambuco",PI:"Piauí",PR:"Paraná",RJ:"Rio de Janeiro",
  RN:"Rio Grande do Norte",RO:"Rondônia",RR:"Roraima",RS:"Rio Grande do Sul",
  SC:"Santa Catarina",SE:"Sergipe",SP:"São Paulo",TO:"Tocantins",
};

const PRECISION_CONFIG: Record<GeocodePrecision, { label: string; color: string; bg: string; border: string }> = {
  address:      { label: "Endereço",  color: "#86efac", bg: "rgba(34,197,94,0.14)",  border: "rgba(34,197,94,0.28)" },
  street:       { label: "Rua",       color: "#93c5fd", bg: "rgba(21,101,232,0.14)", border: "rgba(21,101,232,0.28)" },
  neighborhood: { label: "Bairro",    color: "#fde68a", bg: "rgba(245,184,0,0.14)",  border: "rgba(245,184,0,0.28)" },
  city:         { label: "Cidade",    color: "#fca5a5", bg: "rgba(240,64,64,0.14)",  border: "rgba(240,64,64,0.28)" },
};

interface EditDraft {
  id: string;
  name: string;
  uf: string;
  city: string;
  neighborhood: string;
  street: string;
  postalCode: string;
  phone: string;
  email: string;
  latitude: string;
  longitude: string;
}

export default function PolosAdminPage() {
  const [polos, setPolos] = useState<PoloRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uf, setUf] = useState("");
  const [q, setQ] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [forceReGeocode, setForceReGeocode] = useState(false);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [geocodingId, setGeocodingId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, found: 0 });
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const batchCancelRef = useRef(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  };

  const loadPolos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (uf) params.set("uf", uf);
      if (q.trim()) params.set("q", q.trim());
      if (missingOnly) params.set("missing", "1");
      const res = await fetch(`/api/admin/polos?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar polos.");
      setPolos(await res.json());
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro ao carregar.", false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadPolos(); }, [uf, missingOnly]);

  function openEdit(polo: PoloRecord) {
    setEditing({
      id: polo.id,
      name: polo.name,
      uf: polo.uf,
      city: polo.city,
      neighborhood: polo.neighborhood ?? "",
      street: polo.street ?? "",
      postalCode: polo.postalCode ?? "",
      phone: polo.phone ?? "",
      email: polo.email ?? "",
      latitude: polo.latitude != null ? String(polo.latitude) : "",
      longitude: polo.longitude != null ? String(polo.longitude) : "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const lat = editing.latitude.trim() ? parseFloat(editing.latitude) : null;
      const lng = editing.longitude.trim() ? parseFloat(editing.longitude) : null;

      const res = await fetch(`/api/admin/polos/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editing.name,
          uf: editing.uf.toUpperCase(),
          city: editing.city,
          neighborhood: editing.neighborhood || null,
          street: editing.street || null,
          postalCode: editing.postalCode || null,
          phone: editing.phone || null,
          email: editing.email || null,
          latitude: lat && !isNaN(lat) ? lat : null,
          longitude: lng && !isNaN(lng) ? lng : null,
          geocodePrecision: null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao salvar.");
      const updated: PoloRecord = await res.json();
      setPolos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      // Invalida cache local para este polo
      const polo = polos.find((p) => p.id === updated.id);
      if (polo) clearGeoCache(polo.code);
      setEditing(null);
      showToast("Polo atualizado. Geocodifique para atualizar o pin no mapa.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro ao salvar.", false);
    } finally {
      setSaving(false);
    }
  }

  async function geocodeAndSave(polo: PoloRecord, force = false): Promise<boolean> {
    if (force) clearGeoCache(polo.code);

    const result = await geocodePoloAddress(polo);
    if (!result) return false;

    const res = await fetch(`/api/admin/polos/${polo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: result.lat,
        longitude: result.lon,
        geocodePrecision: result.precision,
      }),
    });
    if (!res.ok) return false;

    setGeoCache(polo.code, result);
    const updated: PoloRecord = await res.json();
    setPolos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    return true;
  }

  async function geocodeOne(polo: PoloRecord) {
    setGeocodingId(polo.id);
    try {
      const ok = await geocodeAndSave(polo, forceReGeocode);
      if (ok) showToast(`Pin atualizado: ${polo.name}`);
      else showToast(`Endereço não encontrado para ${polo.name}.`, false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro.", false);
    } finally {
      setGeocodingId(null);
    }
  }

  async function geocodeEditDraft() {
    if (!editing) return;
    setGeocodingId(editing.id);
    try {
      const result = await geocodePoloAddress({
        street: editing.street || null,
        neighborhood: editing.neighborhood || null,
        postalCode: editing.postalCode || null,
        city: editing.city,
        uf: editing.uf,
      });
      if (!result) { showToast("Endereço não encontrado.", false); return; }
      const cfg = PRECISION_CONFIG[result.precision];
      setEditing((e) => e ? { ...e, latitude: String(result.lat), longitude: String(result.lon) } : e);
      showToast(`Coordenadas preenchidas (precisão: ${cfg.label}) — salve para persistir.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro.", false);
    } finally {
      setGeocodingId(null);
    }
  }

  async function startBatchGeocode() {
    const targets = forceReGeocode
      ? polos
      : polos.filter((p) => p.latitude == null || p.longitude == null);

    if (!targets.length) {
      showToast(forceReGeocode ? "Nenhum polo na lista." : "Todos já têm coordenadas. Ative 'Forçar re-geocodificação'.");
      return;
    }

    setBatchRunning(true);
    batchCancelRef.current = false;
    setBatchProgress({ done: 0, total: targets.length, found: 0 });

    let found = 0;
    for (let i = 0; i < targets.length; i++) {
      if (batchCancelRef.current) break;
      const polo = targets[i];
      try {
        const ok = await geocodeAndSave(polo, forceReGeocode);
        if (ok) found++;
      } catch { /* continue */ }
      setBatchProgress({ done: i + 1, total: targets.length, found });
      // Respeita rate limit do Nominatim: 1 req/s
      await new Promise((r) => setTimeout(r, 1150));
    }

    setBatchRunning(false);
    showToast(`Lote concluído: ${found}/${targets.length} geocodificados.`);
  }

  const missingCount = polos.filter((p) => p.latitude == null || p.longitude == null).length;
  const lowPrecision = polos.filter((p) => p.geocodePrecision === "city" || p.geocodePrecision === "neighborhood").length;

  return (
    <main className="admin-shell" style={{ alignItems: "flex-start", padding: "20px 24px" }}>
      <div style={{ width: "100%", maxWidth: 1280, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px",
          border: "1px solid var(--border)", borderRadius: "var(--radius-xl)",
          background: "rgba(15,26,46,0.90)", backdropFilter: "blur(20px)",
          boxShadow: "var(--shadow)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,var(--brand),#0f4ec0)",
              display: "grid", placeItems: "center", boxShadow: "var(--glow)",
            }}>
              <MapPin size={20} color="white" />
            </div>
            <div>
              <p className="eyebrow">Administração</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>
                Gerenciar Polos & Geocodificação
              </h1>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/admin/importar" className="btn btn-ghost"><RefreshCw size={14} /> Importar</Link>
            <Link href="/" className="btn btn-secondary"><ArrowLeft size={14} /> Voltar</Link>
          </div>
        </div>

        {/* Legenda de precisão */}
        <div style={{
          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
          padding: "12px 18px",
          border: "1px solid var(--border)", borderRadius: "var(--radius-xl)",
          background: "rgba(15,26,46,0.80)",
          fontSize: "0.78rem",
        }}>
          <span style={{ color: "var(--muted)", fontWeight: 600, marginRight: 4 }}>Precisão do pin:</span>
          {(Object.entries(PRECISION_CONFIG) as [GeocodePrecision, typeof PRECISION_CONFIG[GeocodePrecision]][]).map(([key, cfg]) => (
            <span key={key} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: cfg.bg, border: `1px solid ${cfg.border}`,
              borderRadius: 99, padding: "3px 10px", color: cfg.color, fontWeight: 700,
            }}>
              <MapPin size={9} /> {cfg.label}
            </span>
          ))}
          <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
          <span style={{ color: "var(--muted)" }}>
            O sistema tenta geocodificar do mais preciso ao menos preciso (endereço → rua → bairro → cidade).
          </span>
        </div>

        {/* Filtros */}
        <div style={{
          display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
          padding: "12px 18px",
          border: "1px solid var(--border)", borderRadius: "var(--radius-xl)",
          background: "rgba(15,26,46,0.88)",
        }}>
          <Filter size={14} color="var(--muted)" />

          <select className="toolbar-select" value={uf} onChange={(e) => setUf(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Todos os estados</option>
            {UF_LIST.map((u) => <option key={u} value={u}>{u} — {UF_NAMES[u]}</option>)}
          </select>

          <div className="search-wrap" style={{ flex: 1, minWidth: 200 }}>
            <Search size={14} className="search-icon" />
            <input
              className="field"
              placeholder="Buscar polo ou cidade…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadPolos()}
            />
          </div>

          <button className="btn btn-secondary" type="button" onClick={loadPolos} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Buscar
          </button>

          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", color: "var(--text-2)", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)}
              style={{ accentColor: "var(--gold)", width: 14, height: 14 }} />
            Sem coords ({missingCount})
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", color: "var(--text-2)", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={forceReGeocode} onChange={(e) => setForceReGeocode(e.target.checked)}
              style={{ accentColor: "var(--red)", width: 14, height: 14 }} />
            <span style={{ color: forceReGeocode ? "#fca5a5" : "var(--text-2)" }}>
              Forçar re-geocodificação
            </span>
          </label>

          {/* Contadores rápidos */}
          {lowPrecision > 0 && !forceReGeocode && (
            <span style={{
              fontSize: "0.78rem", color: "#fde68a",
              background: "rgba(245,184,0,0.10)", border: "1px solid rgba(245,184,0,0.24)",
              borderRadius: 99, padding: "3px 10px",
            }}>
              {lowPrecision} com baixa precisão
            </span>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {batchRunning && (
              <span style={{ fontSize: "0.8rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                {batchProgress.done}/{batchProgress.total} — {batchProgress.found} encontrados
              </span>
            )}
            {batchRunning ? (
              <button className="btn btn-danger" type="button" onClick={() => { batchCancelRef.current = true; }}>
                <X size={14} /> Cancelar
              </button>
            ) : (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={startBatchGeocode}
                disabled={loading}
              >
                <Globe size={14} />
                {forceReGeocode ? `Re-geocodificar (${polos.length})` : `Geocodificar lote${missingCount > 0 ? ` (${missingCount})` : ""}`}
              </button>
            )}
          </div>
        </div>

        {/* Tabela */}
        <div style={{
          border: "1px solid var(--border)", borderRadius: "var(--radius-xl)",
          background: "rgba(15,26,46,0.88)", overflow: "hidden",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(7,13,26,0.50)" }}>
                  {["Cód", "Nome", "UF", "Cidade", "Bairro", "Endereço (Rua)", "Precisão", "Lat", "Lng", "Ações"].map((h) => (
                    <th key={h} style={{
                      padding: "10px 13px", textAlign: "left",
                      fontSize: "0.68rem", fontWeight: 700,
                      letterSpacing: "0.10em", textTransform: "uppercase",
                      color: "var(--muted)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                    <Loader2 size={20} className="spin" style={{ display: "inline", marginRight: 8 }} />Carregando…
                  </td></tr>
                )}
                {!loading && polos.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                    Nenhum polo encontrado.
                  </td></tr>
                )}
                {polos.map((polo, idx) => {
                  const hasCoords = polo.latitude != null && polo.longitude != null;
                  const isGeocoding = geocodingId === polo.id;
                  const precision = polo.geocodePrecision as GeocodePrecision | null;
                  const precCfg = precision ? PRECISION_CONFIG[precision] : null;

                  return (
                    <tr
                      key={polo.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)",
                        transition: "background 120ms",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(21,101,232,0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)")}
                    >
                      <td style={tdStyle}>
                        <span style={{ color: "var(--muted-2)", fontFamily: "monospace", fontSize: "0.78rem" }}>{polo.code}</span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 220 }}>
                        <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>{polo.name}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          background: "var(--brand-dim)", border: "1px solid rgba(21,101,232,0.24)",
                          borderRadius: 6, padding: "2px 7px", fontSize: "0.72rem", fontWeight: 700, color: "#93c5fd",
                        }}>{polo.uf}</span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: "0.84rem" }}>{polo.city}</td>
                      <td style={{ ...tdStyle, color: "var(--muted)", fontSize: "0.80rem" }}>{polo.neighborhood ?? "—"}</td>
                      <td style={{ ...tdStyle, color: "var(--muted)", fontSize: "0.80rem", maxWidth: 200 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={polo.street ?? ""}>
                          {polo.street ?? "—"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {precCfg ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            background: precCfg.bg, border: `1px solid ${precCfg.border}`,
                            borderRadius: 99, padding: "2px 8px",
                            fontSize: "0.68rem", fontWeight: 700, color: precCfg.color,
                            whiteSpace: "nowrap",
                          }}>
                            <MapPin size={8} /> {precCfg.label}
                          </span>
                        ) : hasCoords ? (
                          <span style={{ color: "var(--muted-2)", fontSize: "0.78rem" }}>Manual</span>
                        ) : (
                          <span style={{ color: "var(--red)", fontSize: "0.78rem" }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {hasCoords
                          ? <span style={{ color: "var(--green)", fontSize: "0.76rem", fontFamily: "monospace" }}>{polo.latitude!.toFixed(5)}</span>
                          : <span style={{ color: "var(--red)", fontSize: "0.78rem" }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        {hasCoords
                          ? <span style={{ color: "var(--green)", fontSize: "0.76rem", fontFamily: "monospace" }}>{polo.longitude!.toFixed(5)}</span>
                          : <span style={{ color: "var(--red)", fontSize: "0.78rem" }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button className="btn btn-icon btn-secondary" title="Editar polo" type="button" onClick={() => openEdit(polo)}>
                            <Pencil size={12} />
                          </button>
                          <button
                            className="btn btn-icon btn-ghost"
                            title={forceReGeocode ? "Re-geocodificar (forçado)" : "Geocodificar pelo endereço"}
                            type="button"
                            disabled={isGeocoding || batchRunning}
                            onClick={() => geocodeOne(polo)}
                          >
                            {isGeocoding ? <Loader2 size={12} className="spin" /> : <Globe size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {polos.length > 0 && (
            <div style={{
              padding: "10px 16px", borderTop: "1px solid var(--border)",
              background: "rgba(7,13,26,0.40)",
              display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
            }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                {polos.length} polo{polos.length !== 1 ? "s" : ""} listado{polos.length !== 1 ? "s" : ""}
              </span>
              <div style={{ display: "flex", gap: 14, fontSize: "0.78rem", flexWrap: "wrap" }}>
                {(["address", "street", "neighborhood", "city"] as GeocodePrecision[]).map((p) => {
                  const cnt = polos.filter((x) => x.geocodePrecision === p).length;
                  if (!cnt) return null;
                  const cfg = PRECISION_CONFIG[p];
                  return (
                    <span key={p} style={{ color: cfg.color }}>
                      {cnt} {cfg.label.toLowerCase()}
                    </span>
                  );
                })}
                {missingCount > 0 && <span style={{ color: "var(--red)" }}>{missingCount} sem coords</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de edição */}
      {editing && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 500,
            background: "rgba(7,13,26,0.82)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <div style={{
            width: "min(660px, 100%)",
            border: "1px solid var(--border-2)", borderRadius: "var(--radius-xl)",
            background: "var(--panel)", boxShadow: "var(--shadow-lg)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "15px 20px", borderBottom: "1px solid var(--border)",
              background: "rgba(7,13,26,0.40)",
            }}>
              <div>
                <p className="eyebrow"><Pencil size={10} style={{ display: "inline", marginRight: 4 }} />Editar polo</p>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 700, margin: 0 }}>
                  {editing.name}
                </h2>
              </div>
              <button className="btn btn-icon btn-ghost" type="button" onClick={() => setEditing(null)}>
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 13, overflowY: "auto", maxHeight: "72vh" }}>
              <div className="field-grid">
                <label className="field-block" style={{ gridColumn: "1 / -1" }}>
                  <span>Nome do polo</span>
                  <input className="field" value={editing.name}
                    onChange={(e) => setEditing((d) => d ? { ...d, name: e.target.value } : d)} />
                </label>
                <label className="field-block">
                  <span>UF</span>
                  <select className="field toolbar-select" style={{ paddingRight: 36 }} value={editing.uf}
                    onChange={(e) => setEditing((d) => d ? { ...d, uf: e.target.value } : d)}>
                    {UF_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
                <label className="field-block">
                  <span>Cidade</span>
                  <input className="field" value={editing.city}
                    onChange={(e) => setEditing((d) => d ? { ...d, city: e.target.value } : d)} />
                </label>
                <label className="field-block">
                  <span>Bairro</span>
                  <input className="field" value={editing.neighborhood} placeholder="Bairro (opcional)"
                    onChange={(e) => setEditing((d) => d ? { ...d, neighborhood: e.target.value } : d)} />
                </label>
                <label className="field-block">
                  <span>Telefone</span>
                  <input className="field" value={editing.phone}
                    onChange={(e) => setEditing((d) => d ? { ...d, phone: e.target.value } : d)} />
                </label>
                <label className="field-block" style={{ gridColumn: "1 / -1" }}>
                  <span>Endereço / Rua</span>
                  <input className="field" value={editing.street}
                    placeholder="Ex: Rua das Flores, 123"
                    onChange={(e) => setEditing((d) => d ? { ...d, street: e.target.value } : d)} />
                </label>
                <label className="field-block">
                  <span>CEP <span style={{ color: "var(--muted-2)", fontWeight: 400 }}>(opcional — melhora o pin)</span></span>
                  <input className="field" value={editing.postalCode}
                    placeholder="00000-000"
                    maxLength={9}
                    onChange={(e) => {
                      // Auto-formata: 00000000 → 00000-000
                      const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                      const fmt = v.length > 5 ? `${v.slice(0, 5)}-${v.slice(5)}` : v;
                      setEditing((d) => d ? { ...d, postalCode: fmt } : d);
                    }} />
                </label>
                <label className="field-block">
                  <span>E-mail</span>
                  <input className="field" type="email" value={editing.email}
                    onChange={(e) => setEditing((d) => d ? { ...d, email: e.target.value } : d)} />
                </label>
              </div>

              {/* Coordenadas */}
              <div style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
                background: "rgba(7,13,26,0.40)", overflow: "hidden",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", borderBottom: "1px solid var(--border)",
                  background: "rgba(21,101,232,0.08)",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-2)" }}>
                    <MapPin size={13} color="var(--brand-h)" /> Coordenadas GPS
                  </span>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                    onClick={geocodeEditDraft}
                    disabled={geocodingId === editing.id}
                  >
                    {geocodingId === editing.id
                      ? <><Loader2 size={13} className="spin" /> Buscando…</>
                      : <><Globe size={13} /> Auto-preencher</>}
                  </button>
                </div>
                <div style={{ padding: "4px 14px 6px", fontSize: "0.74rem", color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                  O sistema tenta identificar o endereço exato do polo. Quanto mais completo o endereço, mais preciso será o pin.
                </div>
                <div className="field-grid" style={{ padding: 14 }}>
                  <label className="field-block">
                    <span>Latitude</span>
                    <input className="field" placeholder="-23.5505"
                      value={editing.latitude}
                      onChange={(e) => setEditing((d) => d ? { ...d, latitude: e.target.value } : d)} />
                  </label>
                  <label className="field-block">
                    <span>Longitude</span>
                    <input className="field" placeholder="-46.6333"
                      value={editing.longitude}
                      onChange={(e) => setEditing((d) => d ? { ...d, longitude: e.target.value } : d)} />
                  </label>
                </div>
              </div>
            </div>

            <div style={{
              display: "flex", justifyContent: "flex-end", gap: 8,
              padding: "14px 20px", borderTop: "1px solid var(--border)",
              background: "rgba(7,13,26,0.40)",
            }}>
              <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" type="button" onClick={saveEdit} disabled={saving}>
                {saving ? <><Loader2 size={14} className="spin" /> Salvando…</> : <><Save size={14} /> Salvar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast" style={{ borderColor: toast.ok ? "rgba(21,101,232,0.36)" : "rgba(240,64,64,0.36)" }}>
          {toast.ok ? <CheckCircle2 size={16} color="var(--brand-h)" /> : <XCircle size={16} color="var(--red)" />}
          {toast.msg}
        </div>
      )}
    </main>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "9px 13px",
  verticalAlign: "middle",
  fontSize: "0.84rem",
};
