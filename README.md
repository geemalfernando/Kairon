# Kairon
Delivery planning and operations frontend for Waypoint Group, connecting ordering, allocation, loading, delivery and receipt, with explainable demo predictions and failure recovery.

## Frontend (`web/`)

Responsive, installable web app covering all four roles, built with React 19, TypeScript, Vite, Tailwind CSS v4 and Zustand.

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build
```

Sign in with a demo account (password `kairon-demo`) or use the one-tap **Demo access** buttons:

| Role | Email | Lands on |
|---|---|---|
| Dispatcher | dispatcher@kairon.demo | `/dispatcher` |
| Loader | loader@kairon.demo | `/loader` |
| Driver | driver@kairon.demo | `/driver` |
| Store manager | store@kairon.demo | `/store` |

**One shared operation.** All roles read and write a single operational state (`src/store`). It is persisted locally and synced across browser tabs, so a dispatcher in one tab and a driver in another see each other's decisions live. Field actions (loading counts, arrivals, deliveries, proof, vehicle issues) are recorded as events. Offline, they queue on the device and replay on reconnect, with route-conflict detection.

**Demo controls** (bottom-left "Demo" pill, presenter-only): close orders and plan, publish, dispatch the fleet, simulate offline for one tab, simulate failing photo uploads, switch roles and reset.

### Complete workflow, predictions and failure recovery

Every role has **Full workflow** and **Service & recovery** navigation. Dispatchers also have **AI predictions** and an expanded **Capacity forecast** covering both depots and all three brands. Estimates are explicitly labelled demo rules, not a trained model. Reviews and capacity proposals are saved to the shared audit history.

Follow the [numbered four-role judge walkthrough and screen rationale](docs/frontend-flows.md#numbered-judge-walkthrough), including offline delivery, proof retry, loading shortfalls, stale predictions and receipt discrepancies. The same document records forecast assumptions and the remaining backend/model integration work.

```sh
cd web
npm test        # prediction, forecast, cutoff and cross-role event checks (Node 24 recommended)
npm run build   # TypeScript and production/PWA build
```

Layout:

- `src/domain`: types, seeded network (120 outlets, 60 vehicles), constraint rules, planner and breakdown recovery
- `src/store`: shared ops state, field-event reducer, device outbox and sync, theme
- `src/components`: design system (`ui.tsx`), app shell, route map, proof capture
- `src/pages`: `public`, `dispatcher`, `loader`, `driver`, `store`, `shared`

Palette: Stormy Teal `#106C6C` (primary), Chocolate `#D66D32` (attention: at risk, deferred), Ocean Blue `#0284C7` (info), Cool Steel `#85979A` and Platinum `#E5E7EB` (neutrals). Red is reserved for critical and green for success. Light and dark themes are both first-class.

### Installable PWA

`npm run build` generates a Workbox service worker that precaches the whole app. Every screen opens offline after one visit, and Google Fonts are cached at runtime. The manifest provides app icons (including maskable) and shortcuts to Route, Load and Sync. An in-app prompt offers installation, with Add-to-Home-Screen steps on iOS. When a new version ships, a "new version ready · Reload" card appears. The installed app remembers who signed in between launches; browser tabs keep separate sign-ins so demos can run several roles side by side. Use `npm run build && npx vite preview` to try the service worker locally.

## Mobile app (`mobile/`)

Native Flutter app for **drivers and loaders**, built offline-first. Dispatchers and store managers are redirected to the web app.

```bash
cd mobile
flutter pub get
flutter run            # Android emulator / device, or iOS
flutter test           # model, sync and offline-delivery widget tests
```

Demo accounts: `driver@kairon.demo` and `loader@kairon.demo`, password `kairon-demo`.

- **Offline-first:** each field action (arrival, delivery, proof photo or signature, loading counts, shortfalls, vehicle issues) is applied on the device and queued in an outbox that is persisted locally. On reconnect it replays against the server. If the dispatcher reassigned a stop meanwhile, a "Route updated" sheet explains it and completed deliveries are never lost. Failed uploads can be retried without redoing the delivery.
- **UI:** an animated brand splash, a route map with a moving truck, slide-to-confirm for big actions, a success animation, crates that stack as the loader confirms stops, a live connectivity pill and banner, and light and dark themes. Fonts are bundled so everything renders without network.
- **Backend:** `lib/data/api.dart` defines `KaironApi`. `MockKaironApi` simulates the server on the device (with latency) until the real API is available. The avatar menu has demo controls: simulate offline, flaky uploads, "loader finishes loading", "dispatcher reassigns a stop", and reset.

## Incident desk (last-mile incident management)

Dispatcher → **Incident desk** (`/dispatcher/incidents`). Press **Start live day**: the plan is published if needed and every vehicle except the hand-driven demo truck VEH014 goes out under watch. The operations clock runs at 1×, 2× or 5× and can be paused.

1. **Watches live deliveries.** Every 1.5 s it reads each vehicle's GPS trail (one fix per minute) and live ETA.
2. **Flags problems before stores complain:** projected to miss its window (including the Fresh 08:00 rule), stationary away from any stop, off the planned route, "delivered" outside the store's 150 m geofence, failed attempt, delivered short. Store claims are also taken in.
3. **Assembles the case:** order and value, timestamps, the rider's GPS trail on a map, merchant details, and the store's credit history.
4. **Runs five checks:** promise, GPS trail, proof of delivery, handover (loading and store readiness), and claim integrity.
5. **Predicts responsibility** (rider, operations, merchant or external) with a multinomial logistic-regression model trained **locally in the browser**. It learns from labelled historical incidents, which are synthetic for the demo, plus every reviewer decision; **Model & rules → Retrain on this device** adds those decisions. The model card shows held-out accuracy and the confusion matrix.
6. **Applies resolution rules** in order (R1–R6): integrity guard and confidence floor send the case to human review; external causes with 3+ late deliveries across 2+ vehicles get one **zone-wide delay notice**; rider or operations fault with real impact gets an **instant credit**; a closed store gets a re-attempt with no credit; in-flight lateness triggers an early warning to the store.

The code is in `web/src/domain/incidents/`: `sim` (road simulation and GPS), `classifier`, `engine` (detectors, case file, checks, rules) and `types`. Stores see zone notices and automatic credits on their dashboard and order pages.
