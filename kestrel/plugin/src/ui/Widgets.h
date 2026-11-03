#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>

#include <functional>
#include <memory>
#include <vector>

#include "PluginProcessor.h"
#include "ui/KestrelLookAndFeel.h"

namespace kestrel::ui {

using TouchFn = std::function<void(int paramIndex)>;

// Base for controls bound to one plug-in parameter.
class ParamControl : public juce::Component {
public:
    ParamControl(plugin::KestrelProcessor& p, int index, TouchFn touch) : proc_(p), index_(index), touch_(std::move(touch)) {}
    int paramIndex() const noexcept { return index_; }
    void setLabel(const juce::String& s) { if (label_ != s) { label_ = s; repaint(); } }
    const juce::String& label() const noexcept { return label_; }
    virtual int preferredWidth() const = 0;
    virtual int preferredHeight() const = 0;

protected:
    plugin::KestrelProcessor& proc_;
    int index_;
    TouchFn touch_;
    juce::String label_;
};

class Knob final : public ParamControl {
public:
    Knob(plugin::KestrelProcessor& p, int index, TouchFn touch, juce::Colour accent, const juce::String& label = {});
    void paint(juce::Graphics&) override;
    void resized() override;
    int preferredWidth() const override { return 54; }
    int preferredHeight() const override { return 86; }

private:
    juce::Slider slider_;
    std::unique_ptr<juce::SliderParameterAttachment> att_;
};

class Choice final : public ParamControl {
public:
    Choice(plugin::KestrelProcessor& p, int index, TouchFn touch, const juce::String& label = {}, int width = 96,
           const juce::StringArray& customItems = {});
    void paint(juce::Graphics&) override;
    void resized() override;
    int preferredWidth() const override { return width_; }
    int preferredHeight() const override { return 44; }
    juce::ComboBox& box() noexcept { return box_; }
    void mouseDown(const juce::MouseEvent&) override { lastClick_ = juce::Time::getMillisecondCounter(); }

private:
    int width_;
    juce::uint32 lastClick_ = 0;
    juce::ComboBox box_;
    std::unique_ptr<juce::ComboBoxParameterAttachment> att_;
};

class Fader final : public ParamControl {
public:
    Fader(plugin::KestrelProcessor& p, int index, TouchFn touch, juce::Colour accent, const juce::String& label);
    void paint(juce::Graphics&) override;
    void resized() override;
    int preferredWidth() const override { return 40; }
    int preferredHeight() const override { return 150; }

private:
    juce::Slider slider_;
    std::unique_ptr<juce::SliderParameterAttachment> att_;
};

// Titled panel section that flows its children left to right (wrapping).
class Section : public juce::Component {
public:
    explicit Section(const juce::String& title, juce::Colour accent = colours::accent) : title_(title), accent_(accent) {}
    void add(juce::Component* c, int w, int h) {
        addAndMakeVisible(c);
        items_.push_back({ c, w, h });
    }
    void addControl(ParamControl* c) { add(c, c->preferredWidth(), c->preferredHeight()); }
    // natural size for a given maximum content width
    juce::Point<int> layoutSize(int maxWidth) const;
    void paint(juce::Graphics&) override;
    void resized() override;
    void setTitle(const juce::String& t) { title_ = t; repaint(); }

private:
    struct Item { juce::Component* c; int w, h; };
    juce::String title_;
    juce::Colour accent_;
    std::vector<Item> items_;
    static constexpr int kPad = 6, kTitle = 18;
};

// Arranges sections in rows (simple flow with fixed row heights).
class FlowView : public juce::Component {
public:
    void addSection(Section* s, int width) { addAndMakeVisible(s); sections_.push_back({ s, width }); }
    void newRow() { if (!sections_.empty()) sections_.back().breakAfter = true; }
    void resized() override;

private:
    struct Entry { Section* s; int width; bool breakAfter = false; };
    std::vector<Entry> sections_;
};

// Hardware-style display: program name + last edited parameter and value.
class Lcd final : public juce::Component {
public:
    void setLines(const juce::String& top, const juce::String& bottom) {
        if (top != top_ || bottom != bottom_) { top_ = top; bottom_ = bottom; repaint(); }
    }
    void paint(juce::Graphics&) override;

private:
    juce::String top_, bottom_;
};

// ADSR preview drawn from the current parameter values (timing curve from Mapping.cpp).
class EnvelopeView final : public juce::Component {
public:
    EnvelopeView(plugin::KestrelProcessor& p, int attackIndex, juce::Colour c) : proc_(p), a_(attackIndex), col_(c) {}
    void paint(juce::Graphics&) override;

private:
    plugin::KestrelProcessor& proc_;
    int a_;
    juce::Colour col_;
};

} // namespace kestrel::ui
