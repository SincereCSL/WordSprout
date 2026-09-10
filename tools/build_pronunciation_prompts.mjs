#!/usr/bin/env node

import { readdir, writeFile } from "node:fs/promises";
import { pinyin } from "pinyin-pro";

const dataUrl = new URL("../public/hanzi-data/", import.meta.url);
const outputUrl = new URL("./pronunciation-prompts.json", import.meta.url);
const files = await readdir(dataUrl);
const candidates = new Map();

for (const file of files) {
  if (!file.endsWith(".json")) continue;
  const char = file.slice(0, -5);
  if (Array.from(char).length !== 1 || !/[\u3400-\u9fff\uf900-\ufaff]/u.test(char)) continue;
  const reading = pinyin(char, { type: "array", toneType: "num" })[0];
  if (!/^[a-zü]+[0-5]$/i.test(reading)) continue;
  const key = reading.toLowerCase().replaceAll("ü", "v");
  const existing = candidates.get(key);
  if (!existing || (char >= "一" && char <= "龥" && !(existing >= "一" && existing <= "龥"))) candidates.set(key, char);
}

const prompts = Object.fromEntries([...candidates].sort(([left], [right]) => left.localeCompare(right)));
await writeFile(outputUrl, `${JSON.stringify(prompts, null, 2)}\n`);
console.log(`已整理 ${Object.keys(prompts).length} 个带声调音节：${outputUrl.pathname}`);
