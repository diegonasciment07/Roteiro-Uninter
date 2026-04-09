"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Pencil,
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

import { buildAdminTokenHeaders, readStoredAdminToken } from "@/lib/admin-token";
import { clearGeoCache, geocodePoloAddress, getGeoCache, setGeoCache } from "@/lib/geocode";
import { buildRoadRouteKey, fetchRoadRoute } from "@/lib/road-route";
import { fetchTravelTimes } from "@/lib/travel-time";
import type {
  Coordinates,
  EncounterRecord,
  PoloRecord,
  RoadRouteLeg,
  TripDraft,
  TripRecord,
  TripRouteSegment,
} from "@/lib/types";

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
const formatMinutes = (value: number) =>
  value >= 60 ? `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, "0")}min` : `${value} min`;
const normalizeCityKey = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

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
  const [selectedUfs, setSelectedUfs] = useState<string[]>([]);
  const [ufDropdownOpen, setUfDropdownOpen] = useState(false);
  const ufPickerRef = useRef<HTMLDivElement>(null);
  const [polos, setPolos] = useState<PoloRecord[]>([]);
  const [coords, setCoords] = useState<Record<string, Coordinates>>({});
  const [search, setSearch] = useState("");
  const [radiusKm, setRadiusKm] = useState(100);
  const [selectionMode, setSelectionMode] = useState<"radius" | "time">("radius");
  const [travelMinutes, setTravelMinutes] = useState(120); // 2h default
  const [travelTimes, setTravelTimes] = useState<Record<string, number | null>>({});
  const [loadingTravelTimes, setLoadingTravelTimes] = useState(false);
  const [tab, setTab] = useState<"enc" | "rot" | "trip">("enc");
  const [status, setStatus] = useState("Selecione um estado para comecar.");
  const [toast, setToast] = useState<string | null>(null);
  const [savingEncounter, setSavingEncounter] = useState(false);
  const [editingEncounterId, setEditingEncounterId] = useState<string | null>(null);
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
  const [roadLegs, setRoadLegs] = useState<Record<string, RoadRouteLeg | null>>({});
  const roadLegsInFlight = useRef(new Set<string>());

  useEffect(() => {
    void Promise.all([loadUfs(), loadEncounters(), loadTrips()]);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!ufDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (ufPickerRef.current && !ufPickerRef.current.contains(e.target as Node)) {
        setUfDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ufDropdownOpen]);

  useEffect(() => {
    if (!selectedUfs.length) {
      setPolos([]);
      setCoords({});
      clearEncounter();
      return;
    }

    void (async () => {
      const label = selectedUfs.length === 1 ? selectedUfs[0] : `${selectedUfs.length} estados`;
      setStatus(`Carregando polos de ${label}...`);
      const params = selectedUfs.map((u) => `uf=${u}`).join("&");
      const data = await fetchJson<PoloRecord[]>(`/api/polos?${params}`, { cache: "no-store" });
      const nextCoords: Record<string, Coordinates> = {};
      data.forEach((polo) => {
        if (polo.latitude !== null && polo.longitude !== null) nextCoords[polo.id] = [polo.latitude, polo.longitude];
      });
      setPolos(data);
      setCoords(nextCoords);
      clearEncounter();
      setStatus(data.length ? `${data.length} polos carregados.` : "Nenhum polo cadastrado.");
    })().catch((error) => setStatus(error instanceof Error ? error.message : "Falha ao carregar polos."));
  }, [selectedUfs]);

  useEffect(() => {
    if (!polos.length) return;
    let cancelled = false;
    void (async () => {
      const targets = polos.filter((polo) => !coords[polo.id]);
      if (!targets.length) {
        setStatus(`${polos.length} polos prontos no mapa.`);
        return;
      }

      let index = 0;
      for (const polo of targets) {
        if (cancelled) continue;
        index += 1;
        setStatus(`Geocodificando ${polo.city} (${index}/${targets.length})...`);
        const result = await geocodePolo(polo);
        if (!cancelled) await sleep(350);
      }
      if (!cancelled) setStatus(`${polos.length} polos prontos no mapa.`);
    })();
    return () => { cancelled = true; };
  }, [polos, coords]);

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
    setEditingEncounterId(null);
  }

  function loadEncounterForEdit(enc: EncounterRecord) {
    setHostId(enc.hostPolo.id);
    setHostParticipants(enc.hostParticipants);
    setEncounterDate(enc.scheduledAt ? enc.scheduledAt.split("T")[0] : "");
    setEncounterNotes(enc.notes ?? "");

    // Force exact guest list: disable auto-selection, set only saved participants
    const savedGuestIds = new Set(enc.participants.map((p) => p.polo.id));
    const overrides: Record<string, boolean> = {};
    polos.forEach((polo) => {
      if (polo.id === enc.hostPolo.id) return;
      overrides[polo.id] = savedGuestIds.has(polo.id);
    });
    setGuestOverrides(overrides);

    const counts: Record<string, number> = {};
    enc.participants.forEach((p) => { counts[p.polo.id] = p.participants; });
    setGuestCounts(counts);

    setEditingEncounterId(enc.id);
    setTab("enc");
  }

  async function persistCoords(poloId: string, value: Coordinates, precision?: string) {
    const adminToken = readStoredAdminToken();
    if (!adminToken) return;

    try {
      await fetchJson(`/api/polos/${poloId}/coords`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildAdminTokenHeaders(adminToken),
        },
        body: JSON.stringify({ latitude: value[0], longitude: value[1], geocodePrecision: precision }),
      });
    } catch { /* Best effort only. */ }
  }

  function applyGeocodeResult(poloId: string, nextCoords: Coordinates, precision: string | null) {
    setCoords((current) => {
      const existing = current[poloId];
      if (existing && existing[0] === nextCoords[0] && existing[1] === nextCoords[1]) {
        return current;
      }

      return { ...current, [poloId]: nextCoords };
    });

    setPolos((current) =>
      current.map((polo) =>
        polo.id === poloId
          ? {
              ...polo,
              latitude: nextCoords[0],
              longitude: nextCoords[1],
              geocodePrecision: precision,
            }
          : polo,
      ),
    );
  }

  function poloNeedsCoordRefresh(polo: PoloRecord) {
    return polo.latitude === null || polo.longitude === null || !polo.geocodePrecision;
  }

  async function geocodePolo(polo: PoloRecord, options?: { force?: boolean }) {
    const cached = options?.force ? null : getGeoCache(polo.code, polo);
    if (cached) {
      const nextCoords = [cached.lat, cached.lon] as Coordinates;
      applyGeocodeResult(polo.id, nextCoords, cached.precision);
      return nextCoords;
    }

    const result = await geocodePoloAddress(polo);
    if (!result) return null;

    const nextCoords: Coordinates = [result.lat, result.lon];
    setGeoCache(polo.code, result, polo);
    applyGeocodeResult(polo.id, nextCoords, result.precision);
    void persistCoords(polo.id, nextCoords, result.precision);
    return nextCoords;
  }

  const host = hostId ? polos.find((polo) => polo.id === hostId) ?? null : null;
  const hostCoords = host ? coords[host.id] ?? null : null;
  useEffect(() => {
    if (!host || tab !== "enc" || !poloNeedsCoordRefresh(host)) return;

    let cancelled = false;
    void (async () => {
      setStatus(`Atualizando coordenadas de ${host.city}...`);
      const result = await geocodePolo(host);
      if (!cancelled) {
        setStatus(
          result
            ? `${polos.length} polos prontos no mapa.`
            : "Nao foi possivel refinar a coordenada deste polo agora.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [host, polos.length, tab]);

  // Buscar tempos de deslocamento via OSRM quando modo = "time" e host mudar
  useEffect(() => {
    if (selectionMode !== "time" || !host || !hostCoords) {
      setTravelTimes({});
      return;
    }

    let cancelled = false;
    setLoadingTravelTimes(true);

    void (async () => {
      const targets = polos.filter((p) => p.id !== host.id && coords[p.id]);
      const destCoords = targets.map((p) => coords[p.id]);
      const times = await fetchTravelTimes(hostCoords, destCoords);

      if (cancelled) return;

      const map: Record<string, number | null> = {};
      targets.forEach((p, i) => { map[p.id] = times[i]; });
      setTravelTimes(map);
      setLoadingTravelTimes(false);
    })();

    return () => { cancelled = true; };
  }, [host?.id, selectionMode, polos.length]);

  const autoGuests = polos.filter((polo) => {
    if (!host || polo.id === host.id) return false;
    if (normalizeCityKey(polo.city) === normalizeCityKey(host.city)) return true;

    if (selectionMode === "time") {
      const minutes = travelTimes[polo.id];
      return minutes != null && minutes <= travelMinutes;
    }

    const targetCoords = coords[polo.id];
    return Boolean(hostCoords && targetCoords && haversine(hostCoords, targetCoords) <= radiusKm);
  });
  const guests = polos.filter((polo) => {
    if (polo.id === hostId) return false;
    const autoSelected = autoGuests.some((guest) => guest.id === polo.id);
    const override = guestOverrides[polo.id];
    return override === true || (override !== false && autoSelected);
  });

  const encounteredPoloIds = useMemo(
    () =>
      new Set(
        encounters
          .filter((encounter) => encounter.id !== editingEncounterId)
          .flatMap((encounter) => [
            encounter.hostPolo.id,
            ...encounter.participants.map((participant) => participant.polo.id),
          ]),
      ),
    [encounters, editingEncounterId],
  );
  const visiblePolos = polos.filter((polo) => {
    const q = search.trim().toLowerCase();
    return !q || polo.name.toLowerCase().includes(q) || polo.city.toLowerCase().includes(q);
  });
  const tripIds = trip.days.flatMap((day) => day.stops.map((stop) => stop.poloId));
  const tripUniquePoleCount = new Set(tripIds).size;
  const totalParticipants = hostParticipants + guests.reduce((sum, guest) => sum + (guestCounts[guest.id] ?? 0), 0);

  const findPolo = (id: string) =>
    polos.find((polo) => polo.id === id) ??
    trips.flatMap((savedTrip) => savedTrip.days.flatMap((day) => day.stops.map((stop) => stop.polo))).find((polo) => polo.id === id) ??
    null;

  const tripRouteRequests = useMemo(() => {
    const requests: Array<{ key: string; from: Coordinates; to: Coordinates }> = [];
    const seenKeys = new Set<string>();

    trip.days.forEach((day, dayIndex) => {
      day.stops.forEach((stop, stopIndex) => {
        const previous =
          stopIndex > 0 ? day.stops[stopIndex - 1] : dayIndex > 0 ? trip.days[dayIndex - 1].stops.at(-1) : undefined;
        if (!previous) return;

        const from = coords[previous.poloId];
        const to = coords[stop.poloId];
        if (!from || !to) return;

        const key = buildRoadRouteKey(from, to);
        if (seenKeys.has(key)) return;

        seenKeys.add(key);
        requests.push({ key, from, to });
      });
    });

    return requests;
  }, [coords, trip.days]);

  useEffect(() => {
    const validKeys = new Set(tripRouteRequests.map((request) => request.key));

    setRoadLegs((current) => {
      const nextEntries = Object.entries(current).filter(([key]) => validKeys.has(key));
      if (nextEntries.length === Object.keys(current).length) return current;
      return Object.fromEntries(nextEntries);
    });

    for (const key of [...roadLegsInFlight.current]) {
      if (!validKeys.has(key)) roadLegsInFlight.current.delete(key);
    }
  }, [tripRouteRequests]);

  useEffect(() => {
    const missingRequests = tripRouteRequests.filter(
      (request) => roadLegs[request.key] === undefined && !roadLegsInFlight.current.has(request.key),
    );
    if (!missingRequests.length) return;

    let cancelled = false;

    void (async () => {
      for (const request of missingRequests) {
        if (cancelled) break;

        roadLegsInFlight.current.add(request.key);
        const result = await fetchRoadRoute(request.from, request.to);
        roadLegsInFlight.current.delete(request.key);

        if (cancelled) break;

        setRoadLegs((current) => (
          current[request.key] === undefined
            ? { ...current, [request.key]: result }
            : current
        ));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roadLegs, tripRouteRequests]);

  const estimateLeg = (fromId: string, toId: string) => {
    const a = coords[fromId];
    const b = coords[toId];
    if (!a || !b) return null;

    const routedLeg = roadLegs[buildRoadRouteKey(a, b)];
    if (routedLeg) {
      return { ...routedLeg, routed: true };
    }

    const km = Math.max(1, Math.round(haversine(a, b) * 1.35));
    return {
      path: [a, b],
      km,
      minutes: Math.max(5, Math.round((km / 70) * 60)),
      routed: false,
    };
  };

  const tripKm = trip.days.reduce((sum, day, dayIndex) => {
    return sum + day.stops.reduce((daySum, stop, stopIndex) => {
      const previous =
        stopIndex > 0 ? day.stops[stopIndex - 1] : dayIndex > 0 ? trip.days[dayIndex - 1].stops.at(-1) : undefined;
      return daySum + (previous ? estimateLeg(previous.poloId, stop.poloId)?.km ?? 0 : 0);
    }, 0);
  }, 0);

  const tripRouteSegments = trip.days.reduce<TripRouteSegment[]>((segments, day, dayIndex) => {
    day.stops.forEach((stop, stopIndex) => {
      const previous =
        stopIndex > 0 ? day.stops[stopIndex - 1] : dayIndex > 0 ? trip.days[dayIndex - 1].stops.at(-1) : undefined;
      if (!previous) return;

      const from = coords[previous.poloId];
      const to = coords[stop.poloId];
      const leg = estimateLeg(previous.poloId, stop.poloId);
      const fromPolo = findPolo(previous.poloId);
      const toPolo = findPolo(stop.poloId);

      if (!from || !to || !leg || !fromPolo || !toPolo) return;

      const routeKey = buildRoadRouteKey(from, to);
      const isLoading = roadLegs[routeKey] === undefined;

      segments.push({
        id: `${previous.id}-${stop.id}`,
        dayIndex,
        fromPoloId: previous.poloId,
        toPoloId: stop.poloId,
        fromLabel: fromPolo.city,
        toLabel: toPolo.city,
        from,
        to,
        path: leg.path,
        km: leg.km,
        minutes: leg.minutes,
        routed: leg.routed,
        loading: isLoading,
        transition: stopIndex === 0 && dayIndex > 0,
      });
    });

    return segments;
  }, []);

  const routesLoadingCount = tripRouteSegments.filter((s) => s.loading).length;
  const routesRoutedCount = tripRouteSegments.filter((s) => s.routed).length;
  const routesFailed = tripRouteSegments.filter((s) => !s.loading && !s.routed).length;

  const optimizeTripDay = (dayIndex: number) => {
    setTrip((current) => {
      const day = current.days[dayIndex];
      if (!day || day.stops.length < 3) return current;

      const [firstStop, ...rest] = day.stops;
      const optimized = [firstStop];
      const remaining = [...rest];

      while (remaining.length > 0) {
        const last = optimized[optimized.length - 1];
        let bestIndex = -1;
        let bestDistance = Number.POSITIVE_INFINITY;

        remaining.forEach((candidate, index) => {
          const distance = estimateLeg(last.poloId, candidate.poloId)?.km ?? Number.POSITIVE_INFINITY;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        });

        if (bestIndex < 0) return current;
        optimized.push(remaining.splice(bestIndex, 1)[0]);
      }

      return {
        ...current,
        days: current.days.map((currentDay, index) =>
          index === dayIndex ? { ...currentDay, stops: optimized } : currentDay,
        ),
      };
    });
  };

  const handlePoloClick = (polo: PoloRecord) => {
    if (tab === "trip") {
      setTrip((current) => {
        const day = current.days[current.activeDayIndex];
        if (!day) return current;
        return {
          ...current,
          days: current.days.map((currentDay, index) =>
            index !== current.activeDayIndex ? currentDay : {
              ...currentDay,
              stops: [...currentDay.stops, createTripStop(polo.id)],
            },
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
    if (!hostId || !selectedUfs.length) return;
    setSavingEncounter(true);
    try {
      const payload = {
        uf: host?.uf ?? selectedUfs[0] ?? "",
        hostPoloId: hostId,
        hostParticipants,
        scheduledAt: encounterDate || null,
        notes: encounterNotes || null,
        participants: guests.map((guest) => ({
          poloId: guest.id,
          participants: guestCounts[guest.id] ?? 0,
        })),
      };
      if (editingEncounterId) {
        await fetchJson(`/api/encontros/${editingEncounterId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJson("/api/encontros", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      await loadEncounters();
      clearEncounter();
      setTab("rot");
      setToast(editingEncounterId ? "Encontro atualizado com sucesso." : "Encontro salvo com sucesso.");
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
          title: trip.title || `Roteiro ${selectedUfs.join("/") || "UNINTER"}`,
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

  const printTripDraft = () => {
    const win = window.open("", "_blank", "width=960,height=800");
    if (!win) return;
    const fmt = (d?: string | null) =>
      d ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(d)) : "Data a definir";
    const daysHtml = trip.days
      .map((day, di) => {
        const stopsHtml = day.stops
          .map((stop, si) => {
            const polo = findPolo(stop.poloId);
            const leg = si > 0 ? estimateLeg(day.stops[si - 1].poloId, stop.poloId) : null;
            return `
              ${leg ? `<div class="leg">↓ &nbsp;~${leg.km} km &nbsp;·&nbsp; ~${formatMinutes(leg.minutes)}</div>` : ""}
              <div class="stop">
                <div class="stop-num">${si + 1}</div>
                <div class="stop-info">
                  <strong>${polo?.name ?? "Polo não encontrado"}</strong>
                  <span>${polo?.city ?? ""}</span>
                  ${stop.arrivalTime || stop.departureTime ? `<div class="stop-times">Chegada: ${stop.arrivalTime || "--:--"} &nbsp;·&nbsp; Saída: ${stop.departureTime || "--:--"}</div>` : ""}
                  ${stop.objective ? `<div class="stop-obj">${stop.objective}</div>` : ""}
                </div>
              </div>`;
          })
          .join("");
        const dayKm = day.stops.reduce((s, stop, i) => s + (i > 0 ? estimateLeg(day.stops[i - 1].poloId, stop.poloId)?.km ?? 0 : 0), 0);
        const dayMin = day.stops.reduce((s, stop, i) => s + (i > 0 ? estimateLeg(day.stops[i - 1].poloId, stop.poloId)?.minutes ?? 0 : 0), 0);
        const interLeg = di > 0 && trip.days[di - 1].stops.length > 0 && day.stops.length > 0
          ? estimateLeg(trip.days[di - 1].stops.at(-1)!.poloId, day.stops[0].poloId) : null;
        return `
          <div class="day-section">
            <div class="day-head">
              <div><span class="eyebrow">Dia ${di + 1}</span><strong>${fmt(day.date)}</strong></div>
              <div class="day-meta">${day.overnightCity ? `Pernoite: <strong>${day.overnightCity}</strong>` : ""}${day.hotel ? ` &nbsp;·&nbsp; Hotel: ${day.hotel}` : ""}</div>
            </div>
            ${interLeg ? `<div class="inter-day">Deslocamento do dia anterior: ~${interLeg.km} km · ~${formatMinutes(interLeg.minutes)}</div>` : ""}
            ${day.stops.length === 0 ? "<p class=\"empty-day\">Nenhuma parada neste dia.</p>" : stopsHtml}
            <div class="day-foot">${day.stops.length} parada${day.stops.length !== 1 ? "s" : ""} &nbsp;·&nbsp; ~${dayKm} km &nbsp;·&nbsp; ${dayMin > 0 ? formatMinutes(dayMin) : "Sem deslocamento"}</div>
          </div>`;
      })
      .join("");
    const flightOut = trip.flightOutboundFrom && trip.flightOutboundTo
      ? `<div class="flight"><span class="eyebrow">Voo de ida</span><strong>${trip.flightOutboundFrom} → ${trip.flightOutboundTo}</strong>${trip.flightOutboundDate ? `<span>${fmt(trip.flightOutboundDate)}${trip.flightOutboundTime ? " às " + trip.flightOutboundTime : ""}</span>` : ""}</div>` : "";
    const flightRet = trip.flightReturnFrom && trip.flightReturnTo
      ? `<div class="flight"><span class="eyebrow">Voo de volta</span><strong>${trip.flightReturnFrom} → ${trip.flightReturnTo}</strong>${trip.flightReturnDate ? `<span>${fmt(trip.flightReturnDate)}${trip.flightReturnTime ? " às " + trip.flightReturnTime : ""}</span>` : ""}</div>` : "";
    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Roteiro${trip.title ? " — " + trip.title : ""}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 13px; color: #111; background: #fff; padding: 36px; max-width: 840px; margin: 0 auto; }
  h1 { font-size: 20px; font-weight: 800; margin-bottom: 2px; }
  .subtitle { font-size: 11px; color: #888; margin-bottom: 20px; }
  .meta-row { display: flex; gap: 24px; margin-bottom: 18px; }
  .meta-block { display: flex; flex-direction: column; gap: 2px; }
  .eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #1565e8; display: block; margin-bottom: 1px; }
  .flights { display: flex; gap: 16px; margin-bottom: 18px; }
  .flight { flex: 1; border: 1px solid #dde4f0; border-radius: 8px; padding: 10px 13px; display: flex; flex-direction: column; gap: 2px; }
  .flight strong { font-size: 13px; }
  .flight span { font-size: 11px; color: #666; }
  .summary-bar { display: flex; gap: 0; border: 1px solid #dde4f0; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
  .summary-item { flex: 1; text-align: center; padding: 10px; border-right: 1px solid #dde4f0; }
  .summary-item:last-child { border-right: none; }
  .summary-item strong { display: block; font-size: 18px; font-weight: 800; color: #1565e8; }
  .summary-item span { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; font-weight: 600; }
  .day-section { margin-bottom: 24px; page-break-inside: avoid; }
  .day-head { display: flex; justify-content: space-between; align-items: center; background: #f4f7fc; border: 1px solid #dde4f0; border-radius: 8px 8px 0 0; padding: 10px 14px; border-bottom: none; }
  .day-head div { display: flex; flex-direction: column; gap: 2px; }
  .day-head strong { font-size: 13px; }
  .day-meta { font-size: 11px; color: #666; text-align: right; }
  .inter-day { font-size: 11px; color: #888; background: #f9f9f9; padding: 6px 14px; border: 1px solid #eee; border-top: none; font-style: italic; }
  .stop { display: flex; gap: 10px; padding: 10px 14px; border: 1px solid #dde4f0; border-top: none; align-items: flex-start; background: #fff; }
  .stop-num { width: 22px; height: 22px; border-radius: 50%; background: #1565e8; color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .stop-info { display: flex; flex-direction: column; gap: 2px; }
  .stop-info strong { font-size: 12px; }
  .stop-info span { font-size: 11px; color: #888; }
  .stop-times { font-size: 11px; color: #555; margin-top: 2px; }
  .stop-obj { font-size: 11px; color: #444; font-style: italic; border-left: 2px solid #1565e8; padding-left: 6px; margin-top: 3px; }
  .leg { font-size: 10px; color: #aaa; padding: 4px 14px; border: 1px solid #eee; border-top: none; background: #fafafa; }
  .day-foot { font-size: 11px; color: #888; padding: 8px 14px; border: 1px solid #dde4f0; border-top: none; border-radius: 0 0 8px 8px; background: #f9f9f9; }
  .empty-day { padding: 10px 14px; border: 1px solid #eee; border-top: none; color: #aaa; font-style: italic; font-size: 12px; }
  .footer { margin-top: 32px; font-size: 10px; color: #bbb; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
  @media print { body { padding: 16px; } }
</style></head><body>
  <h1>${trip.title || "Roteiro de Viagem"}</h1>
  <p class="subtitle">Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date())}${trip.traveler ? " · " + trip.traveler : ""}${trip.vehicle ? " · " + trip.vehicle : ""}</p>
  ${flightOut || flightRet ? `<div class="flights">${flightOut}${flightRet}</div>` : ""}
  <div class="summary-bar">
    <div class="summary-item"><strong>${trip.days.length}</strong><span>Dias</span></div>
    <div class="summary-item"><strong>${tripUniquePoleCount}</strong><span>Polos</span></div>
    <div class="summary-item"><strong>~${tripKm}</strong><span>km est.</span></div>
  </div>
  ${daysHtml}
  <p class="footer">UNINTER · Roteiro de Polos</p>
  <script>window.onload = () => { window.print(); }<\/script>
</body></html>`);
    win.document.close();
  };

  const printEncounters = () => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const uf_label = encounters[0]?.uf ?? "";
    let grandTotal = 0;
    const rows = encounters
      .map((enc, idx) => {
        const guestTotal = enc.participants.reduce((s, p) => s + p.participants, 0);
        const encTotal = enc.hostParticipants + guestTotal;
        grandTotal += encTotal;
        return `
        <section class="card">
          <div class="card-header">
            <div class="card-header-row">
              <div>
                <span class="eyebrow">Encontro ${idx + 1}</span>
                <h2>${enc.hostPolo.name}</h2>
                <p class="date">${enc.scheduledAt ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(enc.scheduledAt)) : "Data a definir"}</p>
              </div>
              <div class="total-badge">${encTotal} participante${encTotal !== 1 ? "s" : ""}</div>
            </div>
          </div>
          <div class="card-body">
            <p><strong>Anfitrião:</strong> ${enc.hostPolo.city} — ${enc.hostParticipants} participante${enc.hostParticipants !== 1 ? "s" : ""}</p>
            ${enc.participants.length > 0 ? `<p><strong>Convidados (${guestTotal} participante${guestTotal !== 1 ? "s" : ""}):</strong></p><ul>${enc.participants.map((p) => `<li>${p.polo.city} — ${p.participants} participante${p.participants !== 1 ? "s" : ""}</li>`).join("")}</ul>` : ""}
            ${enc.notes ? `<p class="notes"><strong>Observações:</strong> ${enc.notes}</p>` : ""}
          </div>
        </section>`;
      })
      .join("");
    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Relatório de Encontros${uf_label ? ` — ${uf_label}` : ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: 13px; color: #111; background: #fff; padding: 32px; }
    h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { font-size: 11px; color: #666; margin-bottom: 4px; }
    .grand-total { font-size: 12px; font-weight: 700; color: #1565e8; margin-bottom: 24px; }
    .card { border: 1px solid #d0d7e3; border-radius: 10px; margin-bottom: 16px; overflow: hidden; page-break-inside: avoid; }
    .card-header { background: #f4f7fc; padding: 12px 16px 10px; border-bottom: 1px solid #d0d7e3; }
    .card-header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #1565e8; display: block; margin-bottom: 3px; }
    .card-header h2 { font-size: 14px; font-weight: 700; margin-bottom: 3px; }
    .date { font-size: 11px; color: #555; }
    .total-badge { background: #1565e8; color: #fff; font-size: 11px; font-weight: 700; border-radius: 99px; padding: 3px 10px; white-space: nowrap; align-self: center; }
    .card-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
    .card-body p { font-size: 12px; }
    .card-body ul { margin-left: 18px; font-size: 12px; }
    .notes { color: #444; font-style: italic; }
    .footer { margin-top: 32px; font-size: 10px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>Relatório de Encontros UNINTER${uf_label ? ` — ${uf_label}` : ""}</h1>
  <p class="subtitle">Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date())} · ${encounters.length} encontro${encounters.length !== 1 ? "s" : ""}</p>
  <p class="grand-total">Total geral: ${grandTotal} participante${grandTotal !== 1 ? "s" : ""}</p>
  ${rows}
  <p class="footer">UNINTER · Roteiro de Polos</p>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
    win.document.close();
  };

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
          <div className="uf-picker" ref={ufPickerRef}>
            <button
              type="button"
              className={`uf-picker-btn${ufDropdownOpen ? " open" : ""}`}
              onClick={() => setUfDropdownOpen((v) => !v)}
            >
              {selectedUfs.length === 0 && <span className="uf-placeholder">Selecione o estado…</span>}
              {selectedUfs.length === 1 && <span>{selectedUfs[0]} — {UF_NAMES[selectedUfs[0]] ?? selectedUfs[0]}</span>}
              {selectedUfs.length > 1 && (
                <span className="uf-tags">
                  {selectedUfs.map((u) => <span key={u} className="uf-tag">{u}</span>)}
                </span>
              )}
            </button>
            {ufDropdownOpen && (
              <div className="uf-dropdown">
                <div className="uf-dropdown-actions">
                  <button type="button" onClick={() => setSelectedUfs([...ufs])}>Todos</button>
                  <button type="button" onClick={() => setSelectedUfs([])}>Limpar</button>
                </div>
                <div className="uf-dropdown-list">
                  {ufs.map((opt) => (
                    <label key={opt} className="uf-option">
                      <input
                        type="checkbox"
                        checked={selectedUfs.includes(opt)}
                        onChange={(e) => {
                          setSelectedUfs((prev) =>
                            e.target.checked ? [...prev, opt] : prev.filter((u) => u !== opt)
                          );
                        }}
                      />
                      <span className="uf-option-code">{opt}</span>
                      <span className="uf-option-name">{UF_NAMES[opt] ?? opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="selection-mode-block">
            <button
              className={`selection-mode-btn${selectionMode === "radius" ? " active" : ""}`}
              type="button"
              onClick={() => setSelectionMode("radius")}
            >
              <CircleDot size={13} /> Raio
            </button>
            <button
              className={`selection-mode-btn${selectionMode === "time" ? " active" : ""}`}
              type="button"
              onClick={() => setSelectionMode("time")}
            >
              <Clock size={13} /> Tempo
            </button>
          </div>

          {selectionMode === "radius" ? (
            <label className="range-block">
              <input
                type="range" min={20} max={400} value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
              />
              <span className="range-value">{radiusKm} km</span>
            </label>
          ) : (
            <div className="time-buttons">
              {[60, 120, 180, 240, 300].map((min) => (
                <button
                  key={min}
                  type="button"
                  className={`time-btn${travelMinutes === min ? " active" : ""}`}
                  onClick={() => setTravelMinutes(min)}
                >
                  {min / 60}h
                </button>
              ))}
              {loadingTravelTimes && <span className="time-loading"><span className="route-status-spinner" style={{ borderTopColor: "var(--muted)" }} /></span>}
            </div>
          )}
        </div>

        <div className="toolbar-actions">
          {tab === "enc" && (
            <>
              <button
                className="btn btn-primary"
                type="button"
                onClick={saveEncounter}
                disabled={!hostId || savingEncounter}
              >
                {savingEncounter
                  ? <><CircleDot size={15} className="spin" /> Salvando…</>
                  : <><Save size={15} /> Salvar encontro</>}
              </button>
              <button className="btn btn-secondary" type="button" onClick={clearEncounter}>
                <X size={15} /> Limpar seleção
              </button>
            </>
          )}
          {tab === "rot" && (
            <button className="btn btn-primary" type="button" onClick={() => setTab("enc")}>
              <Plus size={15} /> Novo encontro
            </button>
          )}
          {tab === "trip" && (
            <>
              <button
                className="btn btn-primary"
                type="button"
                onClick={saveTrip}
                disabled={savingTrip}
              >
                {savingTrip ? "Salvando…" : <><Save size={15} /> Salvar visita</>}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setTrip(createTrip())}>
                <RotateCcw size={15} /> Limpar visita
              </button>
            </>
          )}
          <Link href="/admin/importar" className="btn btn-ghost">
            <UploadCloud size={15} /> Importar
          </Link>
        </div>

        <div className="status-chip">
          <span className="status-dot" />
          {selectedUfs.length > 0 && plottedCount > 0
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
            {!selectedUfs.length && (
              <div className="empty-card" style={{ flex: 1 }}>
                <div className="empty-icon"><MapPin size={20} /></div>
                <h2>Nenhum estado</h2>
                <p>Selecione uma UF no topo para ver os polos.</p>
              </div>
            )}
            {selectedUfs.length > 0 && visiblePolos.length === 0 && (
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
                    {selectedUfs.length > 1 && <span className="uf-tag" style={{ marginRight: 4 }}>{polo.uf}</span>}
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
          {encounters.length > 0 && tab !== "trip" && (
            <div className="map-legend">
              <span className="map-legend-dot" style={{ background: "#8ec5ff" }} />Disponível
              <span className="map-legend-dot" style={{ background: "#ef4444", marginLeft: 10 }} />Já em encontro
              {hostId && <><span className="map-legend-dot" style={{ background: "#ffb703", marginLeft: 10 }} />Anfitrião</>}
              {hostId && <><span className="map-legend-dot" style={{ background: "#22c55e", marginLeft: 10 }} />Convidado</>}
            </div>
          )}
          {selectedUfs.length > 0 ? (
            <PlannerMap
              key={`${selectedUfs.join("-")}-${tab}-${hostId ?? "no-host"}-${trip.activeDayIndex}`}
              activeTab={tab}
              activeTripDayIndex={trip.activeDayIndex}
              coordsByPoloId={coords}
              encounteredPoloIds={[...encounteredPoloIds]}
              guestPoloIds={guests.map((g) => g.id)}
              hostPoloId={hostId}
              onPoloClick={handlePoloClick}
              polos={polos}
              radiusKm={radiusKm}
              showRadiusCircle={selectionMode === "radius"}
              selectedEncounterPoloIds={host ? [host.id, ...guests.map((g) => g.id)] : []}
              tripPoloIds={tripIds}
              tripRouteSegments={tripRouteSegments}
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
              {editingEncounterId ? (
                <div className="day-banner" style={{ background: "rgba(245,184,0,0.10)", borderColor: "rgba(245,184,0,0.30)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span><Pencil size={13} style={{ display: "inline", marginRight: 6 }} />Editando encontro salvo. Salve para atualizar.</span>
                  <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "2px 8px" }} type="button" onClick={clearEncounter}>Cancelar</button>
                </div>
              ) : (
                <div className="day-banner">
                  <CalendarDays size={13} style={{ display: "inline", marginRight: 6 }} />
                  Encontro é um <strong>evento em um polo anfitrião</strong>, com polos convidados dentro do raio selecionado.
                </div>
              )}
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
                      : editingEncounterId
                        ? <><Save size={15} /> Atualizar encontro</>
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
                <>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={printEncounters}
                      title="Gerar relatório em PDF"
                    >
                      <Save size={14} /> Gerar PDF
                    </button>
                  </div>
                  {encounters.map((enc, idx) => (
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
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-icon btn-secondary"
                          type="button"
                          title="Editar encontro"
                          onClick={() => loadEncounterForEdit(enc)}
                        >
                          <Pencil size={14} />
                        </button>
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
                  ))}
                </>
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
                  <strong>{tripUniquePoleCount}</strong>
                  <span>Polos</span>
                </div>
                <div className="stat-pill">
                  <strong>~{tripKm}</strong>
                  <span>km {routesRoutedCount > 0 && routesLoadingCount === 0 && routesFailed === 0 ? "viário" : "est."}</span>
                </div>
              </div>

              {/* Indicador de rotas viárias */}
              {tripRouteSegments.length > 0 && (
                <div className={`route-status-banner ${routesLoadingCount > 0 ? "loading" : routesFailed > 0 ? "partial" : "done"}`}>
                  {routesLoadingCount > 0 ? (
                    <><span className="route-status-spinner" />Calculando rotas viárias… {routesLoadingCount} trecho{routesLoadingCount !== 1 ? "s" : ""} restante{routesLoadingCount !== 1 ? "s" : ""}</>
                  ) : routesFailed > 0 && routesRoutedCount > 0 ? (
                    <><Navigation size={12} />{routesRoutedCount} rota{routesRoutedCount !== 1 ? "s" : ""} real{routesRoutedCount !== 1 ? "is" : ""} · {routesFailed} em linha reta (sem dados viários)</>
                  ) : routesFailed > 0 ? (
                    <><Navigation size={12} />Rotas em linha reta — dados viários indisponíveis</>
                  ) : (
                    <><Navigation size={12} />{routesRoutedCount} trecho{routesRoutedCount !== 1 ? "s" : ""} com rota viária real</>
                  )}
                </div>
              )}

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

              {/* Dias */}
              {trip.days.map((day, dayIndex) => {
                const interDayLeg =
                  dayIndex > 0 && day.stops.length > 0 && trip.days[dayIndex - 1].stops.length > 0
                    ? estimateLeg(trip.days[dayIndex - 1].stops.at(-1)!.poloId, day.stops[0].poloId)
                    : null;
                const dayTotalKm = day.stops.reduce((sum, stop, stopIndex) => {
                  const previous = stopIndex > 0 ? day.stops[stopIndex - 1] : undefined;
                  return sum + (previous ? estimateLeg(previous.poloId, stop.poloId)?.km ?? 0 : 0);
                }, 0);
                const dayTotalMinutes = day.stops.reduce((sum, stop, stopIndex) => {
                  const previous = stopIndex > 0 ? day.stops[stopIndex - 1] : undefined;
                  return sum + (previous ? estimateLeg(previous.poloId, stop.poloId)?.minutes ?? 0 : 0);
                }, 0);

                return (
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
                      <div className="inline-actions">
                        {day.stops.length >= 3 && (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            style={{ padding: "7px 12px" }}
                            title="Reorganizar as paradas a partir da primeira parada"
                            onClick={() => optimizeTripDay(dayIndex)}
                          >
                            <Navigation size={12} /> Melhor trajeto
                          </button>
                        )}
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
                      {interDayLeg && (
                        <div className="day-banner" style={{ marginBottom: 4 }}>
                          <Navigation size={13} style={{ display: "inline", marginRight: 6 }} />
                          Transição do dia anterior: <strong>~{interDayLeg.km} km</strong> · {formatMinutes(interDayLeg.minutes)}
                        </div>
                      )}
                      {day.stops.map((stop, stopIndex) => {
                        const leg = stopIndex > 0 ? estimateLeg(day.stops[stopIndex - 1].poloId, stop.poloId) : null;
                        return (
                          <div key={stop.id} className="stop-card">
                            {leg && (
                              <div className="leg-chip">
                                <Navigation size={11} />
                                ~{leg.km} km · {formatMinutes(leg.minutes)}
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

                    {/* Hint de clique e sugestões de polos próximos */}
                    {trip.activeDayIndex === dayIndex && (() => {
                      const lastStop = day.stops.at(-1);
                      const lastCoord = lastStop ? coords[lastStop.poloId] : null;
                      const usedIds = new Set(trip.days.flatMap((d) => d.stops.map((s) => s.poloId)));
                      const nearby = lastCoord
                        ? polos
                            .filter((p) => !usedIds.has(p.id) && coords[p.id])
                            .map((p) => ({ polo: p, km: Math.round(haversine(lastCoord, coords[p.id])) }))
                            .filter(({ km }) => km <= 200)
                            .sort((a, b) => a.km - b.km)
                            .slice(0, 5)
                        : [];
                      return (
                        <>
                          <div className="add-hint">
                            <MapPin size={12} style={{ display: "inline", marginRight: 5, opacity: 0.6 }} />
                            Clique em um polo no mapa para adicionar
                          </div>
                          {nearby.length > 0 && (
                            <div className="nearby-section">
                              <p className="eyebrow" style={{ fontSize: "0.68rem", padding: "0 2px" }}>
                                <MapPin size={9} style={{ display: "inline", marginRight: 4 }} />
                                Polos próximos a {findPolo(lastStop!.poloId)?.city ?? "último polo"} — Adicionar ao Dia {dayIndex + 1}?
                              </p>
                              {nearby.map(({ polo, km }) => (
                                <div key={polo.id} className="nearby-card">
                                  <div>
                                    <strong>{polo.name}</strong>
                                    <p>{polo.city} · ~{km} km</p>
                                  </div>
                                  <button
                                    className="btn btn-secondary"
                                    type="button"
                                    style={{ padding: "5px 10px", fontSize: "0.75rem", flexShrink: 0 }}
                                    onClick={() => setTrip((c) => ({
                                      ...c,
                                      days: c.days.map((d, i) =>
                                        i === dayIndex
                                          ? { ...d, stops: [...d.stops, createTripStop(polo.id)] }
                                          : d
                                      ),
                                    }))}
                                  >
                                    + ADD
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}

                    <div className="day-footer">
                      <span>{day.stops.length} parada{day.stops.length !== 1 ? "s" : ""}</span>
                      <span>~{dayTotalKm} km no dia</span>
                      <span>{dayTotalMinutes > 0 ? formatMinutes(dayTotalMinutes) : "Sem deslocamento"}</span>
                    </div>
                  </article>
                );
              })}

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
                  className="btn btn-secondary"
                  type="button"
                  onClick={printTripDraft}
                  title="Gerar PDF do roteiro atual"
                >
                  <Save size={14} /> PDF
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={saveTrip}
                  disabled={savingTrip}
                >
                  {savingTrip ? "Salvando…" : <><Save size={14} /> Salvar</>}
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
                              if (savedTrip.days[0]?.stops[0]?.polo.uf) setSelectedUfs([savedTrip.days[0].stops[0].polo.uf]);
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
