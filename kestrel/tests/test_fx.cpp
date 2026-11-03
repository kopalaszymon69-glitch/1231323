// Effects (MOD FX, DELAY, EQ), vocoder, latency, external input routing.
#include "TestHelpers.h"
#include "fx/Effects.h"
#include "params/Mapping.h"
#include "vocoder/Vocoder.h"

using namespace kh;

TEST(delay_time_sync_and_bypass) {
    DelayFx d;
    d.prepare(48000.0);
    std::vector<float> l(48000, 0.0f), r(48000, 0.0f);
    l[0] = r[0] = 1.0f;
    d.process(l.data(), r.data(), 48000, 0, 0.25, 64.0f);
    // first echo exactly 250 ms later
    const long e1 = ka::firstAbove(l, 0.05f, 10);
    CHECK_NEAR(double(e1), 12000.0, 2.0);
    // depth 0 = bypass (bit-identical) [DOC p.39]
    DelayFx b;
    b.prepare(48000.0);
    std::vector<float> x(4800), y(4800);
    for (size_t i = 0; i < x.size(); ++i) x[i] = y[i] = float(std::sin(i * 0.01));
    std::vector<float> x0 = x;
    b.process(x.data(), y.data(), 4800, 1, 0.1, 0.0f);
    CHECK(x == x0);
    // sync note 1/8 at 120 BPM = 250 ms (owner's manual p.65 example 2)
    CHECK_NEAR(mapping::delaySyncNoteBeats(5) * 60.0 / 120.0, 0.25, 1e-12);
}

TEST(delay_cross_and_lr_routing) {
    for (int type : { 1, 2 }) {
        DelayFx d;
        d.prepare(48000.0);
        std::vector<float> l(48000, 0.0f), r(48000, 0.0f);
        l[0] = 1.0f; // left impulse only
        d.process(l.data(), r.data(), 48000, type, 0.1, 100.0f);
        const float rFirst = ka::peakAbs(r, 4790, 4810), rSecond = ka::peakAbs(r, 9590, 9610);
        if (type == 1) CHECK(rFirst < 1e-4f && rSecond > 0.1f);  // Cross: feedback swaps channels
        else CHECK(rFirst < 1e-4f && rSecond > 0.1f);            // L/R: alternates L, R, L ...
        CHECK(ka::peakAbs(l, 4790, 4810) > 0.1f);
    }
}

TEST(delay_extreme_feedback_bounded) {
    DelayFx d;
    d.prepare(48000.0);
    std::vector<float> l(480000), r(480000);
    Rng g(3);
    for (size_t i = 0; i < l.size(); ++i) l[i] = r[i] = g.bipolar();
    d.process(l.data(), r.data(), int(l.size()), 1, 0.001, 127.0f);
    float pk = 0.0f;
    for (float v : l) { CHECK(isFiniteF(v)); pk = std::max(pk, std::fabs(v)); }
    CHECK_MSG(pk < 40.0f, kt::fmt("peak %g", pk));
}

TEST(eq_shelves_and_flat_at_zero) {
    Eq2 q;
    q.prepare(48000.0);
    q.setParams(100.0, 12.0, 8000.0, -12.0);
    auto gain = [&](double hz) {
        q.reset();
        std::vector<float> l(24000), r(24000);
        for (size_t i = 0; i < l.size(); ++i) l[i] = r[i] = float(std::sin(2 * ka::kPi * hz * i / 48000.0));
        q.process(l.data(), r.data(), 24000);
        return ka::db(ka::rms(l.data() + 12000, 12000) * std::sqrt(2.0));
    };
    CHECK_NEAR(gain(30.0), 12.0, 1.0);
    CHECK_NEAR(gain(1000.0), 0.0, 1.0);
    CHECK_NEAR(gain(18000.0), -12.0, 1.5);
    q.setParams(100.0, 0.0, 8000.0, 0.0);
    CHECK_NEAR(gain(5000.0), 0.0, 1e-3);
}

TEST(modfx_types_bypass_and_stability) {
    for (int type = 0; type < 3; ++type) {
        ModFx m;
        m.prepare(48000.0);
        std::vector<float> l(96000), r(96000);
        Rng g(9);
        for (size_t i = 0; i < l.size(); ++i) l[i] = r[i] = 0.5f * g.bipolar();
        auto l0 = l;
        m.process(l.data(), r.data(), 96000, type, 64.0f, 0.0f);
        CHECK(l == l0); // depth 0 = no effect
        m.process(l.data(), r.data(), 96000, type, 127.0f, 127.0f);
        float pk = 0.0f;
        for (float v : l) pk = std::max(pk, std::fabs(v));
        CHECK_MSG(isFiniteF(pk) && pk < 10.0f, kt::fmt("type %g peak %g", type, pk));
        CHECK(l != l0);
    }
}

TEST(vocoder_band_follows_modulator_frequency) {
    Vocoder v;
    v.prepare(48000.0);
    VocoderParams p;
    p.efSense = 20;
    std::vector<float> car(48000), mod(48000), l(48000), r(48000);
    Rng g(5);
    for (size_t i = 0; i < car.size(); ++i) {
        car[i] = 0.3f * g.bipolar();
        mod[i] = float(0.3 * std::sin(2 * ka::kPi * 1150.0 * i / 48000.0)); // band 10 of table 6-1
    }
    v.process(car.data(), mod.data(), l.data(), r.data(), 48000, p, 0.0f, true);
    const auto env = v.envelopes();
    int best = 0;
    for (int b = 1; b < 16; ++b) if (env[size_t(b)] > env[size_t(best)]) best = b;
    CHECK_MSG(best == 9, kt::fmt("strongest band %g (expected index 9 = 1150 Hz)", best));
    CHECK(ka::rms(l.data() + 24000, 24000) > 1e-3);
    // HOLD freezes the analysed character
    p.efSense = 127;
    std::fill(mod.begin(), mod.end(), 0.0f);
    v.process(car.data(), mod.data(), l.data(), r.data(), 48000, p, 0.0f, true);
    CHECK(v.holdValid());
    CHECK(ka::rms(l.data() + 24000, 24000) > 1e-3); // still sounds with silent modulator
}

TEST(vocoder_formant_shift_moves_synthesis_bands) {
    // narrow-band carrier at 1150 Hz; analysis band 10 active. Shift +2 moves synthesis
    // band 10 to 1680 Hz, so the 1150 Hz carrier output drops.
    auto runShift = [](int choice) {
        Vocoder v;
        v.prepare(48000.0);
        VocoderParams p;
        p.efSense = 20;
        p.formantShiftChoice = choice;
        std::vector<float> car(48000), mod(48000), l(48000), r(48000);
        for (size_t i = 0; i < car.size(); ++i) {
            car[i] = float(0.3 * std::sin(2 * ka::kPi * 1150.0 * i / 48000.0));
            mod[i] = float(0.3 * std::sin(2 * ka::kPi * 1150.0 * i / 48000.0));
        }
        v.process(car.data(), mod.data(), l.data(), r.data(), 48000, p, 0.0f, true);
        return ka::rms(l.data() + 24000, 24000);
    };
    CHECK(runShift(0) > 3.0 * runShift(2));
}

TEST(vocoder_program_end_to_end) {
    Program p = basicProgram();
    setChoice(p, "prog.voiceMode", "Vocoder");
    set(p, "voc.amp.directLevel", 0);
    set(p, "voc.filter.efSense", 4); // fast follower so the gated modulator is tracked closely
    std::vector<float> in1(48000);
    for (size_t i = 0; i < in1.size(); ++i) in1[i] = float(0.3 * std::sin(2 * ka::kPi * 630 * i / 48000.0) * (i % 9600 < 4800 ? 1.0 : 0.0));
    Rig r(p);
    r.rs.in1 = &in1;
    const auto out = r.run({ noteOn(0.0, 48, 100) }, 1.0);
    // output follows the gated modulator
    const double on = ka::rms(out.l.data() + 2400, 2000), off = ka::rms(out.l.data() + 7400, 2000);
    CHECK_MSG(on > 10.0 * off, kt::fmt("on %g off %g", on, off));
    // without a carrier note: silence (internal carrier only)
    Rig s(p);
    s.rs.in1 = &in1;
    const auto quiet = s.run({}, 0.5);
    CHECK(ka::peakAbs(quiet.l) < 1e-4f);
}

TEST(latency_reported_matches_alignment) {
    Program p = basicProgram();
    for (int q : { 1, 2, 3 }) {
        set(p, "global.quality", float(q));
        Rig r(p);
        const auto out = r.run({ noteOn(0.01, 69, 127) }, 0.05);
        const long onset = ka::firstAbove(out.l, 1e-4f);
        const long expected = 480 + r.e->latencySamples();
        CHECK_MSG(std::labs(onset - expected) <= 2, kt::fmt("quality %g: onset %g expected %g", q, double(onset), double(expected)));
    }
}

TEST(audio_in_thru_is_latency_aligned) {
    Program p = basicProgram();
    setChoice(p, "global.audioInThru", "On");
    std::vector<float> in1(9600, 0.0f), in2(9600, 0.0f);
    in1[1000] = 1.0f;
    Rig r(p);
    r.rs.in1 = &in1;
    r.rs.in2 = &in2;
    const auto out = r.run({}, 0.2);
    CHECK(ka::firstAbove(out.l, 0.5f) == 1000 + r.e->latencySamples());
}
