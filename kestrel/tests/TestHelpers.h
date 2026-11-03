#pragma once

#include <memory>
#include <string>

#include "Analysis.h"
#include "Engine.h"
#include "TestFramework.h"
#include "common/RenderHarness.h"
#include "io/ProgramIO.h"

namespace kh {

using namespace kestrel;
using namespace kestrel::tools;

inline void set(Program& p, const char* id, float v) {
    const int i = findParam(id);
    if (i < 0) { std::printf("  (unknown param %s)\n", id); kt::failures()++; return; }
    p.values[size_t(i)] = v;
}
inline void setChoice(Program& p, const char* id, const char* choice) {
    const int i = findParam(id);
    const ParamInfo& info = paramInfo(i);
    for (int c = 0; c < info.numChoices; ++c)
        if (std::string(info.choices[c]) == choice) { p.values[size_t(i)] = float(c); return; }
    std::printf("  (unknown choice %s for %s)\n", choice, id);
    kt::failures()++;
}

// Plain test program: one saw, open filter, instant amp envelope, no effects.
inline Program basicProgram() {
    Program p;
    set(p, "t1.aeg.attack", 0);
    set(p, "t1.aeg.decay", 0);
    set(p, "t1.aeg.sustain", 127);
    set(p, "t1.aeg.release", 0);
    set(p, "t1.filter.cutoff", 127);
    return p;
}

struct Rig {
    std::unique_ptr<Engine> e = std::make_unique<Engine>();
    RenderSettings rs;
    explicit Rig(const Program& p, double fs = 48000.0, int block = 256) {
        rs.sampleRate = fs;
        rs.blockSize = block;
        applyProgram(*e, p);
        e->prepare(fs, block);
        applyProgram(*e, p);
    }
    Rendered run(const std::vector<TimedMidi>& m, double seconds) {
        rs.seconds = seconds;
        return render(*e, m, rs);
    }
};

inline Rendered renderNote(const Program& p, int note, double seconds, double fs = 48000.0, double onAt = 0.0,
                           double offAt = 1e9, int vel = 100, int block = 256) {
    Rig r(p, fs, block);
    std::vector<TimedMidi> m { noteOn(onAt, note, vel) };
    if (offAt < seconds) m.push_back(noteOff(offAt, note));
    return r.run(m, seconds);
}

} // namespace kh
