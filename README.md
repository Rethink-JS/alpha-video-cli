# rt-alpha-video

[![macOS](https://img.shields.io/badge/platform-macOS-black?logo=apple)](https://www.apple.com/macos/)
![Node](https://img.shields.io/badge/node-%3E=16.0.0-43853d?logo=node.js&logoColor=white)
![FFmpeg](https://img.shields.io/badge/ffmpeg-required-0A9F47?logo=ffmpeg&logoColor=white)
[![npm version](https://img.shields.io/npm/v/%40rethink-js%2Falpha-video-cli.svg)](https://www.npmjs.com/package/@rethink-js/alpha-video-cli)
[![npm downloads](https://img.shields.io/npm/dm/%40rethink-js%2Falpha-video-cli.svg)](https://www.npmjs.com/package/@rethink-js/alpha-video-cli)
[![bundle size](https://img.shields.io/bundlephobia/min/%40rethink-js%2Falpha-video-cli)](https://bundlephobia.com/package/@rethink-js/alpha-video-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-FFD632.svg)](https://opensource.org/licenses/MIT)
[![Companion Web Helper](https://img.shields.io/badge/companion-web%20helper-1F6FEB.svg)](https://rethink-js.github.io/alpha-video-cli-web-helper)

`rt-alpha-video` turns a folder of **PNG frames with alpha** into:

- `folder-name.webm` (VP9 + alpha)
- `folder-name-hevc.mov` (HEVC + alpha, tagged `hvc1` for Safari)
- `folder-name.txt` (ready-to-paste HTML + JS snippet that auto-detects WebM/HEVC at runtime)

<br>

Perfect for replacing heavy PNG image sequences with lightweight transparent video on the web.

> **Platform:** macOS only  
> **Input:** PNG frames with alpha (RGBA)  
> **Output:** WebM + optional HEVC + snippet

<br>

> [Launch Web Helper](https://rethink-js.github.io/alpha-video-cli-web-helper) <br><br>
> Use the browser-based helper to drag and drop your PNG frames, auto-detect the pattern and FPS, verify alpha, preview the loop, and generate a ready-to-run `rt-alpha-video` command <br>
> Read more about the helper in [Web helper](#11-web-helper).

---

# Table of Contents

- [1. Requirements](#1-requirements)

  - [1.1 OS and runtime](#11-os-and-runtime)
  - [1.2 FFmpeg](#12-ffmpeg)
  - [1.3 Homebrew (optional but recommended)](#13-homebrew-optional-but-recommended)

- [2. What the CLI actually does](#2-what-the-cli-actually-does)

- [3. Installation](#3-installation)

  - [3.1 One-off usage with npx](#31-one-off-usage-with-npx)
  - [3.2 Global install](#32-global-install)

- [4. Basic usage](#4-basic-usage)

- [5. CLI options (full)](#5-cli-options-full)

- [6. Default quality settings](#6-default-quality-settings)

- [7. Input expectations (PNG + alpha)](#7-input-expectations-png--alpha)

- [8. Using the generated snippet](#8-using-the-generated-snippet)

- [9. Troubleshooting](#9-troubleshooting)

  - [9.1 FFmpeg missing](#91-ffmpeg-missing)
  - [9.2 No PNG files found](#92-no-png-files-found)
  - [9.3 Could not infer pattern](#93-could-not-infer-pattern)
  - [9.4 HEVC not generated](#94-hevc-not-generated)

- [10. Typical workflow](#10-typical-workflow)

- [11. Web helper](#11-web-helper)

- [12. Changelog](#12-changelog)

- [13. License](#13-license)

---

## 1. Requirements

### 1.1 OS and runtime

- **macOS** (Apple Silicon or Intel)
- **Node.js ≥ 16**

Check Node:

```bash
node -v
```

### 1.2 FFmpeg

Must include:

- `libvpx-vp9`
- `hevc_videotoolbox`

Check:

```bash
ffmpeg -version
```

### 1.3 Homebrew (optional but recommended)

If FFmpeg is missing but Homebrew exists, CLI installs FFmpeg automatically.

---

## 2. What the CLI actually does

Given a PNG sequence:

1. Detect file pattern

2. Encode:

   - `.webm` (VP9 + alpha)
   - `.mov` HEVC (if supported)

3. Generate snippet (`.txt`)

4. Print detailed stats (sizes, fps, duration)

---

## 3. Installation

### 3.1 One-off usage with npx

```bash
npx @rethink-js/alpha-video-cli --input ./frames --fps 50
```

### 3.2 Global install

```bash
npm install -g @rethink-js/alpha-video-cli
rt-alpha-video --input ./frames --fps 50
```

---

## 4. Basic usage

```bash
rt-alpha-video --input ./frames --fps 50
```

Output folder:

```
frames/dist/
  frames.webm
  frames-hevc.mov
  frames.txt
```

---

## 5. CLI options (full)

### Required

| Flag               | Description                     |
| ------------------ | ------------------------------- |
| `--input <folder>` | Directory containing PNG frames |
| `--fps <number>`   | Playback framerate              |

### Optional

| Flag                     | Description                            |
| ------------------------ | -------------------------------------- |
| `--output <folder>`      | Custom output directory                |
| `--pattern <pattern>`    | Frame pattern e.g. `img_%05d.png`      |
| `--start <number>`       | First frame index                      |
| `--end <number>`         | Last frame index                       |
| `--name <basename>`      | Base name for output files             |
| `--webm-quality <1-100>` | Logical WebM quality (default: **50**) |
| `--hevc-quality <1-100>` | Logical HEVC quality (default: **90**) |
| `--no-hevc`              | Disable HEVC encoding                  |
| `--quiet`                | Hide logs                              |
| `--help`, `-h`           | Help menu                              |

---

## 6. Default quality settings

### WebM (VP9 + alpha)

- Logical default: **50**
- Maps to: **CRF 28**
- Range: CRF 18 → CRF 38

### HEVC (VideoToolbox)

- Logical default: **90**
- Maps to: **alpha_quality 0.9**
- Range: 0.1 → 1.0

---

## 7. Input expectations (PNG + alpha)

Frames must:

- Include **alpha channel**
- Follow consistent numbering
- Use detectable pattern (automatic)
- Or supply manually with `--pattern`

Example:

```
Frame_00000.png
Frame_00001.png
Frame_00002.png
...
```

---

## 8. Using the generated snippet

A `.txt` file is generated with:

- `<video>` markup
- WebM/HEVC auto-switch
- Safari detection
- JS fallback logic

Example snippet (from `.txt`):

```html
<video id="alpha-video" playsinline autoplay muted loop></video>

<script>
  (async () => {
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const video = document.getElementById("alpha-video");

    video.src = isSafari ? "your-video-hevc.mov" : "your-video.webm";

    video.load();
  })();
</script>
```

---

## 9. Troubleshooting

### 9.1 FFmpeg missing

```
ffmpeg is not installed and Homebrew is not available.
```

Install FFmpeg or Homebrew.

### 9.2 No PNG files found

Check path or rename files.

### 9.3 Could not infer pattern

Specify manually:

```bash
--pattern "Frame_%05d.png"
```

### 9.4 HEVC not generated

Possible reasons:

- `--no-hevc` enabled
- Missing VideoToolbox hardware support
- Old FFmpeg build

---

## 10. Typical workflow

```bash
rt-alpha-video \
  --input "/path/to/frames" \
  --fps 50
```

Full-options example:

```bash
rt-alpha-video \
  --input "/path/to/frames" \
  --output "/path/to/output" \
  --fps 50 \
  --pattern "Frame_%05d.png" \
  --start 0 \
  --end 349 \
  --name "Frame-preview" \
  --webm-quality 72 \
  --hevc-quality 95
```

---

## 11. Web helper

A visual companion tool for `rt-alpha-video`
(no installation required — runs entirely in your browser).

### Launch Web Helper

[https://rethink-js.github.io/alpha-video-cli-web-helper](https://rethink-js.github.io/alpha-video-cli-web-helper)

### Repository

[https://github.com/Rethink-JS/alpha-video-cli-web-helper](https://github.com/Rethink-JS/alpha-video-cli-web-helper)

The web helper provides:

- **Drag and drop folder analysis**<br>
  Detects sequences directly from your PNG files.

- **Pattern detection**<br>
  Automatically identifies patterns (for example `%05d`), start frames, and end frames.

- **FPS auto-detection**<br>
  Estimates the most likely frame rate (24, 30, 50, 60) from total frame count.

- **Transparency verification**<br>
  Ensures your PNGs truly contain an alpha channel, so you do not accidentally encode opaque videos.

- **Live canvas preview**<br>
  Loops the sequence so you can confirm smoothness before encoding.

- **Smart defaults**<br>
  Matches CLI defaults.

- **One-click command generation**<br>
  Outputs the full, ready-to-run terminal command string for `rt-alpha-video`.

### Privacy and security

- 100% client-side.
- No files ever uploaded.
- Uses browser memory only.
- No external servers or third-party processing.

### Browser path limitations

Due to browser security, the helper cannot read absolute paths (such as `/Users/username/Desktop/project/frames`). It only sees relative folder names (for example `frames`).

- The helper will suggest a relative path like `./frames`.
- If you run the command from the parent directory of your frames folder, this works as-is.
- Otherwise, replace `--input` with your actual path.

Tip for macOS: drag a folder from Finder into Terminal to paste its absolute path.

---

## 12. Changelog

### 1.1.0

- Added `--end` (frame end index)
- Updated defaults:
- Defaults now map exactly to previous internal quality
- Added full Web Helper documentation

### 1.0.0

- Stable public release
- Pattern detection
- WebM + HEVC encoding
- Snippet generation
- Stronger errors

### 0.1.0

- Initial preview
- Basic encoding pipeline

---

## 13. License

MIT License

Package: `@rethink-js/alpha-video-cli`<br>
GitHub: [https://github.com/Rethink-JS/alpha-video-cli](https://github.com/Rethink-JS/alpha-video-cli)

---

by **Rethink JS**<br>
[https://github.com/Rethink-JS](https://github.com/Rethink-JS)
