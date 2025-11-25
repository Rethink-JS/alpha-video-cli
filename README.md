# rt-alpha-video

Convert PNG frame sequences with alpha into **WebM (VP9 + alpha)** and **HEVC `.mov` (hvc1 + alpha)**, with an auto‑generated HTML preview file for browser testing.  
Supports macOS only.

## Features
- Converts PNG frame sequences to:
  - `yourname.webm`
  - `yourname-hevc.mov`
  - `yourname.html` (preview)
- Auto-installs FFmpeg if missing (via Homebrew)
- Pretty CLI output with progress bars
- Quality controls (`--webm-quality`, `--hevc-quality`)
- Safari-ready HEVC output
- Fully automatic input pattern detection

---

## Installation

### Run with npx (recommended)
```bash
npx @rethink-js/alpha-video-cli --input ./frames --fps 50
```

### Global install
```bash
npm install -g @rethink-js/alpha-video-cli
rt-alpha-video --input ./frames --fps 50
```

---

## Usage

```bash
rt-alpha-video --input ./frames --fps 50
```

**Required flags**
- `--input` → folder containing PNG frames  
- `--fps` → frames per second of your animation

**Optional flags**
- `--webm-quality <1–100>`
- `--hevc-quality <1–100>`
- `--no-hevc`
- `--quiet`

---

## Example

```bash
rt-alpha-video --input ./my-png-frames --fps 50 --webm-quality 90
```

This generates:

```
my-png-frames/dist/
  ├── my-png-frames.webm
  ├── my-png-frames-hevc.mov
  └── my-png-frames.html
```

Open the HTML file to test playback across browsers.

---

## License
MIT

---

powered by **Rethink JS**

GitHub: https://github.com/Rethink-JS
