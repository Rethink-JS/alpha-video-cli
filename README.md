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
> Use the browser-based helper to drag and drop your PNG frames, auto-detect the pattern and FPS, verify alpha, preview the loop, and generate a ready-to-run `rt-alpha-video` command. <br>
> Read more about the helper in [Web helper](#11-web-helper).

---

# Table of Contents

- [1. Requirements](#1-requirements)

  - [1.1. OS and runtime](#11-os-and-runtime)
  - [1.2. FFmpeg](#12-ffmpeg)
  - [1.3. Homebrew (optional but recommended)](#13-homebrew-optional-but-recommended)

- [2. What the CLI actually does](#2-what-the-cli-actually-does)

- [3. Installation](#3-installation)

  - [3.1. Global install](#31-global-install)
  - [3.2. One-off usage with npx](#32-one-off-usage-with-npx)

- [4. Basic usage](#4-basic-usage)

- [5. CLI options (full)](#5-cli-options-full)

- [6. Default quality settings](#6-default-quality-settings)

- [7. Input expectations (PNG + alpha)](#7-input-expectations-png--alpha)

- [8. Using the generated snippet](#8-using-the-generated-snippet)

- [9. Troubleshooting](#9-troubleshooting)

  - [9.1. FFmpeg missing](#91-ffmpeg-missing)
  - [9.2. No PNG files found](#92-no-png-files-found)
  - [9.3. Could not infer pattern](#93-could-not-infer-pattern)
  - [9.4. HEVC not generated](#94-hevc-not-generated)

- [10. Typical workflow](#10-typical-workflow)

- [11. Web helper](#11-web-helper)

- [12. Changelog](#12-changelog)

- [13. License](#13-license)

---

## 1. Requirements

### 1.1. OS and runtime

- **macOS** (Apple Silicon or Intel)
- **Node.js ≥ 16**

Check Node:

```bash
node -v
```

### 1.2. FFmpeg

Your FFmpeg build must include:

- `libvpx-vp9`
- `hevc_videotoolbox` (for HEVC + alpha via VideoToolbox)

Check:

```bash
ffmpeg -version
```

### 1.3. Homebrew (optional but recommended)

If FFmpeg is missing but Homebrew exists, the CLI will offer to install FFmpeg automatically via:

```bash
brew install ffmpeg
```

If Homebrew is not available, you’ll need to install FFmpeg manually.

---

## 2. What the CLI actually does

Given a PNG sequence, `rt-alpha-video` will:

1. **Detect the file pattern and start index**
   Finds a common prefix/suffix between first and last filenames and infers the numeric run (e.g. `Frame_%05d.png` + starting index).

2. **Encode transparent video outputs**

   - `.webm` (VP9 + alpha, `yuva420p`)
   - `.mov` (HEVC + alpha via `hevc_videotoolbox`, tagged `hvc1`), unless `--no-hevc` is provided or the encoder is unavailable.

3. **Generate an HTML snippet (`.txt`)**
   A ready-to-paste snippet that auto-selects WebM vs HEVC at runtime based on codec support (Safari / iOS vs others).

4. **Print detailed stats**
   Frame count, total PNG size, animation duration, final WebM/HEVC sizes, and per-encode times.

---

## 3. Installation

### 3.1. Global install

Install globally and use the `rt-alpha-video` command:

```bash
npm install -g @rethink-js/alpha-video-cli
```

### 3.2. One-off usage with npx

Run once without installing globally:

```bash
npx @rethink-js/alpha-video-cli --input ./frames --fps 50
```

---

## 4. Basic usage

```bash
rt-alpha-video --input ./frames --fps 50
```

Output folder:

```text
frames/dist/
  frames.webm
  frames-hevc.mov
  frames.txt
```

- The output folder defaults to `<input>/dist`.
- The base name defaults to the input folder name (normalized).

---

## 5. CLI options (full)

### Required

| Flag               | Description                     |
| ------------------ | ------------------------------- |
| `--input <folder>` | Directory containing PNG frames |
| `--fps <number>`   | Playback framerate              |

### Optional

| Flag                     | Description                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `--output <folder>`      | Custom output directory (default: `<input>/dist`)                                          |
| `--pattern <pattern>`    | Frame pattern e.g. `Frame_%05d.png` (otherwise inferred from filenames)                    |
| `--start <number>`       | First frame index for the pattern (`-start_number` in FFmpeg). Defaults from detection     |
| `--end <number>`         | Last frame index to include (inclusive). Limits encoding to this range                     |
| `--width <number>`       | Resize video width; if height is omitted, a **square** output is produced                  |
| `--height <number>`      | Resize video height; if width is omitted, a **square** output is produced                  |
| `--name <basename>`      | Base name for output files (default: input folder name, lowercased, spaces → dashes)       |
| `--webm-quality <1-100>` | Logical WebM quality (maps to CRF internally; default: **50**)                             |
| `--hevc-quality <1-100>` | Logical HEVC alpha quality (maps to `-alpha_quality` internally; default: **90**)          |
| `--no-hevc`              | Disable HEVC `.mov` encoding (WebM only)                                                   |
| `--quiet`                | Suppress progress bars and extra logs (FFmpeg still runs, but with minimal console output) |
| `--help`, `-h`           | Help menu                                                                                  |

Notes:

- If you pass **only width** or **only height**, the CLI produces a square output and warns if you upscale above the source PNG dimensions.
- `--end` does **not** change pattern detection; it only clamps how many frames are actually encoded.

---

## 6. Default quality settings

### WebM (VP9 + alpha)

- Logical default: **50** (`--webm-quality 50`)
- Internally mapped to: **CRF ≈ 28**
- CRF range used: **18 → 38**
  (Lower CRF = higher quality, larger files.)

### HEVC (VideoToolbox, alpha)

- Logical default: **90** (`--hevc-quality 90`)
- Internally mapped to: **`-alpha_quality 0.9`**
- Range: **0.1 → 1.0**
  (Higher = better alpha quality, larger files.)

---

## 7. Input expectations (PNG + alpha)

Your PNG frames should:

- Include an **alpha channel** (RGBA)
- Follow consistent numbering (with a stable prefix/suffix)
- Use a **detectable pattern**, e.g. `Frame_00001.png → Frame_00350.png`
- Or you explicitly provide the pattern with `--pattern`

Example:

```text
Frame_00000.png
Frame_00001.png
Frame_00002.png
...
Frame_00349.png
```

The CLI:

- Reads the first and last PNG filenames,
- Finds the shared prefix and suffix,
- Detects the numeric run in the middle,
- Builds a pattern like `Frame_%05d.png`,
- And infers the starting index (e.g. `0`).

If multiple numeric segments exist, it picks the first segment that actually changes between the first and last filenames.

---

## 8. Using the generated snippet

A `.txt` file is generated alongside your video encodes. This file contains:

- A minimal HTML document
- A `<video>` element with a `<source>` child
- A small script that:

  - Detects Safari / iOS vs other browsers
  - Checks actual codec support
  - Picks the best between **WebM (VP9)** and **HEVC (hvc1)** at runtime
  - Attempts to autoplay safely

Example excerpt (simplified):

```html
<video id="rt-alpha-video" muted autoplay loop playsinline poster="">
  <source src="" type="" />
</video>

<script>
  (function () {
    var video = document.getElementById("rt-alpha-video");
    if (!video) return;
    var sourceEl = video.querySelector("source");
    if (!sourceEl) return;

    var webmSrc = "my-animation.webm";
    var hevcSrc = "my-animation-hevc.mov";

    var ua = navigator.userAgent || "";
    var isIOS = /iPad|iPhone|iPod/.test(ua);
    var isSafariDesktop = /^((?!chrome|android).)*safari/i.test(ua);
    var isSafariEngine = isIOS || isSafariDesktop;

    var canPlayHevc = video.canPlayType('video/mp4; codecs="hvc1"');
    var canPlayWebm =
      video.canPlayType('video/webm; codecs="vp9"') ||
      video.canPlayType("video/webm");

    var finalSrc = webmSrc;
    var finalType = 'video/webm; codecs="vp9"';

    if (isSafariEngine && canPlayHevc) {
      finalSrc = hevcSrc;
      finalType = 'video/mp4; codecs="hvc1"';
    } else if (!canPlayWebm && canPlayHevc) {
      finalSrc = hevcSrc;
      finalType = 'video/mp4; codecs="hvc1"';
    }

    sourceEl.src = finalSrc;
    sourceEl.type = finalType;

    video.load();
    var p = video.play();
    if (p && typeof p.then === "function") {
      p.catch(function () {});
    }
  })();
</script>
```

To use:

1. Copy the contents of `your-base-name.txt`.
2. Paste into your project:

   - Either as a full HTML file for testing, or
   - Extract just the `<video>` + `<script>` block into your component/template.

3. Update `webmSrc` / `hevcSrc` (and `poster`, if desired) to match your hosting paths.

---

## 9. Troubleshooting

### 9.1. FFmpeg missing

Error example:

```text
ffmpeg is not installed and Homebrew is not available.
```

Fix:

- Install FFmpeg (via Homebrew or manually).
- Re-run `rt-alpha-video`.

### 9.2. No PNG files found

If you see:

```text
No .png files found in input directory: <path>
```

Check:

- The `--input` path is correct.
- The directory actually contains `.png` files.
- The extension is `.png` (not `.PNG` with some mismatch — though case-insensitive matching is used).

### 9.3. Could not infer pattern

If automatic pattern detection fails:

```text
Could not infer numeric pattern from files.
First file: Frame_final.png
```

Fix: specify the pattern manually:

```bash
rt-alpha-video \
  --input ./frames \
  --fps 50 \
  --pattern "Frame_%05d.png" \
  --start 0
```

### 9.4. HEVC not generated

Possible reasons:

- You passed `--no-hevc`
- `hevc_videotoolbox` encoder is not available in your FFmpeg build
- Your FFmpeg build is too old or compiled without VideoToolbox

The CLI will still encode WebM and print a message such as:

```text
Skipping HEVC encode: hevc_videotoolbox encoder not available in ffmpeg on this system.
```

---

## 10. Typical workflow

Minimal:

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
  --width 500 \
  --height 500 \
  --name "frame-preview" \
  --webm-quality 72 \
  --hevc-quality 95
```

Then:

- Drop the `.webm` and `.mov` files into your preferred hosting (CDN, static folder, etc.).
- Copy HTML/JS from the generated `.txt` file into your site.

---

## 11. Web helper

A visual companion tool for `rt-alpha-video`
(no installation required — runs entirely in your browser).

### Launch Web Helper

[https://rethink-js.github.io/alpha-video-cli-web-helper](https://rethink-js.github.io/alpha-video-cli-web-helper)

### Repository

[https://github.com/Rethink-JS/alpha-video-cli-web-helper](https://github.com/Rethink-JS/alpha-video-cli-web-helper)

The web helper provides:

- **Drag and drop folder analysis**
  Detects sequences directly from your PNG files.

- **Pattern detection**
  Automatically identifies patterns (for example `%05d`), start frames, and end frames using the same logic as the CLI.

- **FPS auto-detection**
  Attempts to estimate the most likely frame rate (24, 25, 30, 48, 50, 60) from total frame count.

- **Transparency verification**
  Checks the alpha channel of your frames so you don’t accidentally encode opaque videos.

- **Live canvas preview**
  Loops the sequence so you can confirm smoothness and transitions before encoding.

- **Smart defaults**
  Mirrors CLI defaults (FPS, quality settings, naming).

- **One-click command generation**
  Outputs a full, ready-to-run terminal command string for `rt-alpha-video`.

### Privacy and security

- 100% client-side.
- No files ever uploaded.
- Uses browser memory only.
- No external servers or third-party processing.

### Browser path limitations

Due to browser security, the helper cannot read absolute paths (such as `/Users/username/Desktop/project/frames`). It only sees relative folder names (for example `frames`).

- The helper will suggest a relative path like `./frames`.
- If you run the command from the parent directory of your frames folder, this works as-is.
- Otherwise, replace `--input` with your actual absolute path.

Tip for macOS: drag a folder from Finder into Terminal to paste its absolute path.

---

## 12. Changelog

### 1.2.0

- Improved pattern detection logic:

  - Uses a shared prefix/mid/suffix comparison between first and last frames
  - Handles multiple numeric segments more robustly

- Added explicit `--width` and `--height` flags with square-output behaviour when only one dimension is set
- Added a warning when requested resize dimensions upscale beyond the source PNG size
- Extended summary output with:

  - Total PNG size
  - Per-encode duration for WebM and HEVC

- Updated HTML preview snippet to:

  - Use `<source>` with runtime codec selection
  - Prefer HEVC (`hvc1`) on Safari / iOS when supported, otherwise WebM

- Minor improvements to progress output and quiet mode handling

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

Package: `@rethink-js/alpha-video-cli`
GitHub: [https://github.com/Rethink-JS/alpha-video-cli](https://github.com/Rethink-JS/alpha-video-cli)

---

by **Rethink JS**
[https://github.com/Rethink-JS](https://github.com/Rethink-JS)
