import 'package:flutter/material.dart';

/// Kairon palette — shared with the web app.
class K {
  static const teal = Color(0xFF106C6C);
  static const tealLight = Color(0xFF5FD0CF);
  static const chocolate = Color(0xFFD66D32);
  static const steel = Color(0xFF85979A);
  static const platinum = Color(0xFFE5E7EB);
  static const ocean = Color(0xFF0284C7);
  static const ink = Color(0xFF0A1315);
  static const critical = Color(0xFFD92D2D);
  static const success = Color(0xFF1F8A4C);
  static const warning = Color(0xFFD49A12);

  static const display = 'SpaceGrotesk';
  static const mono = 'JetBrainsMono';
}

/// Semantic colours that change with light / dark mode.
@immutable
class KColors extends ThemeExtension<KColors> {
  const KColors({
    required this.bg,
    required this.surface,
    required this.surface2,
    required this.line,
    required this.ink,
    required this.muted,
    required this.brand,
    required this.brandSoft,
    required this.brandInk,
    required this.attention,
    required this.attentionSoft,
    required this.attentionInk,
    required this.info,
    required this.infoSoft,
    required this.critical,
    required this.criticalSoft,
    required this.success,
    required this.successSoft,
  });

  final Color bg, surface, surface2, line, ink, muted;
  final Color brand, brandSoft, brandInk;
  final Color attention, attentionSoft, attentionInk;
  final Color info, infoSoft, critical, criticalSoft, success, successSoft;

  static const light = KColors(
    bg: Color(0xFFF4F5F7),
    surface: Colors.white,
    surface2: Color(0xFFEEF0F2),
    line: Color(0xFFE5E7EB),
    ink: Color(0xFF0F1B1D),
    muted: Color(0xFF56676A),
    brand: K.teal,
    brandSoft: Color(0xFFE2EFEF),
    brandInk: Color(0xFF0C5858),
    attention: K.chocolate,
    attentionSoft: Color(0xFFFBECE3),
    attentionInk: Color(0xFFA44B19),
    info: K.ocean,
    infoSoft: Color(0xFFE1F1FB),
    critical: K.critical,
    criticalSoft: Color(0xFFFDE8E8),
    success: K.success,
    successSoft: Color(0xFFE3F4EA),
  );

  static const dark = KColors(
    bg: Color(0xFF0A1315),
    surface: Color(0xFF101C1F),
    surface2: Color(0xFF152427),
    line: Color(0xFF1F3237),
    ink: Color(0xFFE5E7EB),
    muted: Color(0xFF9AABAE),
    brand: Color(0xFF2A9A9A),
    brandSoft: Color(0x292A9A9A),
    brandInk: Color(0xFF6FCACA),
    attention: Color(0xFFE57F45),
    attentionSoft: Color(0x26E57F45),
    attentionInk: Color(0xFFF2A275),
    info: Color(0xFF2EA4E0),
    infoSoft: Color(0x262EA4E0),
    critical: Color(0xFFF05252),
    criticalSoft: Color(0x26F05252),
    success: Color(0xFF34C27A),
    successSoft: Color(0x2434C27A),
  );

  @override
  KColors copyWith() => this;

  @override
  KColors lerp(ThemeExtension<KColors>? other, double t) => t < 0.5 ? this : (other as KColors);
}

extension KContext on BuildContext {
  KColors get k => Theme.of(this).extension<KColors>()!;
  TextTheme get text => Theme.of(this).textTheme;
}

ThemeData buildTheme(Brightness b) {
  final c = b == Brightness.dark ? KColors.dark : KColors.light;
  final base = ThemeData(brightness: b, useMaterial3: true, fontFamily: 'Inter');
  TextStyle d(double size, FontWeight w) => TextStyle(fontFamily: K.display, fontSize: size, fontWeight: w, color: c.ink, letterSpacing: -0.3, height: 1.1);
  return base.copyWith(
    scaffoldBackgroundColor: c.bg,
    colorScheme: ColorScheme.fromSeed(seedColor: K.teal, brightness: b, primary: c.brand, surface: c.surface, error: c.critical),
    extensions: [c],
    textTheme: base.textTheme
        .copyWith(
          displaySmall: d(34, FontWeight.w700),
          headlineMedium: d(28, FontWeight.w700),
          headlineSmall: d(22, FontWeight.w600),
          titleLarge: d(18, FontWeight.w600),
          titleMedium: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.ink),
          bodyLarge: TextStyle(fontSize: 15, color: c.ink),
          bodyMedium: TextStyle(fontSize: 14, color: c.ink),
          bodySmall: TextStyle(fontSize: 12, color: c.muted),
          labelSmall: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.4, color: c.muted),
        )
        .apply(fontFamily: 'Inter'),
    appBarTheme: AppBarTheme(backgroundColor: c.bg, foregroundColor: c.ink, elevation: 0, scrolledUnderElevation: 0, centerTitle: false),
    dividerTheme: DividerThemeData(color: c.line, space: 1, thickness: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.brand,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.ink,
        minimumSize: const Size.fromHeight(52),
        side: BorderSide(color: c.line, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line, width: 1.5)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.brand, width: 2)),
      labelStyle: TextStyle(color: c.muted),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface,
      indicatorColor: c.brandSoft,
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: s.contains(WidgetState.selected) ? c.brandInk : c.muted)),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? c.brandInk : c.muted)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.ink,
      contentTextStyle: TextStyle(color: c.bg, fontFamily: 'Inter', fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: c.surface, showDragHandle: true, shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24)))),
  );
}
