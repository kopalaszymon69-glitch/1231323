// kestrel_snapshot — renders every editor view to PNG (offscreen) for review / docs.
//   kestrel_snapshot <outdir> [programIndex] [scale]
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>

#include "PluginEditor.h"
#include "PluginProcessor.h"

int main(int argc, char** argv) {
    juce::ScopedJuceInitialiser_GUI init;
    const juce::File out(argc > 1 ? juce::String(argv[1]) : juce::String("."));
    out.createDirectory();
    const int prog = argc > 2 ? juce::String(argv[2]).getIntValue() : 0;
    const float scale = argc > 3 ? juce::String(argv[3]).getFloatValue() : 1.0f;
    kestrel::plugin::KestrelProcessor proc;
    proc.prepareToPlay(48000.0, 512);
    if (prog > 0 && prog < proc.getNumPrograms()) proc.setCurrentProgram(prog);
    std::unique_ptr<kestrel::plugin::KestrelEditor> ed(static_cast<kestrel::plugin::KestrelEditor*>(proc.createEditor()));
    ed->setSize(int(1200 * scale), int(720 * scale));
    // program menu summary: the program box holds every program, grouped into section submenus
    std::function<juce::ComboBox*(juce::Component&)> findProgramBox = [&](juce::Component& c) -> juce::ComboBox* {
        if (auto* cb = dynamic_cast<juce::ComboBox*>(&c); cb != nullptr && cb->getNumItems() == proc.getNumPrograms()) return cb;
        for (auto* child : c.getChildren())
            if (auto* r = findProgramBox(*child)) return r;
        return nullptr;
    };
    if (auto* box = findProgramBox(*ed)) {
        int subMenus = 0;
        for (juce::PopupMenu::MenuItemIterator it(*box->getRootMenu()); it.next();)
            if (it.getItem().subMenu != nullptr) ++subMenus;
        std::printf("program menu: %d programs in %d sections, selected '%s'\n", box->getNumItems(), subMenus,
                    box->getText().toRawUTF8());
    } else {
        std::printf("program menu: not found\n");
    }
    const char* names[6] = { "timbre1", "timbre2", "modulation", "fx_arp", "vocoder", "global" };
    for (int v = 0; v < 6; ++v) {
        ed->showView(v);
        auto img = ed->createComponentSnapshot(ed->getLocalBounds(), true, 1.0f);
        juce::PNGImageFormat png;
        auto f = out.getChildFile(juce::String("ui_") + names[v] + ".png");
        f.deleteFile();
        juce::FileOutputStream os(f);
        png.writeImageToStream(img, os);
        std::printf("wrote %s\n", f.getFullPathName().toRawUTF8());
    }
    ed.reset();
    return 0;
}
