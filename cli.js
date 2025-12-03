#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const minimist = require("minimist");
const cliProgress = require("cli-progress");
const pc = require("picocolors");

const VERSION = "1.2.0";

function runQuiet(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "ignore" });
  if (res.error) {
    return { ok: false };
  }
  return { ok: res.status === 0 };
}

function ensureMacOS() {
  if (os.platform() !== "darwin") {
    console.error(pc.red("rt-alpha-video currently supports macOS only."));
    process.exit(1);
  }
}

function ensureFfmpeg() {
  const check = runQuiet("ffmpeg", ["-version"]);
  if (check.ok) return "ffmpeg";
  const hasBrew = runQuiet("brew", ["--version"]);
  if (!hasBrew.ok) {
    console.error(
      pc.red("ffmpeg is not installed and Homebrew is not available.")
    );
    console.error(
      pc.yellow("Please install ffmpeg manually, then re-run rt-alpha-video.")
    );
    process.exit(1);
  }
  console.log(
    pc.yellow("ffmpeg not found. Installing via Homebrew: brew install ffmpeg")
  );
  const res = spawnSync("brew", ["install", "ffmpeg"], { stdio: "inherit" });
  if (res.error || res.status !== 0) {
    console.error(
      pc.red("ffmpeg installation via Homebrew appears to have failed.")
    );
    console.error(
      pc.yellow("Please install ffmpeg manually, then re-run rt-alpha-video.")
    );
    process.exit(1);
  }
  const recheck = runQuiet("ffmpeg", ["-version"]);
  if (!recheck.ok) {
    console.error(
      pc.red("ffmpeg installation via Homebrew did not complete correctly.")
    );
    process.exit(1);
  }
  return "ffmpeg";
}

function detectPattern(inputDir) {
  const entries = fs.readdirSync(inputDir);
  const files = entries
    .filter(function (name) {
      return name.toLowerCase().endsWith(".png");
    })
    .sort();

  if (!files.length) {
    console.error(
      pc.red("No .png files found in input directory: " + inputDir)
    );
    console.error(
      pc.yellow(
        "Make sure your input folder contains PNG frames with alpha, e.g. Frame_00001.png."
      )
    );
    process.exit(1);
  }

  const totalFrames = files.length;
  const firstFile = files[0];
  const lastFile = files[files.length - 1];

  let patternStr = "";
  let startN = 0;

  const dotIndexFirst = firstFile.lastIndexOf(".");
  const ext = dotIndexFirst !== -1 ? firstFile.slice(dotIndexFirst) : "";
  const baseFirst =
    dotIndexFirst !== -1 ? firstFile.slice(0, dotIndexFirst) : firstFile;

  const dotIndexLast = lastFile.lastIndexOf(".");
  const baseLast =
    dotIndexLast !== -1 ? lastFile.slice(0, dotIndexLast) : lastFile;

  const lenFirst = baseFirst.length;
  const lenLast = baseLast.length;
  const maxPrefix = Math.min(lenFirst, lenLast);

  let prefixLen = 0;
  while (
    prefixLen < maxPrefix &&
    baseFirst[prefixLen] === baseLast[prefixLen]
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  const maxSuffix = Math.min(lenFirst - prefixLen, lenLast - prefixLen);
  while (
    suffixLen < maxSuffix &&
    baseFirst[lenFirst - 1 - suffixLen] === baseLast[lenLast - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = baseFirst.slice(0, prefixLen);
  const suffix = suffixLen > 0 ? baseFirst.slice(lenFirst - suffixLen) : "";

  const midFirst = baseFirst.slice(prefixLen, lenFirst - suffixLen);
  const midLast = baseLast.slice(prefixLen, lenLast - suffixLen);

  function getNumericRuns(str) {
    const regex = /(\d+)/g;
    const runs = [];
    let m;
    while ((m = regex.exec(str)) !== null) {
      runs.push({ start: m.index, text: m[0] });
    }
    return runs;
  }

  const runsFirst = getNumericRuns(midFirst);
  const runsLast = getNumericRuns(midLast);

  let chosenIndex = -1;
  for (let i = 0; i < runsFirst.length; i++) {
    const r0 = runsFirst[i];
    const r1 = runsLast[i];
    if (!r1) continue;
    if (r0.text !== r1.text) {
      chosenIndex = i;
      break;
    }
  }

  if (chosenIndex === -1 && runsFirst.length === 1) {
    chosenIndex = 0;
  }

  if (chosenIndex === -1) {
    const regexAll = /(\d+)/g;
    let lastMatch = null;
    let m;
    while ((m = regexAll.exec(baseFirst)) !== null) {
      lastMatch = m;
    }
    if (lastMatch) {
      const numericStr = lastMatch[0];
      const width = numericStr.length;
      startN = parseInt(numericStr, 10);
      const numIndex = lastMatch.index;
      const basePrefix = baseFirst.slice(0, numIndex);
      const baseSuffix = baseFirst.slice(numIndex + width);
      patternStr = basePrefix + "%0" + width + "d" + baseSuffix + ext;
    } else {
      console.error(pc.red("Could not infer numeric pattern from files."));
      console.error(pc.yellow("First file: " + firstFile));
      process.exit(1);
    }
  } else {
    const run = runsFirst[chosenIndex];
    const numericStr = run.text;
    const width = numericStr.length;
    startN = parseInt(numericStr, 10);
    const midPattern =
      midFirst.slice(0, run.start) +
      "%0" +
      width +
      "d" +
      midFirst.slice(run.start + width);
    patternStr = prefix + midPattern + suffix + ext;
  }

  return { pattern: patternStr, start: startN };
}

function getFirstPngDimensions(inputDir) {
  try {
    const entries = fs.readdirSync(inputDir);
    const firstPng = entries.find((name) =>
      name.toLowerCase().endsWith(".png")
    );
    if (!firstPng) return null;

    const fullPath = path.join(inputDir, firstPng);
    const fd = fs.openSync(fullPath, "r");
    const buffer = Buffer.alloc(24);
    fs.readSync(fd, buffer, 0, 24, 0);
    fs.closeSync(fd);

    // PNG signature is bytes 0-7. IHDR starts at 8.
    // Width is at offset 16 (4 bytes), Height at offset 20 (4 bytes), Big Endian.
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    return { width, height };
  } catch (e) {
    return null;
  }
}

function getPngStats(inputDir) {
  const entries = fs.readdirSync(inputDir);
  const pngs = entries.filter(function (name) {
    return name.toLowerCase().endsWith(".png");
  });
  if (!pngs.length) {
    console.error(
      pc.red("No .png files found in input directory: " + inputDir)
    );
    console.error(
      pc.yellow(
        "Make sure your input folder contains PNG frames with alpha, e.g. Frame_00001.png."
      )
    );
    process.exit(1);
  }
  let totalBytes = 0;
  for (let i = 0; i < pngs.length; i++) {
    const p = path.join(inputDir, pngs[i]);
    const st = fs.statSync(p);
    totalBytes += st.size;
  }
  return { count: pngs.length, totalBytes };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hasHevcEncoder(ffmpegCmd) {
  const res = runQuiet(ffmpegCmd, [
    "-hide_banner",
    "-h",
    "encoder=hevc_videotoolbox",
  ]);
  return res.ok;
}

function clampQualityPercent(q) {
  let v = Math.round(q);
  if (v < 1) v = 1;
  if (v > 100) v = 100;
  return v;
}

function mapWebmQualityToCrf(q) {
  const qClamped = clampQualityPercent(q);
  const minCrf = 18;
  const maxCrf = 38;
  const t = (100 - qClamped) / 99;
  const crf = minCrf + t * (maxCrf - minCrf);
  return Math.round(crf);
}

function mapHevcQualityToAlpha(q) {
  const qClamped = clampQualityPercent(q);
  const alpha = qClamped / 100;
  if (alpha < 0.1) return 0.1;
  if (alpha > 1) return 1;
  return alpha;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v = v / 1024;
    i++;
  }
  const fixed = v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1);
  return fixed + " " + units[i];
}

function formatDurationMs(ms) {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    if (totalSeconds < 10) {
      return totalSeconds.toFixed(1) + "s";
    }
    return Math.round(totalSeconds) + "s";
  }
  const totalMinutes = totalSeconds / 60;
  if (totalMinutes < 60) {
    const m = Math.floor(totalMinutes);
    const s = Math.round(totalSeconds - m * 60);
    if (s <= 0) {
      return m + "m";
    }
    return m + "m " + s + "s";
  }
  const totalHours = totalMinutes / 60;
  const h = Math.floor(totalHours);
  const m = Math.round(totalMinutes - h * 60);
  if (m <= 0) {
    return h + "h";
  }
  return h + "h " + m + "m";
}

function buildHtml(name) {
  const htmlTemplate = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width,initial-scale=1">',
    "  <title>Transparent Video Preview · rt-alpha-video</title>",
    "  <style>",
    "    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020617;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif}",
    "    .rt-shell{width:100%;max-width:960px;padding:24px}",
    "    .rt-video-wrapper{width:100%;border-radius:18px;overflow:hidden;background:#020617;box-shadow:0 26px 70px rgba(0,0,0,.75)}",
    "    .rt-video-wrapper video{width:100%;height:auto;display:block;object-fit:contain;pointer-events:none}",
    "  </style>",
    "</head>",
    "<body>",
    '  <div class="rt-shell">',
    '    <div class="rt-video-wrapper">',
    "      <!-- Update the id if you reuse this markup; keep it in sync with the script below -->",
    '      <!-- Add a poster image URL here for better UX, e.g. poster="/path/to/frame.png" -->',
    '      <video id="rt-alpha-video" muted autoplay loop playsinline poster="">',
    '        <source src="">',
    "      </video>",
    "    </div>",
    "  </div>",
    "  <!-- If you host the encoded videos on a CDN or different path, update webmSrc and hevcSrc below -->",
    "  <script>",
    "  (function(){",
    '    var video=document.getElementById("rt-alpha-video");',
    "    if(!video)return;",
    '    var sourceEl=video.querySelector("source");',
    "    if(!sourceEl)return;",
    '    var webmSrc="__NAME__.webm";',
    '    var hevcSrc="__NAME__-hevc.mov";',
    '    var ua=navigator.userAgent||"";',
    "    var isIOS=/iPad|iPhone|iPod/.test(ua);",
    "    var isSafariDesktop=/^((?!chrome|android).)*safari/i.test(ua);",
    "    var isSafariEngine=isIOS||isSafariDesktop;",
    "    var canPlayHevc=video.canPlayType('video/mp4; codecs=\"hvc1\"');",
    '    var canPlayWebm=video.canPlayType(\'video/webm; codecs="vp9"\')||video.canPlayType("video/webm");',
    "    var finalSrc=webmSrc;",
    "    var finalType='video/webm; codecs=\"vp9\"';",
    "    if(isSafariEngine&&canPlayHevc){",
    "      finalSrc=hevcSrc;",
    "      finalType='video/mp4; codecs=\"hvc1\"';",
    "    }else if(!canPlayWebm&&canPlayHevc){",
    "      finalSrc=hevcSrc;",
    "      finalType='video/mp4; codecs=\"hvc1\"';",
    "    }",
    "    sourceEl.src=finalSrc;",
    "    sourceEl.type=finalType;",
    "    video.load();",
    "    function tryPlay(){",
    "      var p=video.play();",
    '      if(p&&typeof p.then==="function"){p.catch(function(){});}',
    "    }",
    '    if(document.visibilityState==="visible"){',
    "      tryPlay();",
    "    }else{",
    '      document.addEventListener("visibilitychange",function handler(){',
    '        if(document.visibilityState==="visible"){',
    '          document.removeEventListener("visibilitychange",handler);',
    "          tryPlay();",
    "        }",
    "      });",
    "    }",
    "  })();",
    "  </script>",
    "</body>",
    "</html>",
  ].join("\n");
  return htmlTemplate.replace(/__NAME__/g, name);
}

function encodeWithProgress(ffmpegCmd, args, label, quiet) {
  return new Promise(function (resolve, reject) {
    if (quiet) {
      const child = spawn(ffmpegCmd, args, { stdio: "ignore" });
      child.on("error", function (err) {
        console.error(
          pc.red("Error running ffmpeg for " + label + ": " + err.message)
        );
        reject(err);
      });
      child.on("close", function (code) {
        if (code === 0) {
          resolve();
        } else {
          console.error(
            pc.red("ffmpeg exited with code " + code + " for " + label)
          );
          reject(new Error("ffmpeg failed"));
        }
      });
      return;
    }
    console.log(pc.cyan("▶ " + label));
    const bar = new cliProgress.SingleBar(
      {
        format: pc.gray("   [{bar}]") + " " + pc.green("{percentage}%"),
        barCompleteChar: "■",
        barIncompleteChar: " ",
        hideCursor: true,
        clearOnComplete: true,
      },
      cliProgress.Presets.rect
    );
    bar.start(100, 0);
    let current = 0;
    const child = spawn(ffmpegCmd, args, { stdio: "ignore" });
    const timer = setInterval(function () {
      if (current < 95) {
        current += 2;
        if (current > 95) current = 95;
        bar.update(current);
      }
    }, 200);
    child.on("error", function (err) {
      clearInterval(timer);
      bar.stop();
      console.error(
        pc.red("Error running ffmpeg for " + label + ": " + err.message)
      );
      reject(err);
    });
    child.on("close", function (code) {
      clearInterval(timer);
      if (code === 0) {
        bar.update(100);
        bar.stop();
        console.log(pc.green("✓ " + label + " completed"));
        resolve();
      } else {
        bar.stop();
        console.error(
          pc.red("ffmpeg exited with code " + code + " for " + label)
        );
        reject(new Error("ffmpeg failed"));
      }
    });
  });
}

function printHelp() {
  console.log("");
  console.log(pc.bold(pc.cyan("rt-alpha-video")) + " " + pc.dim("v" + VERSION));
  console.log(
    pc.dim(
      "Convert PNG frame sequences with alpha → WebM + HEVC + HTML snippet (macOS only)."
    )
  );
  console.log("");
  console.log(pc.bold("Usage"));
  console.log("  rt-alpha-video --input <folder> --fps <number> [options]");
  console.log("");
  console.log(pc.bold("Required"));
  console.log(
    "  --input <folder>        Folder containing PNG frames with alpha"
  );
  console.log("  --fps <number>         Frames per second of the animation");
  console.log("");
  console.log(pc.bold("Optional"));
  console.log(
    "  --output <folder>      Custom output folder (default: <input>/dist)"
  );
  console.log("  --pattern <pattern>    Explicit pattern, e.g. Frame_%05d.png");
  console.log(
    "  --start <number>       Starting index for pattern (default inferred)"
  );
  console.log(
    "  --end <number>         Last frame index to include (inclusive)"
  );
  console.log(
    "  --width <number>       Resize video width (if height unset, creates square)"
  );
  console.log(
    "  --height <number>      Resize video height (if width unset, creates square)"
  );
  console.log(
    "  --name <basename>      Base output name (default: input folder name)"
  );
  console.log(
    "  --webm-quality <1-100> Logical quality for WebM (maps to CRF internally)"
  );
  console.log(
    "  --hevc-quality <1-100> Logical quality for HEVC alpha (maps to alpha_quality)"
  );
  console.log("  --no-hevc              Skip HEVC .mov encoding");
  console.log("  --quiet                Suppress progress bars and extra logs");
  console.log("  --help, -h             Show this help and exit");
  console.log("");
  console.log(pc.bold("Input expectations"));
  console.log(
    "  • PNG sequence with alpha channel (RGBA), e.g. Frame_00001.png → Frame_00350.png"
  );
  console.log("  • Filenames must share a common prefix and numeric suffix.");
  console.log("");
  console.log(pc.bold("Example"));
  console.log(
    "  rt-alpha-video --input ./frames --fps 50 --width 500 --height 500"
  );
  console.log("");
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const argv = minimist(rawArgs, {
    string: [
      "input",
      "output",
      "fps",
      "pattern",
      "name",
      "start",
      "end",
      "webm-quality",
      "hevc-quality",
      "width",
      "height",
    ],
    boolean: ["no-hevc", "quiet", "help", "h"],
    alias: {
      i: "input",
      o: "output",
      q: "quiet",
      h: "help",
      w: "width",
    },
    default: {},
  });

  if (argv.help || rawArgs.length === 0) {
    printHelp();
    process.exit(0);
  }

  ensureMacOS();

  const quiet = !!argv.quiet;

  if (!quiet) {
    console.log("");
    console.log(pc.bold(pc.cyan("rt-alpha-video v" + VERSION)));
    console.log(
      pc.dim(
        "Convert PNG frame sequences with alpha → WebM + HEVC + HTML snippet (macOS)."
      )
    );
    console.log("");
  }

  const inputDir = argv.input;
  const fpsRaw = argv.fps;

  if (!inputDir) {
    console.error(pc.red("Missing required --input <folder> argument."));
    console.error(pc.dim("Use --help for usage details."));
    process.exit(1);
  }
  if (!fpsRaw) {
    console.error(pc.red("Missing required --fps <number> argument."));
    console.error(pc.dim("Use --help for usage details."));
    process.exit(1);
  }

  const fps = Number(fpsRaw);
  if (!Number.isFinite(fps) || fps <= 0) {
    console.error(pc.red("Invalid --fps value: " + fpsRaw));
    process.exit(1);
  }

  const absInput = path.resolve(process.cwd(), inputDir);
  if (!fs.existsSync(absInput) || !fs.statSync(absInput).isDirectory()) {
    console.error(pc.red("Input path is not a directory: " + absInput));
    process.exit(1);
  }

  let outputDir;
  if (argv.output) {
    outputDir = path.resolve(process.cwd(), argv.output);
  } else {
    outputDir = path.join(absInput, "dist");
  }
  ensureDir(outputDir);

  let pattern = argv.pattern || null;
  let startNumber;
  if (pattern) {
    if (typeof argv.start === "string") {
      startNumber = parseInt(argv.start, 10);
      if (!Number.isFinite(startNumber)) {
        console.error(pc.red("Invalid --start value: " + argv.start));
        process.exit(1);
      }
    } else {
      startNumber = 0;
    }
  } else {
    const detected = detectPattern(absInput);
    pattern = detected.pattern;
    startNumber = detected.start;
  }

  let framesLimit = null;
  if (typeof argv.end === "string") {
    const endIndex = parseInt(argv.end, 10);
    if (!Number.isFinite(endIndex)) {
      console.error(pc.red("Invalid --end value: " + argv.end));
      process.exit(1);
    }
    if (endIndex < startNumber) {
      console.error(
        pc.red(
          "Invalid range: --end (" +
            argv.end +
            ") is less than --start (" +
            String(startNumber) +
            ")"
        )
      );
      process.exit(1);
    }
    const count = endIndex - startNumber + 1;
    if (count <= 0) {
      console.error(
        pc.red(
          "Invalid range computed from --start and --end; frame count would be <= 0."
        )
      );
      process.exit(1);
    }
    framesLimit = count;
  }

  let targetWidth = null;
  let targetHeight = null;
  const rawW = argv.width ? parseInt(argv.width, 10) : null;
  const rawH = argv.height ? parseInt(argv.height, 10) : null;

  if (rawW || rawH) {
    if (rawW && rawH) {
      targetWidth = rawW;
      targetHeight = rawH;
    } else if (rawW) {
      targetWidth = rawW;
      targetHeight = rawW;
    } else if (rawH) {
      targetWidth = rawH;
      targetHeight = rawH;
    }

    if (
      !Number.isFinite(targetWidth) ||
      targetWidth <= 0 ||
      !Number.isFinite(targetHeight) ||
      targetHeight <= 0
    ) {
      console.error(pc.red("Invalid width or height specified."));
      process.exit(1);
    }

    const sourceDims = getFirstPngDimensions(absInput);
    if (sourceDims) {
      if (targetWidth > sourceDims.width || targetHeight > sourceDims.height) {
        console.warn(
          pc.yellow(
            `Warning: Target size (${targetWidth}x${targetHeight}) is larger than source frame size (${sourceDims.width}x${sourceDims.height}). Scaling up may degrade quality.`
          )
        );
      }
    }
  }

  const pngStats = getPngStats(absInput);

  const webmLogicalDefault = 50;
  let webmCrf;
  if (typeof argv["webm-quality"] === "string") {
    const q = Number(argv["webm-quality"]);
    if (!Number.isFinite(q)) {
      console.error(
        pc.red("Invalid --webm-quality value: " + argv["webm-quality"])
      );
      process.exit(1);
    }
    webmCrf = mapWebmQualityToCrf(q);
  } else {
    webmCrf = mapWebmQualityToCrf(webmLogicalDefault);
  }

  const hevcLogicalDefault = 90;
  let hevcAlphaQuality;
  if (typeof argv["hevc-quality"] === "string") {
    const qh = Number(argv["hevc-quality"]);
    if (!Number.isFinite(qh)) {
      console.error(
        pc.red("Invalid --hevc-quality value: " + argv["hevc-quality"])
      );
      process.exit(1);
    }
    hevcAlphaQuality = mapHevcQualityToAlpha(qh);
  } else {
    hevcAlphaQuality = mapHevcQualityToAlpha(hevcLogicalDefault);
  }

  const baseName =
    argv.name || path.basename(absInput).replace(/\s+/g, "-").toLowerCase();

  if (!quiet) {
    console.log(pc.bold(pc.white("Input")));
    console.log("  Folder:   " + pc.white(absInput));
    console.log("  Pattern:  " + pc.white(pattern));
    console.log("  Start:    " + pc.white(String(startNumber)));
    if (framesLimit !== null) {
      console.log(
        "  End:      " + pc.white(String(startNumber + framesLimit - 1))
      );
    }
    console.log("  FPS:      " + pc.white(String(fps)));
    console.log("");
    console.log(pc.bold(pc.white("Output")));
    console.log("  Folder:   " + pc.white(outputDir));
    console.log("  Base name:" + pc.white(" " + baseName));
    if (targetWidth) {
      console.log("  Resize:   " + pc.white(`${targetWidth}x${targetHeight}`));
    }
    console.log(
      "  WebM CRF: " +
        pc.white(String(webmCrf)) +
        pc.dim("  (lower = better quality, larger file)")
    );
    console.log("  HEVC α:   " + pc.white(String(hevcAlphaQuality)));
    console.log("");
    console.log(pc.bold(pc.white("Tasks")));
  }

  const ffmpegCmd = ensureFfmpeg();
  const inputPatternPath = path.join(absInput, pattern);
  const webmPath = path.join(outputDir, baseName + ".webm");
  const hevcPath = path.join(outputDir, baseName + "-hevc.mov");

  const webmArgs = [
    "-y",
    "-framerate",
    String(fps),
    "-start_number",
    String(startNumber),
    "-i",
    inputPatternPath,
  ];

  if (targetWidth) {
    webmArgs.push("-vf", `scale=${targetWidth}:${targetHeight}:flags=lanczos`);
  }

  webmArgs.push(
    "-c:v",
    "libvpx-vp9",
    "-pix_fmt",
    "yuva420p",
    "-b:v",
    "0",
    "-crf",
    String(webmCrf),
    "-row-mt",
    "1",
    "-an",
    webmPath
  );

  if (framesLimit !== null) {
    // Insert -frames:v before output file.
    // The args logic above appends output file last.
    // We can just splice it in before the last element.
    webmArgs.splice(webmArgs.length - 1, 0, "-frames:v", String(framesLimit));
  }

  const webmStart = Date.now();
  await encodeWithProgress(
    ffmpegCmd,
    webmArgs,
    "Encoding WebM → " + baseName + ".webm",
    quiet
  );
  const webmDurationMs = Date.now() - webmStart;
  const webmStat = fs.statSync(webmPath);

  let hevcWritten = false;
  let hevcDurationMs = 0;
  let hevcStat = null;

  if (!argv["no-hevc"]) {
    if (hasHevcEncoder(ffmpegCmd)) {
      let vfFilter = "format=bgra";
      if (targetWidth) {
        vfFilter += `,scale=${targetWidth}:${targetHeight}:flags=lanczos`;
      }

      const hevcArgs = [
        "-y",
        "-framerate",
        String(fps),
        "-start_number",
        String(startNumber),
        "-i",
        inputPatternPath,
        "-vf",
        vfFilter,
        "-c:v",
        "hevc_videotoolbox",
        "-pix_fmt",
        "bgra",
        "-alpha_quality",
        String(hevcAlphaQuality),
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-colorspace",
        "bt709",
        "-tag:v",
        "hvc1",
        hevcPath,
      ];
      if (framesLimit !== null) {
        hevcArgs.splice(
          hevcArgs.length - 1,
          0,
          "-frames:v",
          String(framesLimit)
        );
      }
      const hevcStart = Date.now();
      await encodeWithProgress(
        ffmpegCmd,
        hevcArgs,
        "Encoding HEVC .mov → " + baseName + "-hevc.mov",
        quiet
      );
      hevcDurationMs = Date.now() - hevcStart;
      hevcStat = fs.statSync(hevcPath);
      hevcWritten = true;
    } else if (!quiet) {
      console.log(
        pc.yellow(
          "Skipping HEVC encode: hevc_videotoolbox encoder not available in ffmpeg on this system."
        )
      );
    }
  } else if (!quiet) {
    console.log(
      pc.yellow("Skipping HEVC encode because --no-hevc was provided.")
    );
  }

  const htmlPath = path.join(outputDir, baseName + ".txt");
  const html = buildHtml(baseName);
  fs.writeFileSync(htmlPath, html, "utf8");

  if (!quiet) {
    console.log(
      pc.cyan("▶ Writing HTML preview snippet → " + baseName + ".txt")
    );
    console.log(pc.green("✓ HTML snippet file created"));
  }

  console.log("");
  console.log(pc.bold(pc.white("Summary")));
  console.log("  " + pc.green("✔") + " " + webmPath);
  if (hevcWritten) {
    console.log("  " + pc.green("✔") + " " + hevcPath);
  } else {
    console.log("  " + pc.yellow("•") + " HEVC file not generated");
  }
  console.log("  " + pc.green("✔") + " " + htmlPath);
  console.log("");
  console.log(pc.bold(pc.white("Encoding stats")));
  console.log("  Frames:      " + pc.white(String(pngStats.count)));
  console.log("  PNG total:   " + pc.white(formatBytes(pngStats.totalBytes)));
  const animationDurationMs = (pngStats.count / fps) * 1000;
  console.log(
    "  Duration:    " + pc.white(formatDurationMs(animationDurationMs))
  );
  console.log(
    "  WebM size:   " +
      pc.white(formatBytes(webmStat.size)) +
      "  (" +
      formatDurationMs(webmDurationMs) +
      ")"
  );
  if (hevcWritten && hevcStat) {
    console.log(
      "  HEVC size:   " +
        pc.white(formatBytes(hevcStat.size)) +
        "  (" +
        formatDurationMs(hevcDurationMs) +
        ")"
    );
  }
  console.log("");
  console.log(
    pc.dim(
      "Open the .txt file to copy-paste the ready-made HTML and JS snippet into your project."
    )
  );
  console.log("");

  if (!quiet) {
    console.log("");
    const art = [
      "........................................",
      "........................................",
      "..............@@@@@@@@@@@@..............",
      "...........@@@@@@@@@@@@@@@@@@...........",
      "..........@@@@@..........@@@@@..........",
      ".........@@@@..............@@@@.........",
      "........@@@@................@@@@........",
      "........@@@@................@@@@........",
      "........@@@@...@@@@@@@@@@@@@@@@@........",
      "........@@@@...@@@@@@@@@@@@@@@@@........",
      "........@@@@........@@@@................",
      "........@@@@.........@@@@...............",
      "........@@@@..........@@@@@.............",
      "........@@@@...........@@@@@@@@@........",
      "........@@@@..............@@@@@@........",
      "........................................",
      "........................................",
    ];
    for (let i = 0; i < art.length; i++) {
      console.log(pc.gray(art[i]));
    }
    console.log("");
    console.log(pc.dim("powered by ") + pc.bold("Rethink JS"));
    console.log(pc.dim("GitHub - https://github.com/Rethink-JS"));
    console.log("");
    console.log("");
    console.log("");
  }
}

main().catch(function (err) {
  console.error(
    pc.red("Unexpected error:"),
    err && err.message ? err.message : err
  );
  process.exit(1);
});
