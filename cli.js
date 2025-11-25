#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const minimist = require("minimist");
const cliProgress = require("cli-progress");
const pc = require("picocolors");

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
  const pngs = entries
    .filter(function (name) {
      return name.toLowerCase().endsWith(".png");
    })
    .sort();
  if (!pngs.length) {
    console.error(
      pc.red("No .png files found in input directory: " + inputDir)
    );
    process.exit(1);
  }
  const first = pngs[0];
  const match = first.match(/^(.*?)(\d+)\.png$/i);
  if (!match) {
    console.error(
      pc.red("Could not infer pattern from first PNG file name: " + first)
    );
    console.error(
      pc.yellow('Please supply --pattern explicitly, e.g. "Frame_%05d.png".')
    );
    process.exit(1);
  }
  const base = match[1];
  const num = match[2];
  const width = num.length;
  const pattern = base + "%0" + width + "d.png";
  const start = parseInt(num, 10);
  return { pattern, start };
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

async function main() {
  ensureMacOS();
  const argv = minimist(process.argv.slice(2), {
    string: [
      "input",
      "output",
      "fps",
      "pattern",
      "name",
      "start",
      "webm-quality",
      "hevc-quality",
    ],
    boolean: ["no-hevc", "quiet"],
    alias: {
      i: "input",
      o: "output",
      q: "quiet",
    },
    default: {},
  });
  const quiet = !!argv.quiet;
  if (!quiet) {
    console.log("");
    console.log(pc.bold(pc.cyan("rt-alpha-video v0.1.0")));
    console.log(
      pc.dim(
        "Convert PNG frame sequences with alpha → WebM + HEVC + HTML preview (macOS)."
      )
    );
    console.log("");
  }
  const inputDir = argv.input;
  const fpsRaw = argv.fps;
  if (!inputDir) {
    console.error(pc.red("Missing required --input <folder> argument."));
    process.exit(1);
  }
  if (!fpsRaw) {
    console.error(pc.red("Missing required --fps <number> argument."));
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
  const pngStats = getPngStats(absInput);
  let webmCrf = 28;
  if (typeof argv["webm-quality"] === "string") {
    const q = Number(argv["webm-quality"]);
    if (!Number.isFinite(q)) {
      console.error(
        pc.red("Invalid --webm-quality value: " + argv["webm-quality"])
      );
      process.exit(1);
    }
    webmCrf = mapWebmQualityToCrf(q);
  }
  let hevcAlphaQuality = 0.9;
  if (typeof argv["hevc-quality"] === "string") {
    const qh = Number(argv["hevc-quality"]);
    if (!Number.isFinite(qh)) {
      console.error(
        pc.red("Invalid --hevc-quality value: " + argv["hevc-quality"])
      );
      process.exit(1);
    }
    hevcAlphaQuality = mapHevcQualityToAlpha(qh);
  }
  const baseName =
    argv.name || path.basename(absInput).replace(/\s+/g, "-").toLowerCase();
  if (!quiet) {
    console.log(pc.bold(pc.white("Input")));
    console.log("  Folder:   " + pc.white(absInput));
    console.log("  Pattern:  " + pc.white(pattern));
    console.log("  Start:    " + pc.white(String(startNumber)));
    console.log("  FPS:      " + pc.white(String(fps)));
    console.log("");
    console.log(pc.bold(pc.white("Output")));
    console.log("  Folder:   " + pc.white(outputDir));
    console.log("  Base name:" + pc.white(" " + baseName));
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
  const webmStart = Date.now();
  await encodeWithProgress(
    ffmpegCmd,
    [
      "-y",
      "-framerate",
      String(fps),
      "-start_number",
      String(startNumber),
      "-i",
      inputPatternPath,
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
      webmPath,
    ],
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
      const hevcStart = Date.now();
      await encodeWithProgress(
        ffmpegCmd,
        [
          "-y",
          "-framerate",
          String(fps),
          "-start_number",
          String(startNumber),
          "-i",
          inputPatternPath,
          "-vf",
          "format=bgra",
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
        ],
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
    console.log(
      "  WebM size:   " +
        pc.white(formatBytes(webmStat.size)) +
        "  (" +
        webmDurationMs +
        " ms)"
    );
    if (hevcWritten && hevcStat) {
      console.log(
        "  HEVC size:   " +
          pc.white(formatBytes(hevcStat.size)) +
          "  (" +
          hevcDurationMs +
          " ms)"
      );
    }
    console.log("");
    console.log(
      pc.dim(
        "Open the .txt file to copy-paste the ready-made HTML and JS snippet into your project."
      )
    );
    console.log("");
    console.log("");
    const art = [
      "..................................................",
      "..................................................",
      "..................................................",
      "..................................................",
      "..................................................",
      "..................................................",
      "..................................................",
      "...................@@@@@@@@@@@@...................",
      "................@@@@@@@@@@@@@@@@@@................",
      "...............@@@@@..........@@@@@...............",
      "..............@@@@..............@@@@..............",
      ".............@@@@................@@@@.............",
      ".............@@@@................@@@@.............",
      ".............@@@@...@@@@@@@@@@@@@@@@@.............",
      ".............@@@@...@@@@@@@@@@@@@@@@@.............",
      ".............@@@@........@@@@.....................",
      ".............@@@@.........@@@@....................",
      ".............@@@@..........@@@@@..................",
      ".............@@@@...........@@@@@@@@@.............",
      ".............@@@@..............@@@@@@.............",
      "..................................................",
      "..................................................",
      "..................................................",
      "..................................................",
      "..................................................",
      "..................................................",
      "..................................................",
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
