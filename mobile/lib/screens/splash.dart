import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../theme.dart';
import '../widgets/brand.dart';

/// Brand intro: the route logo appears, then the wordmark and delivery route.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.onDone});
  final VoidCallback onDone;
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _logo = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))..forward();
  late final AnimationController _route = AnimationController(vsync: this, duration: const Duration(milliseconds: 1900));

  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 350), () => mounted ? _route.forward() : null);
    Future.delayed(const Duration(milliseconds: 2400), () => mounted ? widget.onDone() : null);
  }

  @override
  void dispose() {
    _logo.dispose();
    _route.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: K.ink,
      body: GestureDetector(
        onTap: widget.onDone,
        child: Stack(children: [
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(gradient: RadialGradient(colors: [Color(0x55106C6C), Color(0x00106C6C)], radius: 0.8)),
            ).animate().fadeIn(duration: 1200.ms),
          ),
          Positioned.fill(child: AnimatedBuilder(animation: _route, builder: (_, _) => CustomPaint(painter: _RouteLine(_route.value)))),
          Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              AnimatedBuilder(animation: _logo, builder: (_, _) => KaironMark(size: 112, progress: _logo.value, inverse: true)),
              const SizedBox(height: 28),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final (i, c) in 'KAIRON'.split('').indexed)
                    Text(c, style: const TextStyle(fontFamily: K.display, fontWeight: FontWeight.w700, fontSize: 34, letterSpacing: 10, color: Colors.white))
                        .animate(delay: (1000 + i * 60).ms)
                        .fadeIn(duration: 450.ms)
                        .slideY(begin: 0.6, curve: Curves.easeOutCubic)
                        .blur(begin: const Offset(6, 6), end: Offset.zero),
                ],
              ),
              const SizedBox(height: 12),
              Text('PLAN · LOAD · DELIVER · RECOVER', style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 11, letterSpacing: 3, fontWeight: FontWeight.w600))
                  .animate(delay: 1500.ms)
                  .fadeIn(duration: 600.ms),
            ]),
          ),
          Positioned(
            bottom: 48,
            left: 0,
            right: 0,
            child: Text('Works offline · Drivers & Loaders', textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.35), fontSize: 12)).animate(delay: 1700.ms).fadeIn(),
          ),
        ]),
      ),
    );
  }
}

class _RouteLine extends CustomPainter {
  _RouteLine(this.t);
  final double t;
  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height * 0.72;
    final path = Path()
      ..moveTo(-20, y + 30)
      ..cubicTo(size.width * 0.25, y + 30, size.width * 0.3, y - 30, size.width * 0.55, y - 10)
      ..cubicTo(size.width * 0.8, y + 10, size.width * 0.85, y + 40, size.width + 20, y - 10);
    final m = path.computeMetrics().first;
    final dash = Paint()
      ..color = K.tealLight.withValues(alpha: 0.35)
      ..strokeWidth = 1.6
      ..style = PaintingStyle.stroke;
    for (double d = 0; d < m.length * t; d += 14) {
      canvas.drawPath(m.extractPath(d, d + 7), dash);
    }
    final tan = m.getTangentForOffset(m.length * Curves.easeInOut.transform(t));
    if (tan != null && t > 0) {
      canvas.drawCircle(tan.position, 14, Paint()..color = K.chocolate.withValues(alpha: 0.2));
      canvas.drawCircle(tan.position, 6, Paint()..color = K.chocolate);
    }
  }

  @override
  bool shouldRepaint(_RouteLine old) => old.t != t;
}
