import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';

import '../data/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'driver/issues.dart';
import 'driver/route.dart';
import 'driver/today.dart';
import 'loader/loader.dart';
import 'sync.dart';

/// Role-aware home: bottom navigation, live connectivity, demo tools.
class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _tab = 0;
  RouteConflict? _shown;

  void go(int i) => setState(() => _tab = i);

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final user = s.user!;
    final driver = user.role == Role.driver;

    // Surface a route conflict once, right after the sync that found it.
    if (s.conflict != null && !identical(s.conflict, _shown)) {
      _shown = s.conflict;
      WidgetsBinding.instance.addPostFrameCallback((_) => showConflictSheet(context, s.conflict!));
    }

    final pages = driver
        ? [DriverToday(onOpenRoute: () => go(1), onOpenIssues: () => go(2)), const DriverRoute(), const DriverIssues(), const SyncScreen()]
        : [LoaderToday(onOpenTrips: () => go(1)), const LoaderTrips(), const LoaderIssues(), const SyncScreen()];

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          _Header(onMenu: () => showDemoSheet(context), onNet: () => go(3)),
          ConnectivityBanner(onTap: () => go(3)),
          Expanded(
            child: AnimatedSwitcher(
              duration: 320.ms,
              switchInCurve: Curves.easeOutCubic,
              transitionBuilder: (c, a) => FadeTransition(opacity: a, child: SlideTransition(position: Tween(begin: const Offset(0, 0.03), end: Offset.zero).animate(a), child: c)),
              child: KeyedSubtree(key: ValueKey(_tab), child: pages[_tab]),
            ),
          ),
        ]),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: go,
        destinations: [
          const NavigationDestination(icon: Icon(Icons.wb_twilight_rounded), label: 'Today'),
          NavigationDestination(icon: Icon(driver ? Icons.route_rounded : Icons.inventory_2_outlined), label: driver ? 'Route' : 'Load'),
          const NavigationDestination(icon: Icon(Icons.report_gmailerrorred_rounded), label: 'Issues'),
          NavigationDestination(
            icon: Badge(isLabelVisible: s.pending + s.failed > 0, label: Text('${s.pending + s.failed}'), backgroundColor: s.failed > 0 ? context.k.critical : context.k.attention, child: const Icon(Icons.sync_rounded)),
            label: 'Sync',
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onMenu, required this.onNet});
  final VoidCallback onMenu, onNet;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final h = DateTime.now().hour;
    final greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 12, 8),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Eyebrow(greet),
            Text(s.user!.name, style: context.text.headlineSmall),
          ]),
        ),
        NetPill(onTap: onNet),
        const SizedBox(width: 8),
        InkWell(
          customBorder: const CircleBorder(),
          onTap: onMenu,
          child: CircleAvatar(radius: 20, backgroundColor: K.teal, child: Text(s.user!.name[0], style: const TextStyle(color: Colors.white, fontFamily: K.display, fontWeight: FontWeight.w700))),
        ),
        const SizedBox(width: 4),
      ]),
    );
  }
}

void showConflictSheet(BuildContext context, RouteConflict c) {
  final k = context.k;
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Eyebrow('While you were offline', color: k.attentionInk),
        Text('Route updated', style: ctx.text.headlineMedium),
        const SizedBox(height: 18),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Eyebrow('Your offline route'),
              const SizedBox(height: 8),
              for (final o in c.offline)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Text(o,
                      style: TextStyle(
                        fontFamily: K.mono,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        color: c.reassigned.contains(o) && !c.deliveredOffline.contains(o) ? k.attentionInk : k.ink,
                        decoration: c.reassigned.contains(o) && !c.deliveredOffline.contains(o) ? TextDecoration.lineThrough : null,
                      )),
                ),
            ]),
          ),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Eyebrow('Latest dispatcher route'),
              const SizedBox(height: 8),
              for (final o in c.latest) Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: Mono(o)),
            ]),
          ),
        ]),
        const SizedBox(height: 14),
        for (final o in c.reassigned)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(c.deliveredOffline.contains(o) ? '$o was delivered by you offline — your delivery record was kept.' : '$o has been reassigned to another vehicle.'),
          ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: k.successSoft, borderRadius: BorderRadius.circular(14)),
          child: Row(children: [
            Icon(Icons.verified_user_rounded, color: k.success),
            const SizedBox(width: 10),
            const Expanded(child: Text('Your completed records will NOT be deleted.', style: TextStyle(fontWeight: FontWeight.w700))),
          ]),
        ),
        const SizedBox(height: 18),
        FilledButton(
          onPressed: () {
            ctx.read<AppState>().dismissConflict();
            Navigator.pop(ctx);
          },
          child: const Text('Review changes'),
        ),
      ]),
    ),
  );
}

void showDemoSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => Consumer<AppState>(builder: (ctx, s, _) {
      final k = ctx.k;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.user!.name, style: ctx.text.headlineSmall),
            Text('${s.user!.role == Role.driver ? 'Driver · ${s.user!.vehicleId}' : 'Loader'} · ${s.user!.depot} depot', style: ctx.text.bodySmall),
            const SizedBox(height: 16),
            const Eyebrow('Appearance'),
            const SizedBox(height: 8),
            SegmentedButton<ThemeMode>(
              segments: const [
                ButtonSegment(value: ThemeMode.light, label: Text('Light'), icon: Icon(Icons.light_mode_outlined)),
                ButtonSegment(value: ThemeMode.dark, label: Text('Dark'), icon: Icon(Icons.dark_mode_outlined)),
                ButtonSegment(value: ThemeMode.system, label: Text('System')),
              ],
              selected: {s.themeMode},
              onSelectionChanged: (v) => s.setTheme(v.first),
            ),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: k.line, style: BorderStyle.solid)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [Icon(Icons.science_outlined, size: 18, color: k.muted), const SizedBox(width: 6), const Eyebrow('Demo controls')]),
                SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Simulate offline'), subtitle: const Text('Cut this device off from the server'), value: s.simulateOffline, onChanged: s.setSimulateOffline, activeThumbColor: k.attention),
                SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Unstable photo uploads'), subtitle: const Text('Proof photos fail during sync'), value: s.flakyUploads, onChanged: s.setFlaky, activeThumbColor: k.attention),
                if (s.user!.role == Role.driver) ...[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.inventory_rounded),
                    title: const Text('Loader finishes loading VEH014'),
                    onTap: () async {
                      await s.demoMarkLoaded();
                      if (ctx.mounted) toast(ctx, 'VEH014 loaded — ready to start');
                    },
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.alt_route_rounded),
                    title: const Text('Dispatcher reassigns a stop'),
                    subtitle: const Text('Try it while offline, then reconnect'),
                    onTap: () async {
                      final o = await s.demoReassign();
                      if (ctx.mounted) toast(ctx, o == null ? 'Nothing left to reassign' : '$o reassigned on the server', icon: Icons.alt_route_rounded);
                    },
                  ),
                ],
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.restart_alt_rounded),
                  title: const Text('Reset demo data'),
                  onTap: () async {
                    await s.demoReset();
                    if (ctx.mounted) toast(ctx, 'Demo reset');
                  },
                ),
              ]),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: s.pending > 0
                  ? null
                  : () {
                      Navigator.pop(ctx);
                      s.signOut();
                    },
              icon: const Icon(Icons.logout_rounded),
              label: Text(s.pending > 0 ? 'Sync ${s.pending} updates before signing out' : 'Sign out'),
            ),
          ]).animate().fadeIn(duration: 200.ms),
        ),
      );
    }),
  );
}
