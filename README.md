# Kairon
AI-powered real-time last-mile delivery incident management platform that detects delays, analyzes evidence, identifies fault fairly, prevents refund abuse, and automates resolutions

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
