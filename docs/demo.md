# Demo

Everything below runs on the seeded database. No setup beyond `docker compose up`.

## Demo accounts

| Person  | Phone         | Password          | Role      |
| ------- | ------------- | ----------------- | --------- |
| Jashim  | `01700000001` | `DhakaPoolDemo123!` | Driver ("Bullet", 3 seats) |
| Nusrat  | `01700000002` | `DhakaPoolDemo123!` | Passenger |
| Rafiq   | `01700000003` | `DhakaPoolDemo123!` | Passenger |
| Shirin  | `01700000004` | `DhakaPoolDemo123!` | Passenger |

The sign-in screen has **Nusrat** and **Jashim** one-click buttons that fill
these in, so the demo never needs typing.

Nusrat starts with one open `REQUESTED` ride, Banani → Mohakhali. That is the
state the story starts from.

## The 3-minute story

Two browser tabs. Tab A is the driver, tab B is a passenger.

| # | Tab | Action | What to point at |
| - | --- | ------ | ---------------- |
| 1 | B | Sign in as **Nusrat** | She already has an open Banani → Mohakhali request. The panel shows it instead of the booking form — one active ride per passenger. |
| 2 | A | Sign in as **Jashim** | He starts offline. Only the "Go online" prompt is visible — no requests leak before he is available. |
| 3 | A | Click **Go online** | Nusrat's request appears in the open list. |
| 4 | A | **Accept** | The dialog shows seats, payment method and how long ago it was requested. Accept. A pool opens with **2 of 3 seats free**. |
| 5 | B | Refresh Nusrat's tab | Her status is now `MATCHED`, and the driver/vehicle is named. She sees her own fare and status only. |
| 6 | B+ | Sign in as **Rafiq** in a second passenger tab, request Banani → Gulshan 1, estimate, request | Fare preview shows all three tiers: solo, 2 seats, 3 seats, with the pool discount called out. |
| 7 | A | **Accept** Rafiq | Gulshan 1 is a different destination but the same cluster, so he **joins the existing pool** instead of starting a new trip. **1 seat free.** |
| 8 | — | Sign in as a 4th passenger and try to accept a ride | Rejected: `409 Not enough seats left`. Capacity cannot be exceeded. |
| 9 | A | **Mark arrived** → **Start trip** | Passenger tabs show the status change in their timelines. |
| 10 | B | Try to **Cancel** now | Refused: the trip has already started, so the seat cannot be released. |
| 11 | A | **Complete trip** | A fare is recorded per passenger. |
| 12 | A | Each passenger's tab → **Ride history** | Final fare per person, and the full status timeline. |
| 13 | A | **Trip history** tab | The finished pool with its timeline, so the driver can explain exactly what happened. |

## Fares in this scenario

Base 30 BDT + 15 BDT/km, then the pool discount:

| Passenger | Route | Solo | 3 seats occupied (−30%) | Charged |
| --------- | ----- | ---- | ----------------------- | ------- |
| Nusrat | Banani → Mohakhali (2 km) | 60 | 42 | **42** |
| Rafiq  | Banani → Gulshan 1 (3 km) | 75 | 52.50 | **52.50** |
| Shirin | Banani → Mohakhali (2 km) | 60 | 42 | **42** |

Each passenger is charged for **their own** origin → destination, not the
pool's, so Rafiq pays more even though they share one Tesla. The 30% tier
applies once all three seats are occupied.

## Screenshots

Captured and committed in `docs/screenshots/`, at both widths, embedded in the
[README](../README.md#screenshots). The table below is the manifest.

| File                          | View                        | Widths        |
| ----------------------------- | --------------------------- | ------------- |
| `01-sign-in.png`              | Sign-in screen with demo buttons | 1280, 390 |
| `02-passenger-new-ride.png`  | Nusrat's booking form, zones loaded | 1280, 390 |
| `03-fare-preview.png`        | Fare estimate showing all three tiers | 1280, 390 |
| `04-driver-offline.png`      | Jashim offline, no requests visible | 1280, 390 |
| `05-driver-online-requests.png` | Jashim online with open requests | 1280, 390 |
| `06-accept-modal.png`        | The accept dialog           | 1280, 390    |
| `07-active-pool.png`         | Active trip: seat summary, passengers, timeline | 1280, 390 |
| `08-passenger-tracking.png`  | Nusrat's status timeline while underway | 1280, 390 |
| `09-wallet-topup.png`        | TeslaPay wallet with top-up form open | 1280, 390 |
| `10-trip-complete.png`       | Completed trip with per-passenger fares | 1280, 390 |
| `11-history.png`             | Driver trip history, timeline expanded | 1280, 390 |

### Error and empty states — not captured

These are the states that usually go undocumented, and they are the ones the
PRD's "clear loading/error/empty states" requirement is really about:

| File                              | How to trigger it |
| --------------------------------- | ----------------- |
| `12-wallet-unavailable.png`       | Stop the backend, then load a passenger's booking form |
| `13-api-unreachable.png`          | Same — the top-level panels now say the API cannot be reached instead of showing a raw fetch error |
| `14-empty-history.png`            | A fresh account with no completed rides |
| `15-no-open-requests.png`         | Jashim online with nobody waiting |
| `16-no-tesla-registered.png`      | Register a driver with no vehicle, then go online |

The first two need the backend stopped, which is not possible against a hosted
service, and the three easy ones were not worth padding the README with. The
states are all handled in the application — the README documents this under
Known limitations rather than implying the screenshots are exhaustive.

## Video outline (6 minutes)

The full word-for-word script is in [`video-script.md`](video-script.md).

Walk the 13 steps above, driving the live deployment at
**https://dhaka-tesla-pool-web-9ejc.onrender.com** so the URL is visible on
screen. Wait out the 30–50s cold start before recording.

The PRD's timing, with this project's content mapped onto it.

| Time      | Section | Content |
| --------- | ------- | ------- |
| 0:00–1:00 | Problem | Dhaka commute, why solo is expensive, what a pool changes. The three people. |
| 1:00–3:00 | Engineering | Zone + cluster matching, the fare formula with Nusrat and Rafiq's numbers, the atomic seat-claim update, the PostgreSQL row-lock argument, the ERD. |
| 3:00–6:00 | Product tour | The 13-step walkthrough above, including one capacity rejection and one cancellation refusal. |

Record it **after** deployment, so the deployment URL can be shown.
