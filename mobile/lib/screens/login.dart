import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';

import '../data/api.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/brand.dart';
import '../widgets/common.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;
  bool _webOnly = false;

  Future<void> _submit([String? email]) async {
    if (email != null) {
      _email.text = email;
      _password.text = demoPassword;
    }
    setState(() {
      _busy = true;
      _error = null;
      _webOnly = false;
    });
    try {
      await context.read<AppState>().signIn(_email.text, _password.text);
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _webOnly = e.code == 'web-only';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    final offline = !context.watch<AppState>().online;
    return Scaffold(
      body: CustomScrollView(slivers: [
        SliverToBoxAdapter(
          child: Container(
            height: 340,
            decoration: const BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [K.ink, Color(0xFF0F3336), K.teal]),
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(36)),
            ),
            child: SafeArea(
              child: Stack(children: [
                Positioned(
                  left: 0,
                  right: 0,
                  top: 56,
                  height: 140,
                  child: Opacity(
                    opacity: 0.7,
                    child: RouteMap(
                      stops: context.read<AppState>().trips.isNotEmpty ? context.read<AppState>().trips.first.stops : seedTrips().first.stops,
                      nextIndex: 1,
                      height: 140,
                      dark: true,
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Wordmark(color: Colors.white),
                    const Spacer(),
                    Text('Your route,\neven without signal.', style: context.text.headlineMedium?.copyWith(color: Colors.white)).animate().fadeIn(duration: 500.ms).slideY(begin: 0.2),
                    const SizedBox(height: 8),
                    Text('Kairon for drivers and loaders', style: TextStyle(color: Colors.white.withValues(alpha: 0.7))).animate(delay: 150.ms).fadeIn(),
                  ]),
                ),
              ]),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          sliver: SliverList.list(children: [
            if (offline)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(children: [Icon(Icons.cloud_off_rounded, color: k.muted), const SizedBox(width: 8), Expanded(child: Text('You’re offline. Connect once to sign in and download your route.', style: context.text.bodySmall))]),
              ),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'Employee ID / Email', prefixIcon: Icon(Icons.badge_outlined))),
            const SizedBox(height: 12),
            TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outline_rounded)), onSubmitted: (_) => _submit()),
            AnimatedSize(
              duration: 250.ms,
              child: _error == null
                  ? const SizedBox(height: 16)
                  : Container(
                      margin: const EdgeInsets.symmetric(vertical: 14),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: _webOnly ? k.infoSoft : k.criticalSoft, borderRadius: BorderRadius.circular(14)),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Icon(_webOnly ? Icons.laptop_mac_rounded : Icons.error_outline_rounded, color: _webOnly ? k.info : k.critical),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(_error!, style: const TextStyle(fontWeight: FontWeight.w600)),
                            if (_webOnly) Text('Open Kairon Web on your computer to plan or track orders.', style: context.text.bodySmall),
                          ]),
                        ),
                      ]),
                    ).animate().shakeX(hz: 4, amount: 4, duration: 350.ms),
            ),
            FilledButton(
              onPressed: _busy || offline ? null : _submit,
              child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)) : const Text('Sign in'),
            ),
            const SizedBox(height: 28),
            Row(children: [
              Expanded(child: Divider(color: k.line)),
              Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Eyebrow('Demo access', color: k.muted)),
              Expanded(child: Divider(color: k.line)),
            ]),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(child: _DemoTile(icon: Icons.local_shipping_rounded, title: 'Driver', sub: 'Nimal · VEH014', onTap: _busy || offline ? null : () => _submit('driver@kairon.demo'))),
              const SizedBox(width: 12),
              Expanded(child: _DemoTile(icon: Icons.inventory_2_rounded, title: 'Loader', sub: 'Kamal · Bay 3', onTap: _busy || offline ? null : () => _submit('loader@kairon.demo'))),
            ]).animate(delay: 200.ms).fadeIn().slideY(begin: 0.15),
            const SizedBox(height: 12),
            Center(child: Text('Password: $demoPassword', style: context.text.bodySmall)),
          ]),
        ),
      ]),
    );
  }
}

class _DemoTile extends StatelessWidget {
  const _DemoTile({required this.icon, required this.title, required this.sub, this.onTap});
  final IconData icon;
  final String title, sub;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return KCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(color: k.brandSoft, borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: k.brandInk),
        ),
        const SizedBox(height: 12),
        Text('$title demo', style: context.text.titleMedium),
        Text(sub, style: context.text.bodySmall),
      ]),
    );
  }
}
