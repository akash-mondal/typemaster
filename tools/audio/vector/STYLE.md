# Sound style guide: inspired by the TRON: Legacy score

Original music written in the style of that score, never its melodies.

**Rule.** Reuse no melodic contour, riff, theme or chord-and-rhythm pairing from any cue. Hum a new motif: if a listener would name a Daft Punk cue, rewrite it. Choose our own keys. Style is free to use: tempos, minor modes, pedal tones, ostinatos, detuned-saw patches, four-on-the-floor with pumping.

## Palette

**Fake orchestra (no samples)**
- Low brass (held themes, big hits): 5–7 detuned saws with a slow filter attack.
- Low strings (8th/16th ostinatos): saws with a short decay, high-passed at 80 Hz.
- High strings: long swells.
- Timpani and big drums: on phrase downbeats.

**Synths**
- Pulsing sequenced bass.
- 16th-note arpeggios.
- Vangelis-style pads.
- Distorted filter-house leads for the electronic cues.

## Arrangement template
1. A low drone or pedal note.
2. The ostinato enters.
3. Percussion hits every 4 or 8 bars.
4. Brass states the theme.
5. A build over 4–8 bars.
6. A hard stop into silence and a big hit, or the whole band returns together.

## Tempos and keys
- Cues sit at 90–124 bpm in minor keys.
- Electronic action cues run at about 120 bpm, straight 4/4.
- Tense cues run at about 100 bpm, with 16th bass and timpani.

## Patches (Web Audio)
**Pulse bass**
- Oscillators: 2 saws at ±6 cents, plus a square an octave down at 30%.
- Filter: two cascaded lowpasses at 150–400 Hz, Q 4–6.
- Filter envelope: 0 attack, 150 ms decay, 1.5–2 octaves.
- Amp envelope: 0 attack, 150 ms decay, sustain 0.3.
- Pattern: 16ths on the root with octave jumps. Open the cutoff slowly over 8–16 bars.

**Arp**
- Oscillators: saw or pulse, 3–8 unison voices at ±7 cents, panned wide.
- Filter: lowpass at a low base, resonance 0.6, strong envelope amount.
- Envelope: pluck, 150–300 ms decay.
- Effects: feedback delay into a hall reverb, plus chorus shimmer.

**Distorted lead**
- Oscillators: saw (+3 cents), saw an octave up (−5 cents), pulse sub an octave down at 20%, noise at 20%.
- Filter: lowpass, resonance 65%.
- Voicing: mono legato with 40–80 ms glide.
- Effects: tanh drive about 0.6, phaser, 1/32-note slapback.

**Brass stab**
- Oscillators: 6 saws at ±10 cents.
- Filter: lowpass 0.8–1.2 kHz, Q 1.5. Filter envelope jumps +1.5 octaves (10 ms attack, 250 ms decay).
- Amp envelope: 5 ms attack, 300 ms decay, sustain 0.4. Slow pulse-width modulation.

**Low hit**
- Oscillators: 8+ saws 1 and 2 octaves below, ±15 cents. Pitch starts 40 cents flat and settles over 150 ms.
- Filter: opens 200 Hz → 2 kHz over 300 ms, closes over 2–3 s.
- Layers: sine sub, noise burst bandpassed at 300 Hz, timpani.
- Effects: tanh drive into a long reverb, lightly bitcrushed.

## Harmony
- Minor centre; the bass implies the chords.
- Idiomatic moves: i–iv–bVI, bVI–bVII–i, and a chromatic i–bII pulse for menace.
- Long pedal roots under sus2/sus4 brass. The size comes from octave doubling.

## Drums
- **Kick:** sine 150 → 45 Hz over 80 ms, 250 ms decay, 2 ms click, soft clip.
- **Clap:** bandpassed noise at 1–1.5 kHz, 3 retriggers 10 ms apart, short plate, gated at 150 ms. On beats 2 and 4.
- **Closed hat:** 16ths, noise highpassed at 7 kHz, 30 ms decay, off-beat accents.
- **Open hat:** on the "and" of each beat, choked by the next closed hat.
- **Pumping:** duck pads and bass 4–6 dB on each kick (5 ms down, 200 ms back). Fills are filter sweeps, not rolls.
