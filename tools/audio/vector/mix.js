const MIX = {};
const mix = (group, names, vol, max, gap, prio, duck) => { for (const n of names.split(' ')) MIX[n] = { group, vol, max, gap, prio, duck: duck || 0 }; };
// Nothing fires ON a keystroke: the RGB keyboard clicks. The engine, grind and
// brake beds run through foley (dry, low-passed at 2.4 kHz) at low levels so they
// sit under the click band and never tire the ear; the game crossfades the three
// engine loops with set(). A typo's sputter is delayed by the game and kept soft.
mix('ui',     'ui_move ui_back',                          0.45, 1, 0.04, 1);
mix('ui',     'ui_select',                                0.55, 1, 0.08, 2);
mix('ui',     'count',                                    0.5, 1, 0.3, 2);
mix('ui',     'go',                                       0.65, 1, 0.5, 3);
mix('foley',  'engine_low engine_mid engine_high',        0.2, 1, 0, 0);
mix('foley',  'grind_loop',                               0.22, 1, 0, 1);
mix('foley',  'brake_loop',                               0.22, 1, 0, 1);
mix('foley',  'turn',                                     0.28, 1, 0.06, 0);
mix('type',   'sputter',                                  0.3, 1, 0.25, 1);
mix('type',   'wall_cut',                                 0.34, 1, 0.2, 1);
mix('combat', 'word_pulse',                               0.32, 1, 0.12, 1);
mix('combat', 'pickup',                                   0.5, 1, 0.15, 2);
mix('combat', 'cell_fire',                                0.55, 1, 0.2, 2);
mix('combat', 'shield_break lance spike phase surge reset', 0.6, 1, 0.2, 2);
mix('combat', 'derez',                                    0.75, 2, 0.08, 3, 0.3);
mix('combat', 'pulse_ring',                               0.7, 1, 0.4, 3, 0.3);
mix('world',  'seal_close',                               0.65, 1, 0.5, 3, 0.3);
mix('world',  'portal',                                   0.45, 2, 0.12, 2);
mix('world',  'fault_warn',                               0.3, 3, 0.1, 1);
mix('world',  'fault_fall',                               0.45, 2, 0.15, 2);
mix('world',  'gate_move',                                0.35, 2, 0.5, 1);
mix('big',    'rez_in',                                   0.5, 2, 0.1, 2);
mix('big',    'boss_sweep_warn boss_drop_warn',           0.55, 1, 0.3, 3);
mix('big',    'boss_sweep',                               0.7, 1, 0.3, 3, 0.3);
mix('big',    'boss_drop',                                0.8, 1, 0.3, 3, 0.35);
mix('big',    'anchor_break',                             0.9, 1, 1.0, 3, 0.5);
