# Frontend Step 02: Passenger Ride Request

## Goal

Let an authenticated passenger create a ride request using seeded Dhaka zones,
see the backend's fare estimate first, choose seats and payment method, and get
a clear confirmation when the request is accepted by the API. Ride history,
cancellation controls, and live status tracking remain a later slice.

## Implemented

- Passenger dashboard loads active zones from `GET /api/zones` and presents
  pickup and destination selectors.
- Rejects identical pickup and destination choices before asking the API.
- Supports one to three requested seats and `CASH` or `WALLET` payment; cash is
  the default.
- Requests estimates through authenticated `POST /api/fares/estimate` and
  presents solo, two-seat-occupancy, and three-seat-occupancy scenarios.
- Invalidates the quote when route or seat selections change; ride submission
  is enabled only for a quote matching the current selections.
- Creates a request through authenticated `POST /api/rides` and confirms its
  `REQUESTED` status, route, seats, payment method, and estimated fare.
- Includes loading, empty-zone, API-error, estimating, and submitting states.
- Keeps the existing driver welcome shell unchanged.

## API Contracts

- Zones: `GET /api/zones` -> `{ success, data: Zone[] }`.
- Fare preview: `POST /api/fares/estimate` with
  `{ originZoneId, destinationZoneId, seatsRequested }` and bearer token.
- Create ride: `POST /api/rides` with
  `{ originZoneId, destinationZoneId, seatsRequested, paymentMethod }` and
  bearer token.
- The backend currently returns the estimate key `twoPasssengers` (three s's).
  The frontend API client maps it to `twoPassengerPool` without changing the
  backend contract.

## Decisions and Limits

- Use explicit fare estimation instead of estimating on every selector change;
  this avoids unnecessary requests and gives the passenger a clear quote step.
- Display the solo fare and the two shared-occupancy scenarios. The backend
  computes discounts from occupied seats; shared fares are estimates until a
  pool's actual occupancy is known.
- The request's estimated fare is informational. Payment method is recorded
  with the ride; wallet settlement happens at trip completion in the backend.
- This slice does not add polling, ride history, or cancellation UI. An
  unsuccessful request leaves the quote visible so the passenger can retry.

## Run and Verify

1. Start PostgreSQL and the API from the repository root with
   `docker compose up -d postgres backend`.
2. Start the frontend with `cd frontend` and `npm run dev`.
3. Sign in as Nusrat (`01700000002`, password `DhakaPoolDemo123!`).
4. Select Banani and Mohakhali, leave one seat and Cash selected, then click
   `Estimate fare`. Expected estimates are BDT 60.00 solo, BDT 48.00 at two
   occupied seats, and BDT 42.00 at three occupied seats.
5. Click `Request this ride` and confirm the route, `REQUESTED` status, payment
   method, and BDT 60.00 estimated fare.
6. To keep the seed account available for another request, cancel the test
   request through `PATCH /api/rides/:id/cancel` before repeating the test.
7. Run `npm run build` and `npm run lint` from `frontend`.

## Git Proposal

- Branch: `feature/front(ride-request)`
- `793e5a7 feat(api): add typed ride request client` — zone, fare estimate, and
  ride request types and API methods in `frontend/src/lib/api.ts`.
- `369e50a feat(frontend): add passenger ride request panel` — route selection,
  fare preview, request submission, confirmation, and associated styling in
  `frontend/src/components/ride-request-panel.tsx` and
  `frontend/src/app/globals.css`.
- `48a9d73 feat(frontend): connect ride requests to passenger session` — pass
  the authenticated token to the panel and show it only for passenger accounts
  in `frontend/src/components/auth-portal.tsx`.
- `docs(frontend): document passenger ride request step` — record this scope,
  decisions, verification, and commit history in this document.
- Formatter reflow was kept with related API/auth changes rather than made a
  standalone commit.

## Next Step

Passenger request tracking, personal ride history, and cancellation rules.
