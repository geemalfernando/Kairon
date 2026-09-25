import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';

import '../data/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// The device outbox in plain words — no talk of databases or queues.
class SyncScreen extends StatelessWidget {
  const SyncScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final k = context.k;
    final (icon, color, title, body) = switch (s.status) {
      NetStatus.offline => (Icons.cloud_off_rounded, K.steel, 'You’re offline', s.pending == 0 ? 'Nothing waiting. Keep working — everything is saved here.' : '${s.pending} ${s.pending == 1 ? 'update is' : 'updates are'} waiting for connection. Nothing will be lost.'),
      NetStatus.syncing => (Icons.cloud_sync_rounded, k.info, 'Synchronizing…', 'Sending ${s.pending} updates.'),
      NetStatus.error => (Icons.cloud_off_rounded, k.critical, 'Sync attention required', '${s.failed} ${s.failed == 1 ? 'update' : 'updates'} failed. You don’t need to redo the delivery — just retry.'),
      NetStatus.online => (Icons.cloud_done_rounded, k.success, s.pending == 0 ? 'Everything synchronized' : 'Ready to sync', s.lastSync == null ? 'Connected' : 'Last synchronized ${clock(s.lastSync!)}'),
    };
    Widget cloud = Icon(icon, size: 72, color: color);
    if (s.status == NetStatus.syncing) {
      cloud = cloud.animate(onPlay: (c) => c.repeat(reverse: true)).scaleXY(end: 1.1, duration: 600.ms).then().shimmer(duration: 800.ms);
    } else if (s.status == NetStatus.online && s.pending == 0) {
      cloud = cloud.animate(key: ValueKey(s.lastSync)).scale(begin: const Offset(0.6, 0.6), curve: Curves.elasticOut, duration: 800.ms);
    } else if (s.status == NetStatus.offline) {
      cloud = cloud.animate(onPlay: (c) => c.repeat(reverse: true)).moveY(end: -6, duration: 1400.ms, curve: Curves.easeInOut);
    }

    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
      KCard(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          cloud,
          const SizedBox(height: 12),
          AnimatedSwitcher(duration: 250.ms, child: Text(title, key: ValueKey(title), style: context.text.headlineSmall, textAlign: TextAlign.center)),
          const SizedBox(height: 6),
          Text(body, style: context.text.bodyMedium?.copyWith(color: k.muted), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          if (s.failed > 0 && s.online)
            FilledButton.icon(style: FilledButton.styleFrom(backgroundColor: k.critical), onPressed: () => s.retry(), icon: const Icon(Icons.refresh_rounded), label: const Text('Retry all'))
          else if (s.online && s.pending > 0 && !s.syncing)
            FilledButton.icon(onPressed: s.sync, icon: const Icon(Icons.sync_rounded), label: const Text('Sync now')),
        ]),
      ),
      const SizedBox(height: 18),
      Row(children: [Text('Waiting to sync', style: context.text.titleLarge), const Spacer(), Tag('${s.outbox.length}', color: k.muted)]),
      const SizedBox(height: 10),
      if (s.outbox.isEmpty)
        Padding(padding: const EdgeInsets.all(24), child: Text('All caught up.', textAlign: TextAlign.center, style: TextStyle(color: k.muted)))
      else
        KCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (final (i, e) in s.outbox.indexed) ...[
              if (i > 0) const Divider(),
              ListTile(
                leading: CircleAvatar(
                  radius: 16,
                  backgroundColor: e.failed ? k.criticalSoft : k.surface2,
                  child: Icon(e.failed ? Icons.error_outline_rounded : _icon(e.type), size: 18, color: e.failed ? k.critical : k.muted),
                ),
                title: Text(e.describe(s.trips), style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(e.failed ? 'Upload failed · ${e.error}' : 'Saved on device · ${clock(e.at)}'),
                trailing: e.failed
                    ? TextButton(onPressed: s.online ? () => s.retry(e.id) : null, child: const Text('Retry'))
                    : Tag(s.syncing ? 'Sending' : 'Waiting', color: s.syncing ? k.info : k.muted),
              ).animate(delay: (40 * i).ms).fadeIn().slideX(begin: 0.05),
            ],
          ]),
        ),
      const SizedBox(height: 16),
      Text('Downloaded ${s.downloadedAt == null ? '—' : clock(s.downloadedAt!)} · everything you record is stored on this phone first.', textAlign: TextAlign.center, style: context.text.bodySmall),
    ]);
  }

  IconData _icon(String type) => switch (type) {
        'ARRIVE' => Icons.place_rounded,
        'DELIVER' => Icons.inventory_rounded,
        'PROOF_PHOTO' => Icons.photo_camera_rounded,
        'PROOF_SIGNATURE' => Icons.draw_rounded,
        'VEHICLE_ISSUE' => Icons.warning_rounded,
        'SHORTFALL' => Icons.report_problem_rounded,
        _ => Icons.check_rounded,
      };
}
