#include "ui/KestrelLookAndFeel.h"

namespace kestrel::ui {

KestrelLookAndFeel::KestrelLookAndFeel() {
    setColour(juce::ComboBox::backgroundColourId, colours::knobBody);
    setColour(juce::ComboBox::textColourId, juce::Colour(0xffeae4d8));
    setColour(juce::ComboBox::outlineColourId, colours::sectionEdge);
    setColour(juce::ComboBox::arrowColourId, colours::accent);
    setColour(juce::PopupMenu::backgroundColourId, juce::Colour(0xff2f2d2a));
    setColour(juce::PopupMenu::textColourId, juce::Colour(0xffeae4d8));
    setColour(juce::PopupMenu::highlightedBackgroundColourId, colours::accent.withAlpha(0.85f));
    setColour(juce::PopupMenu::highlightedTextColourId, juce::Colours::black);
    setColour(juce::TextButton::buttonColourId, colours::knobCap);
    setColour(juce::TextButton::buttonOnColourId, colours::accent);
    setColour(juce::TextButton::textColourOffId, juce::Colour(0xffeae4d8));
    setColour(juce::TextButton::textColourOnId, juce::Colours::black);
    setColour(juce::Slider::textBoxTextColourId, colours::print);
    setColour(juce::Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);
    setColour(juce::Slider::textBoxBackgroundColourId, juce::Colours::transparentBlack);
    setColour(juce::Label::textColourId, colours::print);
    setColour(juce::TextEditor::backgroundColourId, colours::lcdBg);
    setColour(juce::TextEditor::textColourId, colours::lcdText);
    setColour(juce::TextEditor::outlineColourId, colours::sectionEdge);
    setColour(juce::TooltipWindow::backgroundColourId, juce::Colour(0xff2f2d2a));
    setColour(juce::TooltipWindow::textColourId, juce::Colour(0xffeae4d8));
}

juce::Font KestrelLookAndFeel::labelFont(float h, bool bold) {
    return juce::Font(juce::FontOptions(h, bold ? juce::Font::bold : juce::Font::plain));
}

void KestrelLookAndFeel::drawRotarySlider(juce::Graphics& g, int x, int y, int w, int h, float pos, float start, float end,
                                          juce::Slider& s) {
    const auto bounds = juce::Rectangle<float>(float(x), float(y), float(w), float(h)).reduced(2.0f);
    const float r = std::min(bounds.getWidth(), bounds.getHeight()) * 0.5f;
    const auto c = bounds.getCentre();
    const juce::Colour acc = s.findColour(juce::Slider::rotarySliderFillColourId);
    // scale ticks
    g.setColour(colours::printSoft.withAlpha(0.8f));
    for (int i = 0; i <= 10; ++i) {
        const float a = start + (end - start) * float(i) / 10.0f;
        const juce::Point<float> p1 = c.getPointOnCircumference(r * 0.98f, a), p2 = c.getPointOnCircumference(r * 0.86f, a);
        g.drawLine({ p1, p2 }, i == 0 || i == 10 || i == 5 ? 1.4f : 0.8f);
    }
    // value arc (from centre for bipolar parameters)
    const bool bipolar = s.getMinimum() < 0.0 && s.getMaximum() > 0.0;
    const float zero = bipolar ? start + (end - start) * float((0.0 - s.getMinimum()) / (s.getMaximum() - s.getMinimum())) : start;
    const float val = start + (end - start) * pos;
    juce::Path arc;
    arc.addCentredArc(c.x, c.y, r * 0.78f, r * 0.78f, 0.0f, std::min(zero, val), std::max(zero, val), true);
    g.setColour(acc);
    g.strokePath(arc, juce::PathStrokeType(2.6f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    // body
    const float br = r * 0.66f;
    juce::ColourGradient body(colours::knobCap.brighter(0.25f), c.x - br, c.y - br, colours::knobBody, c.x + br, c.y + br, false);
    g.setGradientFill(body);
    g.fillEllipse(c.x - br, c.y - br, br * 2.0f, br * 2.0f);
    g.setColour(juce::Colours::black.withAlpha(0.6f));
    g.drawEllipse(c.x - br, c.y - br, br * 2.0f, br * 2.0f, 1.0f);
    // knurled ring
    g.setColour(juce::Colours::white.withAlpha(0.07f));
    for (int i = 0; i < 24; ++i) {
        const float a = juce::MathConstants<float>::twoPi * float(i) / 24.0f;
        g.drawLine({ c.getPointOnCircumference(br * 0.72f, a), c.getPointOnCircumference(br * 0.95f, a) }, 1.0f);
    }
    // pointer
    g.setColour(juce::Colour(0xfff2ede2));
    g.drawLine({ c.getPointOnCircumference(br * 0.2f, val), c.getPointOnCircumference(br * 0.92f, val) }, 2.2f);
}

void KestrelLookAndFeel::drawLinearSlider(juce::Graphics& g, int x, int y, int w, int h, float pos, float, float,
                                          juce::Slider::SliderStyle style, juce::Slider& s) {
    const auto acc = s.findColour(juce::Slider::trackColourId);
    if (style == juce::Slider::LinearVertical) {
        const float cx = float(x) + float(w) * 0.5f;
        g.setColour(colours::knobBody);
        g.fillRoundedRectangle(cx - 3.0f, float(y), 6.0f, float(h), 3.0f);
        g.setColour(acc);
        g.fillRoundedRectangle(cx - 3.0f, pos, 6.0f, float(y + h) - pos, 3.0f);
        g.setColour(juce::Colour(0xffd8d2c6));
        g.fillRoundedRectangle(cx - 9.0f, pos - 4.0f, 18.0f, 8.0f, 2.0f);
        g.setColour(colours::print);
        g.drawLine(cx - 7.0f, pos, cx + 7.0f, pos, 1.2f);
    } else {
        LookAndFeel_V4::drawLinearSlider(g, x, y, w, h, pos, 0, 0, style, s);
    }
}

void KestrelLookAndFeel::drawComboBox(juce::Graphics& g, int w, int h, bool, int, int, int, int, juce::ComboBox& box) {
    const auto r = juce::Rectangle<float>(0.0f, 0.0f, float(w), float(h)).reduced(0.5f);
    g.setColour(box.findColour(juce::ComboBox::backgroundColourId));
    g.fillRoundedRectangle(r, 3.0f);
    g.setColour(box.findColour(juce::ComboBox::outlineColourId));
    g.drawRoundedRectangle(r, 3.0f, 1.0f);
    juce::Path tri;
    const float ax = float(w) - 10.0f, ay = float(h) * 0.5f;
    tri.addTriangle(ax - 4.0f, ay - 2.0f, ax + 4.0f, ay - 2.0f, ax, ay + 3.0f);
    g.setColour(box.findColour(juce::ComboBox::arrowColourId));
    g.fillPath(tri);
}

juce::Font KestrelLookAndFeel::getComboBoxFont(juce::ComboBox& b) { return labelFont(std::min(13.0f, float(b.getHeight()) * 0.62f), false); }

void KestrelLookAndFeel::positionComboBoxText(juce::ComboBox& box, juce::Label& label) {
    label.setBounds(3, 1, box.getWidth() - 18, box.getHeight() - 2);
    label.setFont(getComboBoxFont(box));
}

void KestrelLookAndFeel::drawButtonBackground(juce::Graphics& g, juce::Button& b, const juce::Colour& base, bool over, bool down) {
    auto r = b.getLocalBounds().toFloat().reduced(0.5f);
    auto c = b.getToggleState() ? b.findColour(juce::TextButton::buttonOnColourId) : base;
    if (over) c = c.brighter(0.12f);
    if (down) c = c.darker(0.2f);
    g.setColour(c);
    g.fillRoundedRectangle(r, 3.0f);
    g.setColour(colours::sectionEdge);
    g.drawRoundedRectangle(r, 3.0f, 1.0f);
}

juce::Font KestrelLookAndFeel::getTextButtonFont(juce::TextButton&, int h) { return labelFont(std::min(13.0f, float(h) * 0.55f)); }

juce::Label* KestrelLookAndFeel::createSliderTextBox(juce::Slider& s) {
    auto* l = LookAndFeel_V4::createSliderTextBox(s);
    l->setFont(labelFont(11.5f, false));
    l->setColour(juce::Label::textColourId, colours::print);
    l->setColour(juce::Label::outlineWhenEditingColourId, colours::accent);
    l->setColour(juce::TextEditor::backgroundColourId, juce::Colour(0xffeae4d8));
    l->setColour(juce::TextEditor::textColourId, colours::print);
    return l;
}

} // namespace kestrel::ui
