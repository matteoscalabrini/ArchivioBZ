// Edit mode, at /edit/: the Library drawn from the draft (cloud/render.mjs) with what edits it.
// The page is the public one; this adds the bar at the top, the controls on each row and chapter,
// dragging, and the idea's ✎. Every edit saves on its own and goes to the server one at a time
// (edit/core.js); the server's answer redraws what it changed.
//
//   edit/core.js      the draft held, the queue, an answer put on the page
//   edit/field.js     a field in place of what ✎ follows
//   edit/rows.js      a row's controls, head and open body
//   edit/pictures.js  a row's pictures and "Side by side"
//   edit/keywords.js  the keywords offered under ＋
//   edit/chapters.js  the headings, ＋ row here, ＋ chapter here
//   edit/drag.js      dragging rows and chapters
//   edit/strip.js     "All keywords": the answers' strip, its keywords dragged into an order
//   edit/bar.js       the bar: the summary, About, Public site, Discard, Publish, Log out
//   edit/idea.js      ✎ on the idea
//   edit/dialog.js    the questions asked
//   edit/icons.js     the icons
import { redraw } from './edit/core.js';
import './edit/rows.js';
import './edit/chapters.js';
import './edit/drag.js';
import './edit/strip.js';
import { makeBar } from './edit/bar.js';
import { dressIdea } from './edit/idea.js';

makeBar();
dressIdea();
// Each row dressed, the hidden ones numbered "—", and the headings made from the draft's
// chapters, those of empty chapters too, which the server does not write.
redraw();
