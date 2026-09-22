import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import MicIcon from "../components/MicIcon.jsx";
import { highlightPython } from "../utils/highlightPython.js";
import api from "../api/client.js";
import "./workspace.css";

export default function WorkspacePage({ user, onSignOut }) {
  const [files, setFiles] = useState({});
  const [activeFile, setActiveFile] = useState("");
  const [openFiles, setOpenFiles] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [activeLesson, setActiveLesson] = useState("");
  const [cursorLine, setCursorLine] = useState(1);
  const [output, setOutput] = useState([]);
  const [chat, setChat] = useState([]);
  const [listening, setListening] = useState(true);
  const [announce, setAnnounce] = useState("Loading workspace\u2026");
  const [loading, setLoading] = useState(true);
  const editorRef = useRef(null);
  const saveTimerRef = useRef(null);

  const code = files[activeFile] || "";
  const lines = useMemo(
    () => highlightPython(code.replace(/\n$/, "") || " "),
    [code]
  );

  // ── Load data on mount ────────────────────────────────────────────
  useEffect(() => {
    document.title = "EchoCode \u2014 Workspace";

    let cancelled = false;

    async function loadWorkspace() {
      try {
        const [filesData, lessonsData, chatData] = await Promise.all([
          api.get("/files"),
          api.get("/lessons"),
          api.get("/chat"),
        ]);

        if (cancelled) return;

        // Build files map
        const filesMap = {};
        for (const f of filesData) {
          filesMap[f.filename] = f.content;
        }
        setFiles(filesMap);

        // Set lessons
        setLessons(lessonsData);

        // Set chat — map "from" field to match component expectations
        const chatMessages = chatData.map((msg) => ({
          from: msg.from || msg.sender,
          text: msg.text,
        }));
        setChat(chatMessages);

        // Open first lesson file by default
        const firstLesson = lessonsData[1] || lessonsData[0];
        if (firstLesson) {
          setActiveFile(firstLesson.file);
          setOpenFiles([firstLesson.file]);
          setActiveLesson(firstLesson.id);

          // Find the first print line
          const fileContent = filesMap[firstLesson.file] || "";
          const printLine =
            fileContent
              .split("\n")
              .findIndex((line) => line.trim().startsWith("print(")) + 1;
          setCursorLine(printLine || 1);
        }

        setLoading(false);
        setAnnounce(
          `Signed in as ${user.email}. ${
            firstLesson ? `${firstLesson.title} is open.` : "Workspace loaded."
          }`
        );
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          setAnnounce("Failed to load workspace. Please try signing in again.");
        }
      }
    }

    loadWorkspace();

    return () => {
      cancelled = true;
      document.title = "EchoCode \u2014 Sign in";
    };
  }, [user.email]);

  // ── File operations ─────────────────────────────────────────────────

  function openFile(name, lessonId) {
    setActiveFile(name);
    setOpenFiles((current) =>
      current.includes(name) ? current : [...current, name]
    );
    if (lessonId) setActiveLesson(lessonId);
    const printLine =
      (files[name] || "")
        .split("\n")
        .findIndex((line) => line.trim().startsWith("print(")) + 1;
    setCursorLine(printLine || 1);
    setAnnounce(`${name} opened.`);
  }

  // Debounced save to backend
  const saveToBackend = useCallback(
    (filename, content) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(async () => {
        try {
          await api.put(`/files/${encodeURIComponent(filename)}`, {
            content,
          });
        } catch {
          // Silent failure on autosave — the file is still in local state
        }
      }, 1000);
    },
    []
  );

  function updateCode(next) {
    setFiles((current) => ({ ...current, [activeFile]: next }));
    const line =
      next.slice(0, editorRef.current?.selectionStart || 0).split("\n").length;
    setCursorLine(line);

    // Debounced save
    saveToBackend(activeFile, next);
  }

  async function runCode() {
    setAnnounce("Running code\u2026");
    try {
      const data = await api.post("/run", { filename: activeFile });
      const result = data.output || [];
      setOutput(result.length ? result : ["(no output)"]);
      setAnnounce(`Ran ${activeFile}. ${result.length} output lines.`);
    } catch (err) {
      setOutput([`Error: ${err.message}`]);
      setAnnounce("Code execution failed.");
    }
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

  async function askTutor(text) {
    setChat((current) => [...current, { from: "you", text }]);
    setAnnounce("Asking tutor\u2026");

    try {
      const data = await api.post("/chat", {
        text,
        filename: activeFile,
        cursor_line: cursorLine,
      });
      const reply = data.reply;
      setChat((current) => [...current, { from: "ai", text: reply }]);
      setAnnounce(reply);

      // If the question was about reading output, also speak it
      const lower = text.toLowerCase();
      if (
        lower.includes("read") ||
        lower.includes("output") ||
        lower.includes("aloud")
      ) {
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(reply);
          window.speechSynthesis.speak(utterance);
        }
      }
    } catch (err) {
      const fallback =
        "I'm having trouble connecting. Please try again in a moment.";
      setChat((current) => [...current, { from: "ai", text: fallback }]);
      setAnnounce(fallback);
    }
  }

  function listenToTutor() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAnnounce(
        "Voice questions are not supported in this browser. Type a question instead."
      );
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

  // ── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="workspace">
        <div className="sr-only" aria-live="polite">
          {announce}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            color: "#999",
            fontSize: "1.2rem",
          }}
          role="status"
        >
          Loading workspace…
        </div>
      </div>
    );
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
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <button
                  type="button"
                  className={`lesson-btn${
                    activeLesson === lesson.id ? " is-active" : ""
                  }`}
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
                      {item.score ? (
                        <span className="score">{item.score}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <p className="nav-label practice-label">Practice</p>
          <ul className="practice-list">
            {Object.keys(files)
              .filter(
                (name) =>
                  !lessons.some((l) => l.file === name)
              )
              .map((name) => (
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
                  className={
                    index + 1 === cursorLine ? "is-current" : undefined
                  }
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
                    className={`code-line${
                      index + 1 === cursorLine ? " is-current" : ""
                    }`}
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
            <button
              type="button"
              className="icon-btn small"
              aria-label="Tutor options"
            >
              ···
            </button>
          </header>
          <div className="chat">
            {chat.map((message, index) => (
              <div key={index} className={`bubble-row ${message.from}`}>
                <span
                  className={`who ${message.from}`}
                  aria-hidden="true"
                >
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
