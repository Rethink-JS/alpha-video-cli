# rt-alpha-video

`rt-alpha-video` turns a folder of **PNG frames with alpha** into:

- `folder-name.webm` (VP9 + alpha)
- `folder-name-hevc.mov` (HEVC + alpha, tagged `hvc1` for Safari where supported)
- `folder-name.txt` (ready-to-paste HTML + JS snippet that auto-picks WebM/HEVC at runtime)

Designed for the **web** where you want transparent video instead of heavy image sequences or GIFs.

> **Platform:** macOS only  
> **Input:** PNG frame sequence with alpha (RGBA)

---

## 1. Requirements

Before running `rt-alpha-video`, you need:

### 1.1 OS and runtime

- **macOS** (Apple Silicon or Intel)
- **Node.js ≥ 16**

Check:

```bash
node -v
```

If Node is missing or too old, install a recent LTS from:

- Node.js: [https://nodejs.org/en/download](https://nodejs.org/en/download)
- Or via a version manager:

  - nvm: [https://github.com/nvm-sh/nvm](https://github.com/nvm-sh/nvm)
  - fnm: [https://github.com/Schniz/fnm](https://github.com/Schniz/fnm)
  - volta: [https://volta.sh](https://volta.sh)

### 1.2 FFmpeg

The CLI relies on `ffmpeg` with:

- `libvpx-vp9` encoder (for WebM + alpha)
- `hevc_videotoolbox` encoder (for HEVC + alpha)

> If `hevc_videotoolbox` is not available, HEVC encoding is skipped and only WebM is produced.

Check if `ffmpeg` is available:

```bash
ffmpeg -version
```

If this command fails, you don’t have FFmpeg in your `PATH`.

You can install FFmpeg manually (if you don’t use Homebrew) from:

- FFmpeg downloads: [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)

### 1.3 Homebrew (optional but strongly recommended)

If FFmpeg is **missing**, `rt-alpha-video` does this:

1. Tries to run `ffmpeg -version`.

2. If that fails, it checks for **Homebrew** with `brew --version`.

3. If Homebrew exists, it runs:

   ```bash
   brew install ffmpeg
   ```

4. If Homebrew **does not exist**, the CLI **exits with a clear error**, asking you to install FFmpeg manually.

So:

- If you’re happy using Homebrew:
  Install Homebrew first from [https://brew.sh](https://brew.sh), then the CLI can auto-install FFmpeg on first run.

- If you don’t want Homebrew:
  Install FFmpeg yourself (for example via MacPorts, a standalone binary, or any other method), make sure `ffmpeg` is on your `PATH`, and then rerun `rt-alpha-video`.

---

## 2. What the CLI actually does

Given an input folder of PNG frames like:

```text
frames/
  img_00000.png
  img_00001.png
  ...
  img_00999.png
```

and a frame rate, for example `--fps 50`, `rt-alpha-video` will:

1. **Detect the filename pattern** automatically (here: `img_%05d.png`, start index inferred).

2. Run **FFmpeg → WebM**:

   - Encoder: `libvpx-vp9`
   - Pixel format: `yuva420p` (YUV + alpha)
   - CRF chosen based on `--webm-quality` or defaults.

3. Run **FFmpeg → HEVC `.mov`** (if not disabled and encoder exists):

   - Encoder: `hevc_videotoolbox`
   - Pixel format: `bgra`
   - Tagged as `hvc1` for better Safari compatibility.
   - Alpha quality based on `--hevc-quality` or default.

4. Generate a **`.txt` file** containing:

   - `<video>` markup with a placeholder `poster=""`
   - A script that:

     - Detects Safari / iOS.
     - Checks `canPlayType` for HEVC and WebM.
     - Automatically picks `.webm` or `.mov`.
     - Attempts to auto-play once the tab becomes visible.

5. Print a **summary + stats**:

   - Number of frames
   - Total PNG size
   - Derived animation duration (`frames / fps`)
   - File sizes and encode times for WebM and HEVC

---

## 3. Installation

### 3.1 One-off usage with npx (recommended)

```bash
npx @rethink-js/alpha-video-cli --input ./frames --fps 50
```

This:

- Uses the published package directly from npm.
- Does **not** require a global install.

Package on npm:
[https://www.npmjs.com/package/@rethink-js/alpha-video-cli](https://www.npmjs.com/package/@rethink-js/alpha-video-cli)

### 3.2 Global install

```bash
npm install -g @rethink-js/alpha-video-cli

rt-alpha-video --input ./frames --fps 50
```

---

## 4. Basic usage

### Minimum required flags

```bash
rt-alpha-video --input ./frames --fps 50
```

- `--input ./frames`
  Folder containing your PNG sequence.
- `--fps 50`
  Frame rate you rendered the sequence at.

This creates:

```text
frames/dist/
  ├── frames.webm
  ├── frames-hevc.mov        # if HEVC encoder available and not skipped
  └── frames.txt             # HTML + JS snippet
```

Open the `.txt` file, copy-paste the snippet into your project, and update the video URLs accordingly.

---

## 5. CLI options (full)

### Required

- `--input <folder>`
  Folder with PNG frames (RGBA). Example: `./frames`.

- `--fps <number>`
  Frame rate of your animation. Example: `24`, `30`, `50`.

### Optional

- `--output <folder>`
  Custom output folder.
  Default: `<input>/dist`

- `--pattern <pattern>`
  Explicit pattern when auto-detect fails.
  Example:

  ```bash
  --pattern "Loop_%05d.png"
  ```

- `--start <number>`
  Starting index for the pattern if you’re not using the inferred one.

- `--name <basename>`
  Base name for output files.
  Defaults to the input folder name, lowercased and kebab-cased.

- `--webm-quality <1-100>`
  Logical quality control for WebM (1–100).
  Higher = better quality, larger file. Internally maps to a VP9 CRF in a safe range.

- `--hevc-quality <1-100>`
  Logical quality control for HEVC alpha (1–100).
  Higher = better alpha quality. Internally maps into `alpha_quality` range.

- `--no-hevc`
  Skip HEVC `.mov` generation completely.
  Use this if:

  - You don’t care about Safari-specific behavior, **or**
  - Your FFmpeg build does not include `hevc_videotoolbox`.

- `--quiet`
  Suppress progress bars and most logs.
  Errors and final summary still print.

- `--help`, `-h`
  Print usage info and exit.

---

## 6. Input expectations (PNG + alpha)

To get clean transparent video:

- **Use PNG with alpha (RGBA).**
  Tools like After Effects, Blender, etc. can export PNG sequences with transparency.

- **Consistent naming:**
  The CLI expects filenames like:

  ```text
  img_00000.png
  img_00001.png
  ...
  img_00999.png
  ```

  Auto-detection looks for:

  - A **prefix** (e.g. `img_`)
  - A **numeric suffix** before `.png` (e.g. `00000`)

- If your filenames don’t match this pattern, pass `--pattern` explicitly:

  ```bash
  rt-alpha-video --input ./frames \
    --fps 50 \
    --pattern "Frame_%04d.png" \
    --start 1
  ```

If you feed in PNGs without alpha, the videos will still be generated, but there won’t be any transparency to preserve.

---

## 7. Using the generated snippet

Inside `dist/folder-name.txt` you’ll see:

- A `<video>` element with `id="rt-alpha-video"` and a blank `poster=""`.
- A script that:

  - Chooses HEVC `.mov` on Safari/iOS if supported.
  - Falls back to WebM elsewhere.
  - Uses `canPlayType` to avoid broken sources.

Typical integration steps:

1. Upload `folder-name.webm` and `folder-name-hevc.mov` to your web project / CDN.

2. Copy the **contents** of `folder-name.txt` into your page.

3. Update:

   ```js
   var webmSrc = "folder-name.webm";
   var hevcSrc = "folder-name-hevc.mov";
   ```

   to point at your real video URLs.

4. Add a `poster` frame to improve UX:

   ```html
   <video
     id="rt-alpha-video"
     muted
     autoplay
     loop
     playsinline
     poster="/path/to/poster-frame.png"
   ></video>
   ```

5. Test on:

   - Desktop Chrome / Firefox (WebM)
   - Desktop Safari (HEVC)
   - iOS Safari / Chrome

---

## 8. What happens when something goes wrong?

### 8.1 “ffmpeg is not installed and Homebrew is not available.”

This means:

- `ffmpeg -version` failed, **and**
- `brew --version` failed.

The CLI stops and prints:

- That FFmpeg is missing.
- That Homebrew is not available.
- That you must install FFmpeg manually and rerun.

To fix:

1. **Option A: Install Homebrew, then rerun the CLI:**

   - Install Homebrew from [https://brew.sh](https://brew.sh)
   - Rerun `rt-alpha-video` – it will now auto-run:

     ```bash
     brew install ffmpeg
     ```

     if needed.

2. **Option B: Install FFmpeg by yourself, without Homebrew:**

   - Use any trusted method:

     - FFmpeg official builds: [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)
     - MacPorts, dmg installer, static binary, etc.

   - Ensure `ffmpeg` is on your `PATH` (so `ffmpeg -version` works in a new terminal).
   - Rerun `rt-alpha-video`.

Once `ffmpeg -version` works, the CLI won’t try to install FFmpeg again.

---

### 8.2 “No .png files found in input directory: …”

The input folder exists but:

- Contains no `.png` files, **or**
- Contains files with different extensions only.

Fix:

- Double-check your `--input` path.
- Ensure frames are actually PNG (`.png`).
- Ensure they are not nested in a subfolder (`./frames/subfolder/...`).

---

### 8.3 “Could not infer pattern from first PNG file name: …”

This happens when the first PNG filename **does not** look like:

- `Prefix_00001.png`, `Name0001.png`, etc.

In other words, there is no simple `[prefix][digits].png` pattern to latch onto.

Fix:

- Either rename frames to something like `img_00001.png`, **or**
- Specify the pattern and optional start index manually:

  ```bash
  rt-alpha-video \
    --input ./frames \
    --fps 30 \
    --pattern "some-weird-name_%03d.png" \
    --start 5
  ```

---

### 8.4 HEVC file not generated

If HEVC fails, you’ll see:

- A notice saying HEVC is skipped, or
- A summary entry: `• HEVC file not generated`

Reasons:

- Your FFmpeg build does not support `hevc_videotoolbox`.
- You passed `--no-hevc`.

You’ll still get a WebM with alpha, and the snippet will indicate the HEVC file is not present.

---

## 9. Typical workflow (end-to-end)

1. **Export PNG sequence** from After Effects / Blender:

   - RGBA (with alpha).
   - Consistent naming, e.g. `img_00000.png` → `img_00999.png`.
   - Frame rate, e.g. `50 fps`.

2. **Verify your frames:**

   Make sure they are consistently named and have alpha/transparency in them.

3. **Run the CLI:**

   ```bash
   npx @rethink-js/alpha-video-cli --input ./frames --fps 50
   ```

4. **Inspect output:**

   ```text
   frames/dist/
     ├── frames.webm
     ├── frames-hevc.mov
     └── frames.txt
   ```

5. **Integrate into your site:**

   - Copy contents of `frames.txt` into your HTML.
   - Point `webmSrc` / `hevcSrc` to your hosted video URLs.
   - Add a `poster` attribute. (optional, but recommended)

6. **Test on target browsers/devices.**

---

## 10. Coming soon

We’re working on a small **web helper** for `rt-alpha-video`:

- Upload a zipped folder of PNG frames (with alpha).
- The helper will:

  - Inspect your files and pattern.
  - Confirm frame count and FPS assumptions.
  - Generate the **exact terminal command** you need to run `alpha-video-cli` locally (with your paths, fps, and naming baked in).

- Goal: make it even easier to go from a PNG sequence → transparent WebM/HEVC + integration snippet, without having to think about FFmpeg arguments at all.

---

## 11. Changelog

### 1.0.0

- First “stable” version.

- Added:

  - `--help` / `-h` flag (usage overview).
  - More explicit error handling and messaging.
  - Clear separation between:

    - “No PNGs in folder”
    - “Pattern could not be inferred”

  - Encoding stats with:

    - Frame count
    - Total PNG size
    - Derived animation duration
    - WebM/HEVC sizes and encode times.

- Switched HTML preview from `.html` file to `.txt` snippet for easier copy-paste into existing projects.

- Clarified alpha expectations in docs:

  - Input must be PNG with alpha (RGBA).
  - Output preserves transparency in WebM + HEVC where supported.

### 0.1.0

- Initial public release.
- Core features:

  - PNG → WebM + HEVC encode.
  - Automatic pattern detection.
  - Basic HTML preview.
  - Automatic FFmpeg installation via Homebrew when missing.

---

## 12. License and attribution

- License: **MIT**
- Package: `@rethink-js/alpha-video-cli`
- Repo: [https://github.com/Rethink-JS/alpha-video-cli](https://github.com/Rethink-JS/alpha-video-cli)

---

powered by **Rethink JS**
GitHub: [https://github.com/Rethink-JS](https://github.com/Rethink-JS)
