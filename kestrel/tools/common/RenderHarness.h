#pragma once

// Offline rendering harness shared by kestrel_render and the tests: drives the
// engine with a list of timed MIDI events at a given sample rate / block size.
#include <algorithm>
#include <string>
#include <vector>

#include "Engine.h"
#include "io/ProgramIO.h"

namespace kestrel::tools {

struct TimedMidi {
    double time = 0.0; // seconds
    uint8_t b0 = 0, b1 = 0, b2 = 0;
};

inline TimedMidi noteOn(double t, int note, int vel, int ch = 0) { return { t, uint8_t(0x90 | ch), uint8_t(note), uint8_t(vel) }; }
inline TimedMidi noteOff(double t, int note, int ch = 0) { return { t, uint8_t(0x80 | ch), uint8_t(note), 0 }; }
inline TimedMidi cc(double t, int num, int val, int ch = 0) { return { t, uint8_t(0xB0 | ch), uint8_t(num), uint8_t(val) }; }
inline TimedMidi bend(double t, int value14, int ch = 0) { return { t, uint8_t(0xE0 | ch), uint8_t(value14 & 0x7F), uint8_t((value14 >> 7) & 0x7F) }; }

struct RenderSettings {
    double sampleRate = 48000.0;
    int blockSize = 256;
    double seconds = 2.0;
    bool variableBlocks = false;      // pseudo-random block sizes (host buffer-size robustness)
    TransportInfo transport;          // static transport (ppq advanced automatically when playing)
    const std::vector<float>* in1 = nullptr;
    const std::vector<float>* in2 = nullptr;
    // Optional per-block parameter automation callback
    void (*automation)(Engine&, double timeSeconds, void* user) = nullptr;
    void* automationUser = nullptr;
};

struct Rendered {
    std::vector<float> l, r;
    double sampleRate = 48000.0;
    int latency = 0;
};

inline void applyProgram(Engine& e, const Program& p) {
    e.setAllParamsImmediate(p.values.data());
    if (p.hasHold) e.setVocoderHoldLevels(p.hold);
}

inline Rendered render(Engine& e, std::vector<TimedMidi> midi, const RenderSettings& s) {
    std::stable_sort(midi.begin(), midi.end(), [](const TimedMidi& a, const TimedMidi& b) { return a.time < b.time; });
    const size_t total = size_t(s.seconds * s.sampleRate);
    Rendered out;
    out.sampleRate = s.sampleRate;
    out.l.assign(total, 0.0f);
    out.r.assign(total, 0.0f);
    std::vector<MidiEvent> ev;
    ev.reserve(midi.size());
    size_t mi = 0, pos = 0;
    uint32_t rng = 12345u;
    TransportInfo tr = s.transport;
    while (pos < total) {
        int bs = s.blockSize;
        if (s.variableBlocks) {
            rng = rng * 1664525u + 1013904223u;
            bs = 1 + int((rng >> 8) % uint32_t(s.blockSize));
        }
        bs = int(std::min<size_t>(size_t(bs), total - pos));
        if (s.automation) s.automation(e, double(pos) / s.sampleRate, s.automationUser);
        ev.clear();
        while (mi < midi.size()) {
            const size_t at = size_t(midi[mi].time * s.sampleRate + 0.5);
            if (at >= pos + size_t(bs)) break;
            MidiEvent m;
            m.offset = int(at > pos ? at - pos : 0);
            m.data[0] = midi[mi].b0; m.data[1] = midi[mi].b1; m.data[2] = midi[mi].b2;
            m.size = 3;
            ev.push_back(m);
            ++mi;
        }
        const float* i1 = s.in1 ? s.in1->data() + std::min(pos, s.in1->size() ? s.in1->size() - 1 : 0) : nullptr;
        const float* i2 = s.in2 ? s.in2->data() + std::min(pos, s.in2->size() ? s.in2->size() - 1 : 0) : nullptr;
        if (s.in1 && pos + size_t(bs) > s.in1->size()) i1 = nullptr;
        if (s.in2 && pos + size_t(bs) > s.in2->size()) i2 = nullptr;
        e.process(out.l.data() + pos, out.r.data() + pos, i1, i2, bs, ev.data(), int(ev.size()), tr);
        if (tr.playing) tr.ppq += double(bs) / s.sampleRate * tr.bpm / 60.0;
        pos += size_t(bs);
    }
    out.latency = e.latencySamples();
    return out;
}

} // namespace kestrel::tools
