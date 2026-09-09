import type { Metadata } from "next";
import WritingStudio from "./writing-studio";

export const metadata: Metadata = {
  title: "字芽 · 一笔一画学汉字",
  description: "输入汉字，看笔顺动画，听语音提示，再亲手写一遍。",
};

export default function Home() {
  return <WritingStudio />;
}
