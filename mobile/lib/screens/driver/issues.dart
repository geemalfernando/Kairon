import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';

import '../../data/models.dart';
import '../../state/app_state.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

const _kinds = [
  ('Breakdown', Icons.car_crash_rounded),
  ('Flat tyre', Icons.tire_repair_rounded),
  ('Engine warning', Icons.warning_rounded),
  ('Refrigeration failure', Icons.ac_unit_rounded),
  ('Accident', Icons.emergency_rounded),
  ('Other', Icons.more_horiz_rounded),
];

class DriverIssues extends StatefulWidget {
  const DriverIssues({super.key});
  @override
  State<DriverIssues> createState() => _DriverIssuesState();
}

class _DriverIssuesState extends State<DriverIssues> {
  String? _kind;
  bool _confirm = false;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final k = context.k;
    final t = s.myTrip;
    final remaining = t?.stops.where((x) => !x.done).toList() ?? [];
    final chilled = remaining.where((x) => x.chilled).toList();

    if (t != null && t.status == TripStatus.paused) {
      return ListView(padding: const EdgeInsets.all(20), children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(color: k.criticalSoft, borderRadius: BorderRadius.circular(24), border: Border.all(color: k.critical.withValues(alpha: 0.4))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.warning_rounded, color: k.critical, size: 44).animate(onPlay: (c) => c.repeat(reverse: true)).fadeOut(begin: 1, duration: 700.ms),
            const SizedBox(height: 10),
            Text('BREAKDOWN REPORTED', style: context.text.headlineSmall?.copyWith(color: k.critical)),
            const SizedBox(height: 12),
            _Line(Icons.check_circle_rounded, s.online ? 'Dispatcher notified.' : 'Saved — the dispatcher is notified when you reconnect.'),
            const _Line(Icons.front_hand_rounded, 'Remain safely stopped.', bold: true),
            _Line(Icons.pause_circle_rounded, 'Current route: paused (${t.issue ?? 'vehicle issue'})'),
            _Line(Icons.alt_route_rounded, '${remaining.length} deliveries awaiting reassignment.'),
          ]),
        ).animate().fadeIn().scale(begin: const Offset(0.96, 0.96)),
      ]);
    }
    if (t == null || !(t.status == TripStatus.loaded || t.status == TripStatus.inProgress)) {
      return Center(child: Padding(padding: const EdgeInsets.all(32), child: Text('Vehicle issues can be reported once your route is loaded.', textAlign: TextAlign.center, style: context.text.bodyMedium)));
    }

    return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 32), children: [
      Text('Vehicle issue', style: context.text.headlineMedium),
      Text('Report anything that stops you delivering safely.', style: context.text.bodySmall),
      const SizedBox(height: 16),
      AnimatedSwitcher(
        duration: 300.ms,
        child: !_confirm
            ? GridView.count(
                key: const ValueKey('grid'),
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.35,
                children: [
                  for (final (i, (label, icon)) in _kinds.indexed)
                    AnimatedContainer(
                      duration: 200.ms,
                      decoration: BoxDecoration(
                        color: _kind == label ? k.criticalSoft : k.surface,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: _kind == label ? k.critical : k.line, width: _kind == label ? 2 : 1.5),
                      ),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => setState(() => _kind = label),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Icon(icon, size: 34, color: _kind == label ? k.critical : k.muted),
                          const SizedBox(height: 8),
                          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600)),
                        ]),
                      ),
                    ).animate(delay: (50 * i).ms).fadeIn().scale(begin: const Offset(0.9, 0.9)),
                ],
              )
            : KCard(
                key: const ValueKey('confirm'),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  if (_kind == 'Refrigeration failure' && chilled.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(bottom: 14),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: k.criticalSoft, borderRadius: BorderRadius.circular(14)),
                      child: Text('⚠ Chilled deliveries onboard: ${chilled.map((c) => c.outletId).join(', ')}.\nAvoid continuing delivery until the dispatcher confirms recovery.', style: const TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  _Row('Vehicle', t.vehicleId),
                  _Row('Issue', _kind!),
                  _Row('Location', 'Current location recorded'),
                  _Row('Remaining deliveries', '${remaining.length}'),
                  _Row('Refrigerated goods', chilled.isEmpty ? 'No' : 'YES'),
                  const SizedBox(height: 16),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: k.critical),
                    onPressed: () {
                      s.record('VEHICLE_ISSUE', t.id, data: {'kind': _kind});
                      toast(context, s.online ? 'Dispatcher notified' : 'Saved offline — sends when signal returns', icon: Icons.warning_rounded);
                      setState(() {
                        _confirm = false;
                        _kind = null;
                      });
                    },
                    child: Text(_kind == 'Refrigeration failure' ? 'Report failure' : 'Report breakdown'),
                  ),
                  TextButton(onPressed: () => setState(() => _confirm = false), child: const Text('Back')),
                ]),
              ),
      ),
      if (!_confirm) ...[
        const SizedBox(height: 16),
        FilledButton(style: FilledButton.styleFrom(backgroundColor: k.critical), onPressed: _kind == null ? null : () => setState(() => _confirm = true), child: const Text('Continue')),
      ],
    ]);
  }
}

class _Line extends StatelessWidget {
  const _Line(this.icon, this.text, {this.bold = false});
  final IconData icon;
  final String text;
  final bool bold;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(children: [Icon(icon, size: 20, color: context.k.critical), const SizedBox(width: 10), Expanded(child: Text(text, style: TextStyle(fontSize: 15, fontWeight: bold ? FontWeight.w800 : FontWeight.w500)))]),
      );
}

class _Row extends StatelessWidget {
  const _Row(this.k, this.v);
  final String k, v;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(children: [Text(k, style: context.text.bodySmall), const Spacer(), Text(v, style: const TextStyle(fontWeight: FontWeight.w700))]),
      );
}
