"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { Coordinates, EncounterRecord, PoloRecord, TripDraft, TripRecord } from "@/lib/types";

const PlannerMap = dynamic(() => import("@/components/planner-map"), {
  ssr: false,
  loading: () => <div className="map-loading">Carregando mapa...</div>,
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
    return () => {
      cancelled = true;
    };
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

  async function persistCoords(poloId: string, value: Coordinates) {
    try {
      await fetchJson(`/api/polos/${poloId}/coords`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: value[0],
          longitude: value[1],
        }),
      });
    } catch {
      // Best effort only. The map can keep using browser cache.
    }
  }

  async function geocodePolo(polo: PoloRecord) {
    const storageKey = `roteirosuninter:geo:${polo.code}`;
    const cached = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    if (cached) return JSON.parse(cached) as Coordinates;
    const state = UF_NAMES[polo.uf] ?? polo.uf;
    for (const query of [[polo.street, polo.city, state, "Brasil"], [polo.city, state, "Brasil"]]) {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.filter(Boolean).join(", "))}&format=json&limit=1&accept-language=pt-BR&countrycodes=br`);
      if (!response.ok) continue;
      const data = (await response.json()) as Array<{ lat: string; lon: string }>;
      if (!data[0]) continue;
      const parsed: Coordinates = [Number.parseFloat(data[0].lat), Number.parseFloat(data[0].lon)];
      window.localStorage.setItem(storageKey, JSON.stringify(parsed));
      void persistCoords(polo.id, parsed);
      return parsed;
    }
    return null;
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
      setToast("Encontro salvo no banco.");
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Falha ao salvar o encontro.",
      );
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
      setToast("Viagem salva no banco.");
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Falha ao salvar a viagem.",
      );
    } finally {
      setSavingTrip(false);
    }
  };

  return (
    <main className="planner-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">UNINTER</p>
          <h1>Roteiro de Polos</h1>
        </div>
        <div className="toolbar-group">
          <select className="field toolbar-select" value={uf} onChange={(event) => setUf(event.target.value)}>
            <option value="">Selecione o estado...</option>
            {ufs.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label className="range-block">
            <span>Raio</span>
            <input type="range" min={20} max={400} value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} />
            <strong>{radiusKm} km</strong>
          </label>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-primary" type="button" onClick={saveEncounter} disabled={!hostId || savingEncounter}>
            {savingEncounter ? "Salvando..." : "Adicionar encontro"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={clearEncounter}>
            Limpar selecao
          </button>
        </div>
        <div className="status-pill">{status}</div>
      </header>

      <section className="main-grid">
        <aside className="sidebar">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Base do estado</p>
              <h2>Polos disponiveis</h2>
            </div>
            <Link href="/admin/importar" className="text-link">
              Importar base
            </Link>
          </div>
          <input className="field" type="search" placeholder="Buscar polo ou cidade..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <p className="count-label">
            {visiblePolos.length} polo{visiblePolos.length === 1 ? "" : "s"} listado{visiblePolos.length === 1 ? "" : "s"}
          </p>
          <div className="polo-list">
            {visiblePolos.map((polo) => {
              const isHost = polo.id === hostId;
              const isGuest = guests.some((guest) => guest.id === polo.id);
              return (
                <button
                  key={polo.id}
                  data-polo={polo.id}
                  className={`polo-item${isHost ? " is-host" : ""}${isGuest ? " is-guest" : ""}`}
                  type="button"
                  onClick={() => {
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
                  }}
                >
                  <span className="polo-title">{polo.name}</span>
                  <span className="polo-meta">{polo.city}{polo.neighborhood ? ` · ${polo.neighborhood}` : ""}</span>
                  {isHost ? <span className="badge badge-host">Anfitriao</span> : null}
                  {!isHost && isGuest ? <span className="badge badge-guest">Convidado</span> : null}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="map-panel">
          {uf ? (
            <PlannerMap
              activeTab={tab}
              coordsByPoloId={coords}
              guestPoloIds={guests.map((guest) => guest.id)}
              hostPoloId={hostId}
              onPoloClick={(polo) => {
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
              }}
              polos={polos}
              radiusKm={radiusKm}
              tripPoloIds={tripIds}
            />
          ) : (
            <div className="empty-card empty-map">
              <p className="eyebrow">Mapa</p>
              <h2>Selecione uma UF</h2>
              <p>Depois disso, clique em um polo para definir o anfitriao ou montar a visita.</p>
            </div>
          )}
        </section>

        <aside className="details-panel">
          <div className="tab-list">
            <button className={`tab-button${tab === "enc" ? " is-active" : ""}`} type="button" onClick={() => setTab("enc")}>
              Encontro
            </button>
            <button className={`tab-button${tab === "rot" ? " is-active" : ""}`} type="button" onClick={() => setTab("rot")}>
              Encontros ({encounters.length})
            </button>
            <button className={`tab-button${tab === "trip" ? " is-active" : ""}`} type="button" onClick={() => setTab("trip")}>
              Visita
            </button>
          </div>

          {tab === "enc" ? (
            <div className="panel-scroll">
              {!host ? (
                <div className="empty-card">
                  <p className="eyebrow">Encontro atual</p>
                  <h2>Defina um anfitriao</h2>
                  <p>Escolha uma UF e clique em um polo para marcar o local do encontro.</p>
                </div>
              ) : (
                <>
                  <div className="summary-card summary-host">
                    <div>
                      <p className="eyebrow">Polo anfitriao</p>
                      <h2>{host.name}</h2>
                      <p>{host.city}</p>
                      {host.street ? <p>{host.street}</p> : null}
                    </div>
                  </div>
                  <label className="field-block">
                    <span>Participantes do anfitriao</span>
                    <input className="field" type="number" min={0} value={hostParticipants} onChange={(event) => setHostParticipants(Number(event.target.value) || 0)} />
                  </label>
                  <div className="stack-section">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Convidados sugeridos</p>
                        <h2>{guests.length} polos</h2>
                      </div>
                    </div>
                    {guests.length ? guests.map((guest) => (
                      <div key={guest.id} className="guest-card">
                        <div>
                          <strong>{guest.name}</strong>
                          <p>{guest.city}</p>
                        </div>
                        <div className="guest-actions">
                          <input className="field field-compact" type="number" min={0} value={guestCounts[guest.id] ?? 0} onChange={(event) => setGuestCounts((current) => ({ ...current, [guest.id]: Number(event.target.value) || 0 }))} />
                          <button className="btn btn-ghost" type="button" onClick={() => setGuestOverrides((current) => ({ ...current, [guest.id]: false }))}>
                            Remover
                          </button>
                        </div>
                      </div>
                    )) : <div className="empty-card compact-card">Nenhum convidado dentro do raio atual.</div>}
                  </div>
                  <div className="summary-card summary-total">
                    <span>Total previsto</span>
                    <strong>{totalParticipants}</strong>
                  </div>
                  <label className="field-block">
                    <span>Data do encontro</span>
                    <input className="field" type="date" value={encounterDate} onChange={(event) => setEncounterDate(event.target.value)} />
                  </label>
                  <label className="field-block">
                    <span>Observacoes</span>
                    <textarea className="field field-textarea" value={encounterNotes} onChange={(event) => setEncounterNotes(event.target.value)} placeholder="Agenda, pauta, observacoes..." />
                  </label>
                  <button className="btn btn-primary full-width" type="button" onClick={saveEncounter}>
                    Salvar encontro
                  </button>
                </>
              )}
            </div>
          ) : null}

          {tab === "rot" ? (
            <div className="panel-scroll">
              {!encounters.length ? (
                <div className="empty-card">
                  <p className="eyebrow">Encontros salvos</p>
                  <h2>Nenhum encontro registrado</h2>
                  <p>Monte o encontro atual e salve para persistir no banco.</p>
                </div>
              ) : encounters.map((encounter, index) => (
                <article key={encounter.id} className="record-card">
                  <div className="record-header">
                    <div>
                      <p className="eyebrow">Encontro {index + 1}</p>
                      <h2>{encounter.hostPolo.name}</h2>
                      <p className="muted">{formatDate(encounter.scheduledAt)}</p>
                    </div>
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={async () => {
                        await fetchJson(`/api/encontros/${encounter.id}`, { method: "DELETE" });
                        await loadEncounters();
                        setToast("Encontro removido.");
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                  <div className="record-body">
                    <p><strong>Anfitriao:</strong> {encounter.hostPolo.city}</p>
                    <p><strong>Participantes do anfitriao:</strong> {encounter.hostParticipants}</p>
                    <div className="chip-list">
                      {encounter.participants.map((participant) => (
                        <span key={participant.id} className="chip">
                          {participant.polo.city} · {participant.participants}
                        </span>
                      ))}
                    </div>
                    {encounter.notes ? <p className="notes-box">{encounter.notes}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {tab === "trip" ? (
            <div className="panel-scroll">
              <div className="summary-card trip-summary">
                <div><span>Dias</span><strong>{trip.days.length}</strong></div>
                <div><span>Polos</span><strong>{tripIds.length}</strong></div>
                <div><span>KM estimado</span><strong>~{tripKm}</strong></div>
              </div>

              <label className="field-block">
                <span>Nome da viagem</span>
                <input className="field" value={trip.title} onChange={(event) => setTrip((current) => ({ ...current, title: event.target.value }))} placeholder="Ex: Nordeste - Abril" />
              </label>
              <div className="field-grid">
                <label className="field-block">
                  <span>Viajante</span>
                  <input className="field" value={trip.traveler} onChange={(event) => setTrip((current) => ({ ...current, traveler: event.target.value }))} />
                </label>
                <label className="field-block">
                  <span>Carro / locadora</span>
                  <input className="field" value={trip.vehicle} onChange={(event) => setTrip((current) => ({ ...current, vehicle: event.target.value }))} />
                </label>
              </div>
              <div className="day-banner">Clique em um polo no mapa para adicionar ao <strong>Dia {trip.activeDayIndex + 1}</strong>.</div>

              {trip.days.map((day, dayIndex) => (
                <article key={day.id} className={`day-card${trip.activeDayIndex === dayIndex ? " is-active" : ""}`}>
                  <div className="day-header">
                    <button className="day-activator" type="button" onClick={() => setTrip((current) => ({ ...current, activeDayIndex: dayIndex }))}>
                      <span>Dia {dayIndex + 1}</span>
                      <strong>{day.date ? formatDate(day.date) : "Sem data"}</strong>
                    </button>
                    <button className="btn btn-danger" type="button" onClick={() => setTrip((current) => ({ ...current, days: current.days.length === 1 ? [{ ...current.days[0], stops: [] }] : current.days.filter((_, index) => index !== dayIndex), activeDayIndex: Math.max(0, Math.min(current.activeDayIndex, current.days.length - 2)) }))}>
                      Remover
                    </button>
                  </div>
                  <div className="field-grid">
                    <label className="field-block">
                      <span>Data</span>
                      <input className="field" type="date" value={day.date} onChange={(event) => setTrip((current) => ({ ...current, days: current.days.map((currentDay, index) => index === dayIndex ? { ...currentDay, date: event.target.value } : currentDay) }))} />
                    </label>
                    <label className="field-block">
                      <span>Pernoite</span>
                      <input className="field" value={day.overnightCity} onChange={(event) => setTrip((current) => ({ ...current, days: current.days.map((currentDay, index) => index === dayIndex ? { ...currentDay, overnightCity: event.target.value } : currentDay) }))} />
                    </label>
                  </div>
                  <label className="field-block">
                    <span>Hotel</span>
                    <input className="field" value={day.hotel} onChange={(event) => setTrip((current) => ({ ...current, days: current.days.map((currentDay, index) => index === dayIndex ? { ...currentDay, hotel: event.target.value } : currentDay) }))} />
                  </label>
                  <div className="stop-list">
                    {day.stops.map((stop, stopIndex) => {
                      const leg = stopIndex > 0 ? estimateLeg(day.stops[stopIndex - 1].poloId, stop.poloId) : null;
                      return (
                        <div key={stop.id} className="stop-card">
                          {leg ? <div className="leg-chip">~{leg.km} km · {leg.minutes}min</div> : null}
                          <div className="stop-header">
                            <div>
                              <strong>{findPolo(stop.poloId)?.name ?? "Polo nao carregado"}</strong>
                              <p>{findPolo(stop.poloId)?.city ?? "Sem cidade"}</p>
                            </div>
                            <div className="stop-actions">
                              <button className="btn btn-ghost" type="button" onClick={() => setTrip((current) => ({ ...current, days: current.days.map((currentDay, index) => index === dayIndex ? { ...currentDay, stops: currentDay.stops.filter((_, currentStopIndex) => currentStopIndex !== stopIndex) } : currentDay) }))}>
                                Excluir
                              </button>
                            </div>
                          </div>
                          <div className="field-grid">
                            <label className="field-block">
                              <span>Chegada</span>
                              <input className="field" type="time" value={stop.arrivalTime} onChange={(event) => setTrip((current) => ({ ...current, days: current.days.map((currentDay, index) => index === dayIndex ? { ...currentDay, stops: currentDay.stops.map((currentStop, currentStopIndex) => currentStopIndex === stopIndex ? { ...currentStop, arrivalTime: event.target.value } : currentStop) } : currentDay) }))} />
                            </label>
                            <label className="field-block">
                              <span>Saida</span>
                              <input className="field" type="time" value={stop.departureTime} onChange={(event) => setTrip((current) => ({ ...current, days: current.days.map((currentDay, index) => index === dayIndex ? { ...currentDay, stops: currentDay.stops.map((currentStop, currentStopIndex) => currentStopIndex === stopIndex ? { ...currentStop, departureTime: event.target.value } : currentStop) } : currentDay) }))} />
                            </label>
                          </div>
                          <label className="field-block">
                            <span>Objetivo da visita</span>
                            <input className="field" value={stop.objective} onChange={(event) => setTrip((current) => ({ ...current, days: current.days.map((currentDay, index) => index === dayIndex ? { ...currentDay, stops: currentDay.stops.map((currentStop, currentStopIndex) => currentStopIndex === stopIndex ? { ...currentStop, objective: event.target.value } : currentStop) } : currentDay) }))} />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}

              <div className="inline-actions">
                <button className="btn btn-secondary" type="button" onClick={() => setTrip((current) => ({ ...current, activeDayIndex: current.days.length, days: [...current.days, { id: makeId(), date: "", overnightCity: "", hotel: "", stops: [] }] }))}>
                  Adicionar dia
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setTrip(createTrip())}>
                  Limpar roteiro
                </button>
                <button className="btn btn-primary" type="button" onClick={saveTrip}>
                  {savingTrip ? "Salvando..." : "Salvar viagem"}
                </button>
              </div>

              <div className="stack-section">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">Viagens salvas</p>
                    <h2>{trips.length} roteiro(s)</h2>
                  </div>
                </div>
                {trips.map((savedTrip) => (
                  <article key={savedTrip.id} className="record-card">
                    <div className="record-header">
                      <div>
                        <p className="eyebrow">Viagem salva</p>
                        <h2>{savedTrip.title}</h2>
                        <p className="muted">{savedTrip.days.length} dia(s)</p>
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
                              flightOutboundDate: savedTrip.flightOutboundDate
                                ? savedTrip.flightOutboundDate.slice(0, 10)
                                : "",
                              flightOutboundTime: savedTrip.flightOutboundTime ?? "",
                              flightReturnFrom: savedTrip.flightReturnFrom ?? "",
                              flightReturnTo: savedTrip.flightReturnTo ?? "",
                              flightReturnDate: savedTrip.flightReturnDate
                                ? savedTrip.flightReturnDate.slice(0, 10)
                                : "",
                              flightReturnTime: savedTrip.flightReturnTime ?? "",
                              vehicle: savedTrip.vehicle ?? "",
                              activeDayIndex: 0,
                              days: savedTrip.days.map((day) => ({
                                id: makeId(),
                                date: day.date ? day.date.slice(0, 10) : "",
                                overnightCity: day.overnightCity ?? "",
                                hotel: day.hotel ?? "",
                                stops: day.stops.map((stop) => ({
                                  id: makeId(),
                                  poloId: stop.polo.id,
                                  arrivalTime: stop.arrivalTime ?? "",
                                  departureTime: stop.departureTime ?? "",
                                  objective: stop.objective ?? "",
                                })),
                              })),
                            });
                            if (savedTrip.days[0]?.stops[0]?.polo.uf) setUf(savedTrip.days[0].stops[0].polo.uf);
                          }}
                        >
                          Carregar
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={async () => {
                            await fetchJson(`/api/viagens/${savedTrip.id}`, { method: "DELETE" });
                            await loadTrips();
                            setToast("Viagem removida.");
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </section>

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
