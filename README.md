# Fuzhu Learn

A browser-based app for learning to write Chinese characters (hanzi) by hand. Uses handwriting recognition to check your strokes in real time.

## Features

- **Learn mode** — watch stroke order animations, then practice writing
- **Review mode** — test yourself on characters you've already learned
- **HanziLookup integration** — WASM-powered handwriting recognition that identifies which character you drew
- **Per-stroke feedback** — tells you exactly which strokes are wrong and by how many degrees
- **HSK levels 1–7** — practice characters organized by official HSK difficulty
- **Progress tracking** — points per character, persisted in localStorage

## How it works

1. A character is shown with an animated stroke order demo
2. You draw the character on a canvas with your mouse or finger
3. On check, two things happen in parallel:
   - **HanziLookup** (Rust/WASM) matches your drawing against its database and returns the top 8 candidate characters
   - **Stroke order checker** compares each of your strokes against the reference SVG animation paths using direction fingerprinting
4. Scoring:
   - Correct character #1 + all strokes right → **1.0 points**
   - Correct character #1 + some strokes off → **0.7 points**
   - Correct character found but not top match → **0.5 points**
   - Not found → **0 points**, shows the correct character and similar matches

## Tech stack

- React 18 + Redux Toolkit
- Vite
- HanziLookup (Rust → WASM) for character recognition
- Make Me a Hanzi SVG data for stroke order reference

## Running locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Building

```bash
npm run build
```

Output goes to `dist/`.

## License

AGPL v3. See [LICENSE_AGPL](LICENSE_AGPL).

### Third-party licenses

- **HanziLookup** — LGPL v3 ([vendor license](vendors/hanzi_lookup/LICENSE))
- **Make Me a Hanzi stroke data** — Arphic Public License ([vendor license](vendors/makemeahanzi/APL/))

## Data sources

- HSK character lists from [complete-hsk-vocabulary](https://github.com/real-ai/complete-hsk-vocabulary)
- Stroke SVG data from [Make Me a Hanzi](https://github.com/chanind/hanzi-writer-data)
- Dictionary data from [CJKlIib](https://github.com/cburgmer/cjklib) and [Unihan](https://unicode.org/charts/unihan.html)