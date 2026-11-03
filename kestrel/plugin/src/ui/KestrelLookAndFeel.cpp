#include "ui/KestrelLookAndFeel.h"

#include <map>

#include "KestrelFontData.h"

namespace kestrel::ui {

// ================================================================== fonts
namespace {
struct Faces {
    juce::Typeface::Ptr printBold, printRegular, text, textBold, logo, lcd;
    Faces() {
        auto load = [](const char* data, int size) { return juce::Typeface::createSystemTypefaceFor(data, size_t(size)); };
        printBold = load(KestrelFontData::BigShouldersBold_ttf, KestrelFontData::BigShouldersBold_ttfSize);
        printRegular = load(KestrelFontData::BigShouldersRegular_ttf, KestrelFontData::BigShouldersRegular_ttfSize);
        text = load(KestrelFontData::WorkSansRegular_ttf, KestrelFontData::WorkSansRegular_ttfSize);
        textBold = load(KestrelFontData::WorkSansBold_ttf, KestrelFontData::WorkSansBold_ttfSize);
        logo = load(KestrelFontData::TekturMedium_ttf, KestrelFontData::TekturMedium_ttfSize);
        lcd = load(KestrelFontData::SilkscreenRegular_ttf, KestrelFontData::SilkscreenRegular_ttfSize);
    }
};
const Faces& faces() {
    static const Faces f;
    return f;
}
juce::Font make(const juce::Typeface::Ptr& t, float h) { return juce::Font(juce::FontOptions(t).withHeight(h)); }
} // namespace

namespace fonts {
juce::Font print(float h) { return make(faces().printBold, h).withExtraKerningFactor(0.04f); }
juce::Font printLight(float h) { return make(faces().printRegular, h).withExtraKerningFactor(0.03f); }
juce::Font text(float h, bool bold) { return make(bold ? faces().textBold : faces().text, h); }
juce::Font logo(float h) { return make(faces().logo, h); }
juce::Font lcd(float h) { return make(faces().lcd, h); }
} // namespace fonts

// ================================================================== textures
namespace textures {
const juce::Image& brushedPanel(int w, int h, juce::Colour base) {
    static std::map<juce::uint64, juce::Image> cache;
    const juce::uint64 key = (juce::uint64(w) << 40) ^ (juce::uint64(h) << 20) ^ base.getARGB();
    auto it = cache.find(key);
    if (it != cache.end()) return it->second;
    juce::Image img(juce::Image::RGB, w, h, false);
    juce::Image::BitmapData bd(img, juce::Image::BitmapData::writeOnly);
    juce::Random rnd(0x5eed);
    std::vector<float> streak(static_cast<size_t>(h));
    for (auto& s : streak) s = rnd.nextFloat() * 2.0f - 1.0f;
    for (int y = 0; y < h; ++y) {
        const float vert = 0.06f * (0.5f - float(y) / float(h)); // light from above
        float run = streak[size_t(y)] * 0.02f;
        for (int x = 0; x < w; ++x) {
            run = run * 0.985f + (rnd.nextFloat() - 0.5f) * 0.006f; // horizontal brushing
            const float n = (rnd.nextFloat() - 0.5f) * 0.035f;
            const float k = 1.0f + vert + run + n;
            bd.setPixelColour(x, y, base.withMultipliedBrightness(juce::jlimit(0.6f, 1.4f, k)));
        }
    }
    return cache.emplace(key, img).first->second;
}

const juce::Image& wood(int w, int h) {
    static std::map<juce::uint64, juce::Image> cache;
    const juce::uint64 key = (juce::uint64(w) << 32) | juce::uint64(h);
    auto it = cache.find(key);
    if (it != cache.end()) return it->second;
    juce::Image img(juce::Image::RGB, w, h, false);
    juce::Image::BitmapData bd(img, juce::Image::BitmapData::writeOnly);
    juce::Random rnd(0xa11d);
    const float f1 = 0.21f + rnd.nextFloat() * 0.05f, f2 = 0.53f, ph = rnd.nextFloat() * 6.0f;
    for (int y = 0; y < h; ++y) {
        for (int x = 0; x < w; ++x) {
            const float wob = std::sin(float(y) * 0.011f + float(x) * 0.07f) * 3.0f + std::sin(float(y) * 0.0037f) * 6.0f;
            const float g = std::sin((float(x) + wob) * f1 + ph) * 0.5f + std::sin((float(x) + wob * 0.5f) * f2) * 0.25f;
            const float ring = std::pow(std::fabs(std::sin((float(x) + wob) * 0.09f)), 6.0f);
            const float n = (rnd.nextFloat() - 0.5f) * 0.06f;
            const float t = juce::jlimit(0.0f, 1.0f, 0.55f + 0.25f * g - 0.35f * ring + n);
            auto c = colours::woodA.interpolatedWith(colours::woodB, t);
            const float edge = std::sin(juce::MathConstants<float>::pi * (float(x) + 0.5f) / float(w)); // rounded cheek
            bd.setPixelColour(x, y, c.withMultipliedBrightness(0.62f + 0.48f * edge));
        }
    }
    return cache.emplace(key, img).first->second;
}
} // namespace textures

// ================================================================== drawing helpers
namespace draw {
void embossedText(juce::Graphics& g, const juce::String& s, juce::Rectangle<float> r, juce::Justification j, juce::Colour ink, float hl) {
    g.setColour(juce::Colours::white.withAlpha(hl));
    g.drawText(s, r.translated(0.0f, 1.0f), j, false);
    g.setColour(ink);
    g.drawText(s, r, j, false);
}

void screw(juce::Graphics& g, juce::Point<float> c, float r, float angle) {
    g.setColour(juce::Colours::black.withAlpha(0.35f));
    g.fillEllipse(c.x - r + 0.8f, c.y - r + 1.2f, 2 * r, 2 * r);
    juce::ColourGradient grad(juce::Colour(0xffe8e4dc), c.x - r * 0.6f, c.y - r * 0.6f, juce::Colour(0xff6b6760), c.x + r, c.y + r, true);
    g.setGradientFill(grad);
    g.fillEllipse(c.x - r, c.y - r, 2 * r, 2 * r);
    g.setColour(juce::Colours::black.withAlpha(0.5f));
    g.drawEllipse(c.x - r, c.y - r, 2 * r, 2 * r, 0.7f);
    for (float a : { angle, angle + juce::MathConstants<float>::halfPi }) {
        const auto d = juce::Point<float>(std::cos(a), std::sin(a)) * (r * 0.72f);
        g.setColour(juce::Colours::black.withAlpha(0.65f));
        g.drawLine({ c - d, c + d }, 1.4f);
        g.setColour(juce::Colours::white.withAlpha(0.35f));
        g.drawLine({ c - d + juce::Point<float>(0.5f, 0.8f), c + d + juce::Point<float>(0.5f, 0.8f) }, 0.6f);
    }
}

void inset(juce::Graphics& g, juce::Rectangle<float> r, float corner, float depth) {
    // dark rim top-left, light rim bottom-right -> reads as a recess
    juce::Path p;
    p.addRoundedRectangle(r, corner);
    g.saveState();
    g.reduceClipRegion(p);
    for (int i = 0; i < 3; ++i) {
        const float a = 0.22f * depth / float(i + 1);
        g.setColour(juce::Colours::black.withAlpha(a));
        g.drawRoundedRectangle(r.translated(float(i) * 0.8f + 0.8f, float(i) * 0.8f + 0.8f).expanded(1.0f), corner, 1.6f);
    }
    g.restoreState();
    g.setColour(juce::Colours::black.withAlpha(0.45f * depth));
    g.drawRoundedRectangle(r, corner, 0.8f);
    g.setColour(juce::Colours::white.withAlpha(0.22f * depth));
    g.drawLine(r.getX() + corner, r.getBottom() + 0.8f, r.getRight() - corner, r.getBottom() + 0.8f, 0.8f);
}

void led(juce::Graphics& g, juce::Point<float> c, float r, juce::Colour col, bool on) {
    if (on) {
        for (int i = 3; i > 0; --i) {
            g.setColour(col.withAlpha(0.10f * float(4 - i)));
            const float rr = r + float(i) * 1.6f;
            g.fillEllipse(c.x - rr, c.y - rr, 2 * rr, 2 * rr);
        }
    }
    juce::ColourGradient grad(on ? col.brighter(0.8f) : col.darker(1.6f), c.x - r * 0.4f, c.y - r * 0.4f,
                              on ? col : col.darker(2.4f), c.x + r, c.y + r, true);
    g.setGradientFill(grad);
    g.fillEllipse(c.x - r, c.y - r, 2 * r, 2 * r);
    g.setColour(juce::Colours::black.withAlpha(0.6f));
    g.drawEllipse(c.x - r, c.y - r, 2 * r, 2 * r, 0.6f);
}
} // namespace draw

// ================================================================== look and feel
KestrelLookAndFeel::KestrelLookAndFeel() {
    setColour(juce::ComboBox::backgroundColourId, colours::knobBody);
    setColour(juce::ComboBox::textColourId, juce::Colour(0xffeee8db));
    setColour(juce::ComboBox::outlineColourId, colours::sectionEdge);
    setColour(juce::ComboBox::arrowColourId, colours::accent);
    setColour(juce::PopupMenu::backgroundColourId, juce::Colour(0xff2a2826));
    setColour(juce::PopupMenu::textColourId, juce::Colour(0xffeee8db));
    setColour(juce::PopupMenu::highlightedBackgroundColourId, colours::accent.withAlpha(0.9f));
    setColour(juce::PopupMenu::highlightedTextColourId, juce::Colours::black);
    setColour(juce::TextButton::buttonColourId, colours::knobCap);
    setColour(juce::TextButton::buttonOnColourId, colours::knobCap);
    setColour(juce::TextButton::textColourOffId, juce::Colour(0xffe6dfd1));
    setColour(juce::TextButton::textColourOnId, juce::Colour(0xfffff3df));
    setColour(juce::Slider::textBoxTextColourId, colours::print);
    setColour(juce::Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);
    setColour(juce::Slider::textBoxBackgroundColourId, juce::Colours::transparentBlack);
    setColour(juce::Label::textColourId, colours::print);
    setColour(juce::TextEditor::backgroundColourId, colours::lcdBg);
    setColour(juce::TextEditor::textColourId, colours::lcdText);
    setColour(juce::TextEditor::outlineColourId, colours::sectionEdge);
    setColour(juce::TextEditor::highlightColourId, colours::accent.withAlpha(0.5f));
    setColour(juce::CaretComponent::caretColourId, colours::lcdText);
}

juce::Typeface::Ptr KestrelLookAndFeel::getTypefaceForFont(const juce::Font& f) {
    // JUCE's default UI text (menus, text editors, value boxes) uses Work Sans
    if (f.getTypefaceName() == juce::Font::getDefaultSansSerifFontName())
        return f.isBold() ? faces().textBold : faces().text;
    return LookAndFeel_V4::getTypefaceForFont(f);
}

void KestrelLookAndFeel::drawRotarySlider(juce::Graphics& g, int x, int y, int w, int h, float pos, float start, float end,
                                          juce::Slider& s) {
    const auto bounds = juce::Rectangle<float>(float(x), float(y), float(w), float(h)).reduced(1.0f);
    const float r = std::min(bounds.getWidth(), bounds.getHeight()) * 0.5f;
    const auto c = bounds.getCentre();
    const juce::Colour acc = s.findColour(juce::Slider::rotarySliderFillColourId);
    const float alpha = s.isEnabled() ? 1.0f : 0.45f;

    // printed scale
    g.setColour(colours::print.withAlpha(0.75f * alpha));
    for (int i = 0; i <= 10; ++i) {
        const float a = start + (end - start) * float(i) / 10.0f;
        const bool major = i == 0 || i == 5 || i == 10;
        g.drawLine({ c.getPointOnCircumference(r * 0.99f, a), c.getPointOnCircumference(r * (major ? 0.82f : 0.88f), a) }, major ? 1.3f : 0.8f);
    }
    // value ring (LED-like), from centre for bipolar parameters
    const bool bipolar = s.getMinimum() < 0.0 && s.getMaximum() > 0.0;
    const float zero = bipolar ? start + (end - start) * float((0.0 - s.getMinimum()) / (s.getMaximum() - s.getMinimum())) : start;
    const float val = start + (end - start) * pos;
    juce::Path track, arc;
    track.addCentredArc(c.x, c.y, r * 0.76f, r * 0.76f, 0.0f, start, end, true);
    g.setColour(juce::Colours::black.withAlpha(0.22f * alpha));
    g.strokePath(track, juce::PathStrokeType(2.4f));
    arc.addCentredArc(c.x, c.y, r * 0.76f, r * 0.76f, 0.0f, std::min(zero, val), std::max(zero, val), true);
    g.setColour(acc.withAlpha(0.35f * alpha));
    g.strokePath(arc, juce::PathStrokeType(4.2f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    g.setColour(acc.brighter(0.25f).withAlpha(alpha));
    g.strokePath(arc, juce::PathStrokeType(2.0f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

    // soft drop shadow (stacked translucent ellipses)
    const float sr = r * 0.64f;
    for (int i = 4; i > 0; --i) {
        g.setColour(juce::Colours::black.withAlpha(0.07f));
        const float e = float(i) * 1.1f;
        g.fillEllipse(c.x - sr - e + 1.5f, c.y - sr - e + 2.8f, 2 * (sr + e), 2 * (sr + e));
    }
    // skirt
    juce::ColourGradient skirt(juce::Colour(0xff4b4843), c.x - sr, c.y - sr, juce::Colour(0xff111010), c.x + sr, c.y + sr, false);
    g.setGradientFill(skirt);
    g.fillEllipse(c.x - sr, c.y - sr, 2 * sr, 2 * sr);
    // knurling
    g.setColour(juce::Colours::white.withAlpha(0.06f));
    for (int i = 0; i < 36; ++i) {
        const float a = juce::MathConstants<float>::twoPi * float(i) / 36.0f;
        g.drawLine({ c.getPointOnCircumference(sr * 0.80f, a), c.getPointOnCircumference(sr * 0.98f, a) }, 0.8f);
    }
    // cap
    const float cr = sr * 0.76f;
    juce::ColourGradient cap(juce::Colour(0xff6a665f), c.x - cr * 0.7f, c.y - cr * 0.9f, juce::Colour(0xff201e1c), c.x + cr * 0.6f, c.y + cr, true);
    g.setGradientFill(cap);
    g.fillEllipse(c.x - cr, c.y - cr, 2 * cr, 2 * cr);
    g.setColour(juce::Colours::black.withAlpha(0.7f));
    g.drawEllipse(c.x - cr, c.y - cr, 2 * cr, 2 * cr, 0.8f);
    // specular highlight
    juce::ColourGradient spec(juce::Colours::white.withAlpha(0.28f), c.x - cr * 0.35f, c.y - cr * 0.75f,
                              juce::Colours::white.withAlpha(0.0f), c.x - cr * 0.35f, c.y + cr * 0.1f, false);
    g.setGradientFill(spec);
    g.fillEllipse(c.x - cr * 0.85f, c.y - cr * 0.95f, cr * 1.5f, cr * 1.0f);
    // pointer
    const auto p1 = c.getPointOnCircumference(cr * 0.25f, val), p2 = c.getPointOnCircumference(sr * 0.93f, val);
    g.setColour(juce::Colours::black.withAlpha(0.5f));
    g.drawLine({ p1.translated(0.6f, 0.8f), p2.translated(0.6f, 0.8f) }, 2.6f);
    g.setColour(juce::Colour(0xfff5efe2).withAlpha(alpha));
    g.drawLine({ p1, p2 }, 2.0f);
}

void KestrelLookAndFeel::drawLinearSlider(juce::Graphics& g, int x, int y, int w, int h, float pos, float, float,
                                          juce::Slider::SliderStyle style, juce::Slider& s) {
    const auto acc = s.findColour(juce::Slider::trackColourId);
    if (style != juce::Slider::LinearVertical) {
        LookAndFeel_V4::drawLinearSlider(g, x, y, w, h, pos, 0, 0, style, s);
        return;
    }
    const float cx = float(x) + float(w) * 0.5f;
    const auto slot = juce::Rectangle<float>(cx - 3.0f, float(y), 6.0f, float(h));
    g.setColour(juce::Colour(0xff151413));
    g.fillRoundedRectangle(slot, 3.0f);
    draw::inset(g, slot, 3.0f, 1.2f);
    g.setColour(acc.withAlpha(0.8f));
    g.fillRoundedRectangle(cx - 1.5f, pos, 3.0f, float(y + h) - pos, 1.5f);
    // fader cap with shadow
    const auto capR = juce::Rectangle<float>(cx - 10.0f, pos - 6.0f, 20.0f, 12.0f);
    g.setColour(juce::Colours::black.withAlpha(0.35f));
    g.fillRoundedRectangle(capR.translated(1.0f, 2.0f), 2.0f);
    juce::ColourGradient cg(juce::Colour(0xff57534c), capR.getX(), capR.getY(), juce::Colour(0xff1d1b19), capR.getX(), capR.getBottom(), false);
    g.setGradientFill(cg);
    g.fillRoundedRectangle(capR, 2.0f);
    g.setColour(juce::Colour(0xfff0eadc));
    g.drawLine(capR.getX() + 3.0f, pos, capR.getRight() - 3.0f, pos, 1.4f);
}

void KestrelLookAndFeel::drawComboBox(juce::Graphics& g, int w, int h, bool, int, int, int, int, juce::ComboBox& box) {
    const auto r = juce::Rectangle<float>(0.0f, 0.0f, float(w), float(h)).reduced(1.0f);
    juce::ColourGradient bg(juce::Colour(0xff121110), 0.0f, r.getY(), juce::Colour(0xff2b2926), 0.0f, r.getBottom(), false);
    g.setGradientFill(bg);
    g.fillRoundedRectangle(r, 3.0f);
    draw::inset(g, r, 3.0f, 1.0f);
    juce::Path tri;
    const float ax = float(w) - 9.0f, ay = float(h) * 0.5f;
    tri.addTriangle(ax - 3.5f, ay - 1.5f, ax + 3.5f, ay - 1.5f, ax, ay + 2.5f);
    g.setColour(box.findColour(juce::ComboBox::arrowColourId).withAlpha(box.isEnabled() ? 1.0f : 0.4f));
    g.fillPath(tri);
}

juce::Font KestrelLookAndFeel::getComboBoxFont(juce::ComboBox& b) { return fonts::text(std::min(13.0f, float(b.getHeight()) * 0.56f)); }

void KestrelLookAndFeel::positionComboBoxText(juce::ComboBox& box, juce::Label& label) {
    label.setBounds(4, 1, box.getWidth() - 18, box.getHeight() - 2);
    label.setFont(getComboBoxFont(box));
    label.setColour(juce::Label::textColourId, box.findColour(juce::ComboBox::textColourId).withAlpha(box.isEnabled() ? 1.0f : 0.4f));
}

juce::Font KestrelLookAndFeel::getPopupMenuFont() { return fonts::text(14.0f); }

void KestrelLookAndFeel::drawButtonBackground(juce::Graphics& g, juce::Button& b, const juce::Colour& base, bool over, bool down) {
    const bool on = b.getToggleState();
    auto r = b.getLocalBounds().toFloat().reduced(1.5f);
    const float press = (down || on) ? 1.0f : 0.0f;
    // shadow
    g.setColour(juce::Colours::black.withAlpha(0.35f - 0.15f * press));
    g.fillRoundedRectangle(r.translated(0.8f, 2.0f - press), 4.0f);
    r = r.translated(0.0f, press);
    // rubber key
    auto top = base.brighter(over ? 0.35f : 0.22f), bottom = base.darker(0.55f);
    if (on) { top = top.darker(0.15f); bottom = bottom.darker(0.15f); }
    juce::ColourGradient kg(top, 0.0f, r.getY(), bottom, 0.0f, r.getBottom(), false);
    g.setGradientFill(kg);
    g.fillRoundedRectangle(r, 4.0f);
    g.setColour(juce::Colours::white.withAlpha(0.12f));
    g.drawLine(r.getX() + 4.0f, r.getY() + 1.0f, r.getRight() - 4.0f, r.getY() + 1.0f, 1.0f);
    g.setColour(juce::Colours::black.withAlpha(0.7f));
    g.drawRoundedRectangle(r, 4.0f, 0.9f);
    // status LED on toggle-able keys
    if (b.getClickingTogglesState() || b.getProperties().contains("led"))
        draw::led(g, { r.getX() + 9.0f, r.getCentreY() }, 3.0f,
                  b.getProperties().contains("ledColour") ? juce::Colour(juce::uint32(int(b.getProperties()["ledColour"]))) : colours::accent, on);
}

void KestrelLookAndFeel::drawButtonText(juce::Graphics& g, juce::TextButton& b, bool, bool down) {
    const bool hasLed = b.getClickingTogglesState() || b.getProperties().contains("led");
    auto r = b.getLocalBounds().toFloat().reduced(2.0f).translated(0.0f, (down || b.getToggleState()) ? 1.0f : 0.0f);
    if (hasLed) r.removeFromLeft(14.0f);
    g.setFont(getTextButtonFont(b, b.getHeight()));
    g.setColour(b.findColour(b.getToggleState() ? juce::TextButton::textColourOnId : juce::TextButton::textColourOffId)
                    .withAlpha(b.isEnabled() ? 1.0f : 0.4f));
    g.drawText(b.getButtonText(), r, juce::Justification::centred, false);
}

juce::Font KestrelLookAndFeel::getTextButtonFont(juce::TextButton&, int h) { return fonts::print(std::min(15.0f, float(h) * 0.62f)); }

juce::Label* KestrelLookAndFeel::createSliderTextBox(juce::Slider& s) {
    auto* l = LookAndFeel_V4::createSliderTextBox(s);
    l->setFont(fonts::text(11.5f, true));
    l->setColour(juce::Label::textColourId, colours::print.withAlpha(0.85f));
    l->setColour(juce::Label::outlineWhenEditingColourId, colours::accent);
    l->setColour(juce::TextEditor::backgroundColourId, juce::Colour(0xffefe9dc));
    l->setColour(juce::TextEditor::textColourId, colours::print);
    return l;
}

void KestrelLookAndFeel::drawTooltip(juce::Graphics& g, const juce::String& text, int w, int h) {
    g.setColour(juce::Colour(0xf0262422));
    g.fillRoundedRectangle(0.0f, 0.0f, float(w), float(h), 4.0f);
    g.setColour(colours::accent.withAlpha(0.6f));
    g.drawRoundedRectangle(0.5f, 0.5f, float(w) - 1.0f, float(h) - 1.0f, 4.0f, 1.0f);
    g.setColour(juce::Colour(0xffeee8db));
    g.setFont(fonts::text(13.0f));
    g.drawFittedText(text, juce::Rectangle<int>(w, h).reduced(6, 2), juce::Justification::centredLeft, 3);
}

} // namespace kestrel::ui
