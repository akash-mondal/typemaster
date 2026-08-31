// ══════════════════════════════════════════════════════════════════ boards
// Every keyboard is its own file in ./boards. They are plain data and import
// nothing, so any one can be copied into a project and edited on its own.
//
// ONE BOARD AT A TIME. Only what is listed in THEMES below is built, and the
// board picker only appears if you list more than one — so leave it at one
// unless you actually want a switcher on screen.
//
// TO SWAP THE BOARD: uncomment its import and put its name in THEMES instead.
//   That is the whole operation; nothing else refers to boards by name.
// TO MOVE IT IN THE SCENE: see BOARD in props.js.

import { mocha }        from './boards/mocha.js';
// import { platinum }   from './boards/platinum.js';   // Apple M0110A, 60%
// import { stone }      from './boards/stone.js';      // hewn rock caps
// import { rgb }        from './boards/rgb.js';        // per-key chroma
// import { typewriter } from './boards/typewriter.js'; // Smith Corona

export const THEMES = { mocha };
