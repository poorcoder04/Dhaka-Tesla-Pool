# Frontend Step 03: Ride Tracking, History, and Cancellation

## Goal

Restore a passenger's active ride after login or refresh, show its status
history, let the passenger refresh status manually, allow cancellation only
while the backend considers the request cancellable, and expose completed or
cancelled rides in personal history.

## Implemented

- Loads the authenticated passenger's rides from `GET /api/rides/me` before
  offering a new request. An active request replaces the booking form, enforcing
  the backend's one-active-request rule in the UI.
- Active statuses are `REQUESTED`, `MATCHED`, `DRIVER_ARRIVED`, and `STARTED`.
- Loads an active ride's owner-checked details and chronological timeline from
  `GET /api/rides/:id` and `GET /api/rides/:id/history`.
- Manual `Refresh status` reloads the passenger list, current ride details, and
  timeline together. No polling is used in this MVP slice.
- Shows assigned driver and vehicle details only when a pool has been assigned;
  the passenger endpoint intentionally does not disclose other passengers.
- Allows cancellation for `REQUESTED`, `MATCHED`, and `DRIVER_ARRIVED`, matching
  backend transition rules. A confirmation is required. The UI does not offer
  cancellation after `STARTED`; server conflicts are shown without hiding the
  active ride.
- Shows `COMPLETED` and `CANCELLED` rides in an expandable personal history
  list. Expanded rows show each ride's own status timeline.
- Completed rides load actual payment details from
  `GET /api/payments/ride/:rideRequestId`. Cancelled rides explain that no
  payment was collected.
- A newly submitted ride can be opened directly in the tracking view.

## API Contracts

- `GET /api/rides/me` returns the authenticated passenger's ride requests.
- `GET /api/rides/:id` returns one ride only after verifying passenger
  ownership.
- `GET /api/rides/:id/history` returns only that passenger's timeline, oldest
  event first.
- `PATCH /api/rides/:id/cancel` enforces ownership and cancellation rules in
  the backend; frontend visibility is only a convenience, not authorization.
- `GET /api/payments/ride/:rideRequestId` returns a payment for its passenger
  or assigned driver. A 404 for a completed ride is treated as no recorded
  payment yet; other API failures remain visible.

## Decisions and Limits

- Manual refresh is used instead of polling to keep the MVP and request volume
  simple. Realtime updates can be added later if the experience requires them.
- The UI preserves the backend as the source of truth for ride transitions,
  ownership, seat release, and cancellation races.
- Ride history is loaded with the passenger-scoped ride list; each timeline and
  final payment is fetched only when that history row is expanded.
- This step does not add maps, push notifications, or driver controls.

## Run and Verify

1. Start the database and API with `docker compose up -d postgres backend`.
2. Start the frontend with `cd frontend` and `npm run dev`.
3. Sign in as Nusrat (`01700000002`) or Rafiq (`01700000003`) with the demo
   password `DhakaPoolDemo123!`.
4. Create a ride, use `Track this request`, and verify the `REQUESTED` event
   appears in its timeline. Refresh the browser tab and confirm the active ride
   is restored instead of a second request form.
5. Use `Refresh status` and confirm route/status/timeline remain consistent.
6. Cancel while the status is `REQUESTED`; confirm the success state and find
   the cancelled ride in Ride history with its cancellation event.
7. Verify cancellation controls are not shown after `STARTED`. Completed rides
   should show final payment amount/status when a payment record exists.
8. Run `npm run build` and `npm run lint` from `frontend`.

## Git History

Branch: `feature/tracking-history`

1. `e58d2bf feat(api): add passenger ride tracking client`
2. `834d2a3 feat(frontend): restore active passenger ride`
3. `5a56455 feat(frontend): add ride timeline and manual refresh`
4. `ad32798 feat(frontend): allow passenger ride cancellation`
5. `47a6068 feat(frontend): add passenger ride history`
6. `docs(frontend): document ride tracking and cancellation`

## Next Step

Driver availability, open-request browsing, acceptance into a pool, and trip
lifecycle controls.