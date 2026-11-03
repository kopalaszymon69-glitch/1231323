// kestrel_capture — generates the reference-capture test set for an original
// (2002) microKORG and the matching Kestrel renders.
//
//   kestrel_capture <outdir> [--render] [--rate 48000]
//
// For every test it writes:
//   NN_name.mid   Standard MIDI File (type 0, 480 PPQ, 120 BPM). It first configures the
//                 hardware through its documented default CC map (owner's manual p.56) and
//                 NRPNs (MIDI implementation, virtual patch source/destination), then plays
//                 the test notes. Requires MIDI FILTER "Control Change" = Enable on the unit.
//   NN_name.kvp   The equivalent Kestrel program.
//   NN_name.kestrel.wav (with --render) Kestrel's rendering of the same MIDI.
// and manifest.md listing the panel settings that cannot be sent over MIDI.
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <string>
#include <vector>

#include "common/RenderHarness.h"
#include "common/WavIO.h"
#include "params/HardwareCc.h"
#include "params/Mapping.h"

using namespace kestrel;
using namespace kestrel::tools;

namespace {

// ------------------------------------------------------------------ hardware CC map
// Default control-change assignments (owner's manual p.56) for the parameters used here.
struct HwCc { const char* id; int cc; };
const HwCc kCcMap[] = {
    { "t1.pitch.portamento", 5 },   { "t1.osc1.wave", 77 },        { "t1.osc1.ctrl1", 14 },   { "t1.osc1.ctrl2", 15 },
    { "t1.osc2.wave", 78 },         { "t1.osc2.mod", 82 },         { "t1.osc2.semitone", 18 }, { "t1.osc2.tune", 19 },
    { "t1.mixer.osc1", 20 },        { "t1.mixer.osc2", 21 },       { "t1.mixer.noise", 22 },   { "t1.filter.type", 83 },
    { "t1.filter.cutoff", 74 },     { "t1.filter.resonance", 71 }, { "t1.filter.egInt", 79 },  { "t1.filter.keyTrack", 85 },
    { "t1.feg.attack", 23 },        { "t1.feg.decay", 24 },        { "t1.feg.sustain", 25 },   { "t1.feg.release", 26 },
    { "t1.amp.level", 7 },          { "t1.amp.pan", 10 },          { "t1.amp.distortion", 92 },
    { "t1.aeg.attack", 73 },        { "t1.aeg.decay", 75 },        { "t1.aeg.sustain", 70 },   { "t1.aeg.release", 72 },
    { "t1.lfo1.wave", 87 },         { "t1.lfo1.freq", 27 },        { "t1.lfo2.wave", 88 },     { "t1.lfo2.freq", 76 },
    { "t1.patch1.int", 28 },        { "t1.patch2.int", 29 },       { "t1.patch3.int", 30 },    { "t1.patch4.int", 31 },
    { "fx.mod.speed", 12 },         { "fx.mod.depth", 93 },        { "fx.delay.time", 13 },    { "fx.delay.depth", 94 },
};

int ccFor(const std::string& id) {
    for (const auto& m : kCcMap) if (id == m.id) return m.cc;
    return -1;
}

// Kestrel plain value -> transmitted CC value (owner's manual p.56/57 value tables)
int ccValue(const std::string& id, float v) {
    if (id == "t1.osc1.wave") return int(v) * 18;                      // 0,18,36,...,126
    if (id == "t1.osc2.wave") return int(v) == 0 ? 0 : (int(v) == 1 ? 64 : 127);
    if (id == "t1.osc2.mod" || id == "t1.filter.type" || id == "t1.lfo1.wave" || id == "t1.lfo2.wave") {
        static const int vals[4] = { 0, 43, 85, 127 };
        return vals[std::clamp(int(v), 0, 3)];
    }
    if (id == "t1.amp.distortion") return v >= 0.5f ? 127 : 0;
    if (id == "t1.osc2.semitone") { // p.57 table: lowest CC value of the step
        const int sem = int(std::lround(v));
        for (int c = 0; c < 128; ++c) if (HardwareCcMap::semitoneFromCc(c) == sem) return c;
        return 64;
    }
    const ParamInfo& p = paramInfo(findParam(id));
    if (p.minV < 0.0f) return std::clamp(int(std::lround(v)) + 64, 1, 127); // -63..63 -> 1..127, 64 = 0
    return std::clamp(int(std::lround(v)), 0, 127);
}

// ------------------------------------------------------------------ SMF writer
struct Smf {
    struct Ev { uint32_t tick; std::vector<uint8_t> bytes; };
    std::vector<Ev> evs;
    static constexpr int kPpq = 480;
    static constexpr double kBpm = 120.0;
    static uint32_t tick(double s) { return uint32_t(std::lround(s * kBpm / 60.0 * kPpq)); }
    void add(double t, std::vector<uint8_t> b) { evs.push_back({ tick(t), std::move(b) }); }
    bool write(const std::string& path) {
        std::stable_sort(evs.begin(), evs.end(), [](const Ev& a, const Ev& b) { return a.tick < b.tick; });
        std::vector<uint8_t> trk;
        auto vlq = [&](uint32_t v) {
            uint8_t buf[5]; int n = 0;
            buf[n++] = v & 0x7F;
            while ((v >>= 7)) buf[n++] = 0x80 | (v & 0x7F);
            while (n) trk.push_back(buf[--n]);
        };
        vlq(0); // tempo meta
        const uint32_t us = uint32_t(60000000.0 / kBpm);
        trk.insert(trk.end(), { 0xFF, 0x51, 0x03, uint8_t(us >> 16), uint8_t(us >> 8), uint8_t(us) });
        uint32_t last = 0;
        for (auto& e : evs) { vlq(e.tick - last); last = e.tick; trk.insert(trk.end(), e.bytes.begin(), e.bytes.end()); }
        vlq(0);
        trk.insert(trk.end(), { 0xFF, 0x2F, 0x00 });
        std::ofstream f(path, std::ios::binary);
        if (!f) return false;
        auto w32 = [&](uint32_t v) { const char b[4] = { char(v >> 24), char(v >> 16), char(v >> 8), char(v) }; f.write(b, 4); };
        auto w16 = [&](uint16_t v) { const char b[2] = { char(v >> 8), char(v) }; f.write(b, 2); };
        f.write("MThd", 4); w32(6); w16(0); w16(1); w16(kPpq);
        f.write("MTrk", 4); w32(uint32_t(trk.size()));
        f.write(reinterpret_cast<const char*>(trk.data()), std::streamsize(trk.size()));
        return true;
    }
};

// ------------------------------------------------------------------ tests
struct Test {
    std::string name, purpose;
    std::map<std::string, float> params;     // Kestrel ids (timbre 1) — sent via CC/NRPN when possible
    std::vector<std::string> manual;          // panel settings without MIDI control
    std::vector<TimedMidi> midi;              // performance (after the setup block)
    double seconds = 4.0;
};

// common "neutral" voice: open filter, instant amp EG, no FX
std::map<std::string, float> neutral() {
    return { { "t1.mixer.osc1", 127 }, { "t1.mixer.osc2", 0 }, { "t1.mixer.noise", 0 }, { "t1.filter.type", 0 },
             { "t1.filter.cutoff", 127 }, { "t1.filter.resonance", 0 }, { "t1.filter.egInt", 0 }, { "t1.filter.keyTrack", 0 },
             { "t1.aeg.attack", 0 }, { "t1.aeg.decay", 0 }, { "t1.aeg.sustain", 127 }, { "t1.aeg.release", 0 },
             { "t1.amp.level", 127 }, { "t1.amp.pan", 0 }, { "t1.amp.distortion", 0 }, { "t1.pitch.portamento", 0 },
             { "t1.osc1.ctrl1", 0 }, { "t1.osc1.ctrl2", 0 }, { "t1.patch1.int", 0 }, { "t1.patch2.int", 0 },
             { "t1.patch3.int", 0 }, { "t1.patch4.int", 0 }, { "fx.mod.depth", 0 }, { "fx.delay.depth", 0 } };
}

const std::vector<std::string> kAlwaysManual = {
    "Start from an initialised program (SHIFT + 8 'INIT PROGRAM', owner's manual p.59), Synth / Single, VOICE ASSIGN Poly",
    "EQ: LOW GAIN 0, HI GAIN 0 (no CC)", "MOD FX DEPTH 0 and DELAY DEPTH 0 are sent by CC#93/#94",
    "PITCH: TRANSPOSE 0, TUNE 0, VIBRATO INT 0; GLOBAL: MASTER TUNE 440.0, TRANSPOSE 0, VELOCITY CURVE 'Curve'",
};

void notesAt(Test& t, const std::vector<int>& notes, double start, double dur, double gap, int vel = 100) {
    double tt = start;
    for (int n : notes) { t.midi.push_back(noteOn(tt, n, vel)); t.midi.push_back(noteOff(tt + dur, n)); tt += dur + gap; }
    t.seconds = std::max(t.seconds, tt + 1.0);
}

void ccRamp(Test& t, int ccNum, int from, int to, double start, double dur) {
    const int steps = std::abs(to - from);
    for (int i = 0; i <= steps; ++i)
        t.midi.push_back(cc(start + dur * double(i) / double(std::max(1, steps)), ccNum, from + (to > from ? i : -i)));
}

std::vector<Test> buildTests() {
    std::vector<Test> T;
    const std::vector<int> keys = { 36, 48, 60, 72, 84, 96 };
    // --- calibration
    {
        Test t { "calibration_sine_a4", "Level calibration: OSC1 Sine, A4 (440 Hz), velocity 127, 4 s; then 2 s silence (noise floor)", neutral(), {}, {} };
        t.params["t1.osc1.wave"] = 3;
        notesAt(t, { 69 }, 0.5, 4.0, 0.0, 127);
        t.seconds = 7.0;
        T.push_back(t);
    }
    // --- isolated oscillators
    for (int w : { 0, 1, 2, 3, 4 }) {
        for (int c1 : { 0, 32, 64, 96, 127 }) {
            if ((w == 3 || w == 4) && c1 == 96) continue;
            Test t;
            t.name = std::string("osc1_") + choices::kOsc1Wave[w] + "_ctrl1_" + std::to_string(c1);
            t.purpose = std::string("OSC1 ") + choices::kOsc1Wave[w] + " spectrum vs pitch, CONTROL 1 = " + std::to_string(c1) + (w == 3 ? " (cross-mod by OSC2 at level 0, semitone 0)" : "");
            t.params = neutral();
            t.params["t1.osc1.wave"] = float(w);
            t.params["t1.osc1.ctrl1"] = float(c1);
            t.params["t1.osc2.semitone"] = 0;
            for (auto& c : t.params) (void)c;
            notesAt(t, keys, 0.5, 1.0, 0.25);
            for (auto& ch : t.name) if (ch == ' ') ch = '_';
            T.push_back(t);
        }
    }
    {
        Test t { "osc1_dwgs_all", "All 64 DWGS waves at C4, 0.8 s each (CONTROL 2 selects the wave: values 0,2,...,126)", neutral(), {}, {} };
        t.params["t1.osc1.wave"] = 5;
        double tt = 0.5;
        for (int i = 0; i < 64; ++i) { t.midi.push_back(cc(tt - 0.1, 15, 2 * i)); t.midi.push_back(noteOn(tt, 60, 100)); t.midi.push_back(noteOff(tt + 0.8, 60)); tt += 1.0; }
        t.seconds = tt + 0.5;
        T.push_back(t);
    }
    {
        Test t { "osc1_noise_filter", "OSC1 Noise: CONTROL 1 = 0/24/64/127 x CONTROL 2 = 0/100 at C4", neutral(), {}, {} };
        t.params["t1.osc1.wave"] = 6;
        double tt = 0.5;
        for (int c1 : { 0, 24, 64, 127 }) for (int c2 : { 0, 100 }) {
            t.midi.push_back(cc(tt - 0.1, 14, c1)); t.midi.push_back(cc(tt - 0.1, 15, c2));
            t.midi.push_back(noteOn(tt, 60, 100)); t.midi.push_back(noteOff(tt + 1.5, 60)); tt += 2.0;
        }
        t.seconds = tt + 0.5;
        T.push_back(t);
    }
    for (int w : { 0, 1, 2 }) {
        Test t;
        t.name = std::string("osc2_") + choices::kOsc2Wave[w];
        t.purpose = std::string("OSC2 ") + choices::kOsc2Wave[w] + " alone (OSC1 level 0)";
        t.params = neutral();
        t.params["t1.mixer.osc1"] = 0; t.params["t1.mixer.osc2"] = 127; t.params["t1.osc2.wave"] = float(w);
        notesAt(t, keys, 0.5, 1.0, 0.25);
        T.push_back(t);
    }
    {
        Test t { "osc2_tune_curve", "OSC2 TUNE curve: OSC1 + OSC2 saw, TUNE ramped -63..+63 over 32 s at A3 (beat/pitch analysis)", neutral(), {}, {} };
        t.params["t1.mixer.osc1"] = 0; t.params["t1.mixer.osc2"] = 127;
        t.midi.push_back(noteOn(0.5, 57, 100));
        ccRamp(t, 19, 1, 127, 1.0, 32.0);
        t.midi.push_back(noteOff(33.5, 57));
        t.seconds = 34.5;
        T.push_back(t);
    }
    // --- sync / ring
    for (int mod : { 1, 2, 3 }) {
        Test t;
        t.name = std::string("oscmod_") + choices::kOscMod[mod] + "_semitone_sweep";
        t.purpose = std::string("OSC MOD ") + choices::kOscMod[mod] + ": OSC2 (saw) SEMITONE ramped 0..+24 at A2 and A4; OSC1 level 0";
        t.params = neutral();
        t.params["t1.mixer.osc1"] = 0; t.params["t1.mixer.osc2"] = 127; t.params["t1.osc2.mod"] = float(mod);
        for (int k = 0; k < 2; ++k) {
            const double s = 0.5 + 12.0 * k;
            const int n = k == 0 ? 45 : 69;
            t.midi.push_back(cc(s - 0.2, 18, 64));
            t.midi.push_back(noteOn(s, n, 100));
            ccRamp(t, 18, 64, 127, s + 0.5, 10.0);
            t.midi.push_back(noteOff(s + 11.0, n));
        }
        t.seconds = 25.0;
        T.push_back(t);
    }
    // --- filter
    for (int type = 0; type < 4; ++type) {
        for (int res : { 0, 64, 100, 127 }) {
            Test t;
            t.name = std::string("filter_") + std::to_string(type) + "_res" + std::to_string(res) + "_noise_sweep";
            t.purpose = std::string("FILTER ") + choices::kFilterType[type] + ", RESONANCE " + std::to_string(res)
                        + ": mixer NOISE 127 (OSC1 0), CUTOFF ramped 0..127 over 16 s, then static 20/40/60/80/100/120 (2 s each)";
            t.params = neutral();
            t.params["t1.mixer.osc1"] = 0; t.params["t1.mixer.noise"] = 127; t.params["t1.filter.type"] = float(type);
            t.params["t1.filter.resonance"] = float(res);
            t.midi.push_back(cc(0.2, 74, 0));
            t.midi.push_back(noteOn(0.5, 60, 100));
            ccRamp(t, 74, 0, 127, 1.0, 16.0);
            double tt = 18.0;
            for (int c : { 20, 40, 60, 80, 100, 120 }) { t.midi.push_back(cc(tt, 74, c)); tt += 2.0; }
            t.midi.push_back(noteOff(tt, 60));
            t.seconds = tt + 1.0;
            T.push_back(t);
        }
    }
    {
        Test t { "filter_self_oscillation_pitch", "-24dB LPF, RESONANCE 127, all mixer levels 0, CUTOFF stepped 30..120 (2 s each): self-oscillation pitch vs cutoff", neutral(), {}, {} };
        t.params["t1.mixer.osc1"] = 0; t.params["t1.filter.resonance"] = 127;
        t.midi.push_back(noteOn(0.5, 60, 100));
        double tt = 0.6;
        for (int c = 30; c <= 120; c += 10) { t.midi.push_back(cc(tt, 74, c)); tt += 2.0; }
        t.midi.push_back(noteOff(tt, 60));
        t.seconds = tt + 1.0;
        T.push_back(t);
    }
    {
        Test t { "filter_input_level", "-24dB LPF, CUTOFF 60, RESONANCE 100, saw at A2 with OSC1 LEVEL 16/32/64/96/127 (level dependence)", neutral(), {}, {} };
        t.params["t1.filter.cutoff"] = 60; t.params["t1.filter.resonance"] = 100;
        double tt = 0.5;
        for (int l : { 16, 32, 64, 96, 127 }) { t.midi.push_back(cc(tt - 0.1, 20, l)); t.midi.push_back(noteOn(tt, 45, 100)); t.midi.push_back(noteOff(tt + 2.0, 45)); tt += 2.5; }
        t.seconds = tt + 0.5;
        T.push_back(t);
    }
    {
        Test t { "filter_keytrack", "-24dB LPF, CUTOFF 40, KEY TRACK +48 and -63 (two passes): saw at C2..C6", neutral(), {}, {} };
        t.params["t1.filter.cutoff"] = 40; t.params["t1.filter.keyTrack"] = 48;
        notesAt(t, { 36, 48, 60, 72, 84 }, 0.5, 1.0, 0.25);
        t.midi.push_back(cc(7.0, 85, 1));
        notesAt(t, { 36, 48, 60, 72, 84 }, 7.5, 1.0, 0.25);
        T.push_back(t);
    }
    // --- envelopes
    for (const char* seg : { "attack", "decay", "release" }) {
        Test t;
        t.name = std::string("amp_eg_") + seg + "_times";
        t.purpose = std::string("AMP EG ") + seg + " time for 0,16,32,48,64,80,96,112,127 (sine A4; held/released long enough to complete)";
        t.params = neutral();
        t.params["t1.osc1.wave"] = 3;
        const int ccNum = std::string(seg) == "attack" ? 73 : (std::string(seg) == "decay" ? 75 : 72);
        if (std::string(seg) == "decay") t.params["t1.aeg.sustain"] = 0;
        double tt = 0.5;
        for (int v : { 0, 16, 32, 48, 64, 80, 96, 112, 127 }) {
            const double segLen = 0.3 + 1.2 * mapping::egTimeSeconds(v) + 0.5 * double(v) / 127.0 * 12.0;
            t.midi.push_back(cc(tt - 0.2, ccNum, v));
            t.midi.push_back(noteOn(tt, 69, 100));
            const double hold = std::string(seg) == "release" ? 0.6 : segLen;
            t.midi.push_back(noteOff(tt + hold, 69));
            tt += hold + (std::string(seg) == "release" ? segLen : 0.3) + 0.5;
        }
        t.seconds = tt + 0.5;
        T.push_back(t);
    }
    {
        Test t { "filter_eg_decay_sweep", "FILTER EG: -24dB LPF CUTOFF 20, EG INT +63, SUSTAIN 0, DECAY 0/32/64/96 on noise (cutoff trajectory)", neutral(), {}, {} };
        t.params["t1.mixer.osc1"] = 0; t.params["t1.mixer.noise"] = 127; t.params["t1.filter.cutoff"] = 20; t.params["t1.filter.egInt"] = 63;
        t.params["t1.feg.attack"] = 0; t.params["t1.feg.sustain"] = 0; t.params["t1.feg.release"] = 0;
        double tt = 0.5;
        for (int d : { 0, 32, 64, 96 }) { t.midi.push_back(cc(tt - 0.2, 24, d)); t.midi.push_back(noteOn(tt, 60, 100)); t.midi.push_back(noteOff(tt + 3.0, 60)); tt += 3.5; }
        t.seconds = tt + 0.5;
        T.push_back(t);
    }
    // --- LFO rates / shapes (via MOD wheel vibrato on LFO2 is not shape-complete; use patch LFO -> pitch)
    for (int lfo : { 1, 2 }) {
        Test t;
        t.name = "lfo" + std::to_string(lfo) + "_rate_and_shape";
        t.purpose = "LFO" + std::to_string(lfo) + " -> Pitch (PATCH1 MOD INT +20, via NRPN source/destination); each WAVE at FREQUENCY 20/64/100";
        t.params = neutral();
        t.params["t1.osc1.wave"] = 3;
        t.params["t1.patch1.int"] = 20;
        t.params["t1.patch1.src"] = float(lfo == 1 ? 2 : 3); // LFO1 / LFO2
        t.params["t1.patch1.dst"] = 0;
        t.manual.push_back("LFO" + std::to_string(lfo) + " KEY SYNC = Off, TEMPO SYNC = Off");
        double tt = 0.5;
        for (int w = 0; w < 4; ++w) for (int f : { 20, 64, 100 }) {
            t.midi.push_back(cc(tt - 0.2, lfo == 1 ? 87 : 88, w == 0 ? 0 : (w == 1 ? 43 : (w == 2 ? 85 : 127))));
            t.midi.push_back(cc(tt - 0.2, lfo == 1 ? 27 : 76, f));
            const double len = f == 20 ? 8.0 : 3.0;
            t.midi.push_back(noteOn(tt, 69, 100)); t.midi.push_back(noteOff(tt + len, 69)); tt += len + 0.4;
        }
        t.seconds = tt + 0.5;
        T.push_back(t);
    }
    // --- pitch / portamento / unison / velocity
    {
        Test t { "portamento_times", "Mono, TRIGGER Multi, PORTAMENTO 0/32/64/96/127: A2 -> A4 legato pairs", neutral(), {}, {} };
        t.params["t1.osc1.wave"] = 3;
        t.manual.push_back("VOICE ASSIGN Mono, TRIGGER MODE Multi");
        double tt = 0.5;
        for (int p : { 0, 32, 64, 96, 127 }) {
            t.midi.push_back(cc(tt - 0.2, 5, p));
            t.midi.push_back(noteOn(tt, 45, 100)); t.midi.push_back(noteOn(tt + 1.0, 69, 100));
            t.midi.push_back(noteOff(tt + 1.05, 45)); t.midi.push_back(noteOff(tt + 5.0, 69)); tt += 5.5;
        }
        t.seconds = tt + 0.5;
        T.push_back(t);
    }
    {
        Test t { "unison_detune", "Unison, DETUNE 0/25/50/99: saw A3, 3 s each (beating / spread analysis)", neutral(), {}, {} };
        t.manual.push_back("VOICE ASSIGN Unison; UNISON DETUNE set by hand before each note: 0, 25, 50, 99 (pause marked by 2 s gaps)");
        notesAt(t, { 57, 57, 57, 57 }, 0.5, 3.0, 2.0);
        T.push_back(t);
    }
    {
        Test t { "velocity_to_amp", "PATCH1 Velocity -> Amp, MOD INT +63, AMP LEVEL 0: sine A4 at velocity 1,16,32,48,64,80,96,112,127", neutral(), {}, {} };
        t.params["t1.osc1.wave"] = 3; t.params["t1.amp.level"] = 0; t.params["t1.patch1.int"] = 63;
        t.params["t1.patch1.src"] = 4; t.params["t1.patch1.dst"] = 5;
        double tt = 0.5;
        for (int v : { 1, 16, 32, 48, 64, 80, 96, 112, 127 }) { t.midi.push_back(noteOn(tt, 69, v)); t.midi.push_back(noteOff(tt + 0.8, 69)); tt += 1.0; }
        t.seconds = tt + 0.5;
        T.push_back(t);
    }
    {
        Test t { "voice_allocation", "Poly: six overlapping notes (last-note priority); then Layer chord (needs manual SINGLE/LAYER = Layer for the 2nd half)", neutral(), {}, {} };
        t.manual.push_back("First half Single/Poly; at 6 s switch SINGLE/LAYER to Layer (both timbres Poly)");
        for (int k = 0; k < 6; ++k) { t.midi.push_back(noteOn(0.5 + 0.4 * k, 48 + 4 * k, 100)); t.midi.push_back(noteOff(4.5, 48 + 4 * k)); }
        for (int k = 0; k < 3; ++k) { t.midi.push_back(noteOn(7.0 + 0.4 * k, 48 + 4 * k, 100)); t.midi.push_back(noteOff(10.0, 48 + 4 * k)); }
        t.seconds = 11.0;
        T.push_back(t);
    }
    // --- effects
    {
        Test t { "delay_times", "DELAY Stereo, DEPTH 64, TIME 0/32/64/96/127: single short clicks (sine A5, 20 ms)", neutral(), {}, {} };
        t.params["t1.osc1.wave"] = 3; t.params["fx.delay.depth"] = 64;
        double tt = 0.5;
        for (int d : { 0, 32, 64, 96, 127 }) { t.midi.push_back(cc(tt - 0.2, 13, d)); t.midi.push_back(noteOn(tt, 81, 127)); t.midi.push_back(noteOff(tt + 0.02, 81)); tt += 4.0; }
        t.seconds = tt + 0.5;
        T.push_back(t);
    }
    {
        Test t { "modfx_types", "MOD FX Flanger/Chorus, Ensemble, Phaser (TYPE by hand), SPEED 20/90, DEPTH 64/127 on saw A3", neutral(), {}, {} };
        t.manual.push_back("MOD FX TYPE set by hand in three passes: Flanger/Chorus, Ensemble, Phaser");
        double tt = 0.5;
        for (int s : { 20, 90 }) for (int d : { 64, 127 }) {
            t.midi.push_back(cc(tt - 0.2, 12, s)); t.midi.push_back(cc(tt - 0.2, 93, d));
            t.midi.push_back(noteOn(tt, 57, 100)); t.midi.push_back(noteOff(tt + 4.0, 57)); tt += 4.5;
        }
        t.seconds = tt + 0.5;
        T.push_back(t);
    }
    // --- complete patches (fully specified, playable on both)
    {
        Test t { "patch_pluck_bass", "Complete patch: saw + OSC2 square -12, -24dB LPF cutoff 44 res 42 EG +40, short decay; bass line", neutral(), {}, {} };
        t.params["t1.osc2.wave"] = 1; t.params["t1.osc2.semitone"] = -12; t.params["t1.mixer.osc2"] = 70;
        t.params["t1.filter.cutoff"] = 44; t.params["t1.filter.resonance"] = 42; t.params["t1.filter.egInt"] = 40; t.params["t1.filter.keyTrack"] = 32;
        t.params["t1.feg.attack"] = 0; t.params["t1.feg.decay"] = 46; t.params["t1.feg.sustain"] = 18; t.params["t1.feg.release"] = 28;
        t.params["t1.aeg.decay"] = 58; t.params["t1.aeg.sustain"] = 70; t.params["t1.aeg.release"] = 24;
        const int line[] = { 36, 36, 48, 39, 41, 43, 36, 46 };
        for (int i = 0; i < 8; ++i) { t.midi.push_back(noteOn(0.5 + 0.25 * i, line[i], 70 + 7 * i)); t.midi.push_back(noteOff(0.5 + 0.25 * i + 0.2, line[i])); }
        t.seconds = 4.0;
        T.push_back(t);
    }
    {
        Test t { "patch_sync_lead", "Complete patch: OSC2 Sync, semitone +7, Filter EG -> OSC2 Tune (+44, NRPN), mono melody", neutral(), {}, {} };
        t.params["t1.mixer.osc1"] = 40; t.params["t1.mixer.osc2"] = 127; t.params["t1.osc2.mod"] = 2; t.params["t1.osc2.semitone"] = 7;
        t.params["t1.feg.decay"] = 72; t.params["t1.feg.sustain"] = 20; t.params["t1.patch1.src"] = 0; t.params["t1.patch1.dst"] = 1; t.params["t1.patch1.int"] = 44;
        t.manual.push_back("VOICE ASSIGN Mono, TRIGGER MODE Multi");
        const int mel[] = { 69, 72, 74, 76, 74, 72, 69, 67 };
        for (int i = 0; i < 8; ++i) { t.midi.push_back(noteOn(0.5 + 0.4 * i, mel[i], 100)); t.midi.push_back(noteOff(0.5 + 0.4 * i + 0.35, mel[i])); }
        t.seconds = 5.0;
        T.push_back(t);
    }
    return T;
}

void addSetup(Smf& smf, const Test& t) {
    double tt = 0.0;
    // NRPN: patch 1 source / destination (MIDI implementation *2-3 / *2-4: value = index * 16)
    auto nrpn = [&](int msb, int lsb, int value) {
        smf.add(tt, { 0xB0, 99, uint8_t(msb) }); smf.add(tt, { 0xB0, 98, uint8_t(lsb) }); smf.add(tt, { 0xB0, 6, uint8_t(value) });
        tt += 0.002;
    };
    for (int k = 0; k < 4; ++k) {
        const std::string s = "t1.patch" + std::to_string(k + 1) + ".src", d = "t1.patch" + std::to_string(k + 1) + ".dst";
        if (t.params.count(s)) nrpn(0x04, k, int(t.params.at(s)) * 16 + 8);
        if (t.params.count(d)) nrpn(0x04, 0x08 + k, int(t.params.at(d)) * 16 + 8);
    }
    for (const auto& [id, v] : t.params) {
        const int ccNum = ccFor(id);
        if (ccNum < 0) continue;
        smf.add(tt, { 0xB0, uint8_t(ccNum), uint8_t(ccValue(id, v)) });
        tt += 0.002;
    }
}

} // namespace

int main(int argc, char** argv) {
    if (argc < 2) { std::printf("usage: kestrel_capture <outdir> [--render] [--rate HZ]\n"); return 2; }
    const std::filesystem::path out = argv[1];
    bool doRender = false;
    double rate = 48000.0;
    for (int i = 2; i < argc; ++i) {
        const std::string a = argv[i];
        if (a == "--render") doRender = true;
        else if (a == "--rate" && i + 1 < argc) rate = std::atof(argv[++i]);
    }
    std::filesystem::create_directories(out);
    const auto tests = buildTests();
    std::ofstream man(out / "manifest.md");
    man << "# Kestrel VA — reference capture set (generated by kestrel_capture)\n\n"
        << "Play each `.mid` file into an original 2002 microKORG (MIDI channel 1) and record the stereo output dry, "
        << "following docs/REFERENCE_CAPTURE.md. Settings for every test:\n\n";
    for (const auto& m : kAlwaysManual) man << "- " << m << "\n";
    man << "\nThe MIDI files begin with a 1-second setup block (CC/NRPN, owner's manual p.56; MIDI FILTER 'Control Change' must be Enable). "
        << "Record the whole file; analysis starts at the first note.\n\n| # | test | purpose | length | additional panel settings |\n|---|---|---|---|---|\n";
    int idx = 0;
    for (const auto& t : tests) {
        ++idx;
        char base[128];
        std::snprintf(base, sizeof base, "%02d_%s", idx, t.name.c_str());
        Smf smf;
        addSetup(smf, t);
        for (const auto& m : t.midi) smf.add(m.time + 1.0, { m.b0, m.b1, m.b2 }); // performance after the 1 s setup
        smf.write((out / (std::string(base) + ".mid")).string());
        Program p;
        p.name = t.name;
        p.category = "Reference test";
        p.description = t.purpose;
        for (const auto& [id, v] : t.params) {
            const int pi = findParam(id);
            if (pi >= 0) p.values[size_t(pi)] = v;
        }
        // manual settings that Kestrel can mirror
        for (const auto& m : t.manual) {
            if (m.find("VOICE ASSIGN Mono") != std::string::npos) p.values[size_t(pT(0, VoiceAssign))] = 0;
            if (m.find("TRIGGER MODE Multi") != std::string::npos) p.values[size_t(pT(0, TriggerMode))] = 1;
            if (m.find("VOICE ASSIGN Unison") != std::string::npos) p.values[size_t(pT(0, VoiceAssign))] = 2;
        }
        std::ofstream(out / (std::string(base) + ".kvp")) << serializeProgram(p);
        std::string manual;
        for (const auto& m : t.manual) manual += (manual.empty() ? "" : "; ") + m;
        char len[32];
        std::snprintf(len, sizeof len, "%.1f s", t.seconds + 1.0);
        man << "| " << idx << " | `" << base << "` | " << t.purpose << " | " << len << " | " << (manual.empty() ? "-" : manual) << " |\n";
        if (doRender) {
            Engine e;
            applyProgram(e, p);
            e.prepare(rate, 256);
            applyProgram(e, p);
            std::vector<TimedMidi> m = t.midi;
            for (auto& x : m) x.time += 1.0;
            RenderSettings rs;
            rs.sampleRate = rate;
            rs.seconds = t.seconds + 1.0;
            const auto r = render(e, m, rs);
            Audio a;
            a.sampleRate = rate;
            a.ch = { r.l, r.r };
            writeWavFloat((out / (std::string(base) + ".kestrel.wav")).string(), a);
        }
        std::printf("%s\n", base);
    }
    std::printf("wrote %d tests to %s\n", idx, out.string().c_str());
    return 0;
}
