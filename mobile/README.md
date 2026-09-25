# kairon_mobile

Kairon offline-first app for drivers and loaders

## Run in Android Studio

### 1. Set up Flutter and Android

- Install the [Flutter SDK](https://docs.flutter.dev/install) and add its `bin` directory to your `PATH`. Use a Flutter release whose bundled Dart SDK satisfies this project's `^3.10.1` requirement in `pubspec.yaml`.
- Install [Android Studio](https://developer.android.com/studio). In **Settings → Plugins → Marketplace**, install **Flutter**, enable the Dart plugin when prompted, and restart the IDE.
- In **SDK Manager**, install the Android SDK platform required by Flutter, Android SDK Build-Tools, Command-line Tools, Platform-Tools, and Android Emulator. Accept any additional SDK/NDK installation requested by the build.

Run these commands in a terminal and resolve any Android toolchain issues they report:

```sh
flutter doctor --android-licenses
flutter doctor -v
```

See Flutter's [Android setup guide](https://docs.flutter.dev/platform-integration/android/setup) for platform-specific installation details.

### 2. Open the mobile project

1. In Android Studio, choose **Open** and select this repository's **`mobile` folder**, which contains `pubspec.yaml`.
2. Under **Settings → Languages & Frameworks → Flutter**, set the Flutter SDK path to your SDK installation directory (for example, `/Users/your-name/flutter`).
3. Open the IDE terminal. With `mobile` as the working directory, install dependencies:

```sh
flutter pub get
```

### 3. Start an Android device

Open **Tools → Device Manager**, create a virtual device, download a system image compatible with your computer, and start the emulator. Wait for its home screen to appear.

Alternatively, connect an Android phone over USB, enable **Developer options → USB debugging**, and accept the phone's debugging authorization prompt.

Confirm Flutter detects the device:

```sh
flutter devices
```

### 4. Launch Kairon

1. Open `lib/main.dart`.
2. Select the Android device in the toolbar and the Flutter run configuration for `main.dart`.
3. Click **Run ▶** or **Debug**. The first build downloads dependencies and can take several minutes.

If the configuration is missing, use **Run → Edit Configurations → + → Flutter**, set the Dart entrypoint to `lib/main.dart`, and use `mobile` as the working directory where that field is available. These steps follow Flutter's [Android Studio guide](https://docs.flutter.dev/tools/android-studio).

You can also launch from the terminal inside `mobile`:

```sh
flutter run -d <device-id>
```

Replace `<device-id>` with an ID from `flutter devices`. Use **Hot Reload** for Dart UI changes; stop and rerun after changing native startup images or launcher icons.

### Troubleshooting

- **Flutter commands unavailable:** add the Flutter SDK's `bin` directory to `PATH`, then reopen the terminal.
- **No device listed:** start the emulator or authorize USB debugging, then rerun `flutter devices`.
- **Flutter run configuration unavailable:** check that the Flutter and Dart plugins are enabled and that you opened `mobile`, the directory containing `pubspec.yaml`.
- **SDK or license errors:** check SDK Manager and rerun `flutter doctor --android-licenses` and `flutter doctor -v`.
- **Dart compilation errors:** run `flutter analyze` from `mobile`. The last validation reported existing errors in `lib/screens/driver/issues.dart`, `lib/screens/driver/today.dart`, and `lib/screens/loader/loader.dart`; these need to be resolved before the app can launch successfully.

## Brand assets

The supplied route logo replaces the original K mark. Light and dark variants follow the app theme; dark surfaces and startup screens use the white/green variant. The adaptive SVG is used for the web favicon.

Source SVGs live in `web/public/brand/` and are mirrored in `mobile/assets/brand/`. From the repository root, run `python3 scripts/generate_brand.py` (requires Pillow) after changing the source artwork. This regenerates Flutter vector paths, web install icons, Android launcher/startup images, and iOS app/startup images. PNG exports are rendered at four times their target size before downsampling; the iOS app icon includes a 1024px export. The generator supports the supplied SVGs’ M/L/Z path geometry.
