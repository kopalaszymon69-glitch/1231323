#include "ui/Widgets.h"

#include "params/Mapping.h"

namespace kestrel::ui {

namespace {
juce::String defaultLabel(int index) {
    juce::String n(paramInfo(index).name);
    if (n.startsWith("T1 ") || n.startsWith("T2 ")) n = n.substring(3);
    return n;
}
} // namespace

// ------------------------------------------------------------------ Knob
Knob::Knob(plugin::KestrelProcessor& p, int index, TouchFn touch, juce::Colour accent, const juce::String& label)
    : ParamControl(p, index, std::move(touch)) {
    label_ = label.isEmpty() ? defaultLabel(index) : label;
    slider_.setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag);
    slider_.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 60, 15);
    slider_.setColour(juce::Slider::rotarySliderFillColourId, accent);
    slider_.setRotaryParameters(juce::MathConstants<float>::pi * 1.25f, juce::MathConstants<float>::pi * 2.75f, true);
    slider_.setDoubleClickReturnValue(true, double(paramInfo(index).defV));
    slider_.setTooltip(juce::String(paramInfo(index).name) + "  [" + juce::String(paramInfo(index).id) + "]");
    // the display follows user gestures only (not host automation / attachment sync)
    slider_.onDragStart = [this] { if (touch_) touch_(index_); };
    slider_.onValueChange = [this] { if (touch_ && (slider_.isMouseButtonDown() || slider_.hasKeyboardFocus(true))) touch_(index_); };
    addAndMakeVisible(slider_);
    att_ = std::make_unique<juce::SliderParameterAttachment>(*p.param(index), slider_, nullptr);
}

void Knob::paint(juce::Graphics& g) {
    g.setColour(colours::print);
    g.setFont(KestrelLookAndFeel::labelFont(11.0f));
    g.drawFittedText(label_.toUpperCase(), getLocalBounds().removeFromTop(14), juce::Justification::centred, 1, 0.8f);
}

void Knob::resized() { slider_.setBounds(getLocalBounds().withTrimmedTop(14)); }

// ------------------------------------------------------------------ Choice
Choice::Choice(plugin::KestrelProcessor& p, int index, TouchFn touch, const juce::String& label, int width,
               const juce::StringArray& customItems)
    : ParamControl(p, index, std::move(touch)), width_(width) {
    label_ = label.isEmpty() ? defaultLabel(index) : label;
    const ParamInfo& info = paramInfo(index);
    if (!customItems.isEmpty()) box_.addItemList(customItems, 1);
    else if (info.choices != nullptr) for (int c = 0; c < info.numChoices; ++c) box_.addItem(info.choices[c], c + 1);
    else for (int v = int(info.minV); v <= int(info.maxV); ++v) box_.addItem(juce::String(v), v - int(info.minV) + 1);
    box_.setTooltip(juce::String(info.name) + "  [" + juce::String(info.id) + "]");
    box_.addMouseListener(this, false);
    box_.onChange = [this] { if (touch_ && juce::Time::getMillisecondCounter() - lastClick_ < 20000) touch_(index_); };
    addAndMakeVisible(box_);
    att_ = std::make_unique<juce::ComboBoxParameterAttachment>(*p.param(index), box_, nullptr);
}

void Choice::paint(juce::Graphics& g) {
    g.setColour(colours::print);
    g.setFont(KestrelLookAndFeel::labelFont(11.0f));
    g.drawFittedText(label_.toUpperCase(), getLocalBounds().removeFromTop(14), juce::Justification::centredLeft, 1, 0.8f);
}

void Choice::resized() { box_.setBounds(getLocalBounds().withTrimmedTop(16).withHeight(24)); }

// ------------------------------------------------------------------ Fader
Fader::Fader(plugin::KestrelProcessor& p, int index, TouchFn touch, juce::Colour accent, const juce::String& label)
    : ParamControl(p, index, std::move(touch)) {
    label_ = label;
    slider_.setSliderStyle(juce::Slider::LinearVertical);
    slider_.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 40, 15);
    slider_.setColour(juce::Slider::trackColourId, accent);
    slider_.setDoubleClickReturnValue(true, double(paramInfo(index).defV));
    slider_.setTooltip(juce::String(paramInfo(index).name));
    slider_.onDragStart = [this] { if (touch_) touch_(index_); };
    slider_.onValueChange = [this] { if (touch_ && slider_.isMouseButtonDown()) touch_(index_); };
    addAndMakeVisible(slider_);
    att_ = std::make_unique<juce::SliderParameterAttachment>(*p.param(index), slider_, nullptr);
}

void Fader::paint(juce::Graphics& g) {
    g.setColour(colours::print);
    g.setFont(KestrelLookAndFeel::labelFont(11.0f));
    g.drawFittedText(label_, getLocalBounds().removeFromTop(14), juce::Justification::centred, 1, 0.8f);
}

void Fader::resized() { slider_.setBounds(getLocalBounds().withTrimmedTop(14)); }

// ------------------------------------------------------------------ Section
juce::Point<int> Section::layoutSize(int maxWidth) const {
    int x = 0, rowH = 0, y = 0, widest = 0;
    for (const auto& it : items_) {
        if (x > 0 && x + it.w > maxWidth - 2 * kPad) { y += rowH + 4; x = 0; rowH = 0; }
        x += it.w + 4;
        rowH = std::max(rowH, it.h);
        widest = std::max(widest, x);
    }
    return { widest + 2 * kPad, y + rowH + kTitle + 2 * kPad };
}

void Section::resized() {
    int x = kPad, y = kTitle + kPad, rowH = 0;
    for (auto& it : items_) {
        if (x > kPad && x + it.w > getWidth() - kPad) { y += rowH + 4; x = kPad; rowH = 0; }
        it.c->setBounds(x, y, it.w, it.h);
        x += it.w + 4;
        rowH = std::max(rowH, it.h);
    }
}

void Section::paint(juce::Graphics& g) {
    auto r = getLocalBounds().toFloat().reduced(1.0f);
    g.setColour(colours::section);
    g.fillRoundedRectangle(r, 5.0f);
    g.setColour(colours::sectionEdge);
    g.drawRoundedRectangle(r, 5.0f, 1.0f);
    auto t = getLocalBounds().removeFromTop(kTitle).reduced(8, 0);
    g.setColour(accent_);
    g.fillRect(t.removeFromLeft(4).reduced(0, 5).toFloat());
    t.removeFromLeft(5);
    g.setColour(colours::print);
    g.setFont(KestrelLookAndFeel::labelFont(12.0f));
    g.drawText(title_.toUpperCase(), t, juce::Justification::centredLeft);
}

// ------------------------------------------------------------------ FlowView
void FlowView::resized() {
    // pass 1: assign rows; pass 2: give every section of a row the row's height
    struct Row { size_t first, last; int h; };
    std::vector<Row> rows;
    int x = 0;
    size_t start = 0;
    int rowH = 0;
    for (size_t i = 0; i < sections_.size(); ++i) {
        auto& e = sections_[i];
        const int w = e.width > 0 ? e.width : e.s->layoutSize(4000).x;
        if (x > 0 && x + w > getWidth()) { rows.push_back({ start, i, rowH }); start = i; x = 0; rowH = 0; }
        x += w + 6;
        rowH = std::max(rowH, e.s->layoutSize(w).y);
        if (e.breakAfter) { rows.push_back({ start, i + 1, rowH }); start = i + 1; x = 0; rowH = 0; }
    }
    if (start < sections_.size()) rows.push_back({ start, sections_.size(), rowH });
    int y = 0;
    for (const auto& r : rows) {
        int xx = 0;
        for (size_t i = r.first; i < r.last; ++i) {
            auto& e = sections_[i];
            const int w = e.width > 0 ? e.width : e.s->layoutSize(4000).x;
            e.s->setBounds(xx, y, w, r.h);
            xx += w + 6;
        }
        y += r.h + 6;
    }
}

// ------------------------------------------------------------------ Lcd
void Lcd::paint(juce::Graphics& g) {
    auto r = getLocalBounds().toFloat();
    g.setColour(juce::Colour(0xff121812));
    g.fillRoundedRectangle(r, 4.0f);
    r = r.reduced(3.0f);
    g.setColour(colours::lcdBg);
    g.fillRoundedRectangle(r, 3.0f);
    g.setColour(colours::lcdDim.withAlpha(0.35f));
    for (float y = r.getY() + 2.0f; y < r.getBottom(); y += 3.0f) g.drawHorizontalLine(int(y), r.getX(), r.getRight());
    g.setColour(colours::lcdText);
    const juce::Font mono(juce::FontOptions(juce::Font::getDefaultMonospacedFontName(), r.getHeight() * 0.36f, juce::Font::bold));
    g.setFont(mono);
    auto inner = r.reduced(8.0f, 3.0f);
    g.drawText(top_, inner.removeFromTop(inner.getHeight() * 0.5f), juce::Justification::centredLeft, true);
    g.setFont(mono.withHeight(r.getHeight() * 0.40f));
    g.drawText(bottom_, inner, juce::Justification::centredLeft, true);
}

// ------------------------------------------------------------------ EnvelopeView
void EnvelopeView::paint(juce::Graphics& g) {
    auto r = getLocalBounds().toFloat().reduced(2.0f);
    g.setColour(colours::lcdBg);
    g.fillRoundedRectangle(r, 3.0f);
    auto v = [&](int off) { return double(proc_.param(a_ + off)->convertFrom0to1(proc_.param(a_ + off)->getValue())); };
    const double A = mapping::egTimeSeconds(v(0)), D = mapping::egTimeSeconds(v(1)), S = mapping::egSustainLevel(v(2)), R = mapping::egTimeSeconds(v(3));
    // display on a compressed (sqrt) time axis so long and short segments are both visible
    auto tx = [](double s) { return std::sqrt(s); };
    const double hold = 0.25;
    const double total = tx(A) + tx(D) + tx(hold) + tx(R);
    const auto in = r.reduced(4.0f);
    auto X = [&](double t) { return in.getX() + float(t / total) * in.getWidth(); };
    auto Y = [&](double l) { return in.getBottom() - float(l) * in.getHeight(); };
    juce::Path p;
    p.startNewSubPath(X(0), Y(0));
    p.lineTo(X(tx(A)), Y(1));
    const double d0 = tx(A), d1 = d0 + tx(D);
    for (int i = 1; i <= 16; ++i) {
        const double f = double(i) / 16.0;
        p.lineTo(X(d0 + f * (d1 - d0)), Y(S + (1.0 - S) * std::exp(-6.9 * f)));
    }
    const double h1 = d1 + tx(hold);
    p.lineTo(X(h1), Y(S));
    for (int i = 1; i <= 16; ++i) {
        const double f = double(i) / 16.0;
        p.lineTo(X(h1 + f * tx(R)), Y(S * std::exp(-6.9 * f)));
    }
    g.setColour(col_);
    g.strokePath(p, juce::PathStrokeType(1.6f));
}

} // namespace kestrel::ui
