const MIX = {};
const mix = (group, names, vol, max, gap, prio, duck) => { for (const n of names.split(' ')) MIX[n] = { group, vol, max, gap, prio, duck: duck || 0 }; };
// Nothing fires ON a keystroke: the game delays what a key causes by a beat,
// and the gun is soft and low so it sits under the keyboard's click.
mix('ui',     'ui_move ui_back',                          0.5, 1, 0.04, 1);
mix('ui',     'ui_select',                                0.6, 1, 0.08, 2);
mix('big',    'launch',                                   0.6, 1, 1.0, 3);
mix('type',   'shot',                                     0.22, 3, 0.035, 0);
mix('type',   'lock',                                     0.3, 1, 0.06, 1);
mix('type',   'release denied',                           0.4, 1, 0.12, 1);
mix('type',   'miss',                                     0.4, 1, 0.08, 1);
mix('combat', 'hit',                                      0.32, 3, 0.03, 0);
mix('combat', 'mult_up nova_ready',                       0.5, 1, 0.3, 2);
mix('combat', 'explode_s',                                0.55, 3, 0.04, 1);
mix('combat', 'explode_m',                                0.7, 2, 0.06, 2);
mix('combat', 'explode_l',                                0.85, 1, 0.15, 3, 0.3);
mix('combat', 'missile orb_fan split',                    0.5, 2, 0.1, 1);
mix('combat', 'turret_die',                               0.7, 2, 0.1, 2);
mix('big',    'core_open',                                0.7, 1, 1.0, 3, 0.3);
mix('big',    'boss_die',                                 0.9, 1, 2.0, 3, 0.5);
mix('big',    'nova',                                     0.9, 1, 0.5, 3, 0.5);
mix('world',  'pickup_nova pickup_repair pickup_stasis',  0.65, 1, 0.2, 3);
mix('big',    'hurt',                                     0.8, 1, 0.3, 3, 0.4);
mix('big',    'player_die',                               0.95, 1, 2.0, 3, 0.6);
mix('world',  'warp',                                     0.7, 1, 2.0, 3, 0.2);
