#!/usr/bin/env python3
"""
Assemble a game's sound engine from the shared engine and its own content.

    python3 tools/audio/build.py kata    -> games/kata-audio.js  (the parts as they are)
    python3 tools/audio/build.py nova    -> games/nova-audio.js

The engine is kata/01..05. A game other than KATA supplies four pieces that
replace KATA's content in place: instruments.js (the INSTR rack and any synth
functions it needs), songs.js (INTRO_CUTS through STINGS), sfx.js (SFX_DEF)
and mix.js (the MIX table). Everything else - the graph, voices, ducking,
transport, scheduling, unlock and prerender - is shared, so a fix to the engine
reaches every game on the next build.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
ENGINE = os.path.join(HERE, "kata")


def read(*p):
    with open(os.path.join(*p)) as fh:
        return fh.read()


def splice(src, start_marker, end_marker, replacement, include_end=False):
    a = src.index(start_marker)
    b = src.index(end_marker, a)
    if include_end:
        b += len(end_marker)
    return src[:a] + replacement + src[b:]


def build(game):
    core, inst, music, sfx, api = (read(ENGINE, f) for f in ("01_core.js", "02_instruments.js", "03_music.js", "04_sfx.js", "05_api.js"))
    if game != "kata":
        G = os.path.join(HERE, game)
        title = game.upper()
        core = core.replace("kata-audio.js - KATA's sound engine.", "%s-audio.js - %s's sound engine (built by tools/audio/build.py)." % (game, title))
        core = core.replace("'typemaxx.kata.audio'", "'typemaxx.%s.audio'" % game)
        inst = splice(inst, "const INSTR = {", "\n};\n", read(G, "instruments.js").rstrip() + "\n", include_end=True)
        music = splice(music, "// the trailer's cuts", "const compiled = new Map();", read(G, "songs.js").rstrip() + "\n")
        sfx = splice(sfx, "const SFX_DEF = {", "// crossfade the ends so a buffer loops", read(G, "sfx.js").rstrip() + "\n\n")
        api = splice(api, "const MIX = {};", "const MIX_DEFAULT", read(G, "mix.js").rstrip() + "\n")
        api = api.replace("const KataAudio", "const %sAudio" % title.title()).replace("export default KataAudio;", "export default %sAudio;" % title.title()).replace("export { KataAudio };", "export { %sAudio };" % title.title())
    out = os.path.join(ROOT, "games", "%s-audio.js" % game)
    with open(out, "w") as fh:
        fh.write(core + inst + music + sfx + api)
    print("wrote", os.path.relpath(out, ROOT))


if __name__ == "__main__":
    for g in sys.argv[1:] or ["kata", "nova"]:
        build(g)
