# Building Kestrel VA

Kestrel VA builds with CMake (≥ 3.22) and a C++20 compiler. The only third-party
dependency is **JUCE 8.0.16-security** (commit `ea77444750de45e036e0279bb0291144bf8e3688`),
fetched by CMake and verified against that commit. The sound engine (`engine/`) has no
dependencies at all.

## Windows (primary target: VST3 for FL Studio)

Requirements: Visual Studio 2022 (Desktop development with C++), CMake 3.22+, Git.

```bash
cmake -S kestrel -B build -G "Visual Studio 17 2022" -A x64
```

```bash
cmake --build build --config Release --parallel
```

```bash
ctest --test-dir build -C Release --output-on-failure
```

Outputs (Release):

| Target | Path |
|---|---|
| VST3 instrument | `build/plugin/KestrelVA_artefacts/Release/VST3/Kestrel VA.vst3` |
| VST3 effect variant (MIDI-controlled; vocoder / Audio In in FL Studio mixer inserts) | `build/plugin/KestrelVAFX_artefacts/Release/VST3/Kestrel VA FX.vst3` |
| Standalone app | `build/plugin/KestrelVA_artefacts/Release/Standalone/Kestrel VA.exe` |

Install a VST3 by copying the whole `.vst3` folder to `C:\Program Files\Common Files\VST3\`,
then rescan plug-ins in the host. The build does not copy plug-ins automatically.

### Pre-built Windows binaries

Every push that touches `kestrel/` runs `.github/workflows/kestrel-va.yml`. It builds with
MSVC on `windows-2022`, runs the engine tests and the host-side VST3 check, then uploads the
artifact **KestrelVA-windows-x64**, which contains both VST3 bundles and the standalone `.exe`.
Download it from the run's page under *Actions*.

## Linux (development, tests and Linux VST3/Standalone)

```bash
sudo apt-get install -y ninja-build libasound2-dev libjack-jackd2-dev libfreetype-dev libx11-dev libxrandr-dev libxinerama-dev libxcursor-dev libxext-dev libgl1-mesa-dev libfontconfig1-dev
```

```bash
cmake -S kestrel -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
```

```bash
cmake --build build --parallel
```

```bash
ctest --test-dir build --output-on-failure
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `KESTREL_JUCE_DIR` | (empty) | Use a local JUCE checkout instead of fetching. It must be at the pinned commit; configuration fails otherwise. |
| `KESTREL_BUILD_PLUGIN` | ON | Build the JUCE targets. Set OFF to build only the engine, tools and tests (no JUCE needed). |
| `KESTREL_BUILD_TESTS` | ON | Build `kestrel_tests`, `kestrel_render`, `kestrel_capture` and `kestrel_compare`. |
| `KESTREL_BUILD_PLUGIN_CHECK` | ON | Build the host-side VST3 checker (`KestrelPluginCheck`). |

Engine-only build (fast, no JUCE):

```bash
cmake -S kestrel -B build-engine -DKESTREL_BUILD_PLUGIN=OFF && cmake --build build-engine
```

## Checking the built plug-ins

```bash
build/plugin/KestrelPluginCheck_artefacts/Release/KestrelPluginCheck "build/plugin/KestrelVA_artefacts/Release/VST3/Kestrel VA.vst3" "build/plugin/KestrelVAFX_artefacts/Release/VST3/Kestrel VA FX.vst3"
```

The checker loads each bundle through JUCE's VST3 hosting layer, as a host would. It renders
MIDI at 44.1, 48 and 96 kHz with fixed and variable buffer sizes and checks the output is
finite and audible. It also checks the reported latency, the program list, automation while
rendering, and state recall into a fresh instance. On Linux, run it under `xvfb-run -a`.

Steinberg's own `validator` (VST3 SDK) was not run in this development environment. You can
run it on the built bundle as an additional conformance check.

## Licences

- JUCE 8 is dual-licensed (AGPLv3 / commercial). Distributing binaries requires a licence
  compatible with your use.
- UI fonts in `plugin/resources/fonts` are under the SIL Open Font License 1.1. The licence
  texts sit next to the font files.
