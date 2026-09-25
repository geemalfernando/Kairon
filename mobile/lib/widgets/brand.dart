import 'dart:math';

import 'package:flutter/material.dart';

import '../data/models.dart';
import '../theme.dart';
import 'route_logo_paths.dart';

/// The supplied route artwork rendered as resolution-independent paths.
class KaironMark extends StatelessWidget {
  const KaironMark({super.key, this.size = 40, this.progress = 1, this.inverse});
  final double size;
  final double progress;
  final bool? inverse;
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Kairon',
    image: true,
    child: CustomPaint(
      size: Size(size * 680 / 486, size),
      painter: _MarkPainter(progress, inverse ?? Theme.of(context).brightness == Brightness.dark),
    ),
  );
}

class _MarkPainter extends CustomPainter {
  _MarkPainter(this.progress, this.dark);
  final double progress;
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final t = Curves.easeOutCubic.transform(progress.clamp(0.0, 1.0));
    canvas.save();
    canvas.translate(size.width / 2, size.height / 2);
    canvas.scale(0.85 + 0.15 * t);
    canvas.translate(-size.width / 2, -size.height / 2);
    canvas.scale(size.width / 680, size.height / 486);
    canvas.drawPath(routeMarkPath, Paint()..color = (dark ? const Color(0xFFF8FAFC) : K.teal).withValues(alpha: t));
    canvas.drawPath(routeGreenPath, Paint()..shader = LinearGradient(
      begin: const Alignment(-1, -0.5),
      end: const Alignment(1, 0.5),
      colors: dark
          ? [const Color(0xFF63E83B).withValues(alpha: t), const Color(0xFFA0FF62).withValues(alpha: t)]
          : [const Color(0xFF3FAF2E).withValues(alpha: t), const Color(0xFF72D94A).withValues(alpha: t)],
    ).createShader(routeGreenPath.getBounds()));
    canvas.restore();
  }

  @override
  bool shouldRepaint(_MarkPainter old) => old.progress != progress || old.dark != dark;
}

class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.color, this.size = 18});
  final Color? color;
  final double size;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        KaironMark(size: size * 1.55, inverse: color == null ? null : color!.computeLuminance() > 0.5),
        SizedBox(width: size * 0.55),
        Text('KAIRON', style: TextStyle(fontFamily: K.display, fontWeight: FontWeight.w700, fontSize: size, letterSpacing: size * 0.18, color: color ?? context.k.ink)),
      ]);
}

// ---------------------------------------------------------------------------
// Route map with a truck travelling between stops
// ---------------------------------------------------------------------------

class RouteMap extends StatefulWidget {
  const RouteMap({super.key, required this.stops, this.nextIndex = 0, this.height = 180, this.dark = false, this.moving = true});
  final List<Stop> stops;
  final int nextIndex;
  final double height;
  final bool dark;
  final bool moving;
  @override
  State<RouteMap> createState() => _RouteMapState();
}

class _RouteMapState extends State<RouteMap> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: widget.height,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => CustomPaint(
          size: Size.infinite,
          painter: _RoutePainter(widget.stops, widget.nextIndex, widget.moving ? _c.value : 0.5, widget.dark, context.k),
        ),
      ),
    );
  }
}

class _RoutePainter extends CustomPainter {
  _RoutePainter(this.stops, this.next, this.t, this.dark, this.k);
  final List<Stop> stops;
  final int next;
  final double t;
  final bool dark;
  final KColors k;

  @override
  void paint(Canvas canvas, Size size) {
    const depot = Offset(0.08, 0.12);
    Offset at(Offset n) => Offset(24 + n.dx * (size.width - 48), 20 + n.dy * (size.height - 40));
    final pts = [at(depot), ...stops.map((s) => at(Offset(s.x, s.y)))];

    // Grid
    final grid = Paint()..color = (dark ? Colors.white : k.ink).withValues(alpha: 0.05);
    for (double x = 0; x < size.width; x += 22) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (double y = 0; y < size.height; y += 22) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }

    // Planned path (dashed) and travelled path (solid)
    final path = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (var i = 1; i < pts.length; i++) {
      final a = pts[i - 1], b = pts[i];
      final mid = Offset((a.dx + b.dx) / 2, a.dy);
      path.quadraticBezierTo(mid.dx, mid.dy, b.dx, b.dy);
    }
    final lineColor = dark ? K.tealLight : k.brand;
    for (final m in path.computeMetrics()) {
      double d = 0;
      final dash = Paint()
        ..color = lineColor.withValues(alpha: 0.45)
        ..strokeWidth = 2.5
        ..style = PaintingStyle.stroke;
      final offset = (t * 16);
      d = -offset;
      while (d < m.length) {
        final s = max(0.0, d), e = min(m.length, d + 8);
        if (e > s) canvas.drawPath(m.extractPath(s, e), dash);
        d += 16;
      }
    }

    // Truck along the current leg
    final leg = next.clamp(0, pts.length - 2);
    final legPath = Path()..moveTo(pts[leg].dx, pts[leg].dy);
    final a = pts[leg], b = pts[leg + 1];
    legPath.quadraticBezierTo((a.dx + b.dx) / 2, a.dy, b.dx, b.dy);
    final metric = legPath.computeMetrics().first;
    final tan = metric.getTangentForOffset(metric.length * Curves.easeInOut.transform(t))!;

    // Depot
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: pts.first, width: 16, height: 16), const Radius.circular(4)), Paint()..color = K.chocolate);

    for (var i = 1; i < pts.length; i++) {
      final s = stops[i - 1];
      final p = pts[i];
      final done = s.done;
      final current = i - 1 == next;
      if (current) {
        canvas.drawCircle(p, 12 + 6 * sin(t * pi), Paint()..color = k.info.withValues(alpha: 0.18));
      }
      canvas.drawCircle(p, 11, Paint()..color = done ? (s.status == StopStatus.failed ? k.attention : lineColor) : (dark ? K.ink : k.surface));
      canvas.drawCircle(
          p,
          11,
          Paint()
            ..color = current ? k.info : lineColor
            ..style = PaintingStyle.stroke
            ..strokeWidth = current ? 3 : 2);
      final tp = TextPainter(
        text: TextSpan(text: '$i', style: TextStyle(fontFamily: K.mono, fontWeight: FontWeight.w700, fontSize: 11, color: done ? Colors.white : (dark ? Colors.white : k.ink))),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, p - Offset(tp.width / 2, tp.height / 2));
    }

    if (next < stops.length) {
      canvas.save();
      canvas.translate(tan.position.dx, tan.position.dy);
      canvas.drawCircle(Offset.zero, 9, Paint()..color = k.info);
      canvas.drawCircle(
          Offset.zero,
          9,
          Paint()
            ..color = Colors.white
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2.5);
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_RoutePainter old) => true;
}

// ---------------------------------------------------------------------------
// Slide-to-confirm: deliberate, glove-friendly confirmation for big actions
// ---------------------------------------------------------------------------

class SlideToConfirm extends StatefulWidget {
  const SlideToConfirm({super.key, required this.label, required this.onConfirmed, this.color, this.icon = Icons.arrow_forward_rounded});
  final String label;
  final VoidCallback onConfirmed;
  final Color? color;
  final IconData icon;
  @override
  State<SlideToConfirm> createState() => _SlideToConfirmState();
}

class _SlideToConfirmState extends State<SlideToConfirm> with SingleTickerProviderStateMixin {
  double _dx = 0;
  bool _done = false;
  late final AnimationController _shimmer = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();

  @override
  void dispose() {
    _shimmer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? context.k.brand;
    return LayoutBuilder(builder: (context, c) {
      const knob = 56.0;
      final max = c.maxWidth - knob - 8;
      final frac = (max <= 0 ? 0.0 : _dx / max).clamp(0.0, 1.0);
      return Semantics(
        button: true,
        label: widget.label,
        onTap: () {
          setState(() => _done = true);
          widget.onConfirmed();
        },
        child: Container(
          height: 64,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withValues(alpha: 0.4))),
          child: Stack(alignment: Alignment.centerLeft, children: [
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: FractionallySizedBox(alignment: Alignment.centerLeft, widthFactor: (frac * 0.9 + 0.1).clamp(0, 1), child: Container(color: color.withValues(alpha: 0.25))),
              ),
            ),
            Center(
              child: AnimatedBuilder(
                animation: _shimmer,
                builder: (context, child) => ShaderMask(
                  shaderCallback: (r) => LinearGradient(
                    colors: [context.k.ink.withValues(alpha: 0.45), context.k.ink, context.k.ink.withValues(alpha: 0.45)],
                    stops: [(_shimmer.value - 0.2).clamp(0, 1), _shimmer.value, (_shimmer.value + 0.2).clamp(0, 1)],
                  ).createShader(r),
                  child: child,
                ),
                child: Opacity(
                  opacity: 1 - frac,
                  child: Text(_done ? 'Done' : widget.label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Colors.white)),
                ),
              ),
            ),
            AnimatedPositioned(
              duration: _dx == 0 ? const Duration(milliseconds: 250) : Duration.zero,
              curve: Curves.easeOutBack,
              left: 4 + (_done ? max : _dx),
              child: GestureDetector(
                onHorizontalDragUpdate: (d) => setState(() => _dx = (_dx + d.delta.dx).clamp(0, max)),
                onHorizontalDragEnd: (_) {
                  if (_dx > max * 0.85) {
                    setState(() {
                      _done = true;
                      _dx = max;
                    });
                    widget.onConfirmed();
                  } else {
                    setState(() => _dx = 0);
                  }
                },
                child: Container(
                  width: knob,
                  height: knob,
                  decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: color.withValues(alpha: 0.4), blurRadius: 12, offset: const Offset(0, 4))]),
                  child: Icon(_done ? Icons.check_rounded : widget.icon, color: Colors.white, size: 28),
                ),
              ),
            ),
          ]),
        ),
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Success burst: a drawn check with radiating particles
// ---------------------------------------------------------------------------

class SuccessBurst extends StatefulWidget {
  const SuccessBurst({super.key, this.color, this.size = 120});
  final Color? color;
  final double size;
  @override
  State<SuccessBurst> createState() => _SuccessBurstState();
}

class _SuccessBurstState extends State<SuccessBurst> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..forward();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (context, _) => CustomPaint(size: Size.square(widget.size), painter: _BurstPainter(_c.value, widget.color ?? context.k.success)),
      );
}

class _BurstPainter extends CustomPainter {
  _BurstPainter(this.t, this.color);
  final double t;
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width * 0.3;
    final grow = Curves.elasticOut.transform((t / 0.5).clamp(0, 1));
    canvas.drawCircle(c, r * grow, Paint()..color = color);
    // particles
    final pt = ((t - 0.15) / 0.85).clamp(0.0, 1.0);
    if (pt > 0) {
      for (var i = 0; i < 12; i++) {
        final a = i * pi / 6;
        final d = r * (1.1 + pt * 0.7);
        final colors = [color, K.chocolate, K.tealLight];
        canvas.drawCircle(c + Offset(cos(a), sin(a)) * d, 4 * (1 - pt), Paint()..color = colors[i % 3]);
      }
    }
    // check
    final ct = ((t - 0.3) / 0.45).clamp(0.0, 1.0);
    if (ct > 0) {
      final path = Path()
        ..moveTo(c.dx - r * 0.45, c.dy + r * 0.02)
        ..lineTo(c.dx - r * 0.1, c.dy + r * 0.35)
        ..lineTo(c.dx + r * 0.5, c.dy - r * 0.35);
      final m = path.computeMetrics().first;
      canvas.drawPath(
          m.extractPath(0, m.length * Curves.easeOut.transform(ct)),
          Paint()
            ..color = Colors.white
            ..strokeWidth = r * 0.16
            ..strokeCap = StrokeCap.round
            ..strokeJoin = StrokeJoin.round
            ..style = PaintingStyle.stroke);
    }
  }

  @override
  bool shouldRepaint(_BurstPainter old) => old.t != t;
}
