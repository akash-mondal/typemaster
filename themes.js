// ══════════════════════════════════════════════════════════════════ boards
// Every keyboard, one file each, in ./boards. They are plain data and import
// nothing, so any one of them can be copied into a project and edited alone.
//
// TO SHOW ONLY ONE BOARD: delete the others from THEMES below. The picker
//   hides itself when a single board is left, and whichever is FIRST is the one
//   that loads at boot.
// TO EDIT ONE BOARD in Commonsmade: copy that file out of ./boards into your
//   project and add ONE line to the import map in index.html, pointing this
//   tag's copy of it at yours. See COMMONSMADE.md.
// TO ADD A BOARD: copy the closest file in ./boards, rename its export, and
//   add it here.

import { mocha }      from './boards/mocha.js';
import { platinum }   from './boards/platinum.js';
import { stone }      from './boards/stone.js';
import { rgb }        from './boards/rgb.js';
import { typewriter } from './boards/typewriter.js';

export const THEMES = { mocha, platinum, stone, rgb, typewriter };
