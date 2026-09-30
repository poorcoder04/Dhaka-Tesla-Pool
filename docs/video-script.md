# Video script — 6 minutes

Timings follow the PRD's §13 shape: problem, engineering, product tour. Read
this as a teleprompter, not a manual. Where it says **[SHOW]**, the thing named
should be on screen at that moment.

Record against the live deployment so the URL is visible:
**https://dhaka-tesla-pool-web-9ejc.onrender.com**

Before you hit record:

- Close Chrome tabs you do not need. The machine has been memory-starved and
  screen recording plus a browser is what tips it over.
- Load the app once and wait out the 30-50s cold start. Do not record it.
- Reset the live database first if the demo state is dirty. Nusrat should have
  no open request and Jashim should be offline, or steps 2 and 3 have nothing to
  show.
- Open two tabs side by side before recording: Tab A driver, Tab B passenger.

---

## 0:00–1:00 — Problem

> Every morning, Dhaka fills up. A car takes one person from Banani to
> Mohakhali, and the other two seats go out empty. The passenger pays the whole
> fare. The driver carries one passenger instead of three. Everyone loses.
>
> This project is called **Dhaka Tesla Pool**. The idea is simple: passengers
> ask for a trip between two named zones. Drivers running an electric rickshaw
> — we call them Teslas — fill their remaining seats with people heading a
> compatible way. As the pool fills, everyone pays less.
>
> Three people in this story. **[SHOW Tab B — the sign-in screen]**
>
> **Nusrat** wants to go Banani to Mohakhali. Alone, that is 60 taka.
>
> **Rafiq** wants to go Banani to Gulshan 1. Also 75 taka alone.
>
> And **Jashim** drives a Tesla called Bullet, with three seats. **[SHOW Tab A
> — sign in as Jashim]** One car, two passengers, and it works because Gulshan 1
> and Mohakhali are both in the same part of the city.
>
> Separately they pay 135 taka between them. Pooled, they pay 94.50 — a 30%
> discount, and Jashim's car is not running empty.

**[Pause. Let the numbers sit.]**

---

## 1:00–3:00 — Engineering

### How matching works

> Matching has two rules, and both are questions a database can answer fast.
>
> First, zones. Dhaka has fixed, well-known neighbourhoods, so there are 13 of
> them in the system — Banani, Mohakhali, Gulshan 1, Farmgate, Dhanmondi, and so
> on. No coordinates, no geocoding. A zone is a name.
>
> **[SHOW `docs/database-design.md`]** — the ERD, eight tables. Users, zones,
> vehicles, pools, ride requests, pool memberships, status history, payments.
>
> Second, clusters. Two destinations count as "the same way" if they fall in the
> same hand-picked group. **[SHOW `backend/src/config/zoneClusters.ts`]** — this
> is the entire file, thirty-nine lines.
>
> Mohakhali, Gulshan 1, Banani, Bashundhara, Baridhara, Badda. One cluster. So
> when Rafiq asks for Gulshan 1 and Jashim's pool is already heading to
> Mohakhali, the system says: same origin, same cluster, **join the existing
> trip**.
>
> A static map instead of geometry. It is not a distance calculation, it is a
> list. I chose it deliberately — this is a deliberate omission, not a
> shortcut, and the README documents why.

### The fare

> **[SHOW the fare preview — `03-fare-preview.png`]**
>
> Base is 30 taka, plus 15 per kilometre. Then a pool discount that steps up
> with occupancy: nothing at one seat, 20% at two, 30% at three and full.
>
> Nusrat: 2 km, so 30 plus 30 equals 60. Alone, 60.
> Rafiq: 3 km, so 30 plus 45 equals 75. Alone, 75.
>
> Now the important detail. **[Point at the two different fares on screen.]**
> Each passenger is charged for **their own** origin to destination. Rafiq goes
> further, so Rafiq pays more — 52.50 against Nusrat's 42 — even though they
> share one car. The fare is not split evenly, and it is not charged for the
> pool's longest leg.
>
> Every calculation is done in **poysha**, hundredths of a taka, as integers,
> and divided by 100 at the end. Money as a float is how you end up with a fare
> of 42.499999. **[SHOW `backend/src/utils/estimateFare.ts`]**

### The interesting part: the seat claim

> This is the bit I want to spend the most time on, because it is the only
> place in this system where two people can genuinely collide.
>
> Jashim's Tesla has three seats. Two passengers want them. Who gets in?
>
> The naive answer is a read, then a check, then a write. Read the pool, see
> one seat left, decrement. That is wrong, and here is why: between the read and
> the write, another driver can accept the last seat. Both of them saw one seat.
> Both of them think they won.
>
> **[SHOW `backend/src/services/pool.service.ts`, the `updateMany`]**
>
> So this is not a read and a write. It is one statement:
>
> ```sql
> UPDATE pools
> SET availableSeats = availableSeats - 1
> WHERE id = ? AND status = 'OPEN' AND availableSeats >= 1;
> ```
>
> The capacity check is **in the `WHERE` clause**. PostgreSQL takes a row lock
> when it runs this. If two transactions arrive together, the first one locks
> the row and commits. The second one waits for that lock, and then — this is
> the part — PostgreSQL **re-evaluates the `WHERE` clause against the row as it
> is now**, not as it was. The seat is gone. The condition is false. Zero rows
> match. The service sees zero and returns 409.
>
> One round trip, and the guarantee is visible in the query itself. I did not
> need `SELECT FOR UPDATE`, and I did not need a version column on the pool.
>
> And this is not a theory. **[SHOW `tests/integration/concurrentSeatClaim.test.ts`]**
> The test takes a real row lock from a second database connection, fires the
> service, asserts it stays blocked, releases the lock, and asserts it comes
> back 409. It proves the behaviour instead of assuming it. That test runs
> against a real PostgreSQL, not a mock — a mocked ORM would prove nothing about
> locking.

---

## 3:00–6:00 — Product tour

> Let me run it. Tab A is Jashim, the driver. Tab B is Nusrat, the passenger.

### Step 1–2 — the starting state

**[SHOW Tab B]** Nusrat signs in. She already has an open request, Banani to
Mohakhali. Notice the panel shows the existing request instead of the booking
form. One active ride per passenger — she cannot stack requests.

**[SHOW Tab A]** Jashim signs in. He is **offline**, and only the "Go online"
prompt is visible. No requests leak before a driver says he is available.

### Step 3–4 — accepting

**[SHOW Tab A — click Go online]**

Nusrat's request appears. **[Click Accept.]**

The dialog shows the seats, the payment method, and how long ago it was
requested — so a driver can see a stale request and skip it.

Accept. A pool opens with **2 of 3 seats free**.

### Step 5 — the passenger's view

**[SHOW Tab B — refresh]**

Nusrat's status is now MATCHED. She sees the driver's name and the vehicle, and
her own fare — 42 taka. She cannot see Rafiq or the pool's total. That is
enforced on the server, not just hidden in the UI.

### Step 6 — the fare preview

**[SHOW Tab B+ — a second passenger tab, sign in as Rafiq]**

Rafiq requests Banani to Gulshan 1. **[SHOW the estimate]** All three tiers are
shown before he commits: what it costs alone, at two seats, at three. The pool
discount is called out explicitly, because a discount nobody sees is not a
discount.

### Step 7 — joining a live trip

**[Back to Tab A — Accept Rafiq]**

Gulshan 1 is a different destination from Mohakhali. But the same origin, and
the same cluster — so he **joins the existing pool** instead of starting a new
trip. Two passengers, **1 seat free**.

This is the thing the whole product is about: a second passenger on a trip
already in progress, heading a compatible direction.

### Step 8 — the first refusal

**[Sign in as a fourth passenger and try to accept]**

**Rejected.** `409 Not enough seats left`. Three seats, three passengers.

This is the same conditional update from earlier, live. The `availableSeats >=
1` clause matched zero rows, so the seat was never taken. Capacity cannot be
exceeded, no matter how many people click at once.

### Step 9 — the trip starts

**[Tab A — Mark arrived, then Start trip]**

Two transitions, and they are enforced by a state machine — you cannot skip a
step or go backwards. **[Show `config/statusTransitions.ts`]** Every one of those
transitions is also written to a status history table, which is what the
passenger's timeline is built from.

**[Show Tab B]** Nusrat sees the change in her timeline.

### Step 10 — the second refusal

**[Tab B — try to Cancel]**

**Refused.** The trip has already started, so the seat cannot be released —
Jashim is driving with three people in the car and cannot now leave one behind.

The check is in the same place as the capacity check: the pool's status has to
be `OPEN` or `DRIVER_ARRIVED` for a seat to be given back. The error message
says why, in words the passenger can act on.

### Step 11–12 — completion and fares

**[Tab A — Complete trip]**

A fare is recorded per passenger, and debited from the wallet. Two separate
charges, 42 and 52.50 — each for their own journey.

**[Tab A — Trip history]**

The finished pool with its full timeline, so Jashim can see exactly what
happened, when, and in what order.

### Closing

> That is the whole system. Four layers — browser, Next.js, Express, PostgreSQL
> — with the business rules in one place, the guarantee in a single SQL
> statement, and a test that proves it under real concurrency.
>
> It is deployed, it is seeded with the demo accounts, and the repository is
> public. The README has the architecture, the API, the trade-offs I made and
> the ones I got wrong.
>
> 52 tests. Every one of them against a real database where it mattered.
>
> Thank you.

---

## Timing

| Section | Content |
| --- | --- |
| 0:00–1:00 | Problem, the three people, 135 vs 94.50 |
| 1:00–1:30 | Zones and clusters, the ERD |
| 1:30–2:00 | The fare formula, per-passenger pricing |
| 2:00–3:00 | The atomic seat claim and the concurrency test |
| 3:00–4:30 | The tour, steps 1–7 |
| 4:30–5:15 | Both refusals, steps 8 and 10 |
| 5:15–6:00 | Completion, history, close |

## If you fall behind

Cut in this order — the tour compresses more gracefully than the engineering:

1. The 13 zones and the ERD tour (keep the cluster file, drop the ERD)
2. The poysha explanation — one sentence is enough
3. Step 12's per-passenger history
4. The closing paragraph after "52 tests"

**Do not cut** the two refusals (steps 8 and 10) or the seat-claim section.
Those are the parts that show the system has rules rather than just screens.
