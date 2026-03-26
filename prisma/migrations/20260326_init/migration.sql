-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Polo" (
    "id" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "uf" VARCHAR(2) NOT NULL,
    "city" TEXT NOT NULL,
    "neighborhood" TEXT,
    "street" TEXT,
    "agent" TEXT,
    "manager" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Polo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "uf" VARCHAR(2) NOT NULL,
    "hostPoloId" TEXT NOT NULL,
    "hostParticipants" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterParticipant" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "poloId" TEXT NOT NULL,
    "participants" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "traveler" TEXT,
    "flightOutboundFrom" TEXT,
    "flightOutboundTo" TEXT,
    "flightOutboundDate" TIMESTAMP(3),
    "flightOutboundTime" TEXT,
    "flightReturnFrom" TEXT,
    "flightReturnTo" TEXT,
    "flightReturnDate" TIMESTAMP(3),
    "flightReturnTime" TEXT,
    "vehicle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDay" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "overnightCity" TEXT,
    "hotel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripStop" (
    "id" TEXT NOT NULL,
    "tripDayId" TEXT NOT NULL,
    "poloId" TEXT NOT NULL,
    "stopIndex" INTEGER NOT NULL,
    "arrivalTime" TEXT,
    "departureTime" TEXT,
    "objective" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Polo_code_key" ON "Polo"("code");

-- CreateIndex
CREATE INDEX "Polo_uf_city_idx" ON "Polo"("uf", "city");

-- CreateIndex
CREATE INDEX "Encounter_uf_createdAt_idx" ON "Encounter"("uf", "createdAt");

-- CreateIndex
CREATE INDEX "EncounterParticipant_encounterId_order_idx" ON "EncounterParticipant"("encounterId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "EncounterParticipant_encounterId_poloId_key" ON "EncounterParticipant"("encounterId", "poloId");

-- CreateIndex
CREATE INDEX "TripDay_tripId_dayIndex_idx" ON "TripDay"("tripId", "dayIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TripDay_tripId_dayIndex_key" ON "TripDay"("tripId", "dayIndex");

-- CreateIndex
CREATE INDEX "TripStop_tripDayId_stopIndex_idx" ON "TripStop"("tripDayId", "stopIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TripStop_tripDayId_stopIndex_key" ON "TripStop"("tripDayId", "stopIndex");

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_hostPoloId_fkey" FOREIGN KEY ("hostPoloId") REFERENCES "Polo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterParticipant" ADD CONSTRAINT "EncounterParticipant_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterParticipant" ADD CONSTRAINT "EncounterParticipant_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES "Polo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripDay" ADD CONSTRAINT "TripDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES "Polo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
