
import { useEffect, useMemo, useRef, useState } from "react";
import MicIcon from "../components/MicIcon.jsx";
import { highlightPython } from "../utils/highlightPython.js";
import { runSimplePython } from "../utils/runPython.js";
import "./workspace.css";

const API_URL = "http://127.0.0.1:8000/api/tutor/chat";

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
    text: "Hello! I'm your BlindCode programming tutor. Ask me about Python, your current code, or your lesson.",
  },
];

export default function WorkspacePage({ user, onSignOut }) {
  const [files, setFiles] = useState(FILES);
  const [activeFile, setActiveFile] = useState("lesson2.py");
  const [openFiles, setOpenFiles] = useState([
    "lesson2.py",
    "trial.py",
  ]);
  const [activeLesson, setActiveLesson] = useState("lesson-2");
  const [cursorLine, setCursorLine] = useState(3);
  const [output, setOutput] = useState(["1", "2", "3", "4", "5"]);
  const [chat, setChat] = useState(INITIAL_CHAT);
  const [question, setQuestion] = useState("");
  const [listening, setListening] = useState(false);
  const [sending, setSending] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [announce, setAnnounce] = useState(
    "Opened Lesson 2, for loops."
  );

  const editorRef = useRef(null);
  const chatRef = useRef(null);
  const questionRef = useRef(null);
  const recognitionRef = useRef(null);

  const code = files[activeFile];

  const lines = useMemo(
    () => highlightPython(code.replace(/\n$/, "") || " "),
    [code]
  );

  // Stop any ongoing speech when the component is removed.
  useEffect(() => {
    document.title = "BlindCode — Workspace";
    setAnnounce(
      `Signed in as ${user.email}. Lesson 2, for loops is open.`
    );

    return () => {
      window.speechSynthesis?.cancel();

      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }

      document.title = "BlindCode — Sign in";
    };
  }, [user.email]);

  // Keep the latest tutor message visible.
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chat, sending]);

  // TEXT-TO-SPEECH
  // Reads the supplied text aloud using the browser's speech engine.
  function speakText(text) {
    if (!text || !text.trim()) return;

    if (!("speechSynthesis" in window)) {
      setAnnounce(
        "Speech playback is not supported in this browser."
      );
      return;
    }

    // Stop the previous message before reading a new one.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      setSpeaking(true);
      setAnnounce("Reading the tutor response aloud.");
    };

    utterance.onend = () => {
      setSpeaking(false);
    };

    utterance.onerror = (event) => {
      setSpeaking(false);

      if (event.error !== "canceled" && event.error !== "interrupted") {
        setAnnounce("Speech playback could not finish.");
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  // Stop reading aloud.
  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setSpeaking(false);
    setAnnounce("Speech stopped.");
  }

  function openFile(name, lessonId) {
    setActiveFile(name);

    setOpenFiles((current) =>
      current.includes(name) ? current : [...current, name]
    );

    if (lessonId) {
      setActiveLesson(lessonId);
    }

    const printLine =
      files[name]
        .split("\n")
        .findIndex((line) => line.trim().startsWith("print(")) + 1;

    setCursorLine(printLine || 1);
    setAnnounce(`${name} opened.`);
  }

  function updateCode(next) {
    setFiles((current) => ({
      ...current,
      [activeFile]: next,
    }));

    const line = next
      .slice(0, editorRef.current?.selectionStart || 0)
      .split("\n").length;

    setCursorLine(line);
  }

  function runCode() {
    const result = runSimplePython(files[activeFile]);

    setOutput(result.length ? result : ["(no output)"]);
    setAnnounce(
      `Ran ${activeFile}. ${result.length} output lines.`
    );
  }

  // Read the program's output aloud.
  function speakOutput() {
    const spoken = output.map(wordFor).join(", ");
    const text = `Output: ${spoken}.`;

    setChat((current) => [
      ...current,
      { from: "ai", text },
    ]);

    setAnnounce("Reading program output aloud.");
    speakText(text);
  }

  // Send the student's question to FastAPI and read the AI response.
  async function askTutor(text) {
    const message = text.trim();

    if (!message || sending) return;

    setQuestion("");

    setChat((current) => [
      ...current,
      { from: "you", text: message },
    ]);

    setSending(true);
    setAnnounce("Sending your question to the AI tutor.");

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message:
            `Current file: ${activeFile}\n` +
            `Current line: ${cursorLine}\n` +
            `Current code:\n${files[activeFile]}\n\n` +
            `Student question: ${message}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            `The tutor request failed (${response.status}).`
        );
      }

      if (
        typeof data.reply !== "string" ||
        !data.reply.trim()
      ) {
        throw new Error("The tutor returned an empty response.");
      }

      const reply = data.reply.trim();

      // Display the AI response once.
      setChat((current) => [
        ...current,
        { from: "ai", text: reply },
      ]);

      // Announce and speak the actual AI response.
      setAnnounce(`Tutor answered: ${reply}`);
      speakText(reply);
    } catch (error) {
      const errorMessage =
        error instanceof TypeError
          ? "I couldn't connect to the AI server. Please check that FastAPI and Ollama are running."
          : error.message ||
            "Something went wrong while contacting the tutor.";

      setChat((current) => [
        ...current,
        { from: "ai", text: errorMessage },
      ]);

      setAnnounce(errorMessage);
      speakText(errorMessage);
    } finally {
      setSending(false);
    }
  }

  // Ask the tutor using the microphone.
  function listenToTutor() {
    if (sending || listening) return;

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const message =
        "Voice questions are not supported in this browser. Type your question in the message box instead.";

      setAnnounce(message);
      speakText(message);
      questionRef.current?.focus();
      return;
    }

    // Stop any previous recognition session.
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;

    setListening(true);
    setAnnounce("Listening for your question.");

    recognition.onresult = (event) => {
      const transcript =
        event.results[0][0].transcript.trim();

      setQuestion(transcript);
      setAnnounce(`I heard: ${transcript}`);

      if (transcript) {
        askTutor(transcript);
      }
    };

    recognition.onerror = (event) => {
      setListening(false);

      if (event.error === "not-allowed") {
        setAnnounce(
          "Microphone permission was denied. Please allow microphone access or type your question."
        );
      } else {
        setAnnounce(
          "Voice recognition failed. You can type your question instead."
        );
      }
    };

    recognition.onend = () => {
      setListening(false);

      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };

    try {
      recognition.start();
    } catch {
      setListening(false);
      recognitionRef.current = null;
      setAnnounce(
        "Unable to start voice recognition. Please try again."
      );
    }
  }

  return (
    <div className="workspace">
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {announce}
      </div>

      <header className="app-bar">
        <div className="app-brand">
          <span className="app-mic" aria-hidden="true">
            <MicIcon />
          </span>

          <span className="app-name">BlindCode</span>

          <span
            className={`listen-pill${listening ? " is-on" : ""}`}
          >
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
                "Use the course list on the left, edit your Python code in the center, run it to view output, and ask the AI tutor questions on the right."
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
                  className={`lesson-btn${
                    activeLesson === lesson.id
                      ? " is-active"
                      : ""
                  }`}
                  onClick={() =>
                    openFile(lesson.file, lesson.id)
                  }
                >
                  <span
                    className="lesson-dot"
                    aria-hidden="true"
                  />
                  {lesson.title}
                </button>

                <ul className="assessment-list">
                  {lesson.assessments.map((item) => (
                    <li key={item.name}>
                      <span>
                        <span
                          className="tiny-dot"
                          aria-hidden="true"
                        />
                        {item.name}
                      </span>

                      {item.score ? (
                        <span className="score">
                          {item.score}
                        </span>
                      ) : null}
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
                <button
                  type="button"
                  onClick={() => openFile(name)}
                >
                  <span
                    className="tiny-dot"
                    aria-hidden="true"
                  />
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="editor-pane" aria-label="Code editor">
          <div className="tabs" role="tablist" aria-label="Open files">
            {openFiles.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={activeFile === name}
                className={`tab${
                  activeFile === name ? " is-active" : ""
                }`}
                onClick={() => {
                  setActiveFile(name);
                  setAnnounce(`${name} selected.`);
                }}
              >
                {name}
              </button>
            ))}

            <button
              type="button"
              className="run-btn"
              onClick={runCode}
            >
              Run
            </button>
          </div>

          <div className="editor">
            <div className="gutter" aria-hidden="true">
              {lines.map((_, index) => (
                <div
                  key={index}
                  className={
                    index + 1 === cursorLine
                      ? "is-current"
                      : undefined
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
                      index + 1 === cursorLine
                        ? " is-current"
                        : ""
                    }`}
                  >
                    {tokens.map((token, tokenIndex) => (
                      <span
                        key={tokenIndex}
                        className={`tok-${token.type}`}
                      >
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
                onChange={(event) =>
                  updateCode(event.target.value)
                }
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

            <pre className="output-body">
              {output.join("\n")}
            </pre>
          </div>
        </section>

        <aside className="tutor" aria-label="AI Tutor">
          <header className="tutor-head">
            <h1>AI Tutor</h1>

            <div className="tutor-speech-controls">
              <button
                type="button"
                className="icon-btn small"
                aria-label="Read program output aloud"
                title="Read output aloud"
                onClick={speakOutput}
              >
                <span aria-hidden="true">···</span>
              </button>

              <button
                type="button"
                className="icon-btn small"
                aria-label="Stop speech"
                title="Stop speaking"
                onClick={stopSpeaking}
              >
                <span aria-hidden="true">■</span>
              </button>
            </div>
          </header>

          <div
            className="chat"
            ref={chatRef}
            role="log"
            aria-label="Tutor conversation"
            aria-live="off"
            aria-relevant="additions"
          >
            {chat.map((message, index) => (
              <div
                key={index}
                className={`bubble-row ${message.from}`}
              >
                <span
                  className={`who ${message.from}`}
                  aria-hidden="true"
                >
                  {message.from === "ai"
                    ? "AI"
                    : user.initials || "FA"}
                </span>

                <div className="bubble">
                  <p>{message.text}</p>

                  {message.from === "ai" && (
                    <button
                      type="button"
                      className="audio-bars"
                      aria-label={`Read tutor response aloud: ${message.text.slice(
                        0,
                        100
                      )}`}
                      onClick={() => speakText(message.text)}
                    >
                      <span />
                      <span />
                      <span />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="bubble-row ai" role="status">
                <span className="who ai" aria-hidden="true">
                  AI
                </span>

                <div className="bubble">
                  <p>The tutor is thinking. Please wait.</p>
                </div>
              </div>
            )}
          </div>

          <form
            className="tutor-input-form"
            onSubmit={(event) => {
              event.preventDefault();
              askTutor(question);
            }}
          >
            <label
              className="sr-only"
              htmlFor="tutor-question"
            >
              Ask the AI programming tutor
            </label>

            <textarea
              id="tutor-question"
              ref={questionRef}
              className="tutor-question"
              rows={2}
              value={question}
              disabled={sending}
              placeholder="Ask about Python..."
              onChange={(event) =>
                setQuestion(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  askTutor(question);
                }
              }}
            />

            <button
              type="submit"
              className="tutor-send"
              disabled={sending || !question.trim()}
            >
              {sending ? "Thinking..." : "Send"}
            </button>
          </form>

          <button
            type="button"
            className="speak-tutor"
            onClick={listenToTutor}
            disabled={sending || listening}
          >
            <span className="listen-dot" aria-hidden="true" />
            {listening
              ? "Listening..."
              : "Speak to ask the tutor a question"}
          </button>

          <p className="speech-status" role="status">
            {speaking
              ? "Tutor is speaking. Use Stop Speaking to stop."
              : "Tutor speech is ready."}
          </p>
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
