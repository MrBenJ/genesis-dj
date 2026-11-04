# Genesis DJ

Play Sega Genesis games in the browser with a DJ controller. Built for Streets of Rage 2 with two players.

## Run it

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080 in **Chrome or Edge**. Safari doesn't support Web MIDI. The page has to be served from localhost or https, because Web MIDI doesn't work from `file://`.

1. Plug in the controller and allow MIDI access when the browser asks.
2. Pick the controller from the dropdown.
3. Click **Load ROM** and choose your own Genesis ROM file. No ROMs are included.

The emulator is [EmulatorJS](https://emulatorjs.org) (genesis_plus_gx core), loaded from its CDN.

## Default layout (one deck per player)

| Control | Genesis | Streets of Rage 2 |
|---|---|---|
| Jog wheel | Left / Right | walk |
| Tempo fader (top / bottom third) | Up / Down | walk |
| PLAY | B | attack |
| CUE | C | jump |
| Pads 1-4 | A, B, C, START | special, attack, jump, pause |
| Pads 5-8 | LEFT, UP, DOWN, RIGHT | d-pad |

For the CDJ-3000, use two units, one per player. Set CDJ #1 to MIDI channel 1 and CDJ #2 to MIDI channel 2.

## Fixing a mapping (Learn mode)

The defaults follow the standard Pioneer MIDI layout but haven't been checked against real hardware. If a control doesn't respond:

- Click a button in the Player 1 or Player 2 grid. It flashes.
- Move the control you want: press a button, spin a jog, or slide a fader. Jogs and faders are detected automatically. For a jog, learn LEFT while spinning left, then learn RIGHT while spinning right.
- Right-click a button to clear its mappings. Press Esc to cancel learning.
- The MIDI monitor shows every incoming message.

Mappings are saved in the browser per controller. **Copy mapping JSON** gives you a mapping you can paste into `profiles.js` to make it the new default.

Press **H** to hide the side panel for the stream.
