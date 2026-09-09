"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import HanziWriter from "hanzi-writer";

const EXAMPLES = ["日月山川", "天地人", "春风雨", "大小多少"];
const DEFAULT_TEXT = "永";
type WriterStatus = "loading" | "ready" | "error" | "practicing" | "complete";

function onlyHanzi(value: string) {
  return Array.from(value).filter((char) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(char)).slice(0, 12);
}

export default function WritingStudio() {
  const [input, setInput] = useState(DEFAULT_TEXT);
  const [characters, setCharacters] = useState([DEFAULT_TEXT]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState<WriterStatus>("loading");
  const [voiceOn, setVoiceOn] = useState(true);
  const [completed, setCompleted] = useState<string[]>([]);
  const [message, setMessage] = useState("先看一遍笔顺，再来亲手写写看");
  const writerHost = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const activeChar = characters[activeIndex] ?? DEFAULT_TEXT;

  const speak = useCallback((words: string) => {
    if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(words);
    speech.lang = "zh-CN";
    speech.rate = 0.76;
    speech.pitch = 1.08;
    window.speechSynthesis.speak(speech);
  }, [voiceOn]);

  useEffect(() => {
    const saved = window.localStorage.getItem("ziya-completed");
    if (saved) queueMicrotask(() => {
      try { setCompleted(JSON.parse(saved)); } catch { setCompleted([]); }
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!writerHost.current) return;
    writerHost.current.innerHTML = "";
    setStatus("loading");
    setMessage(`正在准备“${activeChar}”的字帖…`);
    writer.current = HanziWriter.create(writerHost.current, activeChar, {
      width: 360,
      height: 360,
      padding: 30,
      strokeColor: "#213e34",
      radicalColor: "#e36f43",
      outlineColor: "#d7d0bd",
      drawingColor: "#ef8354",
      drawingWidth: 24,
      strokeAnimationSpeed: 0.85,
      delayBetweenStrokes: 500,
      showCharacter: true,
      showOutline: true,
      charDataLoader: (char, onComplete, onError) => {
        fetch(`/hanzi-data/${encodeURIComponent(char)}.json`)
          .then((response) => {
            if (!response.ok) throw new Error("missing local data");
            return response.json();
          })
          .then(onComplete)
          .catch(onError);
      },
      onLoadCharDataSuccess: (data) => {
        setStatus("ready");
        setMessage(`“${activeChar}”一共有 ${data.strokes.length} 画，准备好了吗？`);
      },
      onLoadCharDataError: () => {
        setStatus("error");
        setMessage(`暂时没有找到“${activeChar}”的笔顺数据`);
      },
    });
    return () => {
      writer.current?.cancelQuiz();
      window.speechSynthesis?.cancel();
    };
  }, [activeChar, speak]);

  function startLesson(value = input) {
    const clean = onlyHanzi(value);
    if (!clean.length) { setMessage("请先输入一个汉字哦"); return; }
    setCharacters(clean);
    setActiveIndex(0);
    setMessage(`我们来学习“${clean.join("、")}”`);
  }

  function submit(event: FormEvent) { event.preventDefault(); startLesson(); }

  function animate() {
    if (!writer.current || status === "loading") return;
    writer.current.cancelQuiz();
    setStatus("ready");
    setMessage("仔细看，从哪里起笔、在哪里收笔");
    speak(`${activeChar}。仔细看，一笔一画跟我写。`);
    writer.current.animateCharacter({ onComplete: () => {
      setMessage("看清楚了吗？现在轮到你啦");
      speak("看清楚了吗？现在轮到你啦。");
    }});
  }

  function practice() {
    if (!writer.current || status === "loading") return;
    setStatus("practicing");
    setMessage("请在米字格里写一遍");
    speak(`请写，${activeChar}。`);
    writer.current.quiz({
      showHintAfterMisses: 2,
      highlightOnComplete: true,
      onMistake: (info) => {
        setMessage(`再想一想，第 ${info.strokeNum + 1} 笔从哪里开始？`);
        speak(`慢一点，第${info.strokeNum + 1}笔，再试一次。`);
      },
      onCorrectStroke: (info) => {
        setMessage(`第 ${info.strokeNum + 1} 笔写对啦，继续！`);
        speak("写对啦，继续。");
      },
      onComplete: () => {
        setStatus("complete");
        setMessage(`太棒了！你会写“${activeChar}”了`);
        speak(`太棒了！你会写，${activeChar}，了。`);
        setCompleted((current) => {
          const next = Array.from(new Set([...current, activeChar]));
          window.localStorage.setItem("ziya-completed", JSON.stringify(next));
          return next;
        });
      },
    });
  }

  function move(direction: -1 | 1) {
    const next = activeIndex + direction;
    if (next >= 0 && next < characters.length) setActiveIndex(next);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="字芽首页">
          <span className="brand-seed" aria-hidden="true"><i /><b /></span>
          <span>字芽<small>一笔一画，慢慢长大</small></span>
        </a>
        <div className="header-actions">
          <span className="offline-badge"><i />可离线学习</span>
          <button className="icon-button" onClick={() => setVoiceOn((value) => !value)} aria-label={voiceOn ? "关闭语音" : "打开语音"}>{voiceOn ? "🔊" : "🔇"}</button>
        </div>
      </header>

      <section className="hero" id="top">
        <p className="eyebrow"><span>✦</span> 今天想学哪个字？</p>
        <h1>让每一笔，都长出<span>小小的力量</span></h1>
        <p className="intro">输入一个字或一句话，字芽会带着小朋友看笔顺、听提示，再亲手写一遍。</p>
        <form className="search" onSubmit={submit}>
          <label htmlFor="character-input">输入想学的汉字</label>
          <div>
            <input id="character-input" value={input} maxLength={24} onChange={(event) => setInput(event.target.value)} placeholder="比如：春风又绿江南岸" />
            <button type="submit">开始学习 <span>→</span></button>
          </div>
        </form>
        <div className="examples"><span>试试看</span>{EXAMPLES.map((item) => <button key={item} onClick={() => { setInput(item); startLesson(item); }}>{item}</button>)}</div>
      </section>

      <section className="lesson-shell" aria-live="polite">
        <aside className="lesson-list">
          <div className="section-title"><span>本次字帖</span><em>{activeIndex + 1} / {characters.length}</em></div>
          <div className="character-list">
            {characters.map((char, index) => (
              <button key={`${char}-${index}`} className={index === activeIndex ? "active" : ""} onClick={() => setActiveIndex(index)}>
                <span>{char}</span><small>{completed.includes(char) ? "已学会 ✓" : index === activeIndex ? "正在学" : "未开始"}</small>
              </button>
            ))}
          </div>
          <div className="tip-card"><span>🌱</span><p><b>小提示</b>先看笔顺，再动手写。写慢一点，会记得更牢哦。</p></div>
        </aside>

        <article className="practice-card">
          <div className="practice-head">
            <div><p>正在学习</p><h2>{activeChar}</h2></div>
            <button className="listen" onClick={() => speak(`${activeChar}。`)}>🔊 听读音</button>
          </div>
          <div className="workspace">
            <div className="paper-wrap">
              <div className="rice-grid"><i /><b /></div>
              <div ref={writerHost} className="writer-host" aria-label={`${activeChar}字书写区`} />
              {status === "loading" && <div className="loading">字帖发芽中…</div>}
              {status === "error" && <div className="loading error">这个字还没收进字芽的字库</div>}
            </div>
            <div className="coach"><span className={status === "complete" ? "coach-face happy" : "coach-face"}>{status === "complete" ? "★" : "芽"}</span><p>{message}</p></div>
          </div>
          <div className="controls">
            <button className="secondary" onClick={animate} disabled={status === "loading" || status === "error"}><span>▶</span> 看笔顺</button>
            <button className="primary" onClick={practice} disabled={status === "loading" || status === "error"}><span>✎</span> 我来写</button>
          </div>
          {characters.length > 1 && <div className="pager">
            <button onClick={() => move(-1)} disabled={activeIndex === 0}>← 上一个</button>
            <div>{characters.map((_, index) => <i key={index} className={index === activeIndex ? "active" : ""} />)}</div>
            <button onClick={() => move(1)} disabled={activeIndex === characters.length - 1}>下一个 →</button>
          </div>}
        </article>
      </section>
      <footer><span>字芽 ZIYA</span><p>愿每个孩子，都能在一撇一捺里找到书写的快乐。</p></footer>
    </main>
  );
}
