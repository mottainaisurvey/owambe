-- Phase 5.2 Amendment-01: Channel Registry + destinationUrl field
-- Brief A Rev 2 + Amendment-01 BILATERAL CONCURRENCE
-- Creates channels table with identity + auth + capabilities + destination + state

-- ChannelAuthScheme enum
CREATE TYPE "ChannelAuthScheme" AS ENUM ('HMAC_SHA256');

-- ChannelState enum
CREATE TYPE "ChannelState" AS ENUM ('ACTIVE', 'PAUSED', 'DECOMMISSIONED');

-- channels table (Brief A Rev 2 + Amendment-01)
CREATE TABLE "channels" (
    "id"                    TEXT NOT NULL,
    "slug"                  TEXT NOT NULL,
    "name"                  TEXT NOT NULL,
    "contact_email"         TEXT,
    "auth_scheme"           "ChannelAuthScheme" NOT NULL DEFAULT 'HMAC_SHA256',
    "hmac_secret"           TEXT,
    "signature_header"      TEXT NOT NULL DEFAULT 'X-Signature',
    "supports_stays"        BOOLEAN NOT NULL DEFAULT false,
    "supports_experiences"  BOOLEAN NOT NULL DEFAULT false,
    "supports_events"       BOOLEAN NOT NULL DEFAULT false,
    "supports_vendors"      BOOLEAN NOT NULL DEFAULT false,
    "destination_url"       TEXT,
    "state"                 "ChannelState" NOT NULL DEFAULT 'ACTIVE',
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on slug
CREATE UNIQUE INDEX "channels_slug_key" ON "channels"("slug");

-- Operational indexes
CREATE INDEX "channels_slug_idx" ON "channels"("slug");
CREATE INDEX "channels_state_idx" ON "channels"("state");
