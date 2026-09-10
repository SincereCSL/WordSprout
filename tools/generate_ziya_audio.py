#!/usr/bin/env python3
"""Generate the offline Mandarin prompt set used by 字芽."""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit"
VOICE = (
    "一位温柔亲切、有活力的中国小学低年级女老师。使用自然流畅的普通话，语速稍慢，"
    "吐字清晰，像坐在孩子身边耐心陪伴书写。语气真诚、有鼓励感，不要播音腔，"
    "不要机械停顿，不要夸张或幼稚的卡通腔。"
)

PROMPTS = {
    "intro-reading": "这个字读作。",
    "look-start": "仔细看，我们一笔一画来写这个字。",
    "look-complete": "看清楚了吗？现在轮到你啦！",
    "practice-start": "轮到你了，请在米字格里认真写一遍。",
    "mistake": "慢一点，想一想这一笔从哪里开始，再试一次。",
    "correct": "写对啦，继续！",
    "complete": "太棒了！你写对了！",
}
PROMPTS.update({f"stroke-{number:02d}": f"第{number}笔。" for number in range(1, 31)})
PROMPTS.update({f"tone-{number}": f"第{'一二三四'[number - 1]}声。" for number in range(1, 5)})
PROMPTS["tone-5"] = "轻声。"
PROMPTS.update({f"total-strokes-{number:02d}": f"一共{number}画。" for number in range(1, 31)})
STROKE_NAMES = {
    "heng-zhe-zhe-pie": "横折折撇。", "shu-wan": "竖弯。", "heng-zhe": "横折。",
    "heng-xie-gou": "横斜钩。", "heng": "横。", "na": "捺。", "heng-zhe-gou": "横折钩。",
    "shu": "竖。", "shu-gou": "竖钩。", "dian": "点。", "pie": "撇。", "pie-zhe": "撇折。",
    "shu-zhe-pie": "竖折撇。", "shu-zhe-zhe": "竖折折。",
    "heng-zhe-zhe-zhe-gou": "横折折折钩。", "heng-pie-wan-gou": "横撇弯钩。",
    "shu-zhe-zhe-gou": "竖折折钩。", "ti": "提。", "wan-gou": "弯钩。", "xie-gou": "斜钩。",
    "wo-gou": "卧钩。", "heng-zhe-zhe": "横折折。", "heng-zhe-wan": "横折弯。",
    "heng-pie": "横撇。", "heng-gou": "横钩。", "heng-zhe-ti": "横折提。",
    "heng-zhe-zhe-zhe": "横折折折。", "shu-ti": "竖提。", "pie-dian": "撇点。",
    "shu-wan-gou": "竖弯钩。",
}
PROMPTS.update({f"stroke-name-{name}": text for name, text in STROKE_NAMES.items()})


def normalize(audio):
    import numpy as np
    waveform = np.asarray(audio, dtype=np.float32).squeeze()
    if waveform.ndim != 1 or not waveform.size:
        raise RuntimeError("模型返回了空音频")
    waveform = np.nan_to_num(waveform)
    peak = float(np.max(np.abs(waveform)))
    if not math.isfinite(peak) or peak <= 0:
        raise RuntimeError("模型返回了无效音频")
    return waveform * min(1.0, 0.95 / peak)


def convert(wav: Path, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    afconvert = shutil.which("afconvert")
    if not afconvert:
        raise RuntimeError("未找到 afconvert")
    subprocess.run([afconvert, str(wav), str(target), "-f", "m4af", "-d", "aac", "-q", "127"], check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "public" / "audio")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    jobs = [(name, text) for name, text in PROMPTS.items() if args.overwrite or not (args.output / f"{name}.m4a").exists()]
    print(f"待生成：{len(jobs)} 句")
    if args.dry_run or not jobs:
        return

    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model

    model = load_model(MODEL)
    manifest_path = args.output / "manifest.json"
    previous = {}
    if manifest_path.exists():
        previous = {item["file"]: item for item in json.loads(manifest_path.read_text(encoding="utf-8")).get("files", [])}
    generated = []
    with tempfile.TemporaryDirectory(prefix="ziya-qwen-") as temp_dir:
        temp = Path(temp_dir)
        for index, (name, text) in enumerate(jobs, 1):
            print(f"[{index}/{len(jobs)}] {name}: {text}", flush=True)
            # Reuse one seed so every prompt sounds like the same teacher.
            mx.random.seed(3101)
            results = list(model.generate_voice_design(text=text, language="Chinese", instruct=VOICE))
            if not results:
                raise RuntimeError(f"没有生成音频：{name}")
            result = results[0]
            wav = temp / f"{name}.wav"
            sf.write(wav, np.asarray(normalize(result.audio)), int(getattr(result, "sample_rate", 0) or getattr(model, "sample_rate", 24000)), subtype="PCM_16")
            convert(wav, args.output / f"{name}.m4a")
            generated.append({"file": f"{name}.m4a", "text": text})

    for item in generated:
        previous[item["file"]] = item

    manifest = {
        "generator": "Qwen3-TTS VoiceDesign via MLX-Audio",
        "model": MODEL,
        "voice": VOICE,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "files": [previous[name] for name in sorted(previous)],
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
