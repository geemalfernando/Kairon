import 'package:flutter_test/flutter_test.dart';
import 'package:kairon_mobile/data/api.dart';
import 'package:kairon_mobile/data/models.dart';

void main() {
  test('offline delivery survives a dispatcher reassignment', () {
    final trips = seedTrips();
    final trip = trips.first;
    final moved = trip.stops[1];
    trip.stops.remove(moved);
    trip.reassigned.add(moved);

    final conflict = applyEvent(trips, FieldEvent(id: '1', type: 'DELIVER', tripId: trip.id, orderId: moved.orderId, data: {'outcome': 'DELIVERED', 'receiver': 'Dilini'}, at: 0));

    expect(conflict, moved.orderId);
    expect(trip.stops.any((s) => s.orderId == moved.orderId && s.status == StopStatus.delivered), isTrue);
    expect(trip.reassigned, isEmpty);
  });

  test('trip completes when every stop is done', () {
    final trip = seedTrips()[2];
    for (final s in trip.stops) {
      applyEvent([trip], FieldEvent(id: s.orderId, type: 'DELIVER', tripId: trip.id, orderId: s.orderId, data: {'outcome': 'DELIVERED'}, at: 0));
    }
    expect(trip.status, TripStatus.completed);
  });

  test('json round trip keeps delivery records', () {
    final t = seedTrips().first;
    t.stops.first
      ..status = StopStatus.delivered
      ..receiver = 'Dilini'
      ..offline = true;
    final back = Trip.fromJson(t.toJson());
    expect(back.stops.first.receiver, 'Dilini');
    expect(back.stops.first.offline, isTrue);
  });
}
