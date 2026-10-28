import { useEffect, useMemo, useRef, useState } from "react";
import MicIcon from "../components/MicIcon.jsx";
import { highlightPython } from "../utils/highlightPython.js";
import { runSimplePython } from "../utils/runPython.js";
import "./workspace.css";

const FILES = {
  "lesson1.py": `# Store a name, then print it
name = "Ada"
print(name)
`,
  "lesson2.py": `# Print each number from 1 to 5
for number in range(1, 6):
    print(number)
`,
  "lesson3.py": `# Count down with a while loop
count = 3
while count > 0:
    print(count)
    count = count - 1
`,
  "trial.py": `# Practice in this file
print("hello")
`,
  "test.py": `# Quick test
print(1 + 1)
`,
};

const LESSONS = [
  {
    id: "lesson-1",
    title: "Lesson 1 · Variables",
    file: "lesson1.py",
    assessments: [
      { name: "Assessment 1", score: "9/10" },
      { name: "Assessment 2", score: "10/10" },
    ],
  },
  {
    id: "lesson-2",
    title: "Lesson 2 · For loops",
    file: "lesson2.py",
    assessments: [
      { name: "Assessment 1", score: "8/10" },
      { name: "Assessment 2", score: null },
    ],
  },
  {
    id: "lesson-3",
    title: "Lesson 3 · While loops",
    file: "lesson3.py",
    assessments: [
      { name: "Assessment 1", score: null },
      { name: "Assessment 2", score: null },
    ],
  },
];

const INITIAL_CHAT = [
  {
    from: "ai",
    text: "Line 3 prints each value of number as the loop runs. Want me to read the output aloud?",
    audio: true,
  },
  { from: "you", text: "Yes, read it out." },
  {
    from: "ai",
    text: "Output: one, two, three, four, five — five lines total, counted correctly.",
  },
];

export default function WorkspacePage({ user, onSignOut }) {
  const [files, setFiles] = useState(FILES);
  const [activeFile, setActiveFile] = useState("lesson2.py");
  const [openFiles, setOpenFiles] = useState(["lesson2.py", "trial.py"]);
  const [activeLesson, setActiveLesson] = useState("lesson-2");
  const [cursorLine, setCursorLine] = useState(3);
  const [output, setOutput] = useState(["1", "2", "3", "4", "5"]);
  const [chat, setChat] = useState(INITIAL_CHAT);
  const [listening, setListening] = useState(false);
  const [tutorModel, setTutorModel] = useState("gemini-3.8-live");
  const [question, setQuestion] = useState("");
  const [tutorBusy, setTutorBusy] = useState(false);
  const [announce, setAnnounce] = useState("Opened Lesson 2, for loops.");
  const editorRef = useRef(null);
  const conversationId = useRef(globalThis.crypto?.randomUUID?.() || `student-${Date.now()}`);
  const playbackRef = useRef({ context: null, nextTime: 0 });
  const code = files[activeFile];
  const lines = useMemo(() => highlightPython(code.replace(/\n$/, "") || " "), [code]);

  useEffect(() => {
    document.title = "BlindCode — Workspace";
    setAnnounce(`Signed in as ${user.email}. Lesson 2, for loops is open.`);
    return () => {
      document.title = "BlindCode — Sign in";
    };
  }, [user.email]);

  function openFile(name, lessonId) {
    setActiveFile(name);
    setOpenFiles((current) => (current.includes(name) ? current : [...current, name]));
    if (lessonId) setActiveLesson(lessonId);
    const printLine =
      files[name]
        .split("\n")
        .findIndex((line) => line.trim().startsWith("print(")) + 1;
    setCursorLine(printLine || 1);
    setAnnounce(`${name} opened.`);
  }

  function updateCode(next) {
    setFiles((current) => ({ ...current, [activeFile]: next }));
    const line = next.slice(0, editorRef.current?.selectionStart || 0).split("\n").length;
    setCursorLine(line);
  }

  function openGeneratedCode(source) {
    let number = 1;
    let name = `tutor-suggestion-${number}.py`;
    while (Object.prototype.hasOwnProperty.call(files, name)) {
      number += 1;
      name = `tutor-suggestion-${number}.py`;
    }
    const completeCode = source.endsWith("\n") ? source : `${source}\n`;
    setFiles((current) => ({ ...current, [name]: completeCode }));
    setOpenFiles((current) => [...current, name]);
    setActiveFile(name);
    setCursorLine(1);
    setAnnounce(`Generated code opened in a new file named ${name}. Your previous file is unchanged.`);
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(0, 0);
    });
  }

  function runCode() {
    const result = runSimplePython(files[activeFile]);
    setOutput(result.length ? result : ["(no output)"]);
    setAnnounce(`Ran ${activeFile}. ${result.length} output lines.`);
  }

  function speakOutput() {
    const spoken = output.join(", ");
    setChat((current) => [
      ...current,
      { from: "ai", text: `Output: ${spoken}.` },
    ]);
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(
        `Output: ${output.map(wordFor).join(", ")}.`
      );
      window.speechSynthesis.speak(utterance);
    }
  }

  async function sendTutorQuestion(rawQuestion) {
    const text = rawQuestion.trim();
    if (!text || tutorBusy) return;
    const asksForCode = /\b(write|create|generate|make|build|implement|add|fix|correct|change|update)\b[\s\S]{0,90}\b(code|program|script|function|loop|file)\b/i.test(text)
      || /\b(code|program|script|function|loop)\b[\s\S]{0,50}\b(for me|please)\b/i.test(text);
    setQuestion("");
    setTutorBusy(true);
    setChat((current) => [...current, { from: "you", text }, { from: "ai", text: "" }]);
    setAnnounce("Sending your question to the voice tutor.");
    const appendReply = (part) => {
      setChat((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.from === "ai") next[next.length - 1] = { ...last, text: `${last.text || ""}${part}` };
        return next;
      });
      setAnnounce(part);
    };
    const playPcm = async (base64) => {
      const state = playbackRef.current;
      state.context ||= new AudioContext();
      await state.context.resume();
      const raw = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
      const buffer = state.context.createBuffer(1, samples.length, 24000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / 32768;
      const source = state.context.createBufferSource();
      source.buffer = buffer;
      source.connect(state.context.destination);
      state.nextTime = Math.max(state.context.currentTime, state.nextTime);
      source.start(state.nextTime);
      state.nextTime += buffer.duration;
    };
    const speakWithLiveVoice = async (spokenText) => new Promise((resolve, reject) => {
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${scheme}//${window.location.host}/api/live`);
      let finished = false;
      const finish = (error) => {
        if (finished) return;
        finished = true;
        socket.close();
        if (error) reject(error);
        else resolve();
      };
      socket.onopen = () => socket.send(JSON.stringify({
        model: tutorModel,
        question: `Read the following tutor explanation aloud exactly as written. Use a warm, natural, clear speaking voice. Do not add or remove information. ${spokenText}`,
        context: "The explanation has already been shown to the student. Speak it clearly and naturally.",
      }));
      socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "audio") {
          try {
            await playPcm(message.data);
          } catch (error) {
            finish(error);
          }
        }
        if (message.type === "error") finish(new Error(message.message));
        if (message.type === "done") finish();
      };
      socket.onerror = () => finish(new Error("Live speech is unavailable."));
    });
    const fallbackToText = async () => {
      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversationId.current,
            question: text,
            current_file: activeFile,
            code,
            output: output.join("\n"),
          }),
        });
        if (!response.ok) throw new Error("The tutor service is unavailable.");
        const data = await response.json();
        const reply = data.answer || (data.suggested_code
          ? "I created the code and opened it in a new editor file."
          : "I could not prepare an answer. Please try again.");
        setChat((current) => {
          const next = [...current];
          next[next.length - 1] = { from: "ai", text: reply };
          return next;
        });
        if (data.suggested_code) openGeneratedCode(data.suggested_code);
        setAnnounce(data.suggested_code
          ? "The tutor created code and opened it in a new editor file. Your previous file is unchanged."
          : "Using the text tutor with spoken output.");
        try {
          await speakWithLiveVoice(reply);
        } catch {
          window.speechSynthesis?.speak(new SpeechSynthesisUtterance(reply));
        }
      } catch {
        appendReply("The voice tutor could not connect. Please try again or use the text box.");
      } finally {
        setTutorBusy(false);
      }
    };
    if (asksForCode) {
      await fallbackToText();
      return;
    }
    try {
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${scheme}//${window.location.host}/api/live`);
      let fellBack = false;
      socket.onopen = () => socket.send(JSON.stringify({
        question: text,
        model: tutorModel,
        context: `Code in ${activeFile}:\n${code}\nProgram output:\n${output.join("\n")}\nCurrent line: ${cursorLine}`,
      }));
      socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "text") appendReply(message.text);
        if (message.type === "audio") await playPcm(message.data);
        if (message.type === "error" && !fellBack) {
          fellBack = true;
          socket.close();
          await fallbackToText();
        }
        if (message.type === "done") {
          setTutorBusy(false);
          setAnnounce("Tutor response complete.");
          socket.close();
        }
      };
      socket.onerror = async () => {
        if (!fellBack) {
          fellBack = true;
          socket.close();
          await fallbackToText();
        }
      };
    } catch {
      await fallbackToText();
    }
  }

  function listenToTutor() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAnnounce("Voice questions are not supported in this browser. Type a question instead.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    setListening(true);
    setAnnounce("Listening for a question.");
    recognition.onresult = (event) => {
      sendTutorQuestion(event.results[0][0].transcript);
    };
    recognition.onerror = () => setAnnounce("I could not hear that. You can try speaking again or type your question.");
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  return (
    <div className="workspace">
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      <header className="app-bar">
        <div className="app-brand">
          <span className="app-mic" aria-hidden="true">
            <MicIcon />
          </span>
          <span className="app-name">BlindCode</span>
          <span className={`listen-pill${listening ? " is-on" : ""}`}>
            <span className="listen-dot" aria-hidden="true" />
            {listening ? "Listening" : "Voice ready"}
          </span>
        </div>
        <div className="app-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Help"
            title="Help"
            onClick={() =>
              setAnnounce(
                "Sign-in succeeded. Use the course list on the left, edit code in the center, and ask the AI tutor on the right."
              )
            }
          >
            ?
          </button>
          <button
            type="button"
            className="avatar"
            onClick={onSignOut}
            aria-label={`Signed in as ${user.email}. Sign out.`}
            title="Sign out"
          >
            {user.initials || "FA"}
          </button>
        </div>
      </header>

      <div className="workspace-body">
        <nav className="sidebar" aria-label="Course">
          <p className="nav-label">Course</p>
          <p className="nav-course">Intro to Loops</p>
          <ul className="lesson-list">
            {LESSONS.map((lesson) => (
              <li key={lesson.id}>
                <button
                  type="button"
                  className={`lesson-btn${activeLesson === lesson.id ? " is-active" : ""}`}
                  onClick={() => openFile(lesson.file, lesson.id)}
                >
                  <span className="lesson-dot" aria-hidden="true" />
                  {lesson.title}
                </button>
                <ul className="assessment-list">
                  {lesson.assessments.map((item) => (
                    <li key={item.name}>
                      <span>
                        <span className="tiny-dot" aria-hidden="true" />
                        {item.name}
                      </span>
                      {item.score ? <span className="score">{item.score}</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <p className="nav-label practice-label">Practice</p>
          <ul className="practice-list">
            {["trial.py", "test.py"].map((name) => (
              <li key={name}>
                <button type="button" onClick={() => openFile(name)}>
                  <span className="tiny-dot" aria-hidden="true" />
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="editor-pane" aria-label="Code editor">
          <div className="tabs" role="tablist">
            {openFiles.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={activeFile === name}
                className={`tab${activeFile === name ? " is-active" : ""}`}
                onClick={() => setActiveFile(name)}
              >
                {name}
              </button>
            ))}
            <button type="button" className="run-btn" onClick={runCode}>
              Run
            </button>
          </div>

          <div className="editor">
            <div className="gutter" aria-hidden="true">
              {lines.map((_, index) => (
                <div
                  key={index}
                  className={index + 1 === cursorLine ? "is-current" : undefined}
                >
                  {index + 1}
                </div>
              ))}
            </div>
            <div className="code-wrap">
              <pre className="code-highlight" aria-hidden="true">
                {lines.map((tokens, index) => (
                  <div
                    key={index}
                    className={`code-line${index + 1 === cursorLine ? " is-current" : ""}`}
                  >
                    {tokens.map((token, tokenIndex) => (
                      <span key={tokenIndex} className={`tok-${token.type}`}>
                        {token.value}
                      </span>
                    ))}
                  </div>
                ))}
              </pre>
              <textarea
                ref={editorRef}
                className="code-input"
                spellCheck="false"
                value={code}
                aria-label={`${activeFile} code editor`}
                onChange={(event) => updateCode(event.target.value)}
                onClick={(event) => {
                  const line = event.target.value
                    .slice(0, event.target.selectionStart)
                    .split("\n").length;
                  setCursorLine(line);
                }}
                onKeyUp={(event) => {
                  const line = event.target.value
                    .slice(0, event.target.selectionStart)
                    .split("\n").length;
                  setCursorLine(line);
                }}
              />
            </div>
          </div>

          <div className="output-panel">
            <p className="output-label">
              <span className="output-dot" aria-hidden="true" />
              Output
            </p>
            <pre className="output-body">{output.join("\n")}</pre>
          </div>
        </section>

        <aside className="tutor" aria-label="AI Tutor">
          <header className="tutor-head">
            <h1>AI Tutor</h1>
            <label className="model-choice">
              Voice model
              <select value={tutorModel} onChange={(event) => setTutorModel(event.target.value)}>
                <option value="gemini-3.8-live">Gemini 3.8 Live</option>
                <option value="gemini-2.5-flash-native-audio-preview-12-2025">Gemini 2.5 Flash Native Audio</option>
              </select>
            </label>
          </header>
          <div className="chat">
            {chat.map((message, index) => (
              <div key={index} className={`bubble-row ${message.from}`}>
                <span className={`who ${message.from}`} aria-hidden="true">
                  {message.from === "ai" ? "AI" : user.initials || "FA"}
                </span>
                <div className="bubble">
                  <p>{message.text || (message.from === "ai" ? "Thinking…" : "")}</p>
                  {message.audio ? (
                    <button
                      type="button"
                      className="audio-bars"
                      aria-label="Play tutor audio"
                      onClick={() => window.speechSynthesis?.speak(new SpeechSynthesisUtterance(message.text))}
                    >
                      <span />
                      <span />
                      <span />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="tutor-controls">
            <form className="question-form" onSubmit={(event) => { event.preventDefault(); sendTutorQuestion(question); }}>
              <label className="sr-only" htmlFor="tutor-question">Ask the programming tutor</label>
              <input
                id="tutor-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Type a question…"
                disabled={tutorBusy}
              />
              <button type="submit" disabled={tutorBusy || !question.trim()}>Send</button>
            </form>
            <button type="button" className="speak-tutor" onClick={listenToTutor} disabled={tutorBusy}>
              <span className="listen-dot" aria-hidden="true" />
              {tutorBusy ? "Tutor is responding…" : "Speak your question"}
            </button>
            <p className="voice-note">Code opens in a new file. Gemini Live speaks the explanation aloud.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function wordFor(value) {
  const words = {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
  };
  return words[value] || value;
}
