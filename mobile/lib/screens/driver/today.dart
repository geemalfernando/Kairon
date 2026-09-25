import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';

import '../../data/models.dart';
import '../../state/app_state.dart';
import '../../theme.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';

class DriverToday extends StatelessWidget {
  const DriverToday({super.key, required this.onOpenRoute, required this.onOpenIssues});
  final VoidCallback onOpenRoute, onOpenIssues;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final k = context.k;
    final t = s.myTrip;
    if (t == null) {
      return _Empty(icon: Icons.local_shipping_outlined, title: 'No route assigned yet', body: 'Your route appears here once the dispatcher publishes the plan.');
    }
    final next = t.nextStop;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 32), children: [
      // Hero route card
      Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [K.teal, Color(0xFF0C4F50), K.ink]),
          boxShadow: [BoxShadow(color: K.teal.withValues(alpha: 0.35), blurRadius: 30, offset: const Offset(0, 12))],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 22, 22, 0),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('TODAY’S ROUTE', style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11, letterSpacing: 1.6, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text('Trip ${t.number} · ${t.brand}', style: const TextStyle(fontFamily: K.display, fontSize: 26, fontWeight: FontWeight.w700, color: Colors.white)),
                  Text('${t.vehicleId} · ${t.vehicleType} · ${t.district}', style: TextStyle(color: Colors.white.withValues(alpha: 0.75))),
                ]),
              ),
              if (t.reefer)
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.ac_unit_rounded, color: Color(0xFF7CC6EE)),
                ).animate(onPlay: (c) => c.repeat()).rotate(duration: 8.seconds),
            ]),
          ),
          RouteMap(stops: t.stops, nextIndex: next == null ? t.stops.length : t.stops.indexOf(next), height: 150, dark: true, moving: t.status == TripStatus.inProgress),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 22),
            child: Row(children: [
              _Stat(label: 'Stops', value: '${t.stops.length}'),
              _Stat(label: 'Departure', value: hm(t.departure)),
              _Stat(label: 'Done', value: '${t.doneCount}/${t.stops.length}'),
            ]),
          ),
        ]),
      ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.06, curve: Curves.easeOutCubic),
      const SizedBox(height: 16),

      // Primary action depends on where the trip is
      AnimatedSwitcher(
        duration: 300.ms,
        child: switch (t.status) {
          TripStatus.loaded => SlideToConfirm(
              key: const ValueKey('start'),
              label: 'Slide to start route',
              onConfirmed: () {
                s.record('START_ROUTE', t.id);
                toast(context, s.online ? 'Route started · stores notified' : 'Route started · saved offline');
                Future.delayed(500.ms, onOpenRoute);
              },
            ),
          TripStatus.inProgress => _NextStopCard(key: const ValueKey('next'), trip: t, onOpen: onOpenRoute),
          TripStatus.paused => _Alert(
              key: const ValueKey('paused'),
              color: k.critical,
              icon: Icons.car_crash_rounded,
              title: 'Breakdown reported · route paused',
              body: 'Dispatcher ${s.online ? 'notified' : 'will be notified when you reconnect'}. Remain safely stopped. ${t.stops.length - t.doneCount} deliveries awaiting reassignment.',
            ),
          TripStatus.completed => _Alert(key: const ValueKey('done'), color: k.success, icon: Icons.emoji_events_rounded, title: 'Route complete', body: 'All ${t.stops.length} stops recorded. Return safely to the depot.'),
          _ => _Alert(
              key: const ValueKey('wait'),
              color: k.info,
              icon: Icons.inventory_2_rounded,
              title: t.status == TripStatus.loading ? 'Your vehicle is being loaded' : 'Waiting for loading',
              body: 'You can start once the loader confirms every stop. (Demo: open the menu → “Loader finishes loading”.)',
            ),
        },
      ),
      const SizedBox(height: 16),

      // Offline readiness
      KCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.offline_pin_rounded, color: k.brand),
            const SizedBox(width: 8),
            Text('Offline readiness', style: context.text.titleMedium),
            const Spacer(),
            Tag('Available offline', color: k.success),
          ]),
          const SizedBox(height: 8),
          CheckLine(label: 'Today’s route', detail: 'Downloaded', delay: 100.ms),
          CheckLine(label: 'Orders & items', detail: '${t.stops.fold<int>(0, (a, b) => a + b.units)} units', delay: 200.ms),
          CheckLine(label: 'Outlet details', detail: 'Downloaded', delay: 300.ms),
          CheckLine(label: 'Delivery windows', detail: 'Downloaded', delay: 400.ms),
          CheckLine(label: 'Proof capture', detail: 'Ready', delay: 500.ms),
          const SizedBox(height: 6),
          Text('Last sync ${s.lastSync == null ? '—' : clock(s.lastSync!)} · keep working if the signal drops', style: context.text.bodySmall),
        ]),
      ),
      const SizedBox(height: 12),
      if (t.status == TripStatus.loaded || t.status == TripStatus.inProgress)
        OutlinedButton.icon(onPressed: onOpenIssues, icon: const Icon(Icons.warning_amber_rounded), label: const Text('Report vehicle issue')),
    ]);
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label, value;
  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 12)),
          Text(value, style: const TextStyle(fontFamily: K.display, color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700)),
        ]),
      );
}

class _NextStopCard extends StatelessWidget {
  const _NextStopCard({super.key, required this.trip, required this.onOpen});
  final Trip trip;
  final VoidCallback onOpen;
  @override
  Widget build(BuildContext context) {
    final n = trip.nextStop;
    final k = context.k;
    if (n == null) return const SizedBox();
    return KCard(
      onTap: onOpen,
      border: k.brand.withValues(alpha: 0.5),
      child: Row(children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(color: k.brandSoft, borderRadius: BorderRadius.circular(16)),
          child: Icon(Icons.navigation_rounded, color: k.brandInk),
        ).animate(onPlay: (c) => c.repeat(reverse: true)).scaleXY(end: 1.06, duration: 900.ms),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Eyebrow('Next stop', color: k.brandInk),
            Mono(n.outletId, size: 20),
            Text('${n.outletName} · ETA ${hm(n.eta)}', style: context.text.bodySmall),
          ]),
        ),
        Icon(Icons.chevron_right_rounded, color: k.muted),
      ]),
    );
  }
}

class _Alert extends StatelessWidget {
  const _Alert({super.key, required this.color, required this.icon, required this.title, required this.body});
  final Color color;
  final IconData icon;
  final String title, body;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withValues(alpha: 0.4))),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 2),
              Text(body, style: context.text.bodyMedium),
            ]),
          ),
        ]),
      );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title, body;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 48, color: context.k.muted).animate(onPlay: (c) => c.repeat(reverse: true)).moveY(end: -6, duration: 1.seconds),
            const SizedBox(height: 16),
            Text(title, style: context.text.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Text(body, style: context.text.bodySmall, textAlign: TextAlign.center),
          ]),
        ),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title, body;
  @override
  Widget build(BuildContext context) => _Empty(icon: icon, title: title, body: body);
}
