#include "ui/Views.h"

#include "osc/Wavetable.h"
#include "params/Mapping.h"

namespace kestrel::ui {

// ================================================================== View helpers
Knob* View::knob(Section& s, int idx, juce::Colour c, const juce::String& label) {
    auto k = std::make_unique<Knob>(proc_, idx, touch_, c, label);
    auto* raw = k.get();
    s.addControl(raw);
    owned_.push_back(std::move(k));
    return raw;
}

Choice* View::choice(Section& s, int idx, const juce::String& label, int width, const juce::StringArray& items) {
    auto c = std::make_unique<Choice>(proc_, idx, touch_, label, width, items);
    auto* raw = c.get();
    s.addControl(raw);
    owned_.push_back(std::move(c));
    return raw;
}

Section* View::section(const juce::String& title, juce::Colour c, int width, bool newRowAfter) {
    auto s = std::make_unique<Section>(title, c);
    auto* raw = s.get();
    flow_.addSection(raw, width);
    if (newRowAfter) flow_.newRow();
    owned_.push_back(std::move(s));
    if (flow_.getParentComponent() == nullptr) addAndMakeVisible(flow_);
    return raw;
}

// ================================================================== TimbreView
TimbreView::TimbreView(plugin::KestrelProcessor& p, TouchFn t, int timbre)
    : View(p, std::move(t)), t_(timbre), col_(timbre == 0 ? colours::accent : colours::accent2) {
    auto P = [&](TP x) { return pT(t_, x); };
    // row 1: VOICE / PITCH / OSC1 / OSC2
    auto* voice = section("Voice", col_, 0);
    choice(*voice, P(VoiceAssign), "Assign", 66);
    trigger_ = choice(*voice, P(TriggerMode), "Trigger", 66);
    unison_ = knob(*voice, P(UnisonDetune), col_, "Uni Detune");

    auto* pitch = section("Pitch", col_, 0);
    knob(*pitch, P(Transpose), col_, "Transpose");
    knob(*pitch, P(Tune), col_, "Tune");
    knob(*pitch, P(BendRange), col_, "Bend Rng");
    knob(*pitch, P(VibratoInt), col_, "Vibrato");
    knob(*pitch, P(Portamento), col_, "Porta");

    auto* osc1 = section("OSC 1", col_, 0);
    choice(*osc1, P(Osc1Wave), "Wave", 80);
    ctrl1_ = knob(*osc1, P(Osc1Ctrl1), col_, "Control 1");
    ctrl2_ = knob(*osc1, P(Osc1Ctrl2), col_, "Control 2");
    juce::StringArray dw;
    for (int i = 0; i < dwgs::kNumWaves; ++i) dw.add(juce::String(i + 1) + " " + dwgs::name(i) + " ~");
    dwgs_ = choice(*osc1, P(Osc1Dwgs), "DWGS (approx.)", 92, dw);

    auto* osc2 = section("OSC 2", col_, 0, true);
    choice(*osc2, P(Osc2Wave), "Wave", 66);
    choice(*osc2, P(Osc2Mod), "OSC Mod", 74);
    knob(*osc2, P(Osc2Semitone), col_, "Semitone");
    knob(*osc2, P(Osc2Tune), col_, "Tune");

    // row 2: MIXER / FILTER / AMP / data-only
    auto* mixer = section("Mixer", col_, 0);
    knob(*mixer, P(MixOsc1), col_, "OSC1 Lvl");
    knob(*mixer, P(MixOsc2), col_, "OSC2 Lvl");
    knob(*mixer, P(MixNoise), col_, "Noise Lvl");

    auto* filter = section("Filter", col_, 0);
    choice(*filter, P(FilterType), "Type", 88);
    knob(*filter, P(Cutoff), col_, "Cutoff");
    knob(*filter, P(Resonance), col_, "Resonance");
    knob(*filter, P(FilterEgInt), col_, "EG Int");
    knob(*filter, P(FilterKeyTrack), col_, "Key Track");

    auto* amp = section("Amp", col_, 0);
    knob(*amp, P(AmpLevel), col_, "Level");
    knob(*amp, P(AmpPan), col_, "Panpot");
    choice(*amp, P(Distortion), "Distortion", 70);
    knob(*amp, P(AmpKeyTrack), col_, "Kbd Track");

    auto* vel = section("Data only", colours::printSoft, 0, true);
    knob(*vel, P(FilterVelSense), colours::printSoft, "Flt Vel");
    knob(*vel, P(AmpVelSense), colours::printSoft, "Amp Vel");

    // row 3: FILTER EG / AMP EG / LFO1 / LFO2
    auto* feg = section("Filter EG", col_, 308);
    knob(*feg, P(FegAttack), col_, "Attack");
    knob(*feg, P(FegDecay), col_, "Decay");
    knob(*feg, P(FegSustain), col_, "Sustain");
    knob(*feg, P(FegRelease), col_, "Release");
    fegReset_ = choice(*feg, P(FegReset), "EG Reset", 64);
    auto fv = std::make_unique<EnvelopeView>(proc_, P(FegAttack), col_);
    feg_ = fv.get();
    feg->add(feg_, 292, 46);
    owned_.push_back(std::move(fv));

    auto* aeg = section("Amp EG", col_, 308);
    knob(*aeg, P(AegAttack), col_, "Attack");
    knob(*aeg, P(AegDecay), col_, "Decay");
    knob(*aeg, P(AegSustain), col_, "Sustain");
    knob(*aeg, P(AegRelease), col_, "Release");
    aegReset_ = choice(*aeg, P(AegReset), "EG Reset", 64);
    auto av = std::make_unique<EnvelopeView>(proc_, P(AegAttack), col_);
    aeg_ = av.get();
    aeg->add(aeg_, 292, 46);
    owned_.push_back(std::move(av));

    auto* lfo1 = section("LFO 1", col_, 242);
    choice(*lfo1, P(Lfo1Wave), "Wave", 72);
    choice(*lfo1, P(Lfo1KeySync), "Key Sync", 72);
    choice(*lfo1, P(Lfo1TempoSync), "Tempo Sync", 72);
    lfo1Freq_ = knob(*lfo1, P(Lfo1Freq), col_, "Frequency");
    lfo1Note_ = choice(*lfo1, P(Lfo1SyncNote), "Sync Note", 72);

    auto* lfo2 = section("LFO 2", col_, 242);
    choice(*lfo2, P(Lfo2Wave), "Wave", 72);
    choice(*lfo2, P(Lfo2KeySync), "Key Sync", 72);
    choice(*lfo2, P(Lfo2TempoSync), "Tempo Sync", 72);
    lfo2Freq_ = knob(*lfo2, P(Lfo2Freq), col_, "Frequency");
    lfo2Note_ = choice(*lfo2, P(Lfo2SyncNote), "Sync Note", 72);

    auto note = std::make_unique<juce::Label>();
    disabledNote_ = note.get();
    disabledNote_->setFont(KestrelLookAndFeel::labelFont(12.0f, false));
    disabledNote_->setColour(juce::Label::textColourId, colours::print);
    disabledNote_->setJustificationType(juce::Justification::topLeft);
    addAndMakeVisible(disabledNote_);
    owned_.push_back(std::move(note));
    flow_.toBack();
    refresh();
}

void TimbreView::refresh() {
    auto v = [&](TP x) { return value(pT(t_, x)); };
    const bool vocoder = int(value(pG(VoiceMode))) == int(ProgMode::Vocoder);
    const auto wave = Wave1(int(v(Osc1Wave)));
    // CONTROL 1 / CONTROL 2 meaning per waveform (owner's manual p.18-21)
    juce::String c1 = "Control 1", c2 = "Control 2";
    switch (wave) {
        case Wave1::Saw: c1 = "Waveform"; c2 = "LFO1 Mod"; break;
        case Wave1::Square: c1 = "Pulse Wid"; c2 = "PWM LFO1"; break;
        case Wave1::Triangle: c1 = "Waveform"; c2 = "LFO1 Mod"; break;
        case Wave1::Sine: c1 = vocoder ? "Waveform" : "Cross Mod"; c2 = "LFO1 Mod"; break;
        case Wave1::Vox: c1 = "Waveform"; c2 = "LFO1 Mod"; break;
        case Wave1::Dwgs: c1 = "(no effect)"; c2 = "(see DWGS)"; break;
        case Wave1::Noise: c1 = "LPF Cutoff"; c2 = "Resonance"; break;
        case Wave1::AudioIn: c1 = "IN1/IN2 Bal"; c2 = "Bal LFO1"; break;
    }
    ctrl1_->setLabel(c1);
    ctrl2_->setLabel(c2);
    ctrl1_->setEnabled(wave != Wave1::Dwgs);
    ctrl2_->setEnabled(wave != Wave1::Dwgs);
    dwgs_->setEnabled(wave == Wave1::Dwgs);
    dwgs_->setLabel(proc_.dwgsIsUser(int(v(Osc1Dwgs)) - 1) ? "DWGS (user data)" : "DWGS (approx.)");
    const auto assign = Assign(int(v(VoiceAssign)));
    trigger_->setEnabled(assign != Assign::Poly);
    unison_->setEnabled(assign == Assign::Unison);
    const bool resetAvail = assign == Assign::Poly || v(TriggerMode) >= 0.5f; // p.26
    fegReset_->setEnabled(resetAvail);
    aegReset_->setEnabled(resetAvail);
    lfo1Freq_->setEnabled(v(Lfo1TempoSync) < 0.5f);
    lfo1Note_->setEnabled(v(Lfo1TempoSync) >= 0.5f);
    lfo2Freq_->setEnabled(v(Lfo2TempoSync) < 0.5f);
    lfo2Note_->setEnabled(v(Lfo2TempoSync) >= 0.5f);
    feg_->repaint();
    aeg_->repaint();
    const auto mode = ProgMode(int(value(pG(VoiceMode))));
    juce::String note;
    if (t_ == 1 && mode != ProgMode::Layer) note = "Timbre 2 is silent: VOICE MODE is not Layer.";
    if (mode == ProgMode::Vocoder) note = t_ == 0 ? "Vocoder program: OSC1, PITCH, AMP EG and LFOs of Timbre 1 shape the carrier; OSC2, mixer, filter and patches are not used."
                                                  : "Vocoder program: Timbre 2 is not used.";
    disabledNote_->setText(note, juce::dontSendNotification);
    disabledNote_->setBounds(getWidth() - 300, getHeight() - 64, 296, 60);
    setAlpha((t_ == 1 && mode != ProgMode::Layer) ? 0.75f : 1.0f);
}

// ================================================================== RoutingMatrix
void RoutingMatrix::paint(juce::Graphics& g) {
    auto r = getLocalBounds().toFloat();
    g.setColour(colours::lcdBg);
    g.fillRoundedRectangle(r, 4.0f);
    draw::inset(g, r, 4.0f, 1.2f);
    const float left = 92.0f, top = 46.0f;
    const float cw = (r.getWidth() - left - 8.0f) / 8.0f, ch = (r.getHeight() - top - 8.0f) / 8.0f;
    g.setFont(KestrelLookAndFeel::labelFont(11.0f, false));
    for (int i = 0; i < 8; ++i) {
        g.setColour(colours::lcdText.withAlpha(0.8f));
        g.drawText(choices::kPatchSrc[i], juce::Rectangle<float>(4.0f, top + ch * float(i), left - 8.0f, ch), juce::Justification::centredRight);
        g.saveState();
        const float cx = left + cw * (float(i) + 0.5f);
        g.addTransform(juce::AffineTransform::rotation(-0.7f, cx, top - 6.0f));
        g.drawText(choices::kPatchDst[i], juce::Rectangle<float>(cx - 4.0f, top - 14.0f, 90.0f, 14.0f), juce::Justification::centredLeft);
        g.restoreState();
    }
    g.setColour(colours::lcdDim);
    for (int i = 0; i <= 8; ++i) {
        g.drawHorizontalLine(int(top + ch * float(i)), left, left + cw * 8.0f);
        g.drawVerticalLine(int(left + cw * float(i)), top, top + ch * 8.0f);
    }
    for (int k = 0; k < 4; ++k) {
        const TP src = TP(P1Src + 3 * k), dst = TP(P1Dst + 3 * k), in = TP(P1Int + 3 * k);
        auto val = [&](TP x) { const int idx = pT(t_, x); return proc_.param(idx)->convertFrom0to1(proc_.param(idx)->getValue()); };
        const int s = int(val(src)), d = int(val(dst));
        const float intensity = val(in);
        const float cx = left + cw * (float(d) + 0.5f), cy = top + ch * (float(s) + 0.5f);
        const float rad = 3.0f + (std::min(cw, ch) * 0.42f - 3.0f) * std::fabs(intensity) / 63.0f;
        const auto c = intensity >= 0.0f ? colours::accent : colours::accent2;
        g.setColour(intensity == 0.0f ? colours::lcdDim : c.withAlpha(0.85f));
        g.fillEllipse(cx - rad, cy - rad, rad * 2.0f, rad * 2.0f);
        g.setColour(juce::Colours::black);
        g.setFont(KestrelLookAndFeel::labelFont(10.0f));
        g.drawText("P" + juce::String(k + 1), juce::Rectangle<float>(cx - 12.0f, cy - 6.0f, 24.0f, 12.0f), juce::Justification::centred);
    }
}

// ================================================================== ModView
ModView::ModView(plugin::KestrelProcessor& p, TouchFn t) : View(p, std::move(t)) {
    for (int tm = 0; tm < 2; ++tm) {
        const auto c = tm == 0 ? colours::accent : colours::accent2;
        auto* s = section(juce::String("Timbre ") + juce::String(tm + 1) + " virtual patch", c, 560, tm == 0);
        for (int k = 0; k < 4; ++k) {
            choice(*s, pT(tm, TP(P1Src + 3 * k)), "P" + juce::String(k + 1) + " Source", 92);
            choice(*s, pT(tm, TP(P1Dst + 3 * k)), "Dest", 92);
            knob(*s, pT(tm, TP(P1Int + 3 * k)), c, "Mod Int");
        }
        auto m = std::make_unique<RoutingMatrix>(proc_, tm);
        matrix_[tm] = m.get();
        addAndMakeVisible(m.get());
        owned_.push_back(std::move(m));
        auto l = std::make_unique<juce::Label>();
        routes_[tm] = l.get();
        routes_[tm]->setFont(juce::Font(juce::FontOptions(juce::Font::getDefaultMonospacedFontName(), 12.5f, juce::Font::bold)));
        routes_[tm]->setColour(juce::Label::textColourId, colours::print);
        routes_[tm]->setJustificationType(juce::Justification::topLeft);
        addAndMakeVisible(l.get());
        owned_.push_back(std::move(l));
    }
}

void ModView::resized() {
    const int w = getWidth();
    flow_.setBounds(0, 0, 566, getHeight());
    for (int tm = 0; tm < 2; ++tm) {
        const int y = tm * (getHeight() / 2);
        matrix_[tm]->setBounds(572, y, 330, getHeight() / 2 - 8);
        routes_[tm]->setBounds(908, y, w - 908, getHeight() / 2 - 8);
    }
}

void ModView::refresh() {
    for (int tm = 0; tm < 2; ++tm) {
        auto txt = [&](int idx) { return proc_.param(idx)->getCurrentValueAsText(); };
        juce::String s;
        s << "DEDICATED ROUTES (T" << (tm + 1) << ")\n";
        s << "Filter EG > Cutoff   " << txt(pT(tm, FilterEgInt)) << "\n";
        s << "Key      > Cutoff    " << txt(pT(tm, FilterKeyTrack)) << "\n";
        s << "Amp EG   > VCA       (fixed)\n";
        s << "Key      > Amp       " << txt(pT(tm, AmpKeyTrack)) << "\n";
        s << "LFO1     > OSC1 Ctl1 " << txt(pT(tm, Osc1Ctrl2)) << "\n";
        s << "LFO2xMod > Pitch     " << txt(pT(tm, VibratoInt)) << "\n";
        s << "Bend     > Pitch     " << txt(pT(tm, BendRange)) << " st\n\n";
        s << "VIRTUAL PATCHES\n";
        for (int k = 0; k < 4; ++k)
            s << "P" << (k + 1) << " " << txt(pT(tm, TP(P1Src + 3 * k))).paddedRight(' ', 10) << "> "
              << txt(pT(tm, TP(P1Dst + 3 * k))).paddedRight(' ', 11) << txt(pT(tm, TP(P1Int + 3 * k))) << "\n";
        routes_[tm]->setText(s, juce::dontSendNotification);
        matrix_[tm]->repaint();
    }
}

// ================================================================== FxArpView
FxArpView::FxArpView(plugin::KestrelProcessor& p, TouchFn t) : View(p, std::move(t)) {
    const auto c = colours::accent;
    auto* mod = section("Mod FX", c, 230);
    choice(*mod, pG(ModFxType), "Type", 96);
    knob(*mod, pG(ModFxSpeed), c, "LFO Speed");
    knob(*mod, pG(ModFxDepth), c, "Depth");
    auto* dly = section("Delay", c, 380);
    choice(*dly, pG(DelayType), "Type", 96);
    choice(*dly, pG(DelaySync), "Tempo Sync", 70);
    delayTime_ = knob(*dly, pG(DelayTime), c, "Time");
    delayNote_ = choice(*dly, pG(DelaySyncNote), "Sync Note", 70);
    knob(*dly, pG(DelayDepth), c, "Depth");
    auto* eq = section("EQ", c, 330, true);
    choice(*eq, pG(EqLowFreq), "Low Freq", 76);
    knob(*eq, pG(EqLowGain), c, "Low Gain");
    choice(*eq, pG(EqHiFreq), "Hi Freq", 76);
    knob(*eq, pG(EqHiGain), c, "Hi Gain");

    auto* a = section("Arpeg. A", c, 520);
    choice(*a, pG(ArpOn), "Arp", 64);
    knob(*a, pG(ArpTempo), c, "Tempo");
    choice(*a, pG(ArpResolution), "Resolution", 72);
    knob(*a, pG(ArpGate), c, "Gate");
    choice(*a, pG(ArpType), "Type", 80);
    knob(*a, pG(ArpRange), c, "Range");
    auto* b = section("Arpeg. B", c, 430, true);
    choice(*b, pG(ArpLatch), "Latch", 64);
    knob(*b, pG(ArpSwing), c, "Swing");
    choice(*b, pG(ArpKeySync), "Key Sync", 64);
    knob(*b, pG(ArpLastStep), c, "Last Step");
    choice(*b, pG(ArpTarget), "Target", 86);
    auto* st = section("Step arpeggiator (steps 1-8)", c, 520);
    for (int i = 0; i < 8; ++i) {
        auto btn = std::make_unique<juce::TextButton>(juce::String(i + 1));
        btn->setClickingTogglesState(true); // LED shows the step on/off state
        btn->setTooltip("Arp step " + juce::String(i + 1) + " on/off");
        stepAtt_.push_back(std::make_unique<juce::ButtonParameterAttachment>(*proc_.param(pG(GP(ArpStep1 + i))), *btn, nullptr));
        steps_.push_back(btn.get());
        st->add(btn.get(), 56, 40);
        owned_.push_back(std::move(btn));
    }
}

void FxArpView::refresh() {
    const bool sync = value(pG(DelaySync)) >= 0.5f;
    delayTime_->setEnabled(!sync);
    delayNote_->setEnabled(sync);
    const int cur = proc_.engine().arpStep();
    const int last = int(value(pG(ArpLastStep)));
    for (int i = 0; i < 8; ++i) {
        steps_[size_t(i)]->setColour(juce::TextButton::buttonColourId, i == cur ? colours::knobCap.brighter(0.6f) : colours::knobCap);
        steps_[size_t(i)]->setAlpha(i < last ? 1.0f : 0.35f);
    }
}

// ================================================================== Vocoder
void BandMeter::paint(juce::Graphics& g) {
    auto r = getLocalBounds().toFloat();
    g.setColour(colours::lcdBg);
    g.fillRoundedRectangle(r, 4.0f);
    draw::inset(g, r, 4.0f, 1.2f);
    const float bw = (r.getWidth() - 16.0f) / 16.0f;
    for (int b = 0; b < 16; ++b) {
        const float e = proc_.engine().vocoderBand(b);
        const float db = juce::jlimit(-60.0f, 0.0f, 20.0f * std::log10(std::max(e * 8.0f, 1e-6f)));
        smooth_[b] = std::max(smooth_[b] * 0.85f, (db + 60.0f) / 60.0f);
        const float h = (r.getHeight() - 22.0f) * smooth_[b];
        g.setColour(b % 2 ? colours::vocoder : colours::vocoder.brighter(0.3f));
        g.fillRect(8.0f + bw * float(b) + 1.0f, r.getBottom() - 16.0f - h, bw - 2.0f, h);
    }
    g.setColour(colours::lcdText.withAlpha(0.8f));
    g.setFont(KestrelLookAndFeel::labelFont(9.5f, false));
    for (int c = 0; c < 8; ++c)
        g.drawText("CH" + juce::String(c + 1), juce::Rectangle<float>(8.0f + bw * float(2 * c), r.getBottom() - 15.0f, bw * 2.0f, 13.0f),
                   juce::Justification::centred);
}

VocoderView::VocoderView(plugin::KestrelProcessor& p, TouchFn t) : View(p, std::move(t)) {
    const auto c = colours::vocoder;
    auto* car = section("Carrier (Timbre 1 OSC1)", c, 300);
    choice(*car, pT(0, Osc1Wave), "Wave", 84);
    knob(*car, pT(0, Osc1Ctrl1), c, "Control 1");
    knob(*car, pT(0, Osc1Ctrl2), c, "Control 2");
    auto* in1 = section("Audio In 1", c, 296);
    knob(*in1, pG(VocGateSense), c, "Gate Sense");
    knob(*in1, pG(VocThreshold), c, "Threshold");
    knob(*in1, pG(VocHpfLevel), c, "HPF Level");
    choice(*in1, pG(VocHpfGate), "HPF Gate", 70);
    auto* mix = section("Mixer", c, 212);
    knob(*mix, pG(VocMixOsc1), c, "OSC1 Lvl");
    knob(*mix, pG(VocMixInst), c, "Inst Lvl");
    knob(*mix, pG(VocMixNoise), c, "Noise Lvl");
    auto* amp = section("Amp", c, 290, true);
    knob(*amp, pG(VocLevel), c, "Level");
    knob(*amp, pG(VocDirectLevel), c, "Direct Lvl");
    choice(*amp, pG(VocDistortion), "Distortion", 70);
    knob(*amp, pG(VocKeyTrack), c, "Kbd Track");
    auto* flt = section("Filter", c, 420);
    choice(*flt, pG(VocFormantShift), "Formant Shift", 80);
    knob(*flt, pG(VocCutoff), c, "Cutoff");
    knob(*flt, pG(VocResonance), c, "Resonance");
    knob(*flt, pG(VocEfSense), c, "E.F. Sense");
    auto hb = std::make_unique<juce::TextButton>("FORMANT HOLD");
    hold_ = hb.get();
    hold_->setClickingTogglesState(false);
    hold_->getProperties().set("led", true);
    hold_->getProperties().set("ledColour", int(colours::vocoder.getARGB()));
    hold_->onClick = [this] {
        auto* prm = proc_.param(pG(VocEfSense));
        const float cur = value(pG(VocEfSense));
        if (cur >= 127.0f) prm->setValueNotifyingHost(prm->convertTo0to1(std::min(preHoldSense_, 126.0f)));
        else { preHoldSense_ = cur; prm->setValueNotifyingHost(prm->convertTo0to1(127.0f)); }
        if (touch_) touch_(pG(VocEfSense));
    };
    flt->add(hold_, 100, 40);
    owned_.push_back(std::move(hb));
    auto* fc = section("FC Mod", c, 190);
    choice(*fc, pG(VocFcModSrc), "Source", 88);
    knob(*fc, pG(VocFcModInt), c, "Intensity");
    auto* aeg = section("Amp EG (Timbre 1)", c, 290, true);
    knob(*aeg, pT(0, AegAttack), c, "Attack");
    knob(*aeg, pT(0, AegDecay), c, "Decay");
    knob(*aeg, pT(0, AegSustain), c, "Sustain");
    knob(*aeg, pT(0, AegRelease), c, "Release");
    auto* lv = section("CH Level / CH Pan", c, 680);
    for (int ch = 0; ch < 8; ++ch) {
        auto f = std::make_unique<Fader>(proc_, pG(GP(VocCh1Level + ch)), touch_, c, "CH" + juce::String(ch + 1));
        lv->add(f.get(), 40, 120);
        owned_.push_back(std::move(f));
    }
    for (int ch = 0; ch < 8; ++ch) knob(*lv, pG(GP(VocCh1Pan + ch)), c, "Pan " + juce::String(ch + 1));
    auto* ms = section("Band envelopes (16 analysis filters, table 6-1)", c, 450);
    auto m = std::make_unique<BandMeter>(proc_);
    meter_ = m.get();
    ms->add(meter_, 430, 200);
    owned_.push_back(std::move(m));
}

void VocoderView::refresh() {
    hold_->setToggleState(value(pG(VocEfSense)) >= 127.0f, juce::dontSendNotification);
    meter_->repaint();
    const bool active = int(value(pG(VoiceMode))) == int(ProgMode::Vocoder);
    setAlpha(active ? 1.0f : 0.8f);
}

// ================================================================== Global
GlobalView::GlobalView(plugin::KestrelProcessor& p, TouchFn t) : View(p, std::move(t)) {
    const auto c = colours::accent;
    auto* gl = section("Global", c, 420);
    knob(*gl, pG(MasterTune), c, "A4 Tune");
    knob(*gl, pG(MasterTranspose), c, "Transpose");
    knob(*gl, pG(VelocityCurve), c, "Vel Curve");
    choice(*gl, pG(Clock), "Clock", 80);
    choice(*gl, pG(AudioInThru), "In Thru", 64);
    auto* en = section("Engine / host (extensions)", c, 520, true);
    choice(*en, pG(VoiceLimit), "Voice Allocation", 170);
    choice(*en, pG(Quality), "Oversampling", 80);
    choice(*en, pG(Damper), "Sustain CC64", 70);
    knob(*en, pG(MasterVolume), c, "Volume");

    // DWGS import
    auto* dw = section("DWGS waveform data", colours::printSoft, 520);
    auto box = std::make_unique<juce::ComboBox>();
    slot_ = box.get();
    for (int i = 0; i < dwgs::kNumWaves; ++i) slot_->addItem(juce::String(i + 1) + " " + dwgs::name(i), i + 1);
    slot_->setSelectedId(1, juce::dontSendNotification);
    dw->add(slot_, 150, 26);
    owned_.push_back(std::move(box));
    auto imp = std::make_unique<juce::TextButton>("Import...");
    imp->onClick = [this] {
        chooser_ = std::make_unique<juce::FileChooser>("Import DWGS slot data (single-cycle WAV/AIFF or harmonic list .txt)",
                                                       juce::File(), "*.wav;*.aif;*.aiff;*.txt;*.dwg");
        chooser_->launchAsync(juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles, [this](const juce::FileChooser& fc) {
            const auto f = fc.getResult();
            if (!f.existsAsFile()) return;
            juce::String err;
            const int slot = slot_->getSelectedId() - 1;
            if (proc_.importDwgs(slot, f, err)) slotStatus_->setText("Slot " + juce::String(slot + 1) + ": imported " + f.getFileName(), juce::dontSendNotification);
            else slotStatus_->setText("Import failed: " + err, juce::dontSendNotification);
        });
    };
    dw->add(imp.get(), 90, 26);
    owned_.push_back(std::move(imp));
    auto clr = std::make_unique<juce::TextButton>("Use approximation");
    clr->onClick = [this] { proc_.clearDwgs(slot_->getSelectedId() - 1); };
    dw->add(clr.get(), 140, 26);
    owned_.push_back(std::move(clr));
    auto st = std::make_unique<juce::Label>();
    slotStatus_ = st.get();
    slotStatus_->setFont(KestrelLookAndFeel::labelFont(12.0f, false));
    dw->add(slotStatus_, 500, 40);
    owned_.push_back(std::move(st));

    // program save
    auto* pr = section("Program", c, 520, true);
    auto te = std::make_unique<juce::TextEditor>();
    name_ = te.get();
    name_->setText(proc_.programName(), juce::dontSendNotification);
    pr->add(name_, 260, 26);
    owned_.push_back(std::move(te));
    auto sv = std::make_unique<juce::TextButton>("Save as user program");
    sv->onClick = [this] {
        proc_.setProgramName(name_->getText());
        auto prog = proc_.captureProgram();
        juce::String err;
        if (proc_.bank().saveUser(prog, err)) saveStatus_->setText("Saved to " + plugin::PresetBank::userFolder().getFullPathName(), juce::dontSendNotification);
        else saveStatus_->setText(err, juce::dontSendNotification);
    };
    pr->add(sv.get(), 170, 26);
    owned_.push_back(std::move(sv));
    auto ss = std::make_unique<juce::Label>();
    saveStatus_ = ss.get();
    saveStatus_->setFont(KestrelLookAndFeel::labelFont(12.0f, false));
    pr->add(saveStatus_, 500, 34);
    owned_.push_back(std::move(ss));

    auto* ab = section("About", colours::printSoft, 1040);
    auto lbl = std::make_unique<juce::Label>();
    lbl->setFont(KestrelLookAndFeel::labelFont(12.5f, false));
    lbl->setJustificationType(juce::Justification::topLeft);
    lbl->setText("Kestrel VA is an independent, unofficial instrument. It is not made, endorsed or supported by KORG; "
                 "\"microKORG\" is used only to name the reference hardware whose documented behaviour is modelled. "
                 "Ranges and routings follow the 2002 owner's manual and MIDI implementation; curves that are not "
                 "documented (cutoff Hz, EG times, LFO rates, delay times, filter topology, distortion curve) are engineering "
                 "approximations awaiting comparison with hardware recordings - see docs/ARCHITECTURE.md and docs/STATUS.md. "
                 "DWGS tables are original approximations of the documented slot names; import your own data per slot above. "
                 "Audio In: L = AUDIO IN 1 (modulator), R = AUDIO IN 2. In FL Studio use 'Kestrel VA FX' on a mixer insert for the vocoder (docs/FL_STUDIO.md).",
                 juce::dontSendNotification);
    ab->add(lbl.get(), 1020, 84);
    owned_.push_back(std::move(lbl));
}

void GlobalView::refresh() {
    const int slot = slot_->getSelectedId() - 1;
    if (!slotStatus_->getText().startsWith("Import") && !slotStatus_->getText().contains("imported"))
        slotStatus_->setText(juce::String("Slot ") + juce::String(slot + 1) + " " + dwgs::name(slot) + ": "
                                 + (proc_.dwgsIsUser(slot) ? "user-supplied data" : "Kestrel approximation (not original data)"),
                             juce::dontSendNotification);
}

} // namespace kestrel::ui
