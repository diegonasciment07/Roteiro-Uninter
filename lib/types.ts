export type Coordinates = [number, number];

export interface PoloRecord {
  id: string;
  code: number;
  name: string;
  uf: string;
  city: string;
  neighborhood: string | null;
  street: string | null;
  agent: string | null;
  manager: string | null;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodePrecision: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EncounterParticipantRecord {
  id: string;
  participants: number;
  order: number;
  polo: PoloRecord;
}

export interface EncounterRecord {
  id: string;
  uf: string;
  hostParticipants: number;
  scheduledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  hostPolo: PoloRecord;
  participants: EncounterParticipantRecord[];
}

export interface TripStopRecord {
  id: string;
  stopIndex: number;
  arrivalTime: string | null;
  departureTime: string | null;
  objective: string | null;
  polo: PoloRecord;
}

export interface TripDayRecord {
  id: string;
  dayIndex: number;
  date: string | null;
  overnightCity: string | null;
  hotel: string | null;
  stops: TripStopRecord[];
}

export interface TripRecord {
  id: string;
  title: string;
  traveler: string | null;
  flightOutboundFrom: string | null;
  flightOutboundTo: string | null;
  flightOutboundDate: string | null;
  flightOutboundTime: string | null;
  flightReturnFrom: string | null;
  flightReturnTo: string | null;
  flightReturnDate: string | null;
  flightReturnTime: string | null;
  vehicle: string | null;
  createdAt: string;
  updatedAt: string;
  days: TripDayRecord[];
}

export interface TripDraftStop {
  id: string;
  poloId: string;
  arrivalTime: string;
  departureTime: string;
  objective: string;
}

export interface TripDraftDay {
  id: string;
  date: string;
  overnightCity: string;
  hotel: string;
  stops: TripDraftStop[];
}

export interface TripDraft {
  title: string;
  traveler: string;
  flightOutboundFrom: string;
  flightOutboundTo: string;
  flightOutboundDate: string;
  flightOutboundTime: string;
  flightReturnFrom: string;
  flightReturnTo: string;
  flightReturnDate: string;
  flightReturnTime: string;
  vehicle: string;
  activeDayIndex: number;
  days: TripDraftDay[];
}
