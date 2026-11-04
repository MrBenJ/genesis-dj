// Controller profiles: default MIDI -> Genesis button mappings.
//
// These defaults follow the standard Pioneer/AlphaTheta MIDI layout (each deck on
// its own MIDI channel, PLAY = note 0x0B, CUE = note 0x0C, jog = relative CC
// 0x21/0x22 centred on 64, tempo = CC 0x00, pads on their own channel). They are
// NOT verified against each device's published MIDI list. If a control doesn't
// respond, use Learn mode in the UI, then "Copy mapping JSON" to save the fix.
//
// Channels are 0-based here: channel 0 means "MIDI channel 1".
//
// A binding is one of:
//   { kind: 'button',   pos: [player, BUTTON] }                    note on/off, or CC >= 64
//   { kind: 'relative', pos: [p, BTN], neg: [p, BTN] }             jog wheels: >64 = pos, <64 = neg
//   { kind: 'absolute', pos: [p, BTN], neg: [p, BTN] }             faders: top third = pos, bottom third = neg

const GENESIS_BUTTONS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'C', 'START'];

// EmulatorJS (libretro RetroPad) input index for each Genesis button, as the
// genesis_plus_gx core maps them: RetroPad B = Genesis B, Y = A, A = C.
const EJS_INDEX = { B: 0, A: 1, MODE: 2, START: 3, UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7, C: 8, Y: 9, X: 10, Z: 11 };

// One deck = one player. Streets of Rage 2: A = special, B = attack, C = jump.
function pioneerDeck(player, deckCh, padCh) {
  const jog = { kind: 'relative', pos: [player, 'RIGHT'], neg: [player, 'LEFT'] };
  return {
    [`cc:${deckCh}:33`]: jog,                 // 0x21 jog side / platter
    [`cc:${deckCh}:34`]: jog,                 // 0x22 jog top (touched)
    [`cc:${deckCh}:35`]: jog,                 // 0x23 jog top, alternate mode
    [`cc:${deckCh}:0`]: { kind: 'absolute', pos: [player, 'DOWN'], neg: [player, 'UP'] }, // tempo fader
    [`note:${deckCh}:11`]: { kind: 'button', pos: [player, 'B'] },     // PLAY/PAUSE = attack
    [`note:${deckCh}:12`]: { kind: 'button', pos: [player, 'C'] },     // CUE = jump
    [`note:${padCh}:0`]: { kind: 'button', pos: [player, 'A'] },       // pad 1
    [`note:${padCh}:1`]: { kind: 'button', pos: [player, 'B'] },       // pad 2
    [`note:${padCh}:2`]: { kind: 'button', pos: [player, 'C'] },       // pad 3
    [`note:${padCh}:3`]: { kind: 'button', pos: [player, 'START'] },   // pad 4
    [`note:${padCh}:4`]: { kind: 'button', pos: [player, 'LEFT'] },    // pad 5
    [`note:${padCh}:5`]: { kind: 'button', pos: [player, 'UP'] },      // pad 6
    [`note:${padCh}:6`]: { kind: 'button', pos: [player, 'DOWN'] },    // pad 7
    [`note:${padCh}:7`]: { kind: 'button', pos: [player, 'RIGHT'] },   // pad 8
  };
}

const PROFILES = [
  {
    id: 'ddj-flx2',
    name: 'AlphaTheta DDJ-FLX2',
    decks: ['Left deck', 'Right deck'],
    notes: 'Left deck plays as Player 1, right deck as Player 2.',
    mapping: { ...pioneerDeck(0, 0, 7), ...pioneerDeck(1, 1, 9) },
  },
  {
    id: 'opus-quad',
    name: 'Pioneer DJ OPUS-QUAD',
    decks: ['Deck 1', 'Deck 2'],
    notes: 'Switch it to PC (MIDI) mode over USB. Deck 1 plays as Player 1, deck 2 as Player 2.',
    mapping: { ...pioneerDeck(0, 0, 7), ...pioneerDeck(1, 1, 9) },
  },
  {
    id: 'cdj-3000',
    name: 'Pioneer DJ CDJ-3000 (x2)',
    decks: ['CDJ 1, MIDI ch 1', 'CDJ 2, MIDI ch 2'],
    notes: 'One CDJ per player. Put each in MIDI mode over USB, with CDJ 1 on MIDI channel 1 and CDJ 2 on channel 2.',
    // A CDJ sends everything on its one channel, pads included.
    mapping: { ...pioneerDeck(0, 0, 0), ...pioneerDeck(1, 1, 1) },
  },
];
