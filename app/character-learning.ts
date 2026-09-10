import cnchar from "cnchar";
import order from "cnchar-order";
import { pinyin } from "pinyin-pro";

cnchar.use(order);

export const STROKE_AUDIO_NAMES: Record<string, string> = {
  横折折撇: "heng-zhe-zhe-pie",
  竖弯: "shu-wan",
  横折: "heng-zhe",
  横斜钩: "heng-xie-gou",
  横: "heng",
  捺: "na",
  横折钩: "heng-zhe-gou",
  竖: "shu",
  竖钩: "shu-gou",
  点: "dian",
  撇: "pie",
  撇折: "pie-zhe",
  竖折撇: "shu-zhe-pie",
  竖折折: "shu-zhe-zhe",
  横折折折钩: "heng-zhe-zhe-zhe-gou",
  横撇弯钩: "heng-pie-wan-gou",
  竖折折钩: "shu-zhe-zhe-gou",
  提: "ti",
  弯钩: "wan-gou",
  斜钩: "xie-gou",
  卧钩: "wo-gou",
  横折折: "heng-zhe-zhe",
  横折弯: "heng-zhe-wan",
  横撇: "heng-pie",
  横钩: "heng-gou",
  横折提: "heng-zhe-ti",
  横折折折: "heng-zhe-zhe-zhe",
  竖提: "shu-ti",
  撇点: "pie-dian",
  竖弯钩: "shu-wan-gou",
};

export function getStrokeNames(char: string) {
  const result = cnchar.stroke(char, "order", "name") as unknown;
  if (!Array.isArray(result) || !Array.isArray(result[0])) return [];
  return (result[0] as string[]).map((name) => name.split("|")[0]);
}

export function getReadings(text: string) {
  const symbols = pinyin(text, { type: "array", toneType: "symbol" }) as string[];
  const numbered = pinyin(text, { type: "array", toneType: "num" }) as string[];
  return symbols.map((symbol, index) => {
    const numberedPinyin = numbered[index] ?? "";
    const tone = Number(numberedPinyin.match(/[0-5]/)?.[0] ?? 5);
    return {
      pinyin: symbol,
      tone,
      toneLabel: tone === 5 || tone === 0 ? "轻声" : `第${["", "一", "二", "三", "四"][tone]}声`,
      audioKey: numberedPinyin.toLowerCase().replaceAll("ü", "v"),
    };
  });
}
