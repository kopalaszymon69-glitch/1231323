#include "arp/Arpeggiator.h"

#include <algorithm>
#include <cmath>

#include "params/Mapping.h"

namespace kestrel {

namespace {
constexpr double kEps = 1e-9;
constexpr int kIdle = 1 << 30;
} // namespace

void Arpeggiator::reset() noexcept {
    held_.fill(false);
    vel_.fill(0);
    numNotes_ = 0;
    physicallyHeld_ = 0;
    latchedSetActive_ = false;
    seqLen_ = seqPos_ = stepCounter_ = 0;
    dirty_ = true;
    running_ = false;
    beatPos_ = 0.0;
    nextStepIndex_ = 0;
    nextOffBeat_ = -1.0;
    numSounding_ = 0;
    pendingKeySync_ = false;
}

void Arpeggiator::keyOn(int note, int velocity) noexcept {
    if (note < 0 || note > 127) return;
    if (physicallyHeld_ == 0) {
        if (latchedSetActive_) { numNotes_ = 0; latchedSetActive_ = false; } // new latch set
        pendingKeySync_ = true;
    }
    if (!held_[size_t(note)]) { held_[size_t(note)] = true; ++physicallyHeld_; }
    vel_[size_t(note)] = uint8_t(std::clamp(velocity, 1, 127));
    // insert sorted (unique)
    bool present = false;
    for (int i = 0; i < numNotes_; ++i) present |= notes_[size_t(i)] == note;
    if (!present && numNotes_ < int(notes_.size())) {
        int i = numNotes_++;
        while (i > 0 && notes_[size_t(i - 1)] > note) { notes_[size_t(i)] = notes_[size_t(i - 1)]; --i; }
        notes_[size_t(i)] = uint8_t(note);
    }
    dirty_ = true;
}

void Arpeggiator::keyOff(int note) noexcept {
    if (note < 0 || note > 127 || !held_[size_t(note)]) return;
    held_[size_t(note)] = false;
    --physicallyHeld_;
    dirty_ = true;
    // with LATCH the set is kept (handled in samplesUntilNextEvent via params)
    latchedSetActive_ = physicallyHeld_ == 0;
}

void Arpeggiator::allKeysOff() noexcept {
    held_.fill(false);
    physicallyHeld_ = 0;
    numNotes_ = 0;
    latchedSetActive_ = false;
    dirty_ = true;
}

double Arpeggiator::stepBeats(const ArpParams& p) const noexcept { return mapping::arpResolutionBeats(p.resolution); }

double Arpeggiator::beatsPerSample(const ArpParams& p, const ArpClock& c) const noexcept {
    const double bpm = c.useHost ? c.hostBpm : p.tempo;
    return std::clamp(bpm, 1.0, 999.0) / 60.0 / fs_;
}

double Arpeggiator::swingOffsetBeats(const ArpParams& p, int64_t idx) const noexcept {
    if ((idx & 1) == 0) return 0.0;  // 1st, 3rd ... notes stay on the grid
    return double(std::clamp(p.swing, -100.0f, 100.0f)) / 100.0 * 0.5 * stepBeats(p);
}

void Arpeggiator::buildSequence(const ArpParams& p) noexcept {
    std::array<uint8_t, 256> up {};
    int nUp = 0;
    const int range = std::clamp(p.range, 1, 4);
    for (int o = 0; o < range; ++o)
        for (int i = 0; i < numNotes_ && nUp < 256; ++i) {
            const int n = int(notes_[size_t(i)]) + 12 * o;
            if (n <= 127) up[size_t(nUp++)] = uint8_t(n);
        }
    seqLen_ = 0;
    auto push = [&](uint8_t v) { if (seqLen_ < int(seq_.size())) seq_[size_t(seqLen_++)] = v; };
    switch (p.type) {
        case 0: case 4: case 5: for (int i = 0; i < nUp; ++i) push(up[size_t(i)]); break;      // Up / Random / Trigger
        case 1: for (int i = nUp - 1; i >= 0; --i) push(up[size_t(i)]); break;                 // Down
        case 2:                                                                                 // Alt1: ends once
            for (int i = 0; i < nUp; ++i) push(up[size_t(i)]);
            for (int i = nUp - 2; i >= 1; --i) push(up[size_t(i)]);
            break;
        case 3:                                                                                 // Alt2: ends twice
            for (int i = 0; i < nUp; ++i) push(up[size_t(i)]);
            for (int i = nUp - 1; i >= 0; --i) push(up[size_t(i)]);
            break;
        default: for (int i = 0; i < nUp; ++i) push(up[size_t(i)]); break;
    }
    if (seqLen_ > 0) seqPos_ %= seqLen_;
    else seqPos_ = 0;
    dirty_ = false;
}


void Arpeggiator::startIfNeeded(const ArpParams& p, const ArpClock& c) noexcept {
    const double sb = stepBeats(p);
    if (!running_) {
        if (!p.on || numNotes_ == 0) return;
        running_ = true;
        if (p.keySync || pendingKeySync_) {
            if (p.keySync) { seqPos_ = 0; stepCounter_ = 0; }
        }
        if (!c.useHost && p.keySync) {
            beatPos_ = 0.0;
            nextStepIndex_ = 0;
        } else {
            nextStepIndex_ = int64_t(std::ceil(beatPos_ / sb - 1e-6));
        }
        pendingKeySync_ = false;
        return;
    }
    if (pendingKeySync_) {
        // keys re-pressed while notes were still sounding / latched
        if (p.keySync) {
            seqPos_ = 0;
            stepCounter_ = 0;
            if (!c.useHost) { beatPos_ = 0.0; nextStepIndex_ = 0; }
        }
        pendingKeySync_ = false;
    }
}

int Arpeggiator::samplesUntilNextEvent(const ArpParams& p, const ArpClock& c) noexcept {
    if (c.useHost) beatPos_ = c.hostPpq;
    if (!p.latch && physicallyHeld_ == 0 && numNotes_ > 0) { numNotes_ = 0; dirty_ = true; }
    if (!p.latch) {
        // drop notes that are no longer held
        int w = 0;
        for (int i = 0; i < numNotes_; ++i)
            if (held_[notes_[size_t(i)]]) notes_[size_t(w++)] = notes_[size_t(i)];
        if (w != numNotes_) { numNotes_ = w; dirty_ = true; }
    }
    if (dirty_) buildSequence(p);
    if (!p.on) return numSounding_ > 0 ? 0 : kIdle;
    startIfNeeded(p, c);
    const double bps = beatsPerSample(p, c);
    const double sb = stepBeats(p);
    double next = 1e300;
    if (running_) {
        if (numNotes_ == 0) return 0; // stop now
        double stepBeat = double(nextStepIndex_) * sb + swingOffsetBeats(p, nextStepIndex_);
        // host jumps (loop/seek): resynchronise to the grid
        if (stepBeat < beatPos_ - sb || stepBeat > beatPos_ + 2.0 * sb) {
            nextStepIndex_ = int64_t(std::ceil(beatPos_ / sb - 1e-6));
            stepBeat = double(nextStepIndex_) * sb + swingOffsetBeats(p, nextStepIndex_);
        }
        next = std::min(next, stepBeat);
    }
    if (numSounding_ > 0 && nextOffBeat_ >= 0.0) {
        if (nextOffBeat_ < beatPos_ - kEps || nextOffBeat_ > beatPos_ + 4.0 * sb) return 0;
        next = std::min(next, nextOffBeat_);
    }
    if (next >= 1e299) return kIdle;
    const double samples = (next - beatPos_) / bps;
    if (samples <= 0.5) return 0;
    return int(std::min(std::ceil(samples - 0.5), double(kIdle)));
}

void Arpeggiator::advance(int n, const ArpParams& p, const ArpClock& c) noexcept {
    if (!c.useHost) beatPos_ += double(n) * beatsPerSample(p, c);
    else beatPos_ = c.hostPpq + double(n) * beatsPerSample(p, c);
}

int Arpeggiator::fire(const ArpParams& p, const ArpClock& c, ArpEvent* out, int max) noexcept {
    int w = 0;
    const double bps = beatsPerSample(p, c);
    const double tol = 0.5 * bps + kEps;
    auto emitOffs = [&]() {
        for (int i = 0; i < numSounding_ && w < max; ++i) out[w++] = { false, sounding_[size_t(i)], 0 };
        numSounding_ = 0;
        nextOffBeat_ = -1.0;
    };
    if (!p.on) { emitOffs(); running_ = false; return w; }
    if (running_ && numNotes_ == 0) { emitOffs(); running_ = false; return w; }
    const double sb = stepBeats(p);
    // pending gate note-off
    if (numSounding_ > 0 && nextOffBeat_ >= 0.0 &&
        (nextOffBeat_ <= beatPos_ + tol || nextOffBeat_ > beatPos_ + 4.0 * sb)) emitOffs();
    if (!running_) return w;
    const double stepBeat = double(nextStepIndex_) * sb + swingOffsetBeats(p, nextStepIndex_);
    if (stepBeat > beatPos_ + tol) return w;

    // ---- a step is due
    std::array<uint8_t, 8> newNotes {};
    int numNew = 0;
    const int last = std::clamp(p.lastStep, 1, 8);
    const bool stepOn = p.steps[size_t(stepCounter_ % last)];
    if (p.type == 5) { // Trigger: all held notes, lowest first, up to the polyphony
        const int lim = std::clamp(p.triggerPolyphony, 1, 8);
        for (int i = 0; i < numNotes_ && numNew < lim; ++i) newNotes[size_t(numNew++)] = notes_[size_t(i)];
    } else if (seqLen_ > 0) {
        if (p.type == 4) newNotes[size_t(numNew++)] = seq_[size_t(rng_.nextU32() % uint32_t(seqLen_))];
        else newNotes[size_t(numNew++)] = seq_[size_t(seqPos_ % seqLen_)];
        seqPos_ = (seqPos_ + 1) % seqLen_;
    }
    const bool tie = p.gate >= 100.0f;
    // Release notes still sounding (gate 100 %). Notes that repeat are released first so
    // the new note-on is not cancelled; other notes are released after the new note-on
    // (legato overlap for Mono/Single-trigger timbres).
    std::array<uint8_t, 8> late {};
    int numLate = 0;
    for (int i = 0; i < numSounding_; ++i) {
        const uint8_t s = sounding_[size_t(i)];
        bool repeats = false;
        for (int k = 0; k < numNew; ++k) repeats |= newNotes[size_t(k)] == s;
        if (repeats || !stepOn) { if (w < max) out[w++] = { false, s, 0 }; }
        else late[size_t(numLate++)] = s;
    }
    numSounding_ = 0;
    if (stepOn) {
        for (int k = 0; k < numNew && w < max; ++k) {
            const uint8_t nn = newNotes[size_t(k)];
            // velocity of the held key this (octave-shifted) note derives from
            uint8_t v = 100;
            for (int i = 0; i < numNotes_; ++i)
                if ((int(nn) - int(notes_[size_t(i)])) % 12 == 0 && nn >= notes_[size_t(i)]) { v = vel_[notes_[size_t(i)]]; }
            out[w++] = { true, nn, v == 0 ? uint8_t(100) : v };
            sounding_[size_t(numSounding_++)] = nn;
        }
        if (!tie) {
            const double gateBeats = std::max(double(p.gate) / 100.0 * sb, 0.002 / (bps * fs_));
            nextOffBeat_ = stepBeat + gateBeats;
        } else {
            nextOffBeat_ = -1.0;
        }
    }
    for (int i = 0; i < numLate && w < max; ++i) out[w++] = { false, late[size_t(i)], 0 };
    stepCounter_ = (stepCounter_ + 1) % last;
    ++nextStepIndex_;
    return w;
}

int Arpeggiator::stop(ArpEvent* out, int max) noexcept {
    int w = 0;
    for (int i = 0; i < numSounding_ && w < max; ++i) out[w++] = { false, sounding_[size_t(i)], 0 };
    numSounding_ = 0;
    nextOffBeat_ = -1.0;
    running_ = false;
    return w;
}

} // namespace kestrel
