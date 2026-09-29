# Frontend Step 01: Authentication Foundation

## Goal

Replace the generated Next.js starter page with a working authentication entry
point and role-aware signed-in shell. This step establishes the frontend's API
and session boundary; ride booking and driver operations are separate steps.

## Implemented

- Typed browser API calls for `POST /api/auth/login`, `POST /api/auth/signup`,
  and `GET /api/auth/me`.
- Passenger and driver registration. Driver registration collects the first
  vehicle's name, model, plate number, and seat capacity, matching backend
  validation.
- Login using an 11-digit Bangladeshi phone number and password.
- JWT stored in `sessionStorage`; a page refresh validates the token through
  `/api/auth/me`. Signing out removes the tab's token.
- Role-aware signed-in state displaying account name, phone, and role.
- Demo account quick-fill controls for Nusrat and Jashim.
- Responsive authentication screen, request-pending state, API error feedback,
  accessible form labels, and reduced-motion support.

## Decisions

- Keep direct browser-to-Express requests using `NEXT_PUBLIC_API_URL` and the
  backend's explicit `FRONTEND_ORIGIN` CORS allowlist. No extra state, form, or
  UI library is needed for this slice.
- Use `sessionStorage` because the backend issues bearer JWTs and does not yet
  provide a cookie session. This keeps the token tab-scoped but makes it
  accessible to JavaScript; an HttpOnly cookie-backed session would be a
  stronger production design.
- The signed-in screen confirms identity and role only. It does not imply ride
  booking or driver controls exist before those slices are implemented.

## Demo Accounts

Both accounts use `DhakaPoolDemo123!`:

| Role | Name | Phone |
| --- | --- | --- |
| Passenger | Nusrat | `01700000002` |
| Driver | Jashim | `01700000001` |

The credential is for local/demo use only; the seed hashes it before storage.

## Run and Verify

1. From the repository root, run `docker compose up -d postgres backend`.
2. In another terminal, run `cd frontend` and then `npm run dev`.
3. Open `http://localhost:3000`, select the Nusrat or Jashim demo control, and
   submit the sign-in form.
4. Confirm the signed-in screen shows the correct name and role. Refresh the
   same tab to verify `/api/auth/me` restores the session; sign out and confirm
   the form returns.
5. Test passenger signup with a new valid phone number. Test driver signup
   with vehicle fields and verify the driver's first vehicle is accepted.
6. Run `npm run build` and `npm run lint` from `frontend`.

## Git

- Branch: `feature/frontend-step-01`
- Commit message: `feat(frontend): add authentication foundation`
- This implementation and its documentation are committed together.

## Next Step

Passenger ride request: load zones, choose origin/destination, estimate fare,
and submit a ride request.