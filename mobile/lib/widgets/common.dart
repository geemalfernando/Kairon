import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';

import '../data/models.dart';
import '../state/app_state.dart';
import '../theme.dart';

class KCard extends StatelessWidget {
  const KCard({super.key, required this.child, this.padding = const EdgeInsets.all(18), this.color, this.onTap, this.border});
  final Widget child;
  final EdgeInsets padding;
  final Color? color;
  final VoidCallback? onTap;
  final Color? border;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Material(
      color: color ?? k.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: padding,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: border ?? k.line)),
          child: child,
        ),
      ),
    );
  }
}

class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color});
  final String text;
  final Color? color;
  @override
  Widget build(BuildContext context) => Text(text.toUpperCase(), style: context.text.labelSmall?.copyWith(color: color));
}

class Tag extends StatelessWidget {
  const Tag(this.label, {super.key, this.color, this.bg, this.icon});
  final String label;
  final Color? color, bg;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final c = color ?? context.k.muted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: bg ?? c.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 13, color: c), const SizedBox(width: 4)],
        Text(label, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: c)),
      ]),
    );
  }
}

class Mono extends StatelessWidget {
  const Mono(this.text, {super.key, this.size = 15, this.color});
  final String text;
  final double size;
  final Color? color;
  @override
  Widget build(BuildContext context) => Text(text, style: TextStyle(fontFamily: K.mono, fontWeight: FontWeight.w700, fontSize: size, color: color ?? context.k.ink, letterSpacing: -0.3));
}

/// Online · Synchronizing · Offline · Sync error — always visible in the header.
class NetPill extends StatelessWidget {
  const NetPill({super.key, this.onTap});
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final k = context.k;
    final (label, color) = switch (s.status) {
      NetStatus.online => ('Online', k.success),
      NetStatus.syncing => ('Syncing', k.info),
      NetStatus.offline => ('Offline', K.steel),
      NetStatus.error => ('Sync error', k.critical),
    };
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: 300.ms,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(color: k.surface, borderRadius: BorderRadius.circular(99), border: Border.all(color: k.line)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (s.status == NetStatus.syncing)
            SizedBox(width: 10, height: 10, child: CircularProgressIndicator(strokeWidth: 2, color: color))
          else
            Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle))
                .animate(onPlay: (c) => c.repeat(reverse: true), target: s.status == NetStatus.online ? 1 : 0)
                .scaleXY(begin: 1, end: 1.35, duration: 900.ms),
          const SizedBox(width: 7),
          Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: color == K.steel ? k.muted : color)),
          if (s.pending > 0) ...[
            const SizedBox(width: 6),
            Icon(Icons.cloud_upload_outlined, size: 14, color: k.muted),
            const SizedBox(width: 2),
            Text('${s.pending}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: k.muted)),
          ],
        ]),
      ),
    );
  }
}

/// Slides in under the header whenever the device isn't simply online.
class ConnectivityBanner extends StatelessWidget {
  const ConnectivityBanner({super.key, this.onTap});
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final k = context.k;
    Widget? child;
    switch (s.status) {
      case NetStatus.offline:
        child = _Strip(
          key: const ValueKey('off'),
          bg: k.ink,
          fg: k.bg,
          icon: Icons.cloud_off_rounded,
          title: 'You’re offline',
          body: s.pending > 0 ? '${s.pending} ${s.pending == 1 ? 'update' : 'updates'} waiting to sync · keep working' : 'Your route and delivery data remain available.',
        );
      case NetStatus.syncing:
        child = _Strip(key: const ValueKey('sync'), bg: k.info, fg: Colors.white, icon: Icons.sync_rounded, spin: true, title: 'Connection restored', body: 'Synchronizing ${s.pending} ${s.pending == 1 ? 'update' : 'updates'}…');
      case NetStatus.error:
        child = _Strip(key: const ValueKey('err'), bg: k.critical, fg: Colors.white, icon: Icons.error_outline_rounded, title: 'Sync attention required', body: '${s.failed} ${s.failed == 1 ? 'update' : 'updates'} could not be sent. Tap to retry.');
      case NetStatus.online:
        child = null;
    }
    return GestureDetector(
      onTap: onTap,
      child: AnimatedSize(
        duration: 350.ms,
        curve: Curves.easeOutCubic,
        child: AnimatedSwitcher(duration: 300.ms, child: child ?? const SizedBox(width: double.infinity)),
      ),
    );
  }
}

class _Strip extends StatelessWidget {
  const _Strip({super.key, required this.bg, required this.fg, required this.icon, required this.title, required this.body, this.spin = false});
  final Color bg, fg;
  final IconData icon;
  final String title, body;
  final bool spin;
  @override
  Widget build(BuildContext context) {
    Widget ic = Icon(icon, color: fg, size: 22);
    if (spin) ic = ic.animate(onPlay: (c) => c.repeat()).rotate(duration: 1.seconds);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        ic,
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 14)),
            Text(body, style: TextStyle(color: fg.withValues(alpha: 0.8), fontSize: 12.5)),
          ]),
        ),
        Icon(Icons.chevron_right_rounded, color: fg.withValues(alpha: 0.7)),
      ]),
    ).animate().slideY(begin: -0.3, duration: 300.ms, curve: Curves.easeOutCubic).fadeIn();
  }
}

class CheckLine extends StatelessWidget {
  const CheckLine({super.key, required this.label, this.detail, this.ok = true, this.delay = Duration.zero});
  final String label;
  final String? detail;
  final bool ok;
  final Duration delay;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(color: ok ? k.successSoft : k.criticalSoft, shape: BoxShape.circle),
          child: Icon(ok ? Icons.check_rounded : Icons.close_rounded, size: 15, color: ok ? k.success : k.critical),
        ).animate(delay: delay).scale(begin: const Offset(0, 0), duration: 400.ms, curve: Curves.elasticOut),
        const SizedBox(width: 12),
        Expanded(child: Text(label, style: context.text.bodyMedium)),
        if (detail != null) Text(detail!, style: context.text.bodySmall),
      ]),
    ).animate(delay: delay).fadeIn(duration: 300.ms).slideX(begin: 0.05);
  }
}

/// Big +/- counter sized for gloves.
class Counter extends StatelessWidget {
  const Counter({super.key, required this.value, required this.max, required this.onChanged});
  final int value, max;
  final ValueChanged<int> onChanged;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    Widget btn(IconData i, int d) => SizedBox(
          width: 48,
          height: 48,
          child: IconButton(onPressed: () => onChanged((value + d).clamp(0, max)), icon: Icon(i), color: k.ink),
        );
    return Container(
      decoration: BoxDecoration(border: Border.all(color: k.line, width: 1.5), borderRadius: BorderRadius.circular(14)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        btn(Icons.remove_rounded, -1),
        SizedBox(
          width: 34,
          child: AnimatedSwitcher(
            duration: 150.ms,
            transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
            child: Text('$value', key: ValueKey(value), textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          ),
        ),
        btn(Icons.add_rounded, 1),
      ]),
    );
  }
}

/// Choice chips list for outcomes and reasons.
class ChoiceTiles<T> extends StatelessWidget {
  const ChoiceTiles({super.key, required this.options, required this.value, required this.onChanged});
  final List<(T, String, String?)> options;
  final T? value;
  final ValueChanged<T> onChanged;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Column(
      children: [
        for (final (v, label, hint) in options)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: AnimatedContainer(
              duration: 200.ms,
              decoration: BoxDecoration(
                color: v == value ? k.brandSoft : k.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: v == value ? k.brand : k.line, width: v == value ? 2 : 1.5),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () => onChanged(v),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  child: Row(children: [
                    AnimatedContainer(
                      duration: 200.ms,
                      width: 20,
                      height: 20,
                      decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: v == value ? k.brand : k.line, width: v == value ? 6 : 2)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                        if (hint != null) Text(hint, style: context.text.bodySmall),
                      ]),
                    ),
                  ]),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Signature pad → PNG (base64) kept small enough to queue offline
// ---------------------------------------------------------------------------

class SignaturePad extends StatefulWidget {
  const SignaturePad({super.key, required this.onChanged});
  final ValueChanged<String?> onChanged;
  @override
  State<SignaturePad> createState() => _SignaturePadState();
}

class _SignaturePadState extends State<SignaturePad> {
  final List<List<Offset>> _strokes = [];
  Size _size = Size.zero;

  Future<void> _export() async {
    if (_strokes.isEmpty) return widget.onChanged(null);
    final rec = ui.PictureRecorder();
    final c = Canvas(rec);
    _SigPainter(_strokes, Colors.black).paint(c, _size);
    final img = await rec.endRecording().toImage(_size.width.ceil(), _size.height.ceil());
    final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
    widget.onChanged(base64Encode(Uint8List.view(bytes!.buffer)));
  }

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      LayoutBuilder(builder: (context, c) {
        _size = Size(c.maxWidth, 150);
        return GestureDetector(
          onPanStart: (d) => setState(() => _strokes.add([d.localPosition])),
          onPanUpdate: (d) => setState(() => _strokes.last.add(d.localPosition)),
          onPanEnd: (_) => _export(),
          child: Container(
            height: 150,
            decoration: BoxDecoration(color: k.surface2, borderRadius: BorderRadius.circular(14), border: Border.all(color: k.line, width: 1.5)),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: CustomPaint(
                painter: _SigPainter(_strokes, k.ink),
                child: _strokes.isEmpty ? Center(child: Text('Sign here', style: TextStyle(color: k.muted, fontSize: 16, fontStyle: FontStyle.italic))) : null,
              ),
            ),
          ),
        );
      }),
      Row(children: [
        Text(_strokes.isEmpty ? 'Receiver signs with a finger' : 'Signed ✓', style: context.text.bodySmall),
        const Spacer(),
        if (_strokes.isNotEmpty)
          TextButton.icon(
            onPressed: () {
              setState(_strokes.clear);
              widget.onChanged(null);
            },
            icon: const Icon(Icons.refresh_rounded, size: 16),
            label: const Text('Clear'),
          ),
      ]),
    ]);
  }
}

class _SigPainter extends CustomPainter {
  _SigPainter(this.strokes, this.color);
  final List<List<Offset>> strokes;
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    for (final s in strokes) {
      if (s.length == 1) {
        canvas.drawCircle(s.first, 1.5, p..style = PaintingStyle.fill);
        p.style = PaintingStyle.stroke;
        continue;
      }
      final path = Path()..moveTo(s.first.dx, s.first.dy);
      for (var i = 1; i < s.length; i++) {
        final mid = Offset((s[i - 1].dx + s[i].dx) / 2, (s[i - 1].dy + s[i].dy) / 2);
        path.quadraticBezierTo(s[i - 1].dx, s[i - 1].dy, mid.dx, mid.dy);
      }
      canvas.drawPath(path, p);
    }
  }

  @override
  bool shouldRepaint(_SigPainter old) => true;
}

void toast(BuildContext context, String message, {IconData icon = Icons.check_circle_rounded}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Row(children: [Icon(icon, color: context.k.bg, size: 20), const SizedBox(width: 10), Expanded(child: Text(message))]),
      duration: const Duration(seconds: 3),
    ));
}

String stopStatusLabel(Stop s) => switch (s.status) {
      StopStatus.pending => 'Pending',
      StopStatus.arrived => 'Arrived',
      StopStatus.delivered => 'Delivered',
      StopStatus.partial => 'Partial',
      StopStatus.failed => 'Failed attempt',
    };
