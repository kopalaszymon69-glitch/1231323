// MIDI timing, voice allocation, sustain, note stealing, envelopes, pitch.
#include "TestHelpers.h"
#include "params/Mapping.h"

using namespace kh;

namespace {
int activeCount(const Engine& e, int timbre = -1) {
    int c = 0;
    for (int i = 0; i < Engine::kMaxVoices; ++i) {
        const Voice& v = e.debugVoice(i);
        if (v.isActive() && (timbre < 0 || v.timbre() == timbre)) ++c;
    }
    return c;
}
bool noteSounding(const Engine& e, int note) {
    for (int i = 0; i < Engine::kMaxVoices; ++i) {
        const Voice& v = e.debugVoice(i);
        if (v.isActive() && v.gate() && v.note() == note) return true;
    }
    return false;
}
} // namespace

TEST(midi_note_on_is_sample_accurate) {
    Program p = basicProgram();
    for (int block : { 64, 256, 1000 }) {
        for (double t : { 0.01, 0.0123456, 0.05 }) {
            Rig r(p, 48000.0, block);
            const auto out = r.run({ noteOn(t, 69, 127) }, 0.1);
            const long onset = ka::firstAbove(out.l, 1e-4f);
            const long expected = long(std::lround(t * 48000.0)) + out.latency;
            CHECK_MSG(std::labs(onset - expected) <= 2, kt::fmt("block %g: onset %g expected %g", block, double(onset), double(expected)));
        }
    }
}

TEST(output_independent_of_block_size) {
    Program p = basicProgram();
    set(p, "t1.filter.cutoff", 70);
    set(p, "t1.filter.resonance", 60);
    set(p, "t1.filter.egInt", 40);
    set(p, "t1.feg.decay", 60);
    setChoice(p, "t1.lfo1.wave", "Triangle");
    set(p, "t1.osc1.ctrl2", 40);
    std::vector<TimedMidi> m { noteOn(0.003, 60, 100), noteOn(0.0711, 64, 90), noteOff(0.2, 60), cc(0.15, 1, 100), bend(0.12, 12000) };
    Rig ref(p, 48000.0, 1);
    const auto a = ref.run(m, 0.4);
    for (int block : { 7, 32, 256, 4096 }) {
        Rig r(p, 48000.0, block);
        const auto b = r.run(m, 0.4);
        double maxd = 0.0;
        for (size_t i = 0; i < a.l.size(); ++i) maxd = std::max(maxd, double(std::fabs(a.l[i] - b.l[i])));
        CHECK_MSG(maxd < 1e-5, kt::fmt("block %g: max diff %g", block, maxd));
    }
    Rig v(p, 48000.0, 512);
    v.rs.variableBlocks = true;
    const auto c = v.run(m, 0.4);
    double maxd = 0.0;
    for (size_t i = 0; i < a.l.size(); ++i) maxd = std::max(maxd, double(std::fabs(a.l[i] - c.l[i])));
    CHECK_MSG(maxd < 1e-5, kt::fmt("variable blocks: max diff %g", maxd));
}

TEST(compat_poly_four_voices_last_note_priority) {
    Program p = basicProgram();
    Rig r(p);
    std::vector<TimedMidi> m;
    for (int k = 0; k < 6; ++k) m.push_back(noteOn(0.01 * (k + 1), 60 + k, 100));
    r.run(m, 0.1);
    CHECK(activeCount(*r.e) == 4);
    // the newest four keys sound; the two oldest were stolen [DOC p.16 "last-pressed key will take priority"]
    CHECK(!noteSounding(*r.e, 60));
    CHECK(!noteSounding(*r.e, 61));
    for (int n = 62; n <= 65; ++n) CHECK(noteSounding(*r.e, n));
}

TEST(compat_layer_voice_splits_match_manual) {
    struct Case { const char* a1; const char* a2; int b1; int b2; };
    // owner's manual p.16 table: Mono+Poly = 1+3, Poly+Poly = 2+2, Unison+Mono = 2+1
    for (Case c : { Case{ "Mono", "Poly", 1, 3 }, Case{ "Poly", "Poly", 2, 2 }, Case{ "Unison", "Mono", 2, 1 } }) {
        Program p = basicProgram();
        setChoice(p, "prog.voiceMode", "Layer");
        setChoice(p, "t1.voice.assign", c.a1);
        setChoice(p, "t2.voice.assign", c.a2);
        Rig r(p);
        r.run({}, 0.01);
        CHECK_MSG(r.e->voiceBudget(0) == c.b1 && r.e->voiceBudget(1) == c.b2,
                  std::string(c.a1) + "+" + c.a2 + kt::fmt(" -> %g+%g", r.e->voiceBudget(0), r.e->voiceBudget(1)));
        CHECK(r.e->voiceBudget(0) + r.e->voiceBudget(1) <= 4);
    }
    // Poly+Poly layer: only two keys can be played [DOC p.16]
    Program p = basicProgram();
    setChoice(p, "prog.voiceMode", "Layer");
    Rig r(p);
    r.run({ noteOn(0.0, 60, 100), noteOn(0.01, 64, 100), noteOn(0.02, 67, 100) }, 0.05);
    CHECK(activeCount(*r.e, 0) == 2 && activeCount(*r.e, 1) == 2);
    CHECK(!noteSounding(*r.e, 60) && noteSounding(*r.e, 64) && noteSounding(*r.e, 67));
}

TEST(extended_mode_raises_polyphony) {
    Program p = basicProgram();
    setChoice(p, "global.voiceLimit", "Extended");
    Rig r(p);
    std::vector<TimedMidi> m;
    for (int k = 0; k < 10; ++k) m.push_back(noteOn(0.001 * k, 50 + k, 100));
    r.run(m, 0.05);
    CHECK(activeCount(*r.e) == 10);
}

TEST(unison_uses_all_voices_with_detune_spread) {
    Program p = basicProgram();
    setChoice(p, "t1.voice.assign", "Unison");
    set(p, "t1.voice.unisonDetune", 40);
    Rig r(p);
    const auto out = r.run({ noteOn(0.0, 57, 100) }, 1.0);
    CHECK(activeCount(*r.e) == 4);
    // detune produces beating: the envelope of the summed signal is not constant
    std::vector<float> a(out.l.begin() + 4800, out.l.end());
    const double f0 = ka::estimateF0(a.data(), a.size(), 48000.0);
    CHECK_NEAR(f0, 220.0, 1.0); // centre pitch unchanged (symmetric spread)
}

TEST(mono_last_note_priority_and_return) {
    Program p = basicProgram();
    setChoice(p, "t1.voice.assign", "Mono");
    Rig r(p);
    r.run({ noteOn(0.0, 60, 100), noteOn(0.05, 67, 100) }, 0.1);
    CHECK(activeCount(*r.e) == 1);
    CHECK(noteSounding(*r.e, 67));
    r.run({ noteOff(0.0, 67) }, 0.05); // back to the still-held key
    CHECK(noteSounding(*r.e, 60));
    r.run({ noteOff(0.0, 60) }, 0.05);
    CHECK(!noteSounding(*r.e, 60));
}

TEST(sustain_pedal_and_all_notes_off) {
    Program p = basicProgram();
    Rig r(p);
    r.run({ noteOn(0.0, 60, 100), cc(0.01, 64, 127), noteOff(0.02, 60) }, 0.05);
    CHECK(noteSounding(*r.e, 60));               // held by the pedal
    r.run({ cc(0.0, 64, 0) }, 0.05);
    CHECK(!noteSounding(*r.e, 60));              // released with the pedal
    r.run({ noteOn(0.0, 62, 100), noteOn(0.0, 65, 100) }, 0.02);
    CHECK(activeCount(*r.e) == 2);
    r.run({ cc(0.0, 123, 0) }, 0.02);            // All Note Off: release stage
    CHECK(!noteSounding(*r.e, 62) && !noteSounding(*r.e, 65));
    Program q = basicProgram();
    set(q, "t1.aeg.release", 120);               // long release
    Rig s(q);
    s.run({ noteOn(0.0, 60, 100) }, 0.05);
    const auto out = s.run({ cc(0.0, 120, 0) }, 0.05); // All Sound Off: silent within a few ms
    // (only the sub-audible tail of the 5 Hz output DC blocker may remain: check sample-to-sample change)
    double maxDiff = 0.0;
    for (size_t i = size_t(0.01 * 48000); i < out.l.size(); ++i) maxDiff = std::max(maxDiff, double(std::fabs(out.l[i] - out.l[i - 1])));
    CHECK_MSG(maxDiff < 1e-4, kt::fmt("residual change per sample %g", maxDiff));
}

TEST(sustain_can_be_disabled_for_compatibility) {
    Program p = basicProgram();
    setChoice(p, "global.damper", "Off");
    Rig r(p);
    r.run({ noteOn(0.0, 60, 100), cc(0.01, 64, 127), noteOff(0.02, 60) }, 0.05);
    CHECK(!noteSounding(*r.e, 60));
}

TEST(stolen_voice_has_no_click) {
    // Retrigger the same voice repeatedly with EG reset ON: steals hand the old
    // sound to a short fade, so the output never jumps by more than a saw edge.
    Program p = basicProgram();
    setChoice(p, "t1.aeg.reset", "On");
    setChoice(p, "t1.osc1.wave", "Sine");
    set(p, "t1.aeg.attack", 10);
    Rig r(p);
    std::vector<TimedMidi> m;
    for (int k = 0; k < 12; ++k) m.push_back(noteOn(0.02 * k + 0.01, 48 + (k * 5) % 24, 100));
    const auto out = r.run(m, 0.3);
    double maxStep = 0.0;
    for (size_t i = 1; i < out.l.size(); ++i) maxStep = std::max(maxStep, double(std::fabs(out.l[i] - out.l[i - 1])));
    CHECK_MSG(maxStep < 0.05, kt::fmt("max sample step %g", maxStep));
}

TEST(envelope_times_follow_mapping) {
    Program p = basicProgram();
    setChoice(p, "t1.osc1.wave", "Sine");
    set(p, "t1.aeg.attack", 64);
    set(p, "t1.aeg.decay", 0);
    set(p, "t1.aeg.sustain", 127);
    set(p, "t1.aeg.release", 64);
    const double att = mapping::egTimeSeconds(64), rel = mapping::egTimeSeconds(64);
    const auto out = renderNote(p, 69, 3.0, 48000.0, 0.0, 1.5);
    // attack: peak envelope reached at the attack time (measure 99 % of full level)
    const float full = ka::peakAbs(out.l, size_t(1.0 * 48000), size_t(1.4 * 48000));
    long t99 = -1;
    for (size_t i = 0; i + 200 < out.l.size(); i += 50)
        if (ka::peakAbs(out.l, i, i + 200) >= 0.99f * full) { t99 = long(i); break; }
    CHECK_MSG(std::fabs(double(t99) / 48000.0 - att) < 0.03, kt::fmt("attack %g s vs %g s", double(t99) / 48000.0, att));
    // release: -60 dB after the release time
    const size_t offIdx = size_t(1.5 * 48000) + size_t(out.latency);
    const size_t at = offIdx + size_t(rel * 48000.0);
    const float level = ka::peakAbs(out.l, at, at + 480);
    CHECK_MSG(ka::db(level / full) < -55.0 && ka::db(level / full) > -66.0, kt::fmt("release level %g dB", ka::db(level / full)));
}

TEST(pitch_tuning_bend_transpose) {
    Program p = basicProgram();
    setChoice(p, "t1.osc1.wave", "Sine");
    for (double fs : { 44100.0, 48000.0, 96000.0, 192000.0 }) {
        const auto out = renderNote(p, 69, 1.0, fs);
        const double f = ka::zeroCrossingFreq(out.l.data() + size_t(0.2 * fs), size_t(0.7 * fs), fs);
        CHECK_MSG(std::fabs(1200.0 * std::log2(f / 440.0)) < 0.2, kt::fmt("fs %g: A4 = %g Hz", fs, f));
    }
    set(p, "t1.pitch.transpose", 12);
    set(p, "t1.pitch.tune", -50);
    set(p, "global.masterTune", 442);
    {
        const auto out = renderNote(p, 69, 1.0);
        const double f = ka::zeroCrossingFreq(out.l.data() + 9600, 33600, 48000.0);
        const double expected = 442.0 * std::exp2((12.0 - 0.5) / 12.0);
        CHECK_NEAR(1200.0 * std::log2(f / expected), 0.0, 0.3);
    }
    Program b = basicProgram();
    setChoice(b, "t1.osc1.wave", "Sine");
    set(b, "t1.pitch.bendRange", 7);
    Rig r(b);
    const auto out = r.run({ noteOn(0.0, 60, 100), bend(0.0, 16383) }, 0.8);
    const double f = ka::zeroCrossingFreq(out.l.data() + 9600, 28000, 48000.0);
    const double expected = mapping::noteToHz(60.0 + 7.0 * (8191.0 / 8192.0), 440.0);
    CHECK_NEAR(1200.0 * std::log2(f / expected), 0.0, 0.5);
}

TEST(portamento_glides_and_first_note_rule) {
    Program p = basicProgram();
    setChoice(p, "t1.osc1.wave", "Sine");
    setChoice(p, "t1.voice.assign", "Mono");
    setChoice(p, "t1.voice.trigger", "Single");
    set(p, "t1.pitch.portamento", 70);
    Rig r(p);
    // first note: no glide with Single trigger [DOC p.17]
    const auto a = r.run({ noteOn(0.0, 48, 100) }, 0.3);
    const double f1 = ka::zeroCrossingFreq(a.l.data() + 2400, 9600, 48000.0);
    CHECK_NEAR(1200.0 * std::log2(f1 / mapping::noteToHz(48, 440)), 0.0, 2.0);
    // legato to an octave above: pitch glides (starts low, ends at target)
    const auto b = r.run({ noteOn(0.0, 60, 100) }, 2.0);
    const double early = ka::zeroCrossingFreq(b.l.data() + 480, 2400, 48000.0);
    const double late = ka::zeroCrossingFreq(b.l.data() + 72000, 19200, 48000.0);
    CHECK(early < mapping::noteToHz(56, 440));
    CHECK_NEAR(1200.0 * std::log2(late / mapping::noteToHz(60, 440)), 0.0, 3.0);
}

TEST(mod_wheel_vibrato_depth) {
    Program p = basicProgram();
    setChoice(p, "t1.osc1.wave", "Sine");
    set(p, "t1.pitch.vibratoInt", 20);
    set(p, "t1.lfo2.freq", 64);
    Rig r(p);
    const auto off = r.run({ noteOn(0.0, 69, 100) }, 0.5);
    // without the MOD wheel no vibrato
    const double fA = ka::zeroCrossingFreq(off.l.data() + 4800, 4800, 48000.0);
    const double fB = ka::zeroCrossingFreq(off.l.data() + 14400, 4800, 48000.0);
    CHECK_NEAR(fA, fB, 0.5);
    const auto on = r.run({ cc(0.0, 1, 127) }, 2.0);
    double fmin = 1e9, fmax = 0.0;
    for (size_t i = 9600; i + 2400 < on.l.size(); i += 1200) {
        const double f = ka::zeroCrossingFreq(on.l.data() + i, 2400, 48000.0);
        fmin = std::min(fmin, f);
        fmax = std::max(fmax, f);
    }
    const double depthCents = 600.0 * std::log2(fmax / fmin);
    const double expected = mapping::pitchModCents(20.0);
    CHECK_MSG(depthCents > 0.5 * expected && depthCents < 1.3 * expected, kt::fmt("vibrato +-%g cents, expected ~+-%g", depthCents, expected));
}

TEST(velocity_patch_to_amp) {
    Program p = basicProgram();
    setChoice(p, "t1.patch1.src", "Velocity");
    setChoice(p, "t1.patch1.dst", "Amp");
    set(p, "t1.patch1.int", 63);
    set(p, "t1.amp.level", 0);
    const auto soft = renderNote(p, 60, 0.3, 48000.0, 0.0, 1e9, 20);
    const auto hard = renderNote(p, 60, 0.3, 48000.0, 0.0, 1e9, 127);
    CHECK(ka::peakAbs(hard.l) > 4.0f * ka::peakAbs(soft.l));
}

TEST(hardware_cc_map_and_nrpn) {
    Program p = basicProgram();
    Rig r(p);
    // CC#74 cutoff, CC#71 resonance, CC#19 OSC2 tune (bipolar), CC#18 semitone (p.57 table), CC#83 filter type
    r.run({ cc(0.0, 74, 33), cc(0.0, 71, 90), cc(0.0, 19, 1), cc(0.0, 18, 126), cc(0.0, 83, 70), cc(0.0, 77, 80) }, 0.01);
    CHECK_NEAR(r.e->param(pT(0, Cutoff)), 33, 1e-6);
    CHECK_NEAR(r.e->param(pT(0, Resonance)), 90, 1e-6);
    CHECK_NEAR(r.e->param(pT(0, Osc2Tune)), -63, 1e-6);
    CHECK_NEAR(r.e->param(pT(0, Osc2Semitone)), 24, 1e-6);
    CHECK_NEAR(r.e->param(pT(0, FilterType)), 2, 1e-6); // 64..95 = -12dB BPF
    CHECK_NEAR(r.e->param(pT(0, Osc1Wave)), 5, 1e-6);   // 80..95 = DWGS
    // CC#15 with OSC1 = DWGS selects the wave (p.57: 0,1 -> 1 ... 126,127 -> 64)
    r.run({ cc(0.0, 15, 71) }, 0.01);
    CHECK_NEAR(r.e->param(pT(0, Osc1Dwgs)), 36, 1e-6);
    // NRPN: patch 2 source = LFO2 (0x30..0x3F), destination = PAN (0x60..0x6F); arp type Alt2
    r.run({ cc(0.0, 99, 4), cc(0.0, 98, 1), cc(0.0, 6, 0x35), cc(0.0, 98, 9), cc(0.0, 6, 0x62), cc(0.0, 99, 0), cc(0.0, 98, 7), cc(0.0, 6, 0x45) }, 0.01);
    CHECK_NEAR(r.e->param(pT(0, P2Src)), 3, 1e-6);
    CHECK_NEAR(r.e->param(pT(0, P2Dst)), 6, 1e-6);
    CHECK_NEAR(r.e->param(pG(ArpType)), 3, 1e-6);
    // the changes are queued for the host-parameter sync
    int idx; float v; int count = 0;
    while (r.e->popControllerChange(idx, v)) ++count;
    CHECK(count == 10);
    // timbre select (CC#95 = 127 -> timbre 2) in Layer
    Program l = basicProgram();
    setChoice(l, "prog.voiceMode", "Layer");
    Rig rl(l);
    rl.run({ cc(0.0, 95, 127), cc(0.0, 74, 10) }, 0.01);
    CHECK_NEAR(rl.e->param(pT(1, Cutoff)), 10, 1e-6);
    CHECK_NEAR(rl.e->param(pT(0, Cutoff)), 127, 1e-6);
    // disabled map: ignored
    Program o = basicProgram();
    setChoice(o, "global.ccMap", "Off");
    Rig ro(o);
    ro.run({ cc(0.0, 74, 10) }, 0.01);
    CHECK_NEAR(ro.e->param(pT(0, Cutoff)), 127, 1e-6);
}
