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
  const [listening, setListening] = useState(true);
  const [announce, setAnnounce] = useState("Opened Lesson 2, for loops.");
  const editorRef = useRef(null);
  const code = files[activeFile];
  const lines = useMemo(() => highlightPython(code.replace(/\n$/, "") || " "), [code]);

  useEffect(() => {
    document.title = "EchoCode — Workspace";
    setAnnounce(`Signed in as ${user.email}. Lesson 2, for loops is open.`);
    return () => {
      document.title = "EchoCode — Sign in";
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

  function askTutor(text) {
    const lower = text.toLowerCase();
    let reply = "I am here. Ask about this loop, the output, or the current line.";
    if (lower.includes("read") || lower.includes("output") || lower.includes("aloud")) {
      reply = `Output: ${output.map(wordFor).join(", ")} — ${output.length} lines total.`;
      speakOutput();
    } else if (lower.includes("line")) {
      reply = `You are on line ${cursorLine}: ${code.split("\n")[cursorLine - 1] || "empty line"}.`;
    }
    setChat((current) => [...current, { from: "you", text }, { from: "ai", text: reply }]);
    setAnnounce(reply);
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
      askTutor(event.results[0][0].transcript);
    };
    recognition.onend = () => setListening(true);
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
          <span className="app-name">EchoCode</span>
          <span className={`listen-pill${listening ? " is-on" : ""}`}>
            <span className="listen-dot" aria-hidden="true" />
            Listening
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
            <button type="button" className="icon-btn small" aria-label="Tutor options">
              ···
            </button>
          </header>
          <div className="chat">
            {chat.map((message, index) => (
              <div key={index} className={`bubble-row ${message.from}`}>
                <span className={`who ${message.from}`} aria-hidden="true">
                  {message.from === "ai" ? "AI" : user.initials || "FA"}
                </span>
                <div className="bubble">
                  <p>{message.text}</p>
                  {message.audio ? (
                    <button
                      type="button"
                      className="audio-bars"
                      aria-label="Play tutor audio"
                      onClick={speakOutput}
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
          <button type="button" className="speak-tutor" onClick={listenToTutor}>
            <span className="listen-dot" aria-hidden="true" />
            Speak to ask the tutor a question
          </button>
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
