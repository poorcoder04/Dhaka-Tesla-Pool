The Mental Model
Think of your project as 4 separate layers, each with its own job:


Browser (you)
    ↕  HTTP
Next.js Frontend  (port 3000)
    ↕  HTTP/REST
Express Backend   (port 5000)
    ↕  Prisma
PostgreSQL DB     (port 5433)
Each layer runs independently. You start them separately. You only restart the one you changed.

How Your Backend Folder Will Look

backend/
├── src/
│   ├── index.ts              ← entry point (already done)
│   ├── routes/               ← URL definitions (e.g. /api/auth, /api/rides)
│   │   ├── auth.routes.ts
│   │   ├── ride.routes.ts
│   │   └── pool.routes.ts
│   ├── controllers/          ← request/response handlers
│   │   ├── auth.controller.ts
│   │   └── ride.controller.ts
│   ├── services/             ← business logic (fare calc, pool matching)
│   │   ├── auth.service.ts
│   │   └── pool.service.ts
│   ├── middleware/           ← JWT auth check, error handler
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   └── lib/
│       └── prisma.ts         ← single shared PrismaClient instance
├── prisma/
│   ├── schema.prisma         ← your DB table definitions
│   ├── migrations/           ← auto-generated SQL history (don't edit)
│   └── seed.ts               ← Jashim, Bullet, Nusrat, Rafiq, Shirin
├── generated/
│   └── prisma/               ← auto-generated Prisma types (don't edit)
├── prisma.config.ts
├── tsconfig.json
├── package.json
└── .env
The Complete Command Reference
1. See Your Tables (3 ways)
Way A — Prisma Studio (visual browser UI, easiest)

powershell

cd backend
npx prisma studio
Opens http://localhost:5555 in your browser. You see all tables, rows, and can edit data visually. Use this constantly while building.

Way B — Check migration was applied

powershell

cd backend
npx prisma migrate status
Shows which migrations are applied and if your DB is in sync with schema.

Way C — psql inside Docker (raw SQL)

powershell

docker exec -it dhaka_tesla_postgres psql -U postgres -d tesla_pool_db
Then inside psql:

sql

\dt              -- list all tables
\d users         -- describe the users table
SELECT * FROM users;
\q               -- quit
2. Run Your Backend
Start Postgres first (always required):

powershell

docker compose up postgres -d
Start backend in dev mode (auto-restarts on file save):

powershell

cd backend
npm run dev
Test it's working:

powershell

# In a new terminal
curl http://localhost:5000/health
# Should return: {"status":"ok"}

curl http://localhost:5000/
# Should return: {"message":"Dhaka Tesla Pool API","version":"1.0.0"}
Or just open http://localhost:5000/health in your browser.

3. Your Daily Backend Workflow
Every day you start working:

powershell

# Step 1 - start the database
docker compose up postgres -d

# Step 2 - start the backend (in backend/ folder)
cd backend
npm run dev

# Step 3 (optional) - open visual DB viewer in another terminal
npx prisma studio
When you write a new route/controller:

Just save the file → tsx watch auto-restarts the server
Test with browser or a tool like Postman / Thunder Client (VS Code extension)
When you want to test a specific endpoint:

powershell

# GET request
curl http://localhost:5000/api/rides

# POST request with JSON body
curl -X POST http://localhost:5000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"phone":"01700000001","password":"yourpassword"}'
4. When You Change the Database Schema
This is the most important workflow to get right. Follow this order every time:


Edit schema.prisma
       ↓
Run prisma migrate dev
       ↓
Prisma auto-generates SQL + updates generated/prisma types
       ↓
Your TypeScript code immediately has the new types
       ↓
Restart backend (npm run dev does this automatically)
The commands:

powershell

# 1. You edited prisma/schema.prisma — now create the migration
cd backend
npx prisma migrate dev --name describe_what_you_changed
# Example: npx prisma migrate dev --name add_driver_online_status

# 2. Regenerate the Prisma client (migrate dev does this automatically,
#    but run it manually if types feel stale)
npx prisma generate

# 3. If you want to wipe everything and start fresh (dev only)
npx prisma migrate reset
# This drops DB → re-runs all migrations → re-runs seed automatically
Naming migrations well (evaluators check this):

powershell

npx prisma migrate dev --name add_fare_fields_to_ride_request
npx prisma migrate dev --name add_driver_online_status
npx prisma migrate dev --name create_audit_log_table
5. When You Move to Frontend
powershell

# Stop thinking about backend, open a new terminal
cd frontend
npm run dev
# Opens http://localhost:3000
Frontend talks to backend via http://localhost:5000. You need both running at the same time — backend in one terminal, frontend in another.

6. Full Stack at Once (Docker)
When you want to test everything together exactly as it will deploy:

powershell

# From project root
docker compose up --build
Postgres starts → Prisma migrates + seeds → Backend starts → Frontend starts
Everything on the right ports automatically
powershell

# Stop everything
docker compose down

# Stop and wipe the database volume (full reset)
docker compose down -v
The Golden Rules
Situation	What to do
Changed a .ts file in src/	Nothing — npm run dev auto-restarts
Changed schema.prisma	Run prisma migrate dev --name xyz
Types feel wrong/stale	Run prisma generate
Want to see table data	Run prisma studio
Want to wipe DB and reseed	Run prisma migrate reset
Testing an API endpoint	Use browser (GET) or Thunder Client/Postman (POST)
Ready to test full stack	docker compose up --build
Recommended VS Code Extensions
Install these — they'll make your life much easier:

Thunder Client — test API endpoints without leaving VS Code (like Postman)
Prisma — syntax highlighting for schema.prisma
ESLint — catches errors as you type