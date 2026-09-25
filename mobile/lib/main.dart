import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'screens/login.dart';
import 'screens/shell.dart';
import 'screens/splash.dart';
import 'state/app_state.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent));
  final state = AppState();
  await state.init();
  runApp(ChangeNotifierProvider.value(value: state, child: const KaironApp()));
}

class KaironApp extends StatefulWidget {
  const KaironApp({super.key});
  @override
  State<KaironApp> createState() => _KaironAppState();
}

class _KaironAppState extends State<KaironApp> {
  bool _intro = true;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return MaterialApp(
      title: 'Kairon',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: s.themeMode,
      home: AnimatedSwitcher(
        duration: const Duration(milliseconds: 600),
        switchInCurve: Curves.easeOutCubic,
        transitionBuilder: (c, a) => FadeTransition(opacity: a, child: ScaleTransition(scale: Tween(begin: 1.04, end: 1.0).animate(a), child: c)),
        child: _intro
            ? SplashScreen(key: const ValueKey('splash'), onDone: () => setState(() => _intro = false))
            : s.user == null
                ? const LoginScreen(key: ValueKey('login'))
                : Shell(key: ValueKey(s.user!.email)),
      ),
    );
  }
}
