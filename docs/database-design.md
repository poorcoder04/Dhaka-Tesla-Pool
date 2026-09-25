# Dhaka Tesla Pool — Database Design (PostgreSQL)

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ VEHICLES : "owns (driver)"
    USERS ||--o{ RIDE_REQUESTS : "makes (passenger)"
    USERS ||--o{ RIDE_STATUS_HISTORY : "triggers change"
    VEHICLES ||--o{ POOLS : "runs"
    ZONES ||--o{ RIDE_REQUESTS : "pickup"
    ZONES ||--o{ RIDE_REQUESTS : "dropoff"
    POOLS ||--o{ POOL_MEMBERSHIPS : "contains"
    RIDE_REQUESTS ||--o| POOL_MEMBERSHIPS : "joins"
    RIDE_REQUESTS ||--o{ RIDE_STATUS_HISTORY : "logs"
    RIDE_REQUESTS ||--o| PAYMENTS : "settled by"

    USERS {
        uuid id PK
        text name
        text email UK
        text password_hash
        text role "PASSENGER or DRIVER"
        timestamptz created_at
    }

    VEHICLES {
        uuid id PK
        uuid driver_id FK
        text model_name
        text license_plate_no UK
        int seat_capacity
        timestamptz created_at
    }

    ZONES {
        uuid id PK
        text name UK
        numeric lat
        numeric lng
    }

    POOLS {
        uuid id PK
        uuid vehicle_id FK
        text status "OPEN, MATCHED, DRIVER_ARRIVED, STARTED, COMPLETED, CANCELLED"
        int available_seats
        int version "optimistic lock"
        timestamptz driver_arrived_at
        timestamptz started_at
        timestamptz completed_at
        timestamptz created_at
    }

    RIDE_REQUESTS {
        uuid id PK
        uuid passenger_id FK
        uuid pool_id FK "nullable until matched"
        uuid pickup_zone_id FK
        uuid dropoff_zone_id FK
        int seats_requested
        text status "REQUESTED, MATCHED, DRIVER_ARRIVED, STARTED, COMPLETED, CANCELLED"
        int base_fare_poysha
        int distance_charge_poysha
        int pool_discount_poysha
        int fare_poysha "total, = base + distance - discount"
        timestamptz requested_at
        timestamptz matched_at
        timestamptz cancelled_at
        timestamptz created_at
    }

    POOL_MEMBERSHIPS {
        uuid id PK
        uuid pool_id FK
        uuid ride_request_id FK UK
        timestamptz joined_at
    }

    RIDE_STATUS_HISTORY {
        uuid id PK
        uuid ride_request_id FK
        text from_status
        text to_status
        uuid changed_by_user_id FK
        timestamptz changed_at
    }

    PAYMENTS {
        uuid id PK
        uuid ride_request_id FK UK
        text method "CASH or WALLET"
        int amount_poysha
        text status "PENDING, PAID, FAILED"
        timestamptz paid_at
    }
```

## 2. Table-by-table schema (DDL)

```sql
CREATE TYPE user_role AS ENUM ('PASSENGER', 'DRIVER');
CREATE TYPE pool_status AS ENUM ('OPEN', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE ride_status AS ENUM ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE payment_method AS ENUM ('CASH', 'WALLET');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'FAILED');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- lets vehicles.driver_id FK to a role-checked subset (see note below)
    UNIQUE (id, role)
);

CREATE TABLE zones (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    TEXT NOT NULL UNIQUE,      -- e.g. 'Banani', 'Gulshan 1', 'Mohakhali'
    lat     NUMERIC(9,6) NOT NULL,
    lng     NUMERIC(9,6) NOT NULL
);

CREATE TABLE vehicles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id         UUID NOT NULL,
    driver_role       user_role NOT NULL DEFAULT 'DRIVER',
    model_name        TEXT NOT NULL,
    license_plate_no  TEXT NOT NULL UNIQUE,
    seat_capacity     INT NOT NULL CHECK (seat_capacity > 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (driver_id, driver_role) REFERENCES users (id, role)
);

CREATE TABLE pools (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id          UUID NOT NULL REFERENCES vehicles (id),
    status              pool_status NOT NULL DEFAULT 'OPEN',
    available_seats     INT NOT NULL CHECK (available_seats >= 0),
    version             INT NOT NULL DEFAULT 0,          -- optimistic locking
    driver_arrived_at   TIMESTAMPTZ,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ride_requests (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id              UUID NOT NULL,
    passenger_role            user_role NOT NULL DEFAULT 'PASSENGER',
    pool_id                   UUID REFERENCES pools (id),   -- NULL until matched
    pickup_zone_id            UUID NOT NULL REFERENCES zones (id),
    dropoff_zone_id           UUID NOT NULL REFERENCES zones (id),
    seats_requested           INT NOT NULL CHECK (seats_requested > 0),
    status                    ride_status NOT NULL DEFAULT 'REQUESTED',
    base_fare_poysha          INT NOT NULL,
    distance_charge_poysha    INT NOT NULL,
    pool_discount_poysha      INT NOT NULL DEFAULT 0,
    fare_poysha               INT GENERATED ALWAYS AS
                                 (base_fare_poysha + distance_charge_poysha - pool_discount_poysha) STORED,
    requested_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    matched_at                TIMESTAMPTZ,
    cancelled_at              TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (pickup_zone_id <> dropoff_zone_id),
    FOREIGN KEY (passenger_id, passenger_role) REFERENCES users (id, role)
);

CREATE TABLE pool_memberships (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id           UUID NOT NULL REFERENCES pools (id),
    ride_request_id   UUID NOT NULL UNIQUE REFERENCES ride_requests (id),
    joined_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ride_status_history (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_request_id      UUID NOT NULL REFERENCES ride_requests (id),
    from_status          ride_status,
    to_status            ride_status NOT NULL,
    changed_by_user_id   UUID REFERENCES users (id),
    changed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_request_id    UUID NOT NULL UNIQUE REFERENCES ride_requests (id),
    method             payment_method NOT NULL,
    amount_poysha      INT NOT NULL,
    status             payment_status NOT NULL DEFAULT 'PENDING',
    paid_at            TIMESTAMPTZ
);

-- Indexes for the access patterns the app actually needs
CREATE INDEX idx_ride_requests_status ON ride_requests (status);
CREATE INDEX idx_ride_requests_passenger ON ride_requests (passenger_id);
CREATE INDEX idx_ride_requests_pool ON ride_requests (pool_id);
CREATE INDEX idx_pools_vehicle ON pools (vehicle_id);
CREATE INDEX idx_pools_status ON pools (status);
CREATE INDEX idx_vehicles_driver ON vehicles (driver_id);
CREATE INDEX idx_ride_status_history_ride ON ride_status_history (ride_request_id);
```

## 3. Design notes worth putting in the README

**Money storage.** Every fare/amount column is `INT` in poysha (1 taka = 100 poysha) — integer minor units, never `NUMERIC`/`FLOAT` for currency, so rounding errors can't creep into split fares.

**Fare is a generated column.** `fare_poysha` is `GENERATED ALWAYS AS (base + distance - discount) STORED`, so the total can never drift from its components — the evaluator (or a test) can verify `base_fare_poysha + distance_charge_poysha - pool_discount_poysha = fare_poysha` directly from one row, by hand, exactly as Section 5 asks.

**Driver FK to a role-checked subset.** Postgres has no native "FK to rows where role = X" constraint. The trick used here: add `UNIQUE (id, role)` on `users`, then `vehicles.driver_id` / `ride_requests.passenger_id` carry a redundant `_role` column with a `DEFAULT` and FK to `(id, role)` as a composite key. This enforces "a vehicle's driver_id must point to a user whose role is DRIVER" at the DB level instead of only in application code. Document this as a deliberate trade-off — it's a bit unusual and worth being ready to explain.

**Concurrency (Section 14's seat race).** `pools.available_seats` is only ever changed via an atomic conditional update inside the same transaction that inserts the `pool_memberships` row:

```sql
UPDATE pools
SET available_seats = available_seats - :seats_requested,
    version = version + 1
WHERE id = :pool_id
  AND available_seats >= :seats_requested
RETURNING available_seats;
```

If this returns zero rows, the claim failed (someone else took the seat first) and the app returns a "seat no longer available" error rather than overbooking. The `version` column is kept as a secondary optimistic-lock signal / audit trail even though the `WHERE available_seats >= :n` guard is what actually prevents the race — worth explaining both in the interview. At scale, this is the point where you'd move to row-level locking (`SELECT ... FOR UPDATE`) or a queue-based matcher; document that as a "what I'd change" item.

**History, not just current state.** `ride_status_history` is append-only and logs every transition with who triggered it and when, satisfying the PRD's "hold onto enough history to explain exactly what happened." `pools`/`ride_requests.status` stay as the fast "current state" columns; the history table is the audit trail — don't try to reconstruct history by diffing status columns.

**Zones as a lookup table, not free text.** `zones` holds the predefined Dhaka-area list (Banani, Gulshan 1, Mohakhali, etc.) with lat/lng, so the matching rule (documented separately, e.g. "same pickup zone + destination zones within one hop") and `distance_charge_poysha` (e.g. haversine between zone centroids) both have something concrete to compute from — not hardcoded strings scattered across the app.

**`pool_id` nullable on `ride_requests`.** A request starts `REQUESTED` with `pool_id = NULL`; matching either attaches it to an existing open pool or creates a new one. `pool_memberships` is technically redundant with `ride_requests.pool_id` once matched, but it's kept as the single place that enforces "one ride request can only ever join one pool" via its `UNIQUE (ride_request_id)` constraint — cheap insurance against a bug double-inserting a membership row.

**Payments kept minimal.** One row per ride request (`UNIQUE (ride_request_id)`), `CASH` or `WALLET`, no real gateway — matches Section 5's "simulated TeslaPay wallet, no real gateway needed."