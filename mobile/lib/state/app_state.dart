import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/api.dart';
import '../data/models.dart';

enum NetStatus { online, offline, syncing, error }

class RouteConflict {
  RouteConflict({required this.offline, required this.latest, required this.reassigned, required this.deliveredOffline});
  final List<String> offline, latest, reassigned, deliveredOffline;
}

/// Everything on this device: who is signed in, their downloaded work, and the
/// outbox of field events waiting to reach the server.
class AppState extends ChangeNotifier {
  AppState({KaironApi? api}) : api = api ?? MockKaironApi();

  final KaironApi api;
  static const _key = 'kairon.device';

  AppUser? user;
  List<Trip> trips = [];
  List<FieldEvent> outbox = [];
  int? lastSync;
  int? downloadedAt;
  bool simulateOffline = false;
  bool netOnline = true;
  bool syncing = false;
  bool flakyUploads = false;
  ThemeMode themeMode = ThemeMode.system;
  RouteConflict? conflict;
  bool ready = false;

  StreamSubscription<List<ConnectivityResult>>? _sub;

  bool get online => netOnline && !simulateOffline;
  int get pending => outbox.where((e) => !e.failed).length;
  int get failed => outbox.where((e) => e.failed).length;
  NetStatus get status => !online ? NetStatus.offline : syncing ? NetStatus.syncing : failed > 0 ? NetStatus.error : NetStatus.online;

  /// The trip the driver should be looking at now.
  Trip? get myTrip {
    if (user?.role != Role.driver) return null;
    final mine = trips.where((t) => t.vehicleId == user!.vehicleId).toList();
    for (final s in [TripStatus.inProgress, TripStatus.paused, TripStatus.loaded, TripStatus.loading, TripStatus.planned, TripStatus.completed]) {
      final t = mine.where((x) => x.status == s).firstOrNull;
      if (t != null) return t;
    }
    return null;
  }

  Trip? trip(String id) => trips.where((t) => t.id == id).firstOrNull;

  Future<void> init() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_key);
    if (raw != null) {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      user = j['user'] == null ? null : AppUser.fromJson(Map<String, dynamic>.from(j['user']));
      trips = ((j['trips'] ?? []) as List).map((e) => Trip.fromJson(Map<String, dynamic>.from(e))).toList();
      outbox = ((j['outbox'] ?? []) as List).map((e) => FieldEvent.fromJson(Map<String, dynamic>.from(e))).toList();
      lastSync = j['lastSync'];
      downloadedAt = j['downloadedAt'];
      simulateOffline = j['simulateOffline'] ?? false;
      flakyUploads = j['flakyUploads'] ?? false;
      themeMode = ThemeMode.values.byName(j['themeMode'] ?? 'system');
    }
    final c = Connectivity();
    netOnline = _hasNet(await c.checkConnectivity());
    _sub = c.onConnectivityChanged.listen((r) {
      final was = online;
      netOnline = _hasNet(r);
      notifyListeners();
      if (!was && online) sync();
    });
    ready = true;
    notifyListeners();
    if (online) sync();
  }

  bool _hasNet(List<ConnectivityResult> r) => r.any((x) => x != ConnectivityResult.none);

  Future<void> _persist() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(
      _key,
      jsonEncode({
        'user': user?.toJson(),
        'trips': trips.map((t) => t.toJson()).toList(),
        'outbox': outbox.map((e) => e.toJson()).toList(),
        'lastSync': lastSync,
        'downloadedAt': downloadedAt,
        'simulateOffline': simulateOffline,
        'flakyUploads': flakyUploads,
        'themeMode': themeMode.name,
      }),
    );
  }

  // ---------------------------------------------------------------- session

  Future<void> signIn(String email, String password) async {
    if (!online) {
      // Allow returning users back in offline with the work already on the device.
      if (user == null && trips.isNotEmpty) throw ApiException('offline', 'You’re offline. Connect once to download your route.');
      if (user != null) return;
      throw ApiException('offline', 'You’re offline. Connect once to sign in and download your route.');
    }
    final u = await api.signIn(email, password);
    user = u;
    trips = await api.assignments(u);
    outbox = [];
    downloadedAt = DateTime.now().millisecondsSinceEpoch;
    lastSync = downloadedAt;
    await _persist();
    notifyListeners();
  }

  Future<void> signOut() async {
    user = null;
    trips = [];
    outbox = [];
    conflict = null;
    await _persist();
    notifyListeners();
  }

  // ------------------------------------------------------------- recording

  /// Save a field event locally first; send it when there is a connection.
  void record(String type, String tripId, {String? orderId, Map<String, dynamic> data = const {}}) {
    final e = FieldEvent(id: '${DateTime.now().microsecondsSinceEpoch}', type: type, tripId: tripId, orderId: orderId, data: data, at: DateTime.now().millisecondsSinceEpoch);
    applyEvent(trips, e);
    outbox.add(e);
    _persist();
    notifyListeners();
    if (online) sync();
  }

  Future<void> sync() async {
    if (syncing || !online || user == null) return;
    if (pending == 0) {
      await _refresh(detectConflict: false);
      return;
    }
    syncing = true;
    notifyListeners();
    await Future.delayed(const Duration(milliseconds: 600));

    // What does the server think my route is, before my offline work lands?
    final mine = myTrip;
    final before = mine?.stops.map((s) => s.orderId).toList();
    List<Trip> server = [];
    try {
      server = await api.assignments(user!);
    } catch (_) {}
    final serverTrip = mine == null ? null : server.where((t) => t.id == mine.id).firstOrNull;

    for (final e in List<FieldEvent>.from(outbox)) {
      if (e.failed) continue;
      if (!online) break;
      try {
        await api.push(e, flakyUploads: flakyUploads);
        outbox.remove(e);
      } on ApiException catch (err) {
        e.failed = true;
        e.error = err.message;
      }
      notifyListeners();
    }

    if (before != null && serverTrip != null) {
      final latestIds = serverTrip.stops.map((s) => s.orderId).toList();
      final reassigned = before.where((id) => !latestIds.contains(id)).toList();
      if (reassigned.isNotEmpty) {
        final deliveredOffline = reassigned.where((id) => mine!.stops.any((s) => s.orderId == id && s.done)).toList();
        String out(String id) => mine!.stops.firstWhere((s) => s.orderId == id).outletId;
        conflict = RouteConflict(
          offline: before.map(out).toList(),
          latest: latestIds.where((id) => mine!.stops.any((s) => s.orderId == id)).map(out).toList(),
          reassigned: reassigned.map(out).toList(),
          deliveredOffline: deliveredOffline.map(out).toList(),
        );
      }
    }
    await _refresh(detectConflict: false);
    syncing = false;
    if (failed == 0) lastSync = DateTime.now().millisecondsSinceEpoch;
    await _persist();
    notifyListeners();
  }

  /// Pull the latest assignments; keep unsent local work on top.
  Future<void> _refresh({required bool detectConflict}) async {
    if (!online || user == null) return;
    try {
      final latest = await api.assignments(user!);
      for (final e in outbox) {
        applyEvent(latest, e);
      }
      trips = latest;
      lastSync = DateTime.now().millisecondsSinceEpoch;
      await _persist();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> retry([String? id]) async {
    for (final e in outbox) {
      if (id == null || e.id == id) {
        e.failed = false;
        e.error = null;
      }
    }
    flakyUploads = false;
    notifyListeners();
    await sync();
  }

  void dismissConflict() {
    conflict = null;
    notifyListeners();
  }

  // ------------------------------------------------------------ demo tools

  void setSimulateOffline(bool v) {
    simulateOffline = v;
    _persist();
    notifyListeners();
    if (online) sync();
  }

  void setFlaky(bool v) {
    flakyUploads = v;
    _persist();
    notifyListeners();
  }

  void setTheme(ThemeMode m) {
    themeMode = m;
    _persist();
    notifyListeners();
  }

  Future<String?> demoReassign() async {
    final t = myTrip;
    if (t == null) return null;
    return api.reassignOneStop(t.id);
  }

  Future<void> demoMarkLoaded() async {
    final t = myTrip;
    if (t == null) return;
    await api.markLoaded(t.id);
    await _refresh(detectConflict: false);
  }

  Future<void> demoReset() async {
    await api.reset();
    final u = user;
    outbox = [];
    conflict = null;
    if (u != null && online) {
      trips = await api.assignments(u);
      downloadedAt = DateTime.now().millisecondsSinceEpoch;
    }
    await _persist();
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
