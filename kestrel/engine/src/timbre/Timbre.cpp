#include "timbre/Timbre.h"

#include <cmath>
#include <limits>

#include "params/Mapping.h"

namespace kestrel {

namespace {
constexpr double kNoGlide = std::numeric_limits<double>::quiet_NaN();
constexpr double kStealFadeSeconds = 0.003; // [ENG] click-free voice stealing
} // namespace

void Timbre::prepare(int index, double fs, Voice* pool, VoiceTailSink* tails, uint64_t* ageCounter) {
    index_ = index;
    tb_ = index * TP_COUNT;
    fs_ = fs;
    pool_ = pool;
    tails_ = tails;
    age_ = ageCounter;
    for (int i = 0; i < 2; ++i) {
        ref_[i].setSampleRate(fs);
        ref_[i].seed(0xA5A5u + uint32_t(index * 7 + i));
        ref_[i].resetPhase();
    }
    resetNoteState();
}

void Timbre::setVoiceRange(int first, int count) noexcept {
    for (int i = first_; i < first_ + count_; ++i) {
        Voice& v = pool_[i];
        if (v.isActive()) {
            tails_->moveToTail(v);
            v.kill();
        }
    }
    first_ = first;
    count_ = count;
    resetNoteState();
}

void Timbre::resetNoteState() noexcept {
    keyDown_.fill(false);
    sustained_.fill(false);
    keyVel_.fill(0);
    heldKeys_ = 0;
    stackSize_ = 0;
    monoNote_ = -1;
    monoSounding_ = false;
}

int Timbre::sustainedCount() const noexcept {
    int c = 0;
    for (bool s : sustained_) c += s ? 1 : 0;
    return c;
}

const Voice* Timbre::leadVoice() const noexcept {
    const Voice* best = nullptr;
    for (int i = first_; i < first_ + count_; ++i) {
        const Voice& v = pool_[i];
        if (v.isActive() && (best == nullptr || v.age() > best->age())) best = &v;
    }
    return best;
}

void Timbre::advanceReference(const float* pv, int n, double bpm) noexcept {
    for (int i = 0; i < 2; ++i) {
        const TP syncP = i == 0 ? Lfo1TempoSync : Lfo2TempoSync;
        const TP noteP = i == 0 ? Lfo1SyncNote : Lfo2SyncNote;
        const TP freqP = i == 0 ? Lfo1Freq : Lfo2Freq;
        const TP waveP = i == 0 ? Lfo1Wave : Lfo2Wave;
        double hz;
        if (pv[tb_ + syncP] >= 0.5f) hz = (bpm / 60.0) / mapping::lfoSyncNoteBeats(int(pv[tb_ + noteP]));
        else hz = mapping::lfoFreqHz(pv[tb_ + freqP]);
        ref_[i].setFrequency(hz);
        const Lfo::Shape s = Lfo::shapeFor(i, int(pv[tb_ + waveP]));
        for (int k = 0; k < n; ++k) ref_[i].process(s);
    }
}

void Timbre::noteOn(const VoiceContext& ctx, int note, int velocity) noexcept {
    if (count_ <= 0 || note < 0 || note > 127) return;
    const float* pv = ctx.pv1;
    // KEY SYNC = Timbre: reset the reference at the first note-on from "no keys" [DOC p.29]
    if (heldKeys_ == 0) {
        for (int i = 0; i < 2; ++i) {
            const TP ks = i == 0 ? Lfo1KeySync : Lfo2KeySync;
            if (int(pv[tb_ + ks]) == 1) ref_[i].resetPhase();
        }
    }
    if (!keyDown_[size_t(note)]) {
        keyDown_[size_t(note)] = true;
        ++heldKeys_;
    }
    sustained_[size_t(note)] = false;
    keyVel_[size_t(note)] = uint8_t(velocity);
    switch (assign(pv)) {
        case Assign::Poly: polyNoteOn(ctx, note, velocity); break;
        case Assign::Mono: monoNoteOn(ctx, note, velocity, false); break;
        case Assign::Unison: monoNoteOn(ctx, note, velocity, true); break;
    }
    lastPitch_ = double(note);
    havePlayed_ = true;
}

void Timbre::polyNoteOn(const VoiceContext& ctx, int note, int velocity) noexcept {
    const float* pv = ctx.pv1;
    const bool r1 = eg1Reset(pv), r2 = eg2Reset(pv);
    Voice* chosen = nullptr;
    bool reuseAudible = false;
    // 1) a voice already holding this note (re-trigger)
    for (int i = first_; i < first_ + count_ && chosen == nullptr; ++i)
        if (pool_[i].isActive() && pool_[i].note() == note) { chosen = &pool_[i]; reuseAudible = true; }
    // 2) an idle voice
    for (int i = first_; i < first_ + count_ && chosen == nullptr; ++i)
        if (!pool_[i].isActive()) chosen = &pool_[i];
    // 3) the oldest releasing voice
    if (chosen == nullptr) {
        for (int i = first_; i < first_ + count_; ++i) {
            Voice& v = pool_[i];
            if (v.isReleasing() && (chosen == nullptr || v.age() < chosen->age())) chosen = &v;
        }
        reuseAudible = chosen != nullptr;
    }
    // 4) steal the oldest held voice (last-note priority [DOC p.16])
    if (chosen == nullptr) {
        for (int i = first_; i < first_ + count_; ++i) {
            Voice& v = pool_[i];
            if (chosen == nullptr || v.age() < chosen->age()) chosen = &v;
        }
        reuseAudible = true;
        if (chosen != nullptr && chosen->note() >= 0 && chosen->note() < 128) sustained_[size_t(chosen->note())] = false;
    }
    if (chosen == nullptr) return;
    // EG RESET [DOC p.26/28]: ON -> start from 0, OFF -> continue from the current level.
    // When an audible voice restarts from 0, its old sound is handed to a short fade tail.
    if (reuseAudible && (r1 || r2) && chosen->ampLevel() > 1e-4f) {
        tails_->moveToTail(*chosen);
    }
    chosen->start(ctx, note, velocity, 0.0, r1, r2, true, ref_, kNoGlide, ++(*age_));
}

void Timbre::startMonoVoices(const VoiceContext& ctx, int note, int velocity, bool unison, bool newPhrase) noexcept {
    const float* pv = ctx.pv1;
    const bool multi = multiTrigger(pv);
    // EG RESET only applies with Multi trigger in Mono/Unison [DOC p.26]
    const bool r1 = multi && eg1Reset(pv);
    const bool r2 = multi && eg2Reset(pv);
    const int nv = unison ? unisonVoices() : 1;
    const double detune = unison ? double(pv[tb_ + UnisonDetune]) : 0.0;
    const bool porta = pv[tb_ + Portamento] > 0.0f;
    if (newPhrase) {
        // Portamento is not applied to the first note with Single trigger [DOC p.17]
        const double glideFrom = (porta && multi && havePlayed_) ? lastPitch_ : kNoGlide;
        for (int k = 0; k < nv; ++k) {
            Voice& v = pool_[first_ + k];
            if (v.isActive() && (r1 || r2) && v.ampLevel() > 1e-4f) tails_->moveToTail(v);
            const double cents = mapping::unisonOffsetCents(k, nv, detune);
            v.start(ctx, note, velocity, cents, r1, r2, true, ref_, glideFrom, ++(*age_));
        }
    } else {
        for (int k = 0; k < nv; ++k) {
            Voice& v = pool_[first_ + k];
            v.setDetune(mapping::unisonOffsetCents(k, nv, detune));
            if (!v.isActive()) {
                v.start(ctx, note, velocity, mapping::unisonOffsetCents(k, nv, detune), r1, r2, true, ref_,
                        porta ? lastPitch_ : kNoGlide, ++(*age_));
            } else {
                v.legato(ctx, note, velocity, multi, r1, r2, ref_, ++(*age_));
            }
        }
    }
    monoNote_ = note;
    monoSounding_ = true;
}

void Timbre::monoNoteOn(const VoiceContext& ctx, int note, int velocity, bool unison) noexcept {
    const bool newPhrase = !monoSounding_ || (stackSize_ == 0 && !sustainDown_);
    stackPush(note);
    startMonoVoices(ctx, note, velocity, unison, newPhrase);
}

void Timbre::noteOff(const VoiceContext& ctx, int note) noexcept {
    if (count_ <= 0 || note < 0 || note > 127) return;
    if (keyDown_[size_t(note)]) {
        keyDown_[size_t(note)] = false;
        --heldKeys_;
    }
    const Assign a = assign(ctx.pv1);
    if (a == Assign::Poly) {
        for (int i = first_; i < first_ + count_; ++i) {
            Voice& v = pool_[i];
            if (v.isActive() && v.gate() && v.note() == note) {
                if (sustainDown_) sustained_[size_t(note)] = true;
                else v.release();
            }
        }
        return;
    }
    monoNoteOff(ctx, note, a == Assign::Unison);
}

void Timbre::monoNoteOff(const VoiceContext& ctx, int note, bool unison) noexcept {
    const bool wasCurrent = (note == monoNote_);
    stackRemove(note);
    if (stackSize_ > 0) {
        if (wasCurrent) {
            // last-note priority: return to the most recent still-held key (legato, no retrigger)
            const int back = stack_[size_t(stackSize_ - 1)];
            const int nv = unison ? unisonVoices() : 1;
            for (int k = 0; k < nv; ++k) pool_[first_ + k].legato(ctx, back, keyVel_[size_t(back)], false, false, false, ref_, ++(*age_));
            monoNote_ = back;
            lastPitch_ = double(back);
        }
        return;
    }
    if (sustainDown_) {
        sustained_[size_t(note)] = true;
        return;
    }
    const int nv = unison ? unisonVoices() : 1;
    for (int k = 0; k < nv; ++k) pool_[first_ + k].release();
    monoSounding_ = false;
}

void Timbre::setSustain(const VoiceContext& ctx, bool down) noexcept {
    if (down == sustainDown_) return;
    sustainDown_ = down;
    if (down) return;
    const Assign a = assign(ctx.pv1);
    if (a == Assign::Poly) {
        for (int i = first_; i < first_ + count_; ++i) {
            Voice& v = pool_[i];
            if (v.isActive() && v.gate() && v.note() >= 0 && sustained_[size_t(v.note())] && !keyDown_[size_t(v.note())])
                v.release();
        }
    } else if (stackSize_ == 0) {
        const int nv = a == Assign::Unison ? unisonVoices() : 1;
        for (int k = 0; k < nv; ++k) pool_[first_ + k].release();
        monoSounding_ = false;
    }
    sustained_.fill(false);
}

void Timbre::allNotesOff() noexcept {
    for (int i = first_; i < first_ + count_; ++i) pool_[i].release();
    sustainDown_ = false;
    resetNoteState();
}

void Timbre::allSoundOff() noexcept {
    for (int i = first_; i < first_ + count_; ++i) {
        Voice& v = pool_[i];
        if (v.isActive()) {
            tails_->moveToTail(v);
            v.kill();
        }
    }
    sustainDown_ = false;
    resetNoteState();
}

void Timbre::stackRemove(int note) noexcept {
    int w = 0;
    for (int r = 0; r < stackSize_; ++r)
        if (stack_[size_t(r)] != note) stack_[size_t(w++)] = stack_[size_t(r)];
    stackSize_ = w;
}

void Timbre::stackPush(int note) noexcept {
    stackRemove(note);
    if (stackSize_ < 128) stack_[size_t(stackSize_++)] = note;
}

} // namespace kestrel
