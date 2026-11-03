#pragma once

#include <array>
#include <cstdint>

#include "core/DspMath.h"

namespace kestrel {

// Step arpeggiator (owner's manual p.43-45, MIDI imp. TABLE 1 bytes 14/15/30-36).
// [DOC] types Up/Down/Alt1/Alt2/Random/Trigger, range 1-4 oct, gate 0-100 %,
//       resolution, swing on even steps, latch, key sync, last step + on/off steps,
//       tempo 20-300, Trigger plays the lowest held notes up to the polyphony.
// [ENG] behaviour of muted steps (the note sequence still advances), swing scaling
//       (fig 20-1: +-100 % = half a step), velocity (= the held key's velocity).
struct ArpParams {
    bool on = false;
    double tempo = 120.0;
    int resolution = 1;  // index into 1/24,1/16,1/12,1/8,1/6,1/4
    float gate = 75.0f;  // %
    int type = 0;        // Up, Down, Alt1, Alt2, Random, Trigger
    int range = 1;       // octaves
    bool latch = false;
    float swing = 0.0f;  // -100..100
    bool keySync = false;
    int lastStep = 8;
    std::array<bool, 8> steps { true, true, true, true, true, true, true, true };
    int triggerPolyphony = 4;
};

struct ArpClock {
    bool useHost = false;     // host transport position drives the grid
    double hostBpm = 120.0;
    double hostPpq = 0.0;     // quarter-note position at the start of the current segment
    bool hostPlaying = false;
};

struct ArpEvent {
    bool on = false;
    uint8_t note = 60, velocity = 100;
};

class Arpeggiator {
public:
    void prepare(double fs) { fs_ = fs; reset(); }
    void reset() noexcept;

    // Keyboard input (after the global settings).
    void keyOn(int note, int velocity) noexcept;
    void keyOff(int note) noexcept;
    void allKeysOff() noexcept;

    // Samples until the next arpeggiator event (or a large number if idle).
    // Must be called at the start of every render segment with the current params/clock.
    int samplesUntilNextEvent(const ArpParams& p, const ArpClock& c) noexcept;
    // Advances time by n samples (no event may fall strictly inside, see above).
    void advance(int n, const ArpParams& p, const ArpClock& c) noexcept;
    // Emits all events due now. Returns the number written (<= max).
    int fire(const ArpParams& p, const ArpClock& c, ArpEvent* out, int max) noexcept;
    // Stops: returns note-offs for sounding arpeggio notes.
    int stop(ArpEvent* out, int max) noexcept;

    bool isRunning() const noexcept { return running_; }
    bool anyNoteSounding() const noexcept { return numSounding_ > 0; }
    int currentStep() const noexcept { return stepCounter_; }
    // held / latched input notes (sorted ascending)
    int numInputNotes() const noexcept { return numNotes_; }

private:
    double stepBeats(const ArpParams& p) const noexcept;
    double beatsPerSample(const ArpParams& p, const ArpClock& c) const noexcept;
    double swingOffsetBeats(const ArpParams& p, int64_t stepIndex) const noexcept;
    void buildSequence(const ArpParams& p) noexcept;
    void startIfNeeded(const ArpParams& p, const ArpClock& c) noexcept;

    double fs_ = 48000.0;
    // input notes
    std::array<uint8_t, 128> vel_ {};
    std::array<bool, 128> held_ {};
    std::array<uint8_t, 64> notes_ {};   // sorted ascending (held or latched)
    int numNotes_ = 0;
    int physicallyHeld_ = 0;
    bool latchedSetActive_ = false;      // notes_ are latched (no key held)

    // sequence
    std::array<uint8_t, 256> seq_ {};
    int seqLen_ = 0;
    int seqPos_ = 0;
    int stepCounter_ = 0;
    bool dirty_ = true;

    // timing (in beats)
    bool running_ = false;
    double beatPos_ = 0.0;               // current position (internal or host-derived)
    int64_t nextStepIndex_ = 0;          // index of the next step to play
    double nextOffBeat_ = -1.0;          // pending note-off time
    std::array<uint8_t, 8> sounding_ {};
    int numSounding_ = 0;
    bool pendingKeySync_ = false;
    Rng rng_ { 0xA4B3C2D1u };
};

} // namespace kestrel
