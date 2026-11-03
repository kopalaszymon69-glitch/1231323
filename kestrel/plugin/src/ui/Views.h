#pragma once

#include "ui/Widgets.h"

namespace kestrel::ui {

// Common base: owns its controls; refresh() is called by the editor timer (~15 Hz).
class View : public juce::Component {
public:
    View(plugin::KestrelProcessor& p, TouchFn t) : proc_(p), touch_(std::move(t)) {}
    virtual void refresh() {}
    void resized() override { flow_.setBounds(getLocalBounds()); }

protected:
    float value(int index) const { return proc_.param(index)->convertFrom0to1(proc_.param(index)->getValue()); }
    Knob* knob(Section& s, int idx, juce::Colour c, const juce::String& label = {});
    Choice* choice(Section& s, int idx, const juce::String& label = {}, int width = 96, const juce::StringArray& items = {});
    Section* section(const juce::String& title, juce::Colour c, int width, bool newRowAfter = false);

    plugin::KestrelProcessor& proc_;
    TouchFn touch_;
    FlowView flow_;
    std::vector<std::unique_ptr<juce::Component>> owned_;
};

class TimbreView final : public View {
public:
    TimbreView(plugin::KestrelProcessor& p, TouchFn t, int timbre);
    void refresh() override;

private:
    int t_;
    juce::Colour col_;
    Knob *ctrl1_ = nullptr, *ctrl2_ = nullptr, *lfo1Freq_ = nullptr, *lfo2Freq_ = nullptr, *unison_ = nullptr;
    Choice *dwgs_ = nullptr, *lfo1Note_ = nullptr, *lfo2Note_ = nullptr, *trigger_ = nullptr, *fegReset_ = nullptr, *aegReset_ = nullptr;
    EnvelopeView *feg_ = nullptr, *aeg_ = nullptr;
    juce::Label* disabledNote_ = nullptr;
};

// Virtual patch matrix (sources x destinations) for one timbre.
class RoutingMatrix final : public juce::Component {
public:
    RoutingMatrix(plugin::KestrelProcessor& p, int timbre) : proc_(p), t_(timbre) {}
    void paint(juce::Graphics&) override;

private:
    plugin::KestrelProcessor& proc_;
    int t_;
};

class ModView final : public View {
public:
    ModView(plugin::KestrelProcessor& p, TouchFn t);
    void refresh() override;
    void resized() override;

private:
    RoutingMatrix* matrix_[2] {};
    juce::Label* routes_[2] {};
};

class FxArpView final : public View {
public:
    FxArpView(plugin::KestrelProcessor& p, TouchFn t);
    void refresh() override;

private:
    Knob* delayTime_ = nullptr;
    Choice* delayNote_ = nullptr;
    std::vector<juce::TextButton*> steps_;
    std::vector<std::unique_ptr<juce::ButtonParameterAttachment>> stepAtt_;
};

class BandMeter final : public juce::Component {
public:
    explicit BandMeter(plugin::KestrelProcessor& p) : proc_(p) {}
    void paint(juce::Graphics&) override;

private:
    plugin::KestrelProcessor& proc_;
    float smooth_[16] {};
};

class VocoderView final : public View {
public:
    VocoderView(plugin::KestrelProcessor& p, TouchFn t);
    void refresh() override;

private:
    BandMeter* meter_ = nullptr;
    juce::TextButton* hold_ = nullptr;
    float preHoldSense_ = 40.0f;
};

class GlobalView final : public View {
public:
    GlobalView(plugin::KestrelProcessor& p, TouchFn t);
    void refresh() override;

private:
    juce::ComboBox* slot_ = nullptr;
    juce::Label* slotStatus_ = nullptr;
    juce::TextEditor* name_ = nullptr;
    juce::Label* saveStatus_ = nullptr;
    std::unique_ptr<juce::FileChooser> chooser_;
};

} // namespace kestrel::ui
