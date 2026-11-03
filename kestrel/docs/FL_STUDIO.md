# Using Kestrel VA in FL Studio

> The routing steps below follow Image-Line's FL Studio manual (links at the end). They have
> **not** been tested in FL Studio during development, because FL Studio could not be run in
> the build environment. The plug-ins themselves were checked by loading the built VST3
> bundles through a VST3 host layer on Linux and Windows (see `docs/STATUS.md`).

## 1. As an instrument (synth programs)

1. Copy `Kestrel VA.vst3` to `C:\Program Files\Common Files\VST3\` and rescan plug-ins
   (*Options → Manage plugins → Find plugins*).
2. Add **Kestrel VA** to the Channel Rack and play it from the Piano roll or a MIDI keyboard.
3. The 66 factory programs appear in FL Studio's preset menu (VST3 program list) and in the
   plug-in's own program selector, which groups them by category.
4. **Latency:** at 44.1/48 kHz with Oversampling = Auto (2×), Kestrel reports 25 samples. FL
   Studio's plug-in delay compensation uses this value, and the wrapper's *Info* field shows
   it. At 88.2 kHz and above, Auto uses 1× (0 samples).
5. **Tempo sync:** with GLOBAL *Clock = Auto* (default), the arpeggiator follows FL Studio's
   tempo and bar grid while the transport plays. Synced LFOs and the delay follow the host
   tempo. When the transport stops, the arpeggiator releases its notes. FL Studio also sends
   All Notes Off on stop by default (*Send All Notes Off when playback stops* in the wrapper).
6. **Controllers:** mod wheel, pitch bend and sustain (CC#64; switchable in GLOBAL) work as
   usual. With GLOBAL *Receive Panel CCs* = On, hardware-style CCs (e.g. CC#74 cutoff,
   CC#71 resonance, CC#95 timbre select; owner's manual p.56) also control parameters, and the
   plug-in's automation values follow.

## 2. Vocoder and OSC1 *Audio In*: feeding audio into Kestrel

Kestrel's input bus is stereo: **left = AUDIO IN 1** (vocoder modulator, mic), **right =
AUDIO IN 2** (vocoder INST carrier, OSC1 Audio In balance 0). With a mono vocal sent
dual-mono, both inputs receive it. Keep the vocoder *Inst Level* at 0 unless you want the
vocal also used as a carrier.

### Recommended: the FX build on a Mixer insert (documented FL Studio route)

FL Studio feeds audio to *effects* on Mixer inserts, while notes go to effects through a
**MIDI Out** channel.

1. Put your vocal or modulator (audio clip, or a live mic input) on a Mixer track, for example
   insert 5. Add **Kestrel VA FX** to an effect slot of that track, or of a dedicated track that
   the vocal is routed to.
2. If the carrier should come from another source (an external synth for *Inst*), route that
   track to the Kestrel track with *Sidechain to this track*. In the Kestrel VA FX wrapper,
   under *Processing → Connections*, use *Auto map inputs* or assign the inputs manually, so
   that the vocal reaches input L (AUDIO IN 1) and the carrier reaches input R (AUDIO IN 2).
3. Add a **MIDI Out** channel to the Channel Rack and set its *Port* (for example 1). In the
   Kestrel VA FX wrapper (*Settings → MIDI → Input port*), set the same port number. Notes
   entered in the MIDI Out channel's piano roll now play Kestrel.
4. Select a vocoder program (for example *Ghost Sermon* or *Soul Vocoder*) and play chords.
5. If FL Studio reports the input as inactive, enable *Process inactive inputs and outputs*
   in the wrapper's *Processing* tab.

### Alternative: the instrument build with an input

FL Studio's wrapper shows input connections for Channel Rack plug-ins (inputs are chosen as
Mixer-track offsets), but the same manual page also states that instrument channels can't
receive audio input. This route may or may not work depending on the FL Studio version, so
prefer the FX build. The instrument plug-in runs normally with silent inputs.

### Standalone app

*Kestrel VA.exe* uses the audio device's input channels 1 and 2 as AUDIO IN 1 and 2.
Choose them in *Options → Audio/MIDI settings* and allow microphone access when asked. An
on-screen keyboard is provided for testing.

## 3. Performance notes

- Compatibility mode (default) limits playback to 4 voices like the original, and a Layer
  program shares them between the timbres (for example 2 + 2). Switch GLOBAL *Voice
  Allocation* to *Extended* for up to 16 voices per timbre.
- CPU use scales with active voices. 2× oversampling is the default; *4x* increases quality
  and CPU, while *1x* lowers both and is slightly duller at 44.1/48 kHz.

## Image-Line references

- Plugin wrapper (Processing tab, connections, *Process inactive inputs and outputs*, *Send
  All Notes Off when playback stops*, latency information):
  https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/wrapper.htm
- Mixer (*Sidechain to this track*, effect inputs):
  https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/mixer.htm
- Mixer input/output routing:
  https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/mixer_iorouting.htm
- MIDI Out (sending notes to effect plug-ins):
  https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/MIDI%20Out.htm
- Vocodex inputs (the same mapping pattern for a vocoder effect):
  https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/Vocodex_inputs.htm
