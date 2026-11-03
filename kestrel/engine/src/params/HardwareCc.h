#pragma once

#include <cstdint>

#include "params/Params.h"

namespace kestrel {

// The reference hardware's default MIDI control map (owner's manual p.56-57, MIDI
// implementation *3 / NRPN tables). Converts received CC / NRPN values to plain
// parameter values exactly as documented for reception.
struct CcTarget {
    int param = -1;
    float value = 0.0f;
};

class HardwareCcMap {
public:
    // Control change. timbreSelect: 0 = timbre 1, 1 = both, 2 = timbre 2 (CC#95).
    // Writes up to 2 targets (both timbres) and returns how many.
    static int controlChange(int cc, int value, ProgMode mode, int timbreSelect, const float* current, CcTarget out[2]) noexcept;
    // NRPN (MSB, LSB) with data entry MSB. Returns the number of targets written (0..2).
    static int nrpn(int msb, int lsb, int value, ProgMode mode, int timbreSelect, const float* current, CcTarget out[2]) noexcept;
    // Semitone table (owner's manual p.57): CC value -> -24..+24
    static int semitoneFromCc(int v) noexcept;
};

} // namespace kestrel
