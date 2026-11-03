// Arpeggiator patterns, timing, gate, swing, latch, steps, trigger, host sync.
#include "TestHelpers.h"
#include "arp/Arpeggiator.h"

using namespace kh;

namespace {
struct Ev { double t; bool on; int note; };

std::vector<Ev> runArp(Arpeggiator& a, const ArpParams& p, ArpClock c, double seconds, double fs = 48000.0) {
    std::vector<Ev> evs;
    const int total = int(seconds * fs);
    int pos = 0;
    ArpEvent buf[32];
    while (pos < total) {
        if (c.useHost) c.hostPpq = double(pos) / fs * c.hostBpm / 60.0;
        int until = a.samplesUntilNextEvent(p, c);
        if (until == 0) {
            const int n = a.fire(p, c, buf, 32);
            for (int k = 0; k < n; ++k) evs.push_back({ double(pos) / fs, buf[k].on, buf[k].note });
            until = a.samplesUntilNextEvent(p, c);
            if (until == 0) until = 1;
        }
        const int step = std::min(until, total - pos);
        a.advance(step, p, c);
        pos += step;
    }
    return evs;
}
std::vector<int> onNotes(const std::vector<Ev>& e) {
    std::vector<int> r;
    for (auto& x : e) if (x.on) r.push_back(x.note);
    return r;
}
} // namespace

TEST(arp_up_down_alt_sequences) {
    struct C { int type; std::vector<int> expect; };
    const std::vector<C> cases = {
        { 0, { 60, 64, 67, 72, 76, 79, 60, 64 } },   // Up, range 2
        { 1, { 79, 76, 72, 67, 64, 60, 79, 76 } },   // Down
        { 2, { 60, 64, 67, 72, 76, 79, 76, 72, 67, 64, 60, 64 } }, // Alt1: ends once
        { 3, { 60, 64, 67, 72, 76, 79, 79, 76, 72, 67, 64, 60, 60 } }, // Alt2: ends twice
    };
    for (const auto& c : cases) {
        Arpeggiator a;
        a.prepare(48000.0);
        ArpParams p;
        p.on = true; p.type = c.type; p.range = 2; p.resolution = 1; p.keySync = true; p.tempo = 120.0;
        a.keyOn(60, 100); a.keyOn(67, 100); a.keyOn(64, 100);
        const auto ev = runArp(a, p, ArpClock {}, 0.125 * double(c.expect.size()) + 0.01);
        const auto on = onNotes(ev);
        bool ok = on.size() >= c.expect.size();
        for (size_t i = 0; ok && i < c.expect.size(); ++i) ok = on[i] == c.expect[i];
        CHECK_MSG(ok, kt::fmt("type %g", c.type));
    }
}

TEST(arp_timing_resolution_and_gate) {
    Arpeggiator a;
    a.prepare(48000.0);
    ArpParams p;
    p.on = true; p.tempo = 120.0; p.resolution = 1; /* 1/16 = 125 ms at 120 BPM */ p.gate = 50.0f; p.keySync = true;
    a.keyOn(60, 100);
    const auto ev = runArp(a, p, ArpClock {}, 1.0);
    std::vector<double> ons, offs;
    for (auto& e : ev) (e.on ? ons : offs).push_back(e.t);
    CHECK(ons.size() == 8);
    for (size_t i = 0; i < ons.size(); ++i) CHECK_NEAR(ons[i], 0.125 * double(i), 1.0 / 48000.0 + 1e-9);
    for (size_t i = 0; i < std::min(ons.size(), offs.size()); ++i) CHECK_NEAR(offs[i] - ons[i], 0.0625, 2.0 / 48000.0);
    // resolutions [DOC p.44]: 1/24 .. 1/4 at 120 BPM
    const double expect[6] = { 1.0 / 12.0, 0.125, 1.0 / 6.0, 0.25, 1.0 / 3.0, 0.5 };
    for (int r = 0; r < 6; ++r) {
        Arpeggiator b;
        b.prepare(48000.0);
        p.resolution = r;
        b.keyOn(60, 100);
        const auto e2 = runArp(b, p, ArpClock {}, 1.1);
        std::vector<double> o;
        for (auto& e : e2) if (e.on) o.push_back(e.t);
        CHECK(o.size() >= 2);
        if (o.size() >= 2) CHECK_NEAR(o[1] - o[0], expect[r], 1.0 / 48000.0 + 1e-9);
    }
}

TEST(arp_swing_shifts_even_steps) {
    Arpeggiator a;
    a.prepare(48000.0);
    ArpParams p;
    p.on = true; p.tempo = 120.0; p.resolution = 3; /* 1/8 = 250 ms */ p.swing = 50.0f; p.keySync = true;
    a.keyOn(60, 100);
    const auto ev = runArp(a, p, ArpClock {}, 1.0);
    std::vector<double> o;
    for (auto& e : ev) if (e.on) o.push_back(e.t);
    CHECK(o.size() >= 4);
    CHECK_NEAR(o[0], 0.0, 1e-4);
    CHECK_NEAR(o[1], 0.25 + 0.0625, 1e-4); // 2nd note late by 50 % of half a step [ENG reading of fig 20-1]
    CHECK_NEAR(o[2], 0.5, 1e-4);
}

TEST(arp_steps_last_step_and_latch) {
    Arpeggiator a;
    a.prepare(48000.0);
    ArpParams p;
    p.on = true; p.tempo = 120.0; p.resolution = 1; p.keySync = true; p.lastStep = 3;
    p.steps = { true, false, true, true, true, true, true, true };
    a.keyOn(60, 100);
    const auto ev = runArp(a, p, ArpClock {}, 0.125 * 6 - 0.01);
    std::vector<double> o;
    for (auto& e : ev) if (e.on) o.push_back(e.t);
    // steps 1,_,3 | 1,_,3
    CHECK(o.size() == 4);
    if (o.size() == 4) { CHECK_NEAR(o[1], 0.25, 1e-4); CHECK_NEAR(o[2], 0.375, 1e-4); }
    // latch: keeps playing after release; a new key after release replaces the set
    Arpeggiator l;
    l.prepare(48000.0);
    ArpParams q;
    q.on = true; q.latch = true; q.tempo = 120.0; q.resolution = 1; q.keySync = true;
    l.keyOn(60, 100);
    l.keyOn(64, 100);
    runArp(l, q, ArpClock {}, 0.2);
    l.keyOff(60);
    l.keyOff(64);
    auto e1 = runArp(l, q, ArpClock {}, 0.5);
    CHECK(onNotes(e1).size() >= 3);
    l.keyOn(70, 100);
    auto e2 = runArp(l, q, ArpClock {}, 0.5);
    bool only70 = true;
    for (int n : onNotes(e2)) only70 &= n == 70;
    CHECK(only70);
}

TEST(arp_trigger_plays_lowest_notes_up_to_polyphony) {
    Arpeggiator a;
    a.prepare(48000.0);
    ArpParams p;
    p.on = true; p.type = 5; p.tempo = 120.0; p.resolution = 1; p.keySync = true; p.triggerPolyphony = 2;
    for (int n : { 72, 60, 64, 67 }) a.keyOn(n, 100);
    const auto ev = runArp(a, p, ArpClock {}, 0.01);
    const auto on = onNotes(ev);
    CHECK(on.size() == 2 && on[0] == 60 && on[1] == 64); // [DOC p.44]
}

TEST(arp_host_sync_aligns_to_grid) {
    Arpeggiator a;
    a.prepare(48000.0);
    ArpParams p;
    p.on = true; p.resolution = 3; p.keySync = false; p.tempo = 90.0;
    ArpClock c;
    c.useHost = true; c.hostBpm = 100.0; c.hostPlaying = true;
    a.keyOn(60, 100);
    const auto ev = runArp(a, p, c, 2.0);
    for (auto& e : ev) {
        if (!e.on) continue;
        const double beats = e.t * 100.0 / 60.0;
        CHECK_NEAR(std::fmod(beats + 1e-9, 0.5), 0.0, 1e-3); // eighth-note grid of the host tempo
    }
}

TEST(arp_drives_engine_and_stops_on_release) {
    Program p = basicProgram();
    setChoice(p, "arp.on", "On");
    set(p, "arp.tempo", 120);
    setChoice(p, "arp.keySync", "On");
    set(p, "arp.gate", 50);
    Rig r(p);
    const auto out = r.run({ noteOn(0.0, 60, 100), noteOn(0.0, 64, 100), noteOff(0.6, 60), noteOff(0.6, 64) }, 1.0);
    // notes at 0, 125 ms, 250 ms ... and silence after release (release time ~1 ms)
    CHECK(ka::peakAbs(out.l, size_t(0.01 * 48000), size_t(0.05 * 48000)) > 0.05f);
    CHECK(ka::peakAbs(out.l, size_t(0.08 * 48000), size_t(0.12 * 48000)) < 1e-3f); // gate 50 % gap
    CHECK(ka::peakAbs(out.l, size_t(0.7 * 48000)) < 1e-3f);
}

TEST(arp_notes_do_not_retrigger_timbre_lfo_sync) {
    // LFO1 (KEY SYNC = Timbre, slow saw) -> Pitch. With the arpeggiator running, the LFO keeps
    // its phase across arpeggiated notes; only the first played key resets it [DOC p.29, p.53].
    Program p = basicProgram();
    setChoice(p, "t1.osc1.wave", "Sine");
    setChoice(p, "t1.lfo1.wave", "Saw");
    setChoice(p, "t1.lfo1.keySync", "Timbre");
    set(p, "t1.lfo1.freq", 30);
    setChoice(p, "t1.patch1.src", "LFO1");
    setChoice(p, "t1.patch1.dst", "Pitch");
    set(p, "t1.patch1.int", 30);
    setChoice(p, "arp.on", "On");
    set(p, "arp.gate", 50);
    setChoice(p, "arp.keySync", "On");
    Rig r(p);
    const auto out = r.run({ noteOn(0.0, 69, 100) }, 1.2);
    // pitch at the start of note 1 and note 5 must differ (the saw LFO moved on)
    auto f = [&](double t) { return ka::zeroCrossingFreq(out.l.data() + size_t(t * 48000) + 240, 2400, 48000.0); };
    const double a = f(0.0), b = f(0.5);
    CHECK_MSG(std::fabs(1200.0 * std::log2(b / a)) > 20.0, kt::fmt("note1 %g Hz, note5 %g Hz", a, b));
}
