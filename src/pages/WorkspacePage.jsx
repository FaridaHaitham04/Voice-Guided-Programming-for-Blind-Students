
import { useEffect, useMemo, useRef, useState } from "react";
import MicIcon from "../components/MicIcon.jsx";
import { highlightPython } from "../utils/highlightPython.js";
import { runSimplePython } from "../utils/runPython.js";
import "./workspace.css";

const API_BASE = "http://127.0.0.1:8000";

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
  const [micReady, setMicReady] = useState(false);
  const [processingCode, setProcessingCode] = useState(false);
  const [tutorProcessing, setTutorProcessing] = useState(false);

  const [announce, setAnnounce] = useState(
    "Opened Lesson 2, for loops."
  );

  const editorRef = useRef(null);

  // Shared microphone and audio processing
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Recorders
  const recorderRef = useRef(null);
  const editorRecorderRef = useRef(null);
  const editorSegmentRef = useRef(null);

  // Voice detection
  const silenceStartRef = useRef(null);
  const tutorActiveRef = useRef(false);

  // Keep the latest values available to microphone callbacks
  const latestRef = useRef({ activeFile, files });
  latestRef.current = { activeFile, files };

  const processingCodeRef = useRef(false);
  processingCodeRef.current = processingCode;

  const tutorProcessingRef = useRef(false);
  tutorProcessingRef.current = tutorProcessing;

  const code = files[activeFile];

  const lines = useMemo(
    () => highlightPython(code.replace(/\n$/, "") || " "),
    [code]
  );

  // Announce information using speech
  function speakMessage(message) {
    setAnnounce(message);

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = "en-US";

      // Prevent the microphone from recording the computer's own voice
      tutorActiveRef.current = true;

      utterance.onend = () => {
        tutorActiveRef.current = false;
      };

      utterance.onerror = () => {
        tutorActiveRef.current = false;
      };

      window.speechSynthesis.speak(utterance);
    }
  }

  // Workspace title and initial announcement
  useEffect(() => {
    document.title = "BlindCode — Workspace";

    setAnnounce(
      `Signed in as ${user.email}. Lesson 2, for loops is open.`
    );

    return () => {
      document.title = "BlindCode — Sign in";
    };
  }, [user.email]);

  // Open a file
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

  // Update the editor content
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

  // Run Python code
  function runCode() {
    const result = runSimplePython(files[activeFile]);

    setOutput(result.length ? result : ["(no output)"]);

    speakMessage(
      `Ran ${activeFile}. ${result.length} output lines.`
    );
  }

  // Read the output aloud
  function speakOutput() {
    const spoken = output.join(", ");

    setChat((current) => [
      ...current,
      { from: "ai", text: `Output: ${spoken}.` },
    ]);

    speakMessage(
      `Output: ${output.map(wordFor).join(", ")}.`
    );
  }

  // Play audio generated by the AI Tutor
  function playTutorAudio(audioUrl) {
    const audio = new Audio(`${API_BASE}${audioUrl}`);

    tutorActiveRef.current = true;

    audio.onended = () => {
      tutorActiveRef.current = false;
    };

    audio.onerror = () => {
      tutorActiveRef.current = false;

      setAnnounce("Could not play the tutor audio.");
    };

    audio.play().catch((error) => {
      console.error("Audio playback error:", error);

      tutorActiveRef.current = false;

      setAnnounce(
        "Could not play the tutor audio. Please check your browser audio permissions."
      );
    });
  }

  // Send a typed question to the AI Tutor
  async function askTutor(text) {
    if (!text.trim()) return;

    setChat((current) => [
      ...current,
      { from: "you", text },
      { from: "ai", text: "Thinking..." },
    ]);

    setAnnounce("The AI tutor is preparing an answer.");

    try {
      const response = await fetch(`${API_BASE}/api/tutor/text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: text }),
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
      }

      const data = await response.json();

      setChat((current) => {
        const updated = [...current];

        updated[updated.length - 1] = {
          from: "ai",
          text: data.answer,
          audioUrl: data.audio_url,
        };

        return updated;
      });

      setAnnounce(data.answer);

      if (data.audio_url) {
        playTutorAudio(data.audio_url);
      }
    } catch (error) {
      console.error("Tutor error:", error);

      setChat((current) => {
        const updated = [...current];

        updated[updated.length - 1] = {
          from: "ai",
          text: "Sorry, I couldn't connect to the AI tutor. Please check that the backend is running.",
        };

        return updated;
      });

      setAnnounce("The AI tutor could not connect to the backend.");
    }
  }

  // Select the supported recording format
  function getAudioMimeType() {
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      return "audio/webm;codecs=opus";
    }

    if (MediaRecorder.isTypeSupported("audio/webm")) {
      return "audio/webm";
    }

    return "";
  }

  // Record one spoken coding instruction
  function startEditorSegment() {
    const stream = streamRef.current;

    if (
      !stream ||
      tutorActiveRef.current ||
      processingCodeRef.current ||
      tutorProcessingRef.current
    ) {
      return;
    }

    if (editorSegmentRef.current) return;

    const selectedFile = latestRef.current.activeFile;
    const existingCode = latestRef.current.files[selectedFile];

    try {
      const mimeType = getAudioMimeType();

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const chunks = [];

      const segment = {
        recorder,
        chunks,
        selectedFile,
        existingCode,
        discard: false,
      };

      editorSegmentRef.current = segment;
      editorRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("Editor recording error:", event.error);

        editorSegmentRef.current = null;
        editorRecorderRef.current = null;
        silenceStartRef.current = null;

        setAnnounce(
          "There was a problem recording your coding instruction."
        );
      };

      recorder.onstop = async () => {
        editorSegmentRef.current = null;
        editorRecorderRef.current = null;
        silenceStartRef.current = null;

        if (segment.discard || !chunks.length) return;

        const audioBlob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });

        if (!audioBlob.size) return;

        // Prevent another recording while processing this instruction
        processingCodeRef.current = true;
        setProcessingCode(true);

        setAnnounce("Processing your coding instruction.");

        const extension = recorder.mimeType.includes("mp4")
          ? "mp4"
          : "webm";

        const formData = new FormData();

        formData.append(
          "file",
          audioBlob,
          `code-instruction.${extension}`
        );

        formData.append("existing_code", existingCode);
        formData.append("mode", "dictation");

        try {
          const response = await fetch(
            `${API_BASE}/api/editor/voice`,
            {
              method: "POST",
              body: formData,
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));

            throw new Error(
              errorData.detail || `Backend error: ${response.status}`
            );
          }

          const data = await response.json();

          setFiles((current) => ({
            ...current,
            [selectedFile]: data.code,
          }));

          setOpenFiles((current) =>
            current.includes(selectedFile)
              ? current
              : [...current, selectedFile]
          );

          setCursorLine(1);

          speakMessage(
            `Your code in ${selectedFile} has been updated.`
          );
        } catch (error) {
          console.error("Voice to code error:", error);

          speakMessage(
            `Could not generate code. ${error.message}`
          );
        } finally {
          processingCodeRef.current = false;
          setProcessingCode(false);
        }
      };

      recorder.start();
    } catch (error) {
      console.error("Could not start editor recording:", error);
    }
  }

  // Start or stop the AI Tutor recording
  function toggleTutorRecording() {
    if (!micReady || !streamRef.current) {
      setAnnounce(
        "The microphone is not ready yet. Please try again."
      );
      return;
    }

    if (tutorProcessingRef.current || processingCodeRef.current) {
      return;
    }

    // Second Space press: stop and submit the tutor recording
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();

      setListening(false);

      setAnnounce(
        "Recording stopped. Processing your tutor question."
      );

      return;
    }

    // First Space press: switch to the AI Tutor
    tutorActiveRef.current = true;

    // Discard an unfinished editor recording
    if (editorSegmentRef.current) {
      editorSegmentRef.current.discard = true;

      if (
        editorSegmentRef.current.recorder.state === "recording"
      ) {
        editorSegmentRef.current.recorder.stop();
      }
    }

    silenceStartRef.current = null;

    try {
      const mimeType = getAudioMimeType();

      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);

      const chunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("Tutor recording error:", event.error);

        recorderRef.current = null;
        tutorActiveRef.current = false;

        setListening(false);

        setAnnounce(
          "There was a problem recording your tutor question."
        );
      };

      recorder.onstop = async () => {
        recorderRef.current = null;

        const audioBlob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });

        if (!audioBlob.size) {
          tutorActiveRef.current = false;

          setAnnounce(
            "No audio was recorded. Please try again."
          );

          return;
        }

        tutorProcessingRef.current = true;
        setTutorProcessing(true);

        setChat((current) => [
          ...current,
          {
            from: "ai",
            text: "I am processing your question...",
          },
        ]);

        const extension = recorder.mimeType.includes("mp4")
          ? "mp4"
          : "webm";

        const formData = new FormData();

        formData.append(
          "file",
          audioBlob,
          `question.${extension}`
        );

        let tutorAudioAvailable = false;

        try {
          const response = await fetch(
            `${API_BASE}/api/tutor/voice`,
            {
              method: "POST",
              body: formData,
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));

            throw new Error(
              errorData.detail || `Backend error: ${response.status}`
            );
          }

          const data = await response.json();

          tutorAudioAvailable = Boolean(data.audio_url);

          setChat((current) => {
            const updated = [...current];

            updated[updated.length - 1] = {
              from: "you",
              text: data.question,
            };

            updated.push({
              from: "ai",
              text: data.answer,
              audioUrl: data.audio_url,
            });

            return updated;
          });

          setAnnounce(data.answer);

          if (data.audio_url) {
            playTutorAudio(data.audio_url);
          } else {
            tutorActiveRef.current = false;
          }
        } catch (error) {
          console.error("Voice tutor error:", error);

          setChat((current) => {
            const updated = [...current];

            updated[updated.length - 1] = {
              from: "ai",
              text: `Sorry, I couldn't process your voice question. ${error.message}`,
            };

            return updated;
          });

          tutorActiveRef.current = false;

          setAnnounce(
            "There was a problem processing your tutor question."
          );
        } finally {
          tutorProcessingRef.current = false;
          setTutorProcessing(false);

          if (!tutorAudioAvailable) {
            tutorActiveRef.current = false;
          }
        }
      };

      recorderRef.current = recorder;
      recorder.start();

      setListening(true);

      setAnnounce(
        "Recording your question for the AI tutor. Press Space again when you finish."
      );
    } catch (error) {
      console.error("Could not start tutor recording:", error);

      tutorActiveRef.current = false;
      setListening(false);

      setAnnounce("Could not start the tutor recording.");
    }
  }

  // Initialize the microphone and detect speech automatically
  useEffect(() => {
    let cancelled = false;

    async function initializeMicrophone() {
      try {
        if (
          !navigator.mediaDevices?.getUserMedia ||
          !window.MediaRecorder
        ) {
          setAnnounce(
            "Microphone recording is not supported in this browser."
          );
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        const audioContext = new AudioContext();

        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          await audioContext.close();
          return;
        }

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();

        analyser.fftSize = 2048;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        setMicReady(true);

        setAnnounce(
          "Microphone is ready. Speak your Python instructions naturally. Press Space to ask the AI tutor."
        );

        const data = new Uint8Array(analyser.fftSize);

        function detectSpeech() {
          if (cancelled) return;

          animationFrameRef.current =
            requestAnimationFrame(detectSpeech);

          if (
            tutorActiveRef.current ||
            processingCodeRef.current ||
            tutorProcessingRef.current
          ) {
            return;
          }

          analyser.getByteTimeDomainData(data);

          let sum = 0;

          for (let i = 0; i < data.length; i++) {
            const normalized = (data[i] - 128) / 128;
            sum += normalized * normalized;
          }

          const volume = Math.sqrt(sum / data.length);

          const isSpeaking = volume > 0.025;
          const currentSegment = editorSegmentRef.current;

          // Student starts speaking
          if (isSpeaking && !currentSegment) {
            silenceStartRef.current = null;
            startEditorSegment();
            return;
          }

          // Detect when the student stops speaking
          if (currentSegment) {
            if (volume < 0.012) {
              if (!silenceStartRef.current) {
                silenceStartRef.current = Date.now();
              }

              // 1.3 seconds of silence ends the recording
              if (
                Date.now() - silenceStartRef.current >= 1300
              ) {
                silenceStartRef.current = null;

                if (
                  currentSegment.recorder.state === "recording"
                ) {
                  currentSegment.recorder.stop();
                }
              }
            } else {
              silenceStartRef.current = null;
            }
          }
        }

        detectSpeech();
      } catch (error) {
        console.error("Microphone initialization error:", error);

        setAnnounce(
          "Could not access your microphone. Please allow microphone permissions."
        );
      }
    }

    initializeMicrophone();

    return () => {
      cancelled = true;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (editorSegmentRef.current) {
        editorSegmentRef.current.discard = true;
      }

      if (
        editorRecorderRef.current?.state === "recording"
      ) {
        editorRecorderRef.current.stop();
      }

      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }

      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      audioContextRef.current?.close();

      streamRef.current = null;
      editorRecorderRef.current = null;
      recorderRef.current = null;
      editorSegmentRef.current = null;
    };
  }, []);

  // Global Space shortcut for the AI Tutor
  useEffect(() => {
    function handleSpaceShortcut(event) {
      if (event.code !== "Space" || event.repeat) return;

      const target = event.target;

      // Do not interfere with normal typing or button activation
      if (
        target instanceof HTMLElement &&
        target.closest(
          'textarea, input, select, button, a, [contenteditable="true"], [role="textbox"], [role="button"]'
        )
      ) {
        return;
      }

      event.preventDefault();

      toggleTutorRecording();
    }

    window.addEventListener("keydown", handleSpaceShortcut);

    return () => {
      window.removeEventListener(
        "keydown",
        handleSpaceShortcut
      );
    };
  }, [micReady, tutorProcessing, processingCode, listening]);

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
            className={`listen-pill${
              listening || processingCode || tutorProcessing
                ? " is-on"
                : ""
            }`}
          >
            <span className="listen-dot" aria-hidden="true" />

            {tutorProcessing
              ? "Tutor Thinking"
              : processingCode
                ? "Generating"
                : listening
                  ? "Tutor Recording"
                  : micReady
                    ? "Editor Ready"
                    : "Connecting Mic"}
          </span>
        </div>

        <div className="app-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Help"
            title="Help"
            onClick={() =>
              speakMessage(
                "Sign-in succeeded. Use the course list on the left, edit code in the center, and ask the AI tutor on the right. Speak naturally to give coding instructions. Press Space to ask the tutor."
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
        {/* Course sidebar */}
        <nav className="sidebar" aria-label="Course">
          <p className="nav-label">Course</p>
          <p className="nav-course">Intro to Loops</p>

          <ul className="lesson-list">
            {LESSONS.map((lesson) => (
              <li key={lesson.id}>
                <button
                  type="button"
                  className={`lesson-btn${
                    activeLesson === lesson.id ? " is-active" : ""
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

          <p className="nav-label practice-label">
            Practice
          </p>

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

        {/* Code editor */}
        <section
          className="editor-pane"
          aria-label="Code editor"
        >
          <div
            className="tabs"
            role="tablist"
            aria-label="Open files"
          >
            {openFiles.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={activeFile === name}
                className={`tab${
                  activeFile === name ? " is-active" : ""
                }`}
                onClick={() => setActiveFile(name)}
              >
                {name}
              </button>
            ))}

            <button
              type="button"
              className="run-btn"
              onClick={runCode}
              aria-label="Run Python code"
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
              <pre
                className="code-highlight"
                aria-hidden="true"
              >
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

          {/* Program output */}
          <div className="output-panel">
            <p className="output-label">
              <span
                className="output-dot"
                aria-hidden="true"
              />
              Output
            </p>

            <pre className="output-body">
              {output.join("\n")}
            </pre>
          </div>
        </section>

        {/* AI Tutor */}
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

          <div
            className="chat"
            aria-label="Tutor conversation"
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

                  {message.audio || message.audioUrl ? (
                    <button
                      type="button"
                      className="audio-bars"
                      aria-label="Play tutor audio"
                      onClick={() =>
                        message.audioUrl
                          ? playTutorAudio(message.audioUrl)
                          : speakOutput()
                      }
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

          {/* Spacebar instructions instead of a microphone button */}
          <div className="tutor-shortcut">
            <p>
              Press <strong>Space</strong> to ask the AI Tutor.
            </p>

            <p>
              Press <strong>Space</strong> again when you finish.
            </p>

            {tutorProcessing && (
              <p aria-live="polite">
                Processing your question...
              </p>
            )}
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
