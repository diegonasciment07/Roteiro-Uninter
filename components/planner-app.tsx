"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  Database,
  ListTodo,
  MapPin,
  MapPinned,
  Minus,
  Navigation,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UploadCloud,
  User,
  Users,
  X,
} from "lucide-react";

import { clearGeoCache, geocodePoloAddress, getGeoCache, setGeoCache } from "@/lib/geocode";
import type { Coordinates, EncounterRecord, PoloRecord, TripDraft, TripRecord } from "@/lib/types";

const PlannerMap = dynamic(() => import("@/components/planner-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <div style={{ textAlign: "center", color: "var(--muted)" }}>
        <MapPin size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
        <p>Carregando mapa…</p>
      </div>
    </div>
  ),
});

const UF_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapa", BA: "Bahia", CE: "Ceara",
  DF: "Distrito Federal", ES: "Espirito Santo", GO: "Goias", MA: "Maranhao",
  MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Para",
  PB: "Paraiba", PE: "Pernambuco", PI: "Piaui", PR: "Parana", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RO: "Rondonia", RR: "Roraima", RS: "Rio Grande do Sul",
  SC: "Santa Catarina", SE: "Sergipe", SP: "Sao Paulo", TO: "Tocantins",
};

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createTrip = (): TripDraft => ({
  title: "",
  traveler: "",
  flightOutboundFrom: "",
  flightOutboundTo: "",
  flightOutboundDate: "",
  flightOutboundTime: "",
  flightReturnFrom: "",
  flightReturnTo: "",
  flightReturnDate: "",
  flightReturnTime: "",
  vehicle: "",
  activeDayIndex: 0,
  days: [{ id: makeId(), date: "", overnightCity: "", hotel: "", stops: [] }],
});

const createTripStop = (poloId: string) => ({
  id: makeId(),
  poloId,
  arrivalTime: "",
  departureTime: "",
  objective: "",
});

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value))
    : "Data a definir";

function haversine(a: Coordinates, b: Coordinates) {
  const radius = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const base =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(base), Math.sqrt(1 - base));
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Falha na requisicao.");
  return data as T;
}

export default function PlannerApp() {
  const [ufs, setUfs] = useState<string[]>([]);
  const [uf, setUf] = useState("");
  const [polos, setPolos] = useState<PoloRecord[]>([]);
  const [coords, setCoords] = useState<Record<string, Coordinates>>({});
  const [search, setSearch] = useState("");
  const [radiusKm, setRadiusKm] = useState(100);
  const [tab, setTab] = useState<"enc" | "rot" | "trip">("enc");
  const [status, setStatus] = useState("Selecione um estado para comecar.");
  const [toast, setToast] = useState<string | null>(null);
  const [savingEncounter, setSavingEncounter] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [hostId, setHostId] = useState<string | null>(null);
  const [guestOverrides, setGuestOverrides] = useState<Record<string, boolean>>({});
  const [hostParticipants, setHostParticipants] = useState(0);
  const [guestCounts, setGuestCounts] = useState<Record<string, number>>({});
  const [encounterDate, setEncounterDate] = useState("");
  const [encounterNotes, setEncounterNotes] = useState("");
  const [encounters, setEncounters] = useState<EncounterRecord[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [trip, setTrip] = useState<TripDraft>(createTrip());

  useEffect(() => {
    void Promise.all([loadUfs(), loadEncounters(), loadTrips()]);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!uf) {
      setPolos([]);
      setCoords({});
      clearEncounter();
      return;
    }

    void (async () => {
      setStatus(`Carregando polos de ${uf}...`);
      const data = await fetchJson<PoloRecord[]>(`/api/polos?uf=${uf}`, { cache: "no-store" });
      const nextCoords: Record<string, Coordinates> = {};
      data.forEach((polo) => {
        if (polo.latitude !== null && polo.longitude !== null) nextCoords[polo.id] = [polo.latitude, polo.longitude];
      });
      setPolos(data);
      setCoords(nextCoords);
      clearEncounter();
      setStatus(data.length ? `${data.length} polos carregados.` : "Nenhum polo cadastrado.");
    })().catch((error) => setStatus(error instanceof Error ? error.message : "Falha ao carregar polos."));
  }, [uf]);

  useEffect(() => {
    if (!polos.length) return;
    let cancelled = false;
    void (async () => {
      let index = 0;
      for (const polo of polos) {
        if (cancelled || coords[polo.id]) continue;
        index += 1;
        setStatus(`Geocodificando ${polo.city} (${index}/${polos.length})...`);
        const result = await geocodePolo(polo);
        if (!cancelled && result) setCoords((current) => ({ ...current, [polo.id]: result }));
        if (!cancelled) await sleep(350);
      }
      if (!cancelled) setStatus(`${polos.length} polos prontos no mapa.`);
    })();
    return () => { cancelled = true; };
  }, [polos]);

  async function loadUfs() {
    const data = await fetchJson<string[]>("/api/polos/ufs", { cache: "no-store" });
    setUfs(data);
    if (!data.length) setStatus("Banco sem polos. Use a tela de importacao.");
  }

  const loadEncounters = async () => setEncounters(await fetchJson<EncounterRecord[]>("/api/encontros", { cache: "no-store" }));
  const loadTrips = async () => setTrips(await fetchJson<TripRecord[]>("/api/viagens", { cache: "no-store" }));

  function clearEncounter() {
    setHostId(null);
    setGuestOverrides({});
    setHostParticipants(0);
    setGuestCounts({});
    setEncounterDate("");
    setEncounterNotes("");
  }

  async function persistCoords(poloId: string, value: Coordinates, precision?: string) {
    try {
      await fetchJson(`/api/polos/${poloId}/coords`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: value[0], longitude: value[1], geocodePrecision: precision }),
      });
    } catch { /* Best effort only. */ }
  }

  async function geocodePolo(polo: PoloRecord) {
    // Usa cache local v2 (invalida entradas legadas com precisão de cidade)
    const cached = getGeoCache(polo.code);
    if (cached) return [cached.lat, cached.lon] as Coordinates;

    const result = await geocodePoloAddress(polo);
    if (!result) return null;

    const coords: Coordinates = [result.lat, result.lon];
    setGeoCache(polo.code, result);
    void persistCoords(polo.id, coords, result.precision);
    return coords;
  }

  const host = hostId ? polos.find((polo) => polo.id === hostId) ?? null : null;
  const hostCoords = host ? coords[host.id] ?? null : null;
  const autoGuests = polos.filter((polo) => {
    if (!host || polo.id === host.id) return false;
    if (polo.city.trim().toLowerCase() === host.city.trim().toLowerCase()) return true;
    const targetCoords = coords[polo.id];
    return Boolean(hostCoords && targetCoords && haversine(hostCoords, targetCoords) <= radiusKm);
  });
  const guests = polos.filter((polo) => {
    if (polo.id === hostId) return false;
    const autoSelected = autoGuests.some((guest) => guest.id === polo.id);
    const override = guestOverrides[polo.id];
    return override === true || (override !== false && autoSelected);
  });
  const visiblePolos = polos.filter((polo) => {
    const q = search.trim().toLowerCase();
    return !q || polo.name.toLowerCase().includes(q) || polo.city.toLowerCase().includes(q);
  });
  const tripIds = trip.days.flatMap((day) => day.stops.map((stop) => stop.poloId));
  const totalParticipants = hostParticipants + guests.reduce((sum, guest) => sum + (guestCounts[guest.id] ?? 0), 0);

  const findPolo = (id: string) =>
    polos.find((polo) => polo.id === id) ??
    trips.flatMap((savedTrip) => savedTrip.days.flatMap((day) => day.stops.map((stop) => stop.polo))).find((polo) => polo.id === id) ??
    null;

  const estimateLeg = (fromId: string, toId: string) => {
    const a = coords[fromId];
    const b = coords[toId];
    if (!a || !b) return null;
    const km = Math.max(1, Math.round(haversine(a, b) * 1.35));
    return { km, minutes: Math.max(5, Math.round((km / 70) * 60)) };
  };

  const tripKm = trip.days.reduce((sum, day, dayIndex) => {
    return sum + day.stops.reduce((daySum, stop, stopIndex) => {
      const previous =
        stopIndex > 0 ? day.stops[stopIndex - 1] : dayIndex > 0 ? trip.days[dayIndex - 1].stops.at(-1) : undefined;
      return daySum + (previous ? estimateLeg(previous.poloId, stop.poloId)?.km ?? 0 : 0);
    }, 0);
  }, 0);

  const handlePoloClick = (polo: PoloRecord) => {
    if (tab === "trip") {
      setTrip((current) => {
        const day = current.days[current.activeDayIndex];
        if (!day || day.stops.some((stop) => stop.poloId === polo.id)) return current;
        return {
          ...current,
          days: current.days.map((currentDay, index) =>
            index === current.activeDayIndex
              ? { ...currentDay, stops: [...currentDay.stops, createTripStop(polo.id)] }
              : currentDay,
          ),
        };
      });
      return;
    }

    if (!hostId || hostId === polo.id) {
      setHostId(polo.id);
      setGuestOverrides({});
      return;
    }

    const autoSelected = autoGuests.some((guest) => guest.id === polo.id);
    const selected = guests.some((guest) => guest.id === polo.id);
    setGuestOverrides((current) => {
      const next = { ...current };
      const value = !selected;
      if (value === autoSelected) delete next[polo.id];
      else next[polo.id] = value;
      return next;
    });
  };

  const saveEncounter = async () => {
    if (!hostId || !uf) return;
    setSavingEncounter(true);
    try {
      await fetchJson("/api/encontros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uf,
          hostPoloId: hostId,
          hostParticipants,
          scheduledAt: encounterDate || null,
          notes: encounterNotes || null,
          participants: guests.map((guest) => ({
            poloId: guest.id,
            participants: guestCounts[guest.id] ?? 0,
          })),
        }),
      });
      await loadEncounters();
      clearEncounter();
      setTab("rot");
      setToast("Encontro salvo com sucesso.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao salvar o encontro.");
    } finally {
      setSavingEncounter(false);
    }
  };

  const saveTrip = async () => {
    if (!trip.days.some((day) => day.stops.length)) {
      setToast("Adicione ao menos um polo na viagem.");
      return;
    }
    setSavingTrip(true);
    try {
      await fetchJson("/api/viagens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trip.title || `Roteiro ${uf || "UNINTER"}`,
          traveler: trip.traveler || null,
          flightOutboundFrom: trip.flightOutboundFrom || null,
          flightOutboundTo: trip.flightOutboundTo || null,
          flightOutboundDate: trip.flightOutboundDate || null,
          flightOutboundTime: trip.flightOutboundTime || null,
          flightReturnFrom: trip.flightReturnFrom || null,
          flightReturnTo: trip.flightReturnTo || null,
          flightReturnDate: trip.flightReturnDate || null,
          flightReturnTime: trip.flightReturnTime || null,
          vehicle: trip.vehicle || null,
          days: trip.days.map((day) => ({
            date: day.date || null,
            overnightCity: day.overnightCity || null,
            hotel: day.hotel || null,
            stops: day.stops.map((stop) => ({
              poloId: stop.poloId,
              arrivalTime: stop.arrivalTime || null,
              departureTime: stop.departureTime || null,
              objective: stop.objective || null,
            })),
          })),
        }),
      });
      await loadTrips();
      setToast("Viagem salva com sucesso.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Falha ao salvar a viagem.");
    } finally {
      setSavingTrip(false);
    }
  };

  const plottedCount = Object.keys(coords).length;

  return (
    <main className="planner-shell">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-icon">
            <MapPinned size={20} color="white" />
          </div>
          <div className="brand-text">
            <span className="brand-name">UNINTER</span>
            <span className="brand-product">Roteiro de Polos</span>
          </div>
        </div>

        <div className="toolbar-group">
          <div style={{ position: "relative" }}>
            <select
              className="toolbar-select"
              value={uf}
              onChange={(e) => setUf(e.target.value)}
            >
              <option value="">Selecione o estado…</option>
              {ufs.map((opt) => (
                <option key={opt} value={opt}>{UF_NAMES[opt] ? `${opt} — ${UF_NAMES[opt]}` : opt}</option>
              ))}
            </select>
          </div>

          <label className="range-block">
            <CircleDot size={14} color="var(--muted)" />
            <span className="range-label">Raio</span>
            <input
              type="range" min={20} max={400} value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
            />
            <span className="range-value">{radiusKm} km</span>
          </label>
        </div>

        <div className="toolbar-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={saveEncounter}
            disabled={!hostId || savingEncounter}
          >
            {savingEncounter
              ? <><CircleDot size={15} className="spin" /> Salvando…</>
              : <><Plus size={15} /> Adicionar encontro</>}
          </button>
          <button className="btn btn-secondary" type="button" onClick={clearEncounter}>
            <X size={15} /> Limpar
          </button>
          <Link href="/admin/importar" className="btn btn-ghost">
            <UploadCloud size={15} /> Importar
          </Link>
        </div>

        <div className="status-chip">
          <span className="status-dot" />
          {uf && plottedCount > 0
            ? `${plottedCount} de ${polos.length} plotados`
            : status}
        </div>
      </header>

      {/* ── Grid principal ── */}
      <section className="main-grid">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Base do estado</p>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem" }}>Polos disponíveis</h2>
            </div>
            <span className="count-label" style={{ paddingTop: 2 }}>
              {visiblePolos.length} polo{visiblePolos.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="search-wrap">
            <Search size={14} className="search-icon" />
            <input
              className="field"
              type="search"
              placeholder="Buscar polo ou cidade…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="polo-list">
            {!uf && (
              <div className="empty-card" style={{ flex: 1 }}>
                <div className="empty-icon"><MapPin size={20} /></div>
                <h2>Nenhum estado</h2>
                <p>Selecione uma UF no topo para ver os polos.</p>
              </div>
            )}
            {uf && visiblePolos.length === 0 && (
              <div className="empty-card compact-card">Nenhum polo encontrado.</div>
            )}
            {visiblePolos.map((polo) => {
              const isHost = polo.id === hostId;
              const isGuest = guests.some((g) => g.id === polo.id);
              return (
                <button
                  key={polo.id}
                  className={`polo-item${isHost ? " is-host" : ""}${isGuest ? " is-guest" : ""}`}
                  type="button"
                  onClick={() => handlePoloClick(polo)}
                >
                  <span className="polo-title">{polo.name}</span>
                  <span className="polo-meta">
                    {polo.city}{polo.neighborhood ? ` · ${polo.neighborhood}` : ""}
                  </span>
                  {(isHost || isGuest) && (
                    <div className="polo-badges">
                      {isHost && <span className="badge badge-host"><MapPin size={9} /> Anfitrião</span>}
                      {!isHost && isGuest && <span className="badge badge-guest"><Users size={9} /> Convidado</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Mapa */}
        <section className="map-panel">
          {uf ? (
            <PlannerMap
              activeTab={tab}
              coordsByPoloId={coords}
              guestPoloIds={guests.map((g) => g.id)}
              hostPoloId={hostId}
              onPoloClick={handlePoloClick}
              polos={polos}
              radiusKm={radiusKm}
              tripPoloIds={tripIds}
            />
          ) : (
            <div className="empty-card empty-map">
              <div className="empty-icon" style={{ width: 56, height: 56 }}>
                <Navigation size={26} />
              </div>
              <p className="eyebrow">Mapa interativo</p>
              <h2>Selecione uma UF</h2>
              <p>Depois clique em um polo para definir o anfitrião ou montar a visita.</p>
            </div>
          )}
        </section>

        {/* Painel de detalhes */}
        <aside className="details-panel">
          <div className="tab-list">
            <button
              className={`tab-button${tab === "enc" ? " is-active" : ""}`}
              type="button"
              onClick={() => setTab("enc")}
            >
              <CalendarDays size={14} /> Encontro
            </button>
            <button
              className={`tab-button${tab === "rot" ? " is-active" : ""}`}
              type="button"
              onClick={() => setTab("rot")}
            >
              <ListTodo size={14} /> Encontros
              {encounters.length > 0 && (
                <span style={{
                  background: "var(--brand-dim)", border: "1px solid rgba(21,101,232,0.3)",
                  borderRadius: 99, padding: "1px 7px", fontSize: "0.7rem", color: "#93c5fd"
                }}>
                  {encounters.length}
                </span>
              )}
            </button>
            <button
              className={`tab-button${tab === "trip" ? " is-active" : ""}`}
              type="button"
              onClick={() => setTab("trip")}
            >
              <Navigation size={14} /> Visita
            </button>
          </div>

          {/* Tab: Encontro */}
          {tab === "enc" && (
            <div className="panel-scroll">
              {!host ? (
                <div className="empty-card">
                  <div className="empty-icon"><MapPin size={20} /></div>
                  <p className="eyebrow">Encontro atual</p>
                  <h2>Defina um anfitrião</h2>
                  <p>Escolha uma UF e clique em um polo para marcar o local do encontro.</p>
                </div>
              ) : (
                <>
                  {/* Card do polo anfitrião */}
                  <div className="summary-card summary-host">
                    <div className="host-card-inner">
                      <p className="eyebrow"><MapPin size={10} style={{ display: "inline", marginRight: 4 }} />Polo anfitrião</p>
                      <h2>{host.name}</h2>
                      {host.city && (
                        <p className="address-line">
                          <MapPin size={11} color="var(--muted)" /> {host.city}
                          {host.neighborhood ? ` · ${host.neighborhood}` : ""}
                        </p>
                      )}
                      {host.street && (
                        <p className="address-line">
                          <CircleDot size={11} color="var(--muted)" /> {host.street}
                        </p>
                      )}
                    </div>
                  </div>

                  <label className="field-block">
                    <span><Users size={12} style={{ display: "inline", marginRight: 4 }} />Participantes do anfitrião</span>
                    <input
                      className="field"
                      type="number" min={0}
                      value={hostParticipants}
                      onChange={(e) => setHostParticipants(Number(e.target.value) || 0)}
                    />
                  </label>

                  <hr className="divider" />

                  {/* Convidados */}
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Polos convidados</p>
                      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "0.88rem" }}>
                        {guests.length} polo{guests.length !== 1 ? "s" : ""}
                      </h2>
                    </div>
                  </div>

                  {guests.length === 0 && (
                    <div className="empty-card compact-card">
                      Nenhum polo dentro do raio atual.
                    </div>
                  )}

                  {guests.map((guest) => (
                    <div key={guest.id} className="guest-card">
                      <div>
                        <strong style={{ fontSize: "0.875rem" }}>{guest.name}</strong>
                        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>{guest.city}</p>
                      </div>
                      <div className="guest-actions">
                        <input
                          className="field field-compact"
                          type="number" min={0}
                          value={guestCounts[guest.id] ?? 0}
                          onChange={(e) => setGuestCounts((c) => ({ ...c, [guest.id]: Number(e.target.value) || 0 }))}
                          title="Participantes"
                        />
                        <button
                          className="btn btn-icon btn-ghost"
                          type="button"
                          title="Remover convidado"
                          onClick={() => setGuestOverrides((c) => ({ ...c, [guest.id]: false }))}
                        >
                          <Minus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="summary-card summary-total">
                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)" }}>
                      <Users size={14} /> Total previsto
                    </span>
                    <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", color: "var(--gold)" }}>
                      {totalParticipants}
                    </strong>
                  </div>

                  <hr className="divider" />

                  <label className="field-block">
                    <span><CalendarDays size={12} style={{ display: "inline", marginRight: 4 }} />Data do encontro</span>
                    <input
                      className="field" type="date"
                      value={encounterDate}
                      onChange={(e) => setEncounterDate(e.target.value)}
                    />
                  </label>

                  <label className="field-block">
                    <span><BookOpen size={12} style={{ display: "inline", marginRight: 4 }} />Observações / Pauta</span>
                    <textarea
                      className="field field-textarea"
                      value={encounterNotes}
                      onChange={(e) => setEncounterNotes(e.target.value)}
                      placeholder="Agenda, objetivos, local específico…"
                    />
                  </label>

                  <button
                    className="btn btn-primary full-width"
                    type="button"
                    onClick={saveEncounter}
                    disabled={savingEncounter}
                  >
                    {savingEncounter
                      ? "Salvando…"
                      : <><Save size={15} /> Salvar encontro</>}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Tab: Encontros salvos */}
          {tab === "rot" && (
            <div className="panel-scroll">
              {encounters.length === 0 ? (
                <div className="empty-card">
                  <div className="empty-icon"><CalendarDays size={20} /></div>
                  <p className="eyebrow">Encontros salvos</p>
                  <h2>Nenhum encontro</h2>
                  <p>Monte o encontro atual e salve para registrar no banco.</p>
                </div>
              ) : (
                encounters.map((enc, idx) => (
                  <article key={enc.id} className="record-card">
                    <div className="record-header">
                      <div>
                        <p className="eyebrow">Encontro {idx + 1}</p>
                        <h2>{enc.hostPolo.name}</h2>
                        <p className="muted" style={{ fontSize: "0.8rem", marginTop: 3 }}>
                          <CalendarDays size={11} style={{ display: "inline", marginRight: 4 }} />
                          {formatDate(enc.scheduledAt)}
                        </p>
                      </div>
                      <button
                        className="btn btn-icon btn-danger"
                        type="button"
                        title="Excluir encontro"
                        onClick={async () => {
                          await fetchJson(`/api/encontros/${enc.id}`, { method: "DELETE" });
                          await loadEncounters();
                          setToast("Encontro removido.");
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="record-body">
                      <p style={{ fontSize: "0.82rem" }}>
                        <strong style={{ color: "var(--gold)" }}>Anfitrião:</strong>{" "}
                        <span style={{ color: "var(--text-2)" }}>{enc.hostPolo.city}</span>
                      </p>
                      <p style={{ fontSize: "0.82rem" }}>
                        <strong style={{ color: "var(--gold)" }}>Participantes:</strong>{" "}
                        <span style={{ color: "var(--text-2)" }}>{enc.hostParticipants}</span>
                      </p>
                      {enc.participants.length > 0 && (
                        <div className="chip-list">
                          {enc.participants.map((p) => (
                            <span key={p.id} className="chip">
                              <MapPin size={10} /> {p.polo.city} · {p.participants}
                            </span>
                          ))}
                        </div>
                      )}
                      {enc.notes && <p className="notes-box">{enc.notes}</p>}
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {/* Tab: Visita / Roteiro */}
          {tab === "trip" && (
            <div className="panel-scroll">
              {/* Estatísticas */}
              <div className="stat-row">
                <div className="stat-pill">
                  <strong>{trip.days.length}</strong>
                  <span>Dias</span>
                </div>
                <div className="stat-pill">
                  <strong>{tripIds.length}</strong>
                  <span>Polos</span>
                </div>
                <div className="stat-pill">
                  <strong>~{tripKm}</strong>
                  <span>km est.</span>
                </div>
              </div>

              {/* Info básica */}
              <label className="field-block">
                <span><BookOpen size={12} style={{ display: "inline", marginRight: 4 }} />Nome da viagem</span>
                <input
                  className="field"
                  value={trip.title}
                  onChange={(e) => setTrip((c) => ({ ...c, title: e.target.value }))}
                  placeholder="Ex: Nordeste — Abril 2025"
                />
              </label>

              <div className="field-grid">
                <label className="field-block">
                  <span><User size={12} style={{ display: "inline", marginRight: 4 }} />Viajante</span>
                  <input
                    className="field"
                    value={trip.traveler}
                    onChange={(e) => setTrip((c) => ({ ...c, traveler: e.target.value }))}
                    placeholder="Seu nome"
                  />
                </label>
                <label className="field-block">
                  <span><Car size={12} style={{ display: "inline", marginRight: 4 }} />Carro / locadora</span>
                  <input
                    className="field"
                    value={trip.vehicle}
                    onChange={(e) => setTrip((c) => ({ ...c, vehicle: e.target.value }))}
                    placeholder="Locadora / modelo"
                  />
                </label>
              </div>

              {/* Voo de ida */}
              <div className="flight-section">
                <div className="flight-section-head">
                  <PlaneTakeoff size={14} color="var(--brand-h)" /> Voo de ida
                </div>
                <div className="flight-section-body">
                  <div className="field-grid">
                    <label className="field-block">
                      <span>De</span>
                      <input className="field" value={trip.flightOutboundFrom} placeholder="Curitiba/PR"
                        onChange={(e) => setTrip((c) => ({ ...c, flightOutboundFrom: e.target.value }))} />
                    </label>
                    <label className="field-block">
                      <span>Para</span>
                      <input className="field" value={trip.flightOutboundTo} placeholder="Cidade destino"
                        onChange={(e) => setTrip((c) => ({ ...c, flightOutboundTo: e.target.value }))} />
                    </label>
                    <label className="field-block">
                      <span>Data</span>
                      <input className="field" type="date" value={trip.flightOutboundDate}
                        onChange={(e) => setTrip((c) => ({ ...c, flightOutboundDate: e.target.value }))} />
                    </label>
                    <label className="field-block">
                      <span>Horário</span>
                      <input className="field" type="time" value={trip.flightOutboundTime}
                        onChange={(e) => setTrip((c) => ({ ...c, flightOutboundTime: e.target.value }))} />
                    </label>
                  </div>
                </div>
              </div>

              {/* Voo de volta */}
              <div className="flight-section">
                <div className="flight-section-head">
                  <PlaneLanding size={14} color="var(--gold)" /> Voo de volta
                </div>
                <div className="flight-section-body">
                  <div className="field-grid">
                    <label className="field-block">
                      <span>De</span>
                      <input className="field" value={trip.flightReturnFrom} placeholder="Cidade retorno"
                        onChange={(e) => setTrip((c) => ({ ...c, flightReturnFrom: e.target.value }))} />
                    </label>
                    <label className="field-block">
                      <span>Para</span>
                      <input className="field" value={trip.flightReturnTo} placeholder="Curitiba/PR"
                        onChange={(e) => setTrip((c) => ({ ...c, flightReturnTo: e.target.value }))} />
                    </label>
                    <label className="field-block">
                      <span>Data</span>
                      <input className="field" type="date" value={trip.flightReturnDate}
                        onChange={(e) => setTrip((c) => ({ ...c, flightReturnDate: e.target.value }))} />
                    </label>
                    <label className="field-block">
                      <span>Horário</span>
                      <input className="field" type="time" value={trip.flightReturnTime}
                        onChange={(e) => setTrip((c) => ({ ...c, flightReturnTime: e.target.value }))} />
                    </label>
                  </div>
                </div>
              </div>

              {/* Banner de instrução */}
              <div className="day-banner">
                <MapPin size={13} style={{ display: "inline", marginRight: 6 }} />
                Clique em um polo no mapa para adicionar ao <strong>Dia {trip.activeDayIndex + 1}</strong>.
              </div>

              {/* Dias */}
              {trip.days.map((day, dayIndex) => (
                <article key={day.id} className={`day-card${trip.activeDayIndex === dayIndex ? " is-active" : ""}`}>
                  <div className="day-header">
                    <button
                      className="day-activator"
                      type="button"
                      onClick={() => setTrip((c) => ({ ...c, activeDayIndex: dayIndex }))}
                    >
                      <span><CalendarDays size={11} style={{ display: "inline", marginRight: 4 }} />Dia {dayIndex + 1}</span>
                      <strong>{day.date ? formatDate(day.date) : "Sem data"}</strong>
                    </button>
                    <button
                      className="btn btn-icon btn-danger"
                      type="button"
                      title="Remover dia"
                      onClick={() => setTrip((c) => ({
                        ...c,
                        days: c.days.length === 1
                          ? [{ ...c.days[0], stops: [] }]
                          : c.days.filter((_, i) => i !== dayIndex),
                        activeDayIndex: Math.max(0, Math.min(c.activeDayIndex, c.days.length - 2)),
                      }))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="field-grid">
                    <label className="field-block">
                      <span>Data</span>
                      <input className="field" type="date" value={day.date}
                        onChange={(e) => setTrip((c) => ({
                          ...c, days: c.days.map((d, i) => i === dayIndex ? { ...d, date: e.target.value } : d)
                        }))} />
                    </label>
                    <label className="field-block">
                      <span>Pernoite</span>
                      <input className="field" value={day.overnightCity} placeholder="Cidade"
                        onChange={(e) => setTrip((c) => ({
                          ...c, days: c.days.map((d, i) => i === dayIndex ? { ...d, overnightCity: e.target.value } : d)
                        }))} />
                    </label>
                  </div>

                  <label className="field-block">
                    <span>Hotel</span>
                    <input className="field" value={day.hotel} placeholder="Nome do hotel (opcional)"
                      onChange={(e) => setTrip((c) => ({
                        ...c, days: c.days.map((d, i) => i === dayIndex ? { ...d, hotel: e.target.value } : d)
                      }))} />
                  </label>

                  {/* Paradas */}
                  <div className="stop-list">
                    {day.stops.map((stop, stopIndex) => {
                      const leg = stopIndex > 0 ? estimateLeg(day.stops[stopIndex - 1].poloId, stop.poloId) : null;
                      return (
                        <div key={stop.id} className="stop-card">
                          {leg && (
                            <div className="leg-chip">
                              <Navigation size={11} />
                              ~{leg.km} km · {leg.minutes} min
                            </div>
                          )}
                          <div className="stop-header">
                            <div>
                              <strong>{findPolo(stop.poloId)?.name ?? "Polo não carregado"}</strong>
                              <p>{findPolo(stop.poloId)?.city ?? "Sem cidade"}</p>
                            </div>
                            <button
                              className="btn btn-icon btn-ghost"
                              type="button"
                              title="Remover parada"
                              onClick={() => setTrip((c) => ({
                                ...c, days: c.days.map((d, i) => i === dayIndex
                                  ? { ...d, stops: d.stops.filter((_, si) => si !== stopIndex) }
                                  : d)
                              }))}
                            >
                              <X size={13} />
                            </button>
                          </div>
                          <div className="field-grid">
                            <label className="field-block">
                              <span><Clock size={11} style={{ display: "inline", marginRight: 3 }} />Chegada</span>
                              <input className="field" type="time" value={stop.arrivalTime}
                                onChange={(e) => setTrip((c) => ({
                                  ...c, days: c.days.map((d, i) => i === dayIndex
                                    ? { ...d, stops: d.stops.map((s, si) => si === stopIndex ? { ...s, arrivalTime: e.target.value } : s) }
                                    : d)
                                }))} />
                            </label>
                            <label className="field-block">
                              <span><Clock size={11} style={{ display: "inline", marginRight: 3 }} />Saída</span>
                              <input className="field" type="time" value={stop.departureTime}
                                onChange={(e) => setTrip((c) => ({
                                  ...c, days: c.days.map((d, i) => i === dayIndex
                                    ? { ...d, stops: d.stops.map((s, si) => si === stopIndex ? { ...s, departureTime: e.target.value } : s) }
                                    : d)
                                }))} />
                            </label>
                          </div>
                          <label className="field-block">
                            <span>Objetivo da visita</span>
                            <input className="field" value={stop.objective} placeholder="Ex: Reunião com coordenador"
                              onChange={(e) => setTrip((c) => ({
                                ...c, days: c.days.map((d, i) => i === dayIndex
                                  ? { ...d, stops: d.stops.map((s, si) => si === stopIndex ? { ...s, objective: e.target.value } : s) }
                                  : d)
                              }))} />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}

              {/* Ações do roteiro */}
              <div className="inline-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setTrip((c) => ({
                    ...c,
                    activeDayIndex: c.days.length,
                    days: [...c.days, { id: makeId(), date: "", overnightCity: "", hotel: "", stops: [] }],
                  }))}
                >
                  <Plus size={14} /> Dia
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setTrip(createTrip())}>
                  <RotateCcw size={14} /> Limpar
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={saveTrip}
                  disabled={savingTrip}
                >
                  {savingTrip ? "Salvando…" : <><Save size={14} /> Salvar viagem</>}
                </button>
              </div>

              {/* Viagens salvas */}
              {trips.length > 0 && (
                <>
                  <hr className="divider" />
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Viagens salvas</p>
                      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "0.88rem" }}>
                        {trips.length} roteiro{trips.length !== 1 ? "s" : ""}
                      </h2>
                    </div>
                  </div>
                  {trips.map((savedTrip) => (
                    <article key={savedTrip.id} className="record-card">
                      <div className="record-header">
                        <div>
                          <p className="eyebrow">Viagem salva</p>
                          <h2>{savedTrip.title}</h2>
                          <p className="muted" style={{ fontSize: "0.8rem", marginTop: 3 }}>
                            {savedTrip.days.length} dia{savedTrip.days.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="inline-actions">
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => {
                              setTrip({
                                title: savedTrip.title,
                                traveler: savedTrip.traveler ?? "",
                                flightOutboundFrom: savedTrip.flightOutboundFrom ?? "",
                                flightOutboundTo: savedTrip.flightOutboundTo ?? "",
                                flightOutboundDate: savedTrip.flightOutboundDate ? savedTrip.flightOutboundDate.slice(0, 10) : "",
                                flightOutboundTime: savedTrip.flightOutboundTime ?? "",
                                flightReturnFrom: savedTrip.flightReturnFrom ?? "",
                                flightReturnTo: savedTrip.flightReturnTo ?? "",
                                flightReturnDate: savedTrip.flightReturnDate ? savedTrip.flightReturnDate.slice(0, 10) : "",
                                flightReturnTime: savedTrip.flightReturnTime ?? "",
                                vehicle: savedTrip.vehicle ?? "",
                                activeDayIndex: 0,
                                days: savedTrip.days.map((d) => ({
                                  id: makeId(),
                                  date: d.date ? d.date.slice(0, 10) : "",
                                  overnightCity: d.overnightCity ?? "",
                                  hotel: d.hotel ?? "",
                                  stops: d.stops.map((s) => ({
                                    id: makeId(),
                                    poloId: s.polo.id,
                                    arrivalTime: s.arrivalTime ?? "",
                                    departureTime: s.departureTime ?? "",
                                    objective: s.objective ?? "",
                                  })),
                                })),
                              });
                              if (savedTrip.days[0]?.stops[0]?.polo.uf) setUf(savedTrip.days[0].stops[0].polo.uf);
                            }}
                          >
                            Carregar
                          </button>
                          <button
                            className="btn btn-icon btn-danger"
                            type="button"
                            title="Excluir viagem"
                            onClick={async () => {
                              await fetchJson(`/api/viagens/${savedTrip.id}`, { method: "DELETE" });
                              await loadTrips();
                              setToast("Viagem removida.");
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </>
              )}
            </div>
          )}
        </aside>
      </section>

      {/* Toast */}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={16} color="var(--brand-h)" />
          {toast}
        </div>
      )}
    </main>
  );
}
