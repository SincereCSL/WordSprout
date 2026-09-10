#!/usr/bin/env python3
"""Generate Qwen pronunciation assets for offline character readings."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from generate_ziya_audio import MODEL, ROOT, VOICE, convert, normalize

PROMPTS = Path(__file__).with_name("pronunciation-prompts.json")
CACHE = Path(__file__).with_name(".pronunciation-cache")


def first_utterance(waveform, sample_rate):
    """Keep the first spoken syllable and discard occasional model tail speech."""
    waveform = np.asarray(waveform, dtype=np.float32).squeeze()
    frame = max(1, round(sample_rate * 0.02))
    rms = np.array([
        np.sqrt(np.mean(waveform[index:index + frame] ** 2))
        for index in range(0, len(waveform), frame)
    ])
    voiced = np.flatnonzero(rms > 0.012)
    if not len(voiced):
        return waveform[:round(sample_rate * 1.5)]
    start_frame = max(0, int(voiced[0]) - 2)
    end_frame = min(len(rms), start_frame + round(1.5 / 0.02))
    minimum_end = int(voiced[0]) + round(0.24 / 0.02)
    quiet_run = round(0.12 / 0.02)
    for index in range(minimum_end, end_frame - quiet_run):
        if np.all(rms[index:index + quiet_run] <= 0.012):
            end_frame = index + 2
            break
    clipped = waveform[start_frame * frame:min(len(waveform), end_frame * frame)].copy()
    fade = min(len(clipped), round(sample_rate * 0.025))
    if fade:
        clipped[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return clipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "public" / "audio")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--assemble-only", action="store_true")
    parser.add_argument("--export-files", action="store_true")
    args = parser.parse_args()
    target = args.output / "pronunciations.m4a"
    index_target = args.output / "pronunciations.json"
    prompts = json.loads(PROMPTS.read_text(encoding="utf-8"))
    CACHE.mkdir(parents=True, exist_ok=True)
    missing = [] if args.assemble_only or args.export_files else [(key, char) for key, char in prompts.items() if args.overwrite or not (CACHE / f"{key}.wav").exists()]
    print(f"读音总数：{len(prompts)}；待生成：{len(missing)}", flush=True)

    if missing:
        import mlx.core as mx
        import soundfile as sf
        from mlx_audio.tts.utils import load_model

        model = load_model(MODEL)
        for offset in range(0, len(missing), args.batch_size):
            batch = missing[offset:offset + args.batch_size]
            position = min(offset + len(batch), len(missing))
            print(f"[{position}/{len(missing)}] 批量生成 {batch[0][0]} … {batch[-1][0]}", flush=True)
            mx.random.seed(3101)
            results = list(model.batch_generate(
                texts=[f"{char}。" for _, char in batch],
                instructs=[VOICE] * len(batch),
                lang_code="Chinese",
                max_tokens=32,
            ))
            if len(results) != len(batch):
                raise RuntimeError(f"批量生成不完整：应有 {len(batch)}，实际 {len(results)}")
            for result in results:
                key, _ = batch[result.sequence_idx]
                sample_rate = int(getattr(result, "sample_rate", 0) or getattr(model, "sample_rate", 24000))
                sf.write(CACHE / f"{key}.wav", normalize(result.audio), sample_rate, subtype="PCM_16")

    import soundfile as sf

    sample_rate = 24000
    if args.export_files or not args.assemble_only:
        output_dir = args.output / "pronunciations"
        output_dir.mkdir(parents=True, exist_ok=True)
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("未找到 ffmpeg")
        jobs = [(key, char) for key, char in prompts.items() if args.overwrite or not (output_dir / f"{key}.m4a").exists()]
        print(f"待导出独立读音：{len(jobs)}", flush=True)
        with tempfile.TemporaryDirectory(prefix="ziya-pronunciation-files-") as temp_dir:
            temp = Path(temp_dir)
            def export(job):
                key, _ = job
                waveform, current_rate = sf.read(CACHE / f"{key}.wav", dtype="float32")
                if current_rate != sample_rate:
                    raise RuntimeError(f"采样率不一致：{key} = {current_rate}")
                wav = temp / f"{key}.wav"
                sf.write(wav, first_utterance(waveform, sample_rate), sample_rate, subtype="PCM_16")
                subprocess.run([
                    ffmpeg, "-loglevel", "error", "-y", "-i", str(wav),
                    "-c:a", "aac", "-b:a", "48k", str(output_dir / f"{key}.m4a"),
                ], check=True)
            with ThreadPoolExecutor(max_workers=8) as pool:
                for position, _ in enumerate(pool.map(export, jobs), 1):
                    if position % 100 == 0 or position == len(jobs):
                        print(f"[{position}/{len(jobs)}] 已导出", flush=True)
        print(f"完成：{len(prompts)} 个按需读音文件", flush=True)
        return

    silence = np.zeros(round(sample_rate * 0.12), dtype=np.float32)
    parts = []
    entries = {}
    cursor = 0
    for key, char in prompts.items():
        waveform, current_rate = sf.read(CACHE / f"{key}.wav", dtype="float32")
        if current_rate != sample_rate:
            raise RuntimeError(f"采样率不一致：{key} = {current_rate}")
        waveform = np.asarray(waveform, dtype=np.float32).squeeze()
        waveform = first_utterance(waveform, sample_rate)
        start = cursor / sample_rate
        duration = len(waveform) / sample_rate
        entries[key] = {"start": round(start, 4), "duration": round(duration, 4), "sample": char}
        parts.extend((waveform, silence))
        cursor += len(waveform) + len(silence)

    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="ziya-pronunciations-") as temp_dir:
        wav = Path(temp_dir) / "pronunciations.wav"
        sf.write(wav, np.concatenate(parts), sample_rate, subtype="PCM_16")
        convert(wav, target)
    index_target.write_text(json.dumps({"audio": "/audio/pronunciations.m4a", "entries": entries}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"完成：{target}（{target.stat().st_size / 1024 / 1024:.1f} MB）", flush=True)


if __name__ == "__main__":
    main()
