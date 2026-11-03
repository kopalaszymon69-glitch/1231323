#pragma once

#include <array>
#include <string>
#include <vector>

#include "params/Params.h"

namespace kestrel {

// A complete program (both timbres, routing, effects, arpeggiator, vocoder) plus
// metadata. Stored as a human-readable text file:
//
//   format=kestrel-program 1
//   name=Velvet Sub
//   category=Bass
//   t1.osc1.wave=Saw          <- choice parameters may be written by name
//   t1.filter.cutoff=64
//   voc.hold=0.1,0.2,...       <- optional formant-hold levels (16 values)
//
// Missing parameters take their defaults; unknown keys are reported as warnings
// (so files written by newer versions still load).
struct Program {
    std::string name = "Init Program";
    std::string category;
    std::string author;
    std::string description;
    std::array<float, kNumParams> values {};
    bool hasHold = false;
    std::array<float, 16> hold {};

    Program();
};

std::string serializeProgram(const Program& p, bool includeGlobals = false);
bool parseProgram(const std::string& text, Program& out, std::string& error, std::vector<std::string>* warnings = nullptr);

// Parameters that belong to the instrument (GLOBAL section), not the program.
bool isGlobalSetting(int paramIndex);

} // namespace kestrel
