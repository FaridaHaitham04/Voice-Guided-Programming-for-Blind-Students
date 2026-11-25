import { useEffect, useMemo, useRef, useState } from "react";
import LessonAudioPlayer from "../components/LessonAudioPlayer.jsx";
import MicIcon from "../components/MicIcon.jsx";
import DEFAULT_LESSONS from "../data/lessonsData.json";
import { highlightPython } from "../utils/highlightPython.js";
import { runSimplePython } from "../utils/runPython.js";
import "./workspace.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SPEECH_RATE_PRESETS = {
  slow: { label: "Slow (Clear)", lengthScale: 1.42, browserRate: 0.75 },
  calm: { label: "Calm (Default)", lengthScale: 1.28, browserRate: 0.85 },
  normal: { label: "Normal", lengthScale: 1.1, browserRate: 0.95 },
};

const INITIAL_FILES = {
  ...Object.fromEntries(DEFAULT_LESSONS.map((l) => [l.file, l.starter_code])),
  "trial.py": '# Practice in this file\nprint("hello")\n',
  "test.py": "# Quick test\nprint(1 + 1)\n",
};

const INITIAL_CHAT = [
  {
    from: "ai",
    text: "Welcome! Open Lesson 1 Loops on the left, listen to the For Loop audio or read its script, and ask me anytime you want extra help.",
    audio: true,
  },
];

export default function WorkspacePage({ user, onSignOut }) {
  const [lessons, setLessons] = useState(DEFAULT_LESSONS);
  const [files, setFiles] = useState(INITIAL_FILES);
  const [activeFile, setActiveFile] = useState(DEFAULT_LESSONS[0].file);
  const [openFiles, setOpenFiles] = useState([DEFAULT_LESSONS[0].file, "trial.py"]);
  const [activeLesson, setActiveLesson] = useState(DEFAULT_LESSONS[0].id);
  const [expandedModules, setExpandedModules] = useState({ "lesson-1": true });
  const [lessonViewerOpen, setLessonViewerOpen] = useState(true);
  const [lessonExpanded, setLessonExpanded] = useState(false);
  const [lessonTab, setLessonTab] = useState("script");

  const [cursorLine, setCursorLine] = useState(3);
  const [output, setOutput] = useState(DEFAULT_LESSONS[0].default_output || ["1", "2", "3", "4", "5"]);
  const [chat, setChat] = useState(INITIAL_CHAT);
  const [listening, setListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [announce, setAnnounce] = useState(`Opened ${DEFAULT_LESSONS[0].title}.`);
  const [tutorInput, setTutorInput] = useState("");
  const [voiceCapabilities, setVoiceCapabilities] = useState({
    faster_whisper_available: false,
    piper_available: false,
  });
  const [speechRate, setSpeechRate] = useState("calm");

  const editorRef = useRef(null);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const speechEpochRef = useRef(0);
  const speechPauseTimerRef = useRef(null);
  const speechRateRef = useRef("calm");
  const speechQueueRef = useRef([]);
  const isSpeakingQueueRef = useRef(false);

  const code = files[activeFile] ?? "";
  const lines = useMemo(() => highlightPython(code.replace(/\n$/, "") || " "), [code]);
  const currentLessonIndex = useMemo(() => {
    const idx = lessons.findIndex((l) => l.id === activeLesson);
    return idx >= 0 ? idx : 0;
  }, [lessons, activeLesson]);
  const currentLesson = lessons[currentLessonIndex] || lessons[0];
  const nextLesson =
    currentLessonIndex < lessons.length - 1 ? lessons[currentLessonIndex + 1] : null;
  const modules = useMemo(() => {
    const map = new Map();
    for (const lesson of lessons) {
      const modId = lesson.module_id || "lesson-1";
      const modTitle = lesson.module_title || "Lesson 1 · Loops";
      if (!map.has(modId)) {
        map.set(modId, { id: modId, title: modTitle, items: [] });
      }
      map.get(modId).items.push(lesson);
    }
    return Array.from(map.values());
  }, [lessons]);

  useEffect(() => {
    document.title = "BlindCode — Workspace";
    setAnnounce(`Signed in as ${user.email}. ${DEFAULT_LESSONS[0].title} is open.`);
    return () => {
      document.title = "BlindCode — Sign in";
      cancelSpeech();
    };
  }, [user.email]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // Sync structured lessons and backend Whisper/Piper capabilities on mount
  useEffect(() => {
    let active = true;

    async function syncBackend() {
      try {
        const res = await fetch(`${API_BASE}/api/lessons`);
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data) && data.length > 0) {
            setLessons(data);
          }
        }
      } catch {
        // Offline / frontend-only mode keeps DEFAULT_LESSONS
      }

      try {
        const res = await fetch(`${API_BASE}/api/health`);
        if (res.ok) {
          const data = await res.json();
          if (active && data?.voice) {
            setVoiceCapabilities(data.voice);
          }
        }
      } catch {
        // Offline / frontend-only mode keeps browser Web Speech fallback
      }
    }

    syncBackend();
    return () => {
      active = false;
    };
  }, []);

  function cancelSpeech() {
    speechEpochRef.current += 1;
    speechQueueRef.current = [];
    isSpeakingQueueRef.current = false;
    if (speechPauseTimerRef.current) {
      clearTimeout(speechPauseTimerRef.current);
      speechPauseTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function scheduleNextSentence(epoch, onFinished) {
    if (speechEpochRef.current !== epoch) return;
    if (speechQueueRef.current.length === 0) {
      isSpeakingQueueRef.current = false;
      if (onFinished) onFinished();
      return;
    }
    speechPauseTimerRef.current = setTimeout(() => {
      speechPauseTimerRef.current = null;
      if (speechEpochRef.current === epoch) {
        pumpSpeechQueue(onFinished);
      }
    }, 250);
  }

  function pickPreferredEnglishVoice(voices) {
    if (!Array.isArray(voices) || voices.length === 0) return null;
    const enVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
    return (
      enVoices.find((v) => /natural|neural|google|aria|jenny|guy/i.test(v.name)) ||
      enVoices[0] ||
      null
    );
  }

  function speakWithBrowser(text, epoch, onFinished) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      speechQueueRef.current = [];
      isSpeakingQueueRef.current = false;
      if (onFinished) onFinished();
      return;
    }
    const preset = SPEECH_RATE_PRESETS[speechRateRef.current] || SPEECH_RATE_PRESETS.calm;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = preset.browserRate;
    const preferred = pickPreferredEnglishVoice(window.speechSynthesis.getVoices());
    if (preferred) {
      utterance.voice = preferred;
    }
    const next = () => scheduleNextSentence(epoch, onFinished);
    utterance.onend = next;
    utterance.onerror = next;
    window.speechSynthesis.speak(utterance);
  }

  async function pumpSpeechQueue(onFinished) {
    if (speechQueueRef.current.length === 0) {
      isSpeakingQueueRef.current = false;
      if (onFinished) onFinished();
      return;
    }

    const epoch = speechEpochRef.current;
    isSpeakingQueueRef.current = true;
    const nextText = speechQueueRef.current.shift();
    const preset = SPEECH_RATE_PRESETS[speechRateRef.current] || SPEECH_RATE_PRESETS.calm;

    if (voiceCapabilities.piper_available) {
      try {
        const res = await fetch(`${API_BASE}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: nextText,
            length_scale: preset.lengthScale,
          }),
        });
        if (speechEpochRef.current !== epoch) return;
        if (res.ok) {
          const blob = await res.blob();
          if (speechEpochRef.current !== epoch) return;
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          const finishClip = () => {
            if (audioUrlRef.current === url) {
              URL.revokeObjectURL(url);
              audioUrlRef.current = null;
            }
            if (audioRef.current === audio) {
              audioRef.current = null;
            }
            scheduleNextSentence(epoch, onFinished);
          };
          audio.onended = finishClip;
          audio.onerror = finishClip;
          await audio.play();
          return;
        }
      } catch {
        if (speechEpochRef.current !== epoch) return;
      }
    }

    speakWithBrowser(nextText, epoch, onFinished);
  }

  function speakText(text, onFinished) {
    if (!text) return;
    cancelSpeech();
    speechQueueRef.current.push(text);
    pumpSpeechQueue(onFinished);
  }

  function enqueueSpeechSentence(sentence) {
    const clean = (sentence || "").trim();
    if (!clean) return;
    speechQueueRef.current.push(clean);
    if (!isSpeakingQueueRef.current) {
      pumpSpeechQueue();
    }
  }

  function computeOutputForFile(fileName, sourceText) {
    const result = runSimplePython(sourceText);
    if (result.length > 0) return result;
    const matchedLesson = lessons.find((l) => l.file === fileName);
    if (matchedLesson && Array.isArray(matchedLesson.default_output)) {
      return matchedLesson.default_output;
    }
    return ["(no output)"];
  }

  function openFile(name, lessonId) {
    setActiveFile(name);
    setOpenFiles((current) => (current.includes(name) ? current : [...current, name]));
    if (lessonId) {
      setActiveLesson(lessonId);
    } else {
      const matched = lessons.find((l) => l.file === name);
      if (matched) setActiveLesson(matched.id);
    }

    const fileContent = files[name] ?? "";
    const printLine =
      fileContent
        .split("\n")
        .findIndex((line) => line.trim().startsWith("print(")) + 1;
    setCursorLine(printLine || 1);
    setOutput(computeOutputForFile(name, fileContent));
    setAnnounce(`${name} opened.`);
  }

  function toggleModuleDropdown(moduleId) {
    setExpandedModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }));
  }

  function selectLesson(lesson) {
    cancelSpeech();
    setActiveLesson(lesson.id);
    if (lesson.module_id) {
      setExpandedModules((prev) => ({ ...prev, [lesson.module_id]: true }));
    }
    setLessonViewerOpen(true);
    setLessonTab("script");
    setActiveFile(lesson.file);
    setOpenFiles((current) =>
      current.includes(lesson.file) ? current : [...current, lesson.file]
    );

    const fileContent = files[lesson.file] ?? lesson.starter_code ?? "";
    const printLine =
      fileContent
        .split("\n")
        .findIndex((line) => line.trim().startsWith("print(")) + 1;
    setCursorLine(printLine || 1);
    setOutput(computeOutputForFile(lesson.file, fileContent));
    setAnnounce(`Opened ${lesson.title}. ${lesson.summary}`);
  }

  function focusAndSpeakLine(item) {
    setCursorLine(item.line);
    if (editorRef.current) {
      const linesArr = code.split("\n");
      let charOffset = 0;
      for (let i = 0; i < Math.min(item.line - 1, linesArr.length); i += 1) {
        charOffset += linesArr[i].length + 1;
      }
      editorRef.current.focus();
      editorRef.current.setSelectionRange(charOffset, charOffset);
    }
    setAnnounce(item.explanation);
    speakText(item.explanation);
  }

  function updateCode(next) {
    setFiles((current) => ({ ...current, [activeFile]: next }));
    const line = next.slice(0, editorRef.current?.selectionStart || 0).split("\n").length;
    setCursorLine(line);
  }

  function runCode() {
    const result = runSimplePython(files[activeFile] ?? "");
    setOutput(result.length ? result : ["(no output)"]);
    setAnnounce(`Ran ${activeFile}. ${result.length} output lines.`);
  }

  async function askTutor(text) {
    if (!text || !text.trim() || isThinking) return;
    const trimmed = text.trim();

    cancelSpeech();
    setIsThinking(true);

    const history = chat.map((m) => ({
      role: m.from === "ai" ? "assistant" : "user",
      content: m.text,
    }));

    // Optimistically add student turn + streaming placeholder AI bubble
    setChat((current) => [
      ...current,
      { from: "you", text: trimmed },
      { from: "ai", text: "Thinking...", audio: true, streaming: true },
    ]);
    setAnnounce("Tutor is thinking...");

    const payload = {
      lesson_id: currentLesson?.id || activeLesson,
      lesson_title: currentLesson ? currentLesson.title : "Python Practice",
      file_name: activeFile,
      code,
      cursor_line: cursorLine,
      output,
      history,
      user_message: trimmed,
    };

    const updateLastBubble = (nextText, streaming = false) => {
      setChat((current) => {
        if (current.length === 0) return current;
        const next = [...current];
        const last = next[next.length - 1];
        if (last.from === "ai") {
          next[next.length - 1] = { ...last, text: nextText, audio: true, streaming };
        }
        return next;
      });
    };

    try {
      const streamResp = await fetch(`${API_BASE}/api/tutor/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (streamResp.ok && streamResp.body) {
        const reader = streamResp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedSentences = [];
        let finalReply = "";

        const handleStreamLine = (rawLine) => {
          const cleanedLine = rawLine.trim();
          if (!cleanedLine) return;
          const evt = JSON.parse(cleanedLine);
          if (evt.type === "sentence" && evt.text) {
            streamedSentences.push(evt.text);
            updateLastBubble(streamedSentences.join(" "), true);
            enqueueSpeechSentence(evt.text);
          } else if (evt.type === "done") {
            finalReply = evt.reply || streamedSentences.join(" ") || "I am listening.";
          } else if (evt.type === "error") {
            throw new Error(evt.detail || "Streaming error");
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const linesOut = buffer.split("\n");
          buffer = linesOut.pop() ?? "";
          for (const line of linesOut) {
            handleStreamLine(line);
          }
        }
        if (buffer.trim()) {
          handleStreamLine(buffer);
        }

        const resolved = finalReply || streamedSentences.join(" ") || "I am listening.";
        updateLastBubble(resolved, false);
        setAnnounce(resolved);
        if (streamedSentences.length === 0) {
          speakText(resolved);
        }
        return;
      }

      if (streamResp.status >= 500) {
        const errData = await streamResp.json().catch(() => null);
        throw new Error(errData?.detail || `Server returned status ${streamResp.status}`);
      }

      // Fallback to standard single-response endpoint
      const response = await fetch(`${API_BASE}/api/tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || `Server returned status ${response.status}`);
      }

      const data = await response.json();
      const reply = data.reply || data.raw_reply || "I am listening.";
      updateLastBubble(reply, false);
      setAnnounce(reply);
      speakText(reply);
    } catch (err) {
      const detail = err?.message && !/failed to fetch/i.test(err.message) ? err.message : "";
      const errorMsg =
        detail ||
        "I could not connect to the tutor service. Please check that Ollama and the backend server are running.";
      updateLastBubble(errorMsg, false);
      setAnnounce(errorMsg);
      speakText(errorMsg);
    } finally {
      setIsThinking(false);
    }
  }

  function handleTutorSubmit(e) {
    e.preventDefault();
    if (!tutorInput.trim() || isThinking) return;
    const text = tutorInput;
    setTutorInput("");
    askTutor(text);
  }

  async function listenWithWhisper() {
    if (listening && mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      setListening(false);
      return;
    }

    cancelSpeech();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setListening(false);

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (!audioBlob.size) return;

        setAnnounce("Transcribing your voice with Whisper...");
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");

        try {
          const res = await fetch(`${API_BASE}/api/stt`, {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.detail || `STT returned ${res.status}`);
          }
          const data = await res.json();
          const transcript = (data.text || "").trim();
          if (transcript) {
            askTutor(transcript);
          } else {
            const msg = "I did not hear any speech in that recording. Please try again.";
            setAnnounce(msg);
            speakText(msg);
          }
        } catch (err) {
          const msg =
            err?.message && !/failed to fetch/i.test(err.message)
              ? `Speech transcription failed: ${err.message}`
              : "Could not transcribe audio. Check that the backend STT service is running.";
          setAnnounce(msg);
          speakText(msg);
        }
      };

      recorder.start();
      setListening(true);
      setAnnounce("Listening with Whisper. Click again when finished speaking.");
    } catch {
      setListening(false);
      setAnnounce("Microphone access was denied or unavailable.");
    }
  }

  function listenToTutor() {
    if (
      voiceCapabilities.faster_whisper_available &&
      navigator.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== "undefined"
    ) {
      listenWithWhisper();
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAnnounce(
        "Voice questions are not supported in this browser. Type a question instead."
      );
      return;
    }

    if (listening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setListening(false);
      return;
    }

    cancelSpeech();

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    let handled = false;

    recognition.onstart = () => {
      setListening(true);
      setAnnounce("Listening for your question. Speak now.");
    };

    recognition.onresult = (event) => {
      if (handled) return;
      const result = event.results[0];
      if (result && result[0]) {
        const transcript = result[0].transcript.trim();
        if (transcript) {
          handled = true;
          setListening(false);
          askTutor(transcript);
        }
      }
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error !== "no-speech") {
        setAnnounce(`Voice recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setListening(false);
    };

    try {
      recognition.start();
    } catch {
      setListening(false);
    }
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
            {listening ? "Listening" : "Ready"}
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
                "Click any lesson on the left to open its lesson guide and starter code, edit code in the center, and ask the AI tutor on the right."
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
          <p className="nav-course">Python Programming</p>
          <div className="module-list">
            {modules.map((mod) => {
              const isExpanded = Boolean(expandedModules[mod.id]);
              return (
                <section key={mod.id} className="module-group">
                  <button
                    type="button"
                    className={`module-toggle${isExpanded ? " is-open" : ""}`}
                    aria-expanded={isExpanded}
                    onClick={() => toggleModuleDropdown(mod.id)}
                  >
                    <span className="module-toggle-text">
                      <span className="module-toggle-title">{mod.title}</span>
                      <span className="module-toggle-count">
                        {mod.items.length} {mod.items.length === 1 ? "item" : "items"}
                      </span>
                    </span>
                    <svg
                      className={`module-chevron${isExpanded ? " is-open" : ""}`}
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {isExpanded ? (
                    <ul className="module-lesson-list">
                      {mod.items.map((lesson) => {
                        const isSelected = activeLesson === lesson.id;
                        return (
                          <li key={lesson.id}>
                            <button
                              type="button"
                              aria-current={isSelected ? "page" : undefined}
                              className={`module-lesson-btn${isSelected ? " is-active" : ""}`}
                              onClick={() => selectLesson(lesson)}
                            >
                              <span className="module-lesson-dot" aria-hidden="true" />
                              <span className="module-lesson-info">
                                <span className="module-lesson-title">{lesson.title}</span>
                                <span className="module-lesson-meta">
                                  {lesson.subtitle || `Audio & Script · ${lesson.duration_label || "1:00"}`}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>

          <p className="nav-label practice-label">Practice</p>
          <ul className="practice-list">
            {["trial.py", "test.py"].map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className={activeFile === name ? "is-active" : undefined}
                  onClick={() => openFile(name)}
                >
                  <span className="tiny-dot" aria-hidden="true" />
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="editor-pane" aria-label="Lesson and code workspace">
          <div className="tabs" role="tablist">
            {openFiles.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={activeFile === name}
                className={`tab${activeFile === name ? " is-active" : ""}`}
                onClick={() => openFile(name)}
              >
                {name}
              </button>
            ))}
            <div className="tab-actions">
              {lessonViewerOpen ? (
                <button
                  type="button"
                  className={`guide-toggle-btn${lessonExpanded ? " is-open" : ""}`}
                  onClick={() => setLessonExpanded((prev) => !prev)}
                >
                  {lessonExpanded ? "Show Code Editor" : "Expand Lesson"}
                </button>
              ) : null}
              <button
                type="button"
                className={`guide-toggle-btn${lessonViewerOpen ? " is-open" : ""}`}
                aria-expanded={lessonViewerOpen}
                onClick={() => setLessonViewerOpen((prev) => !prev)}
              >
                {lessonViewerOpen ? "Hide Lesson" : "Show Lesson"}
              </button>
              <button type="button" className="run-btn" onClick={runCode}>
                Run
              </button>
            </div>
          </div>

          {lessonViewerOpen && currentLesson ? (
            <section
              className={`lesson-viewer${lessonExpanded ? " is-expanded" : ""}`}
              aria-label={`${currentLesson.title} guide`}
            >
              <div className="lesson-viewer-header">
                <div className="lesson-viewer-titles">
                  <div className="lesson-title-row">
                    <h2>{currentLesson.title}</h2>
                    <span className="lesson-file-badge">{currentLesson.file}</span>
                  </div>
                </div>
                <div className="lesson-viewer-actions">
                  <button
                    type="button"
                    className="lesson-action-btn secondary"
                    disabled={isThinking}
                    onClick={() =>
                      askTutor(
                        `Walk me through ${currentLesson.title} step by step and give me a small challenge.`
                      )
                    }
                  >
                    Ask Vision to Teach Me
                  </button>
                </div>
              </div>

              <LessonAudioPlayer
                lesson={currentLesson}
                apiBase={API_BASE}
                onBeforePlay={cancelSpeech}
                onAnnounce={setAnnounce}
              />

              <div className="lesson-subtabs" role="tablist" aria-label="Lesson sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={lessonTab === "script"}
                  aria-controls="lesson-tabpanel"
                  className={`lesson-subtab${lessonTab === "script" ? " is-active" : ""}`}
                  onClick={() => setLessonTab("script")}
                >
                  Lesson Script
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={lessonTab === "walkthrough"}
                  aria-controls="lesson-tabpanel"
                  className={`lesson-subtab${lessonTab === "walkthrough" ? " is-active" : ""}`}
                  onClick={() => setLessonTab("walkthrough")}
                >
                  Line-by-Line Code Guide
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={lessonTab === "practice"}
                  aria-controls="lesson-tabpanel"
                  className={`lesson-subtab${lessonTab === "practice" ? " is-active" : ""}`}
                  onClick={() => setLessonTab("practice")}
                >
                  Practice Task
                </button>
              </div>

              <div id="lesson-tabpanel" role="tabpanel" className="lesson-tabpanel">
                {lessonTab === "script" && (
                  <div className="lesson-script-view">
                    {(Array.isArray(currentLesson.script) && currentLesson.script.length > 0
                      ? currentLesson.script
                      : [currentLesson.concept_explanation]
                    )
                      .filter(Boolean)
                      .map((paragraph, idx) => (
                        <p key={idx} className="lesson-script-paragraph">
                          {paragraph}
                        </p>
                      ))}
                  </div>
                )}

                {lessonTab === "walkthrough" && (
                  <ul className="walkthrough-list">
                    {(currentLesson.code_walkthrough || []).map((item) => (
                      <li key={item.line}>
                        <button
                          type="button"
                          className={`walkthrough-item${
                            cursorLine === item.line && activeFile === currentLesson.file
                              ? " is-current"
                              : ""
                          }`}
                          onClick={() => focusAndSpeakLine(item)}
                        >
                          <span className="walkthrough-line-badge">
                            Line {item.line}
                          </span>
                          <code className="walkthrough-code">{item.code}</code>
                          <span className="walkthrough-desc">{item.explanation}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {lessonTab === "practice" && (
                  <div className="lesson-practice-view">
                    <p className="practice-prompt-text">
                      <strong>Try this:</strong> {currentLesson.practice_prompt}
                    </p>
                    {currentLesson.objectives?.length ? (
                      <ul className="lesson-objectives">
                        {currentLesson.objectives.map((goal) => (
                          <li key={goal}>{goal}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="lesson-viewer-footer">
                <span className="lesson-constant-note">
                  {currentLesson.module_title}
                </span>
                {nextLesson ? (
                  <button
                    type="button"
                    className="next-item-btn"
                    onClick={() => selectLesson(nextLesson)}
                  >
                    Go to next item →
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {!lessonExpanded || !lessonViewerOpen ? (
            <>
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
            </>
          ) : null}
        </section>

        <aside className="tutor" aria-label="AI Tutor">
          <header className="tutor-head">
            <h1>AI Tutor</h1>
            <select
              className="voice-speed-select"
              aria-label="Tutor voice speed"
              value={speechRate}
              onChange={(e) => {
                const nextRate = e.target.value;
                speechRateRef.current = nextRate;
                setSpeechRate(nextRate);
                const label = SPEECH_RATE_PRESETS[nextRate]?.label || nextRate;
                setAnnounce(`Tutor voice speed set to ${label}`);
              }}
            >
              {Object.entries(SPEECH_RATE_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </header>
          <div className="chat">
            {chat.map((message, index) => (
              <div key={index} className={`bubble-row ${message.from}`}>
                <span className={`who ${message.from}`} aria-hidden="true">
                  {message.from === "ai" ? "AI" : user.initials || "FA"}
                </span>
                <div className="bubble">
                  <p>{message.text}</p>
                  {message.audio && !message.streaming ? (
                    <button
                      type="button"
                      className="audio-bars"
                      aria-label="Play tutor audio"
                      onClick={() => speakText(message.text)}
                    >
                      <span />
                      <span />
                      <span />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <button
            type="button"
            className={`speak-tutor${listening ? " is-listening" : ""}`}
            onClick={listenToTutor}
            disabled={isThinking}
            aria-label={
              isThinking
                ? "Tutor is thinking"
                : listening
                ? "Stop listening"
                : "Speak to ask the tutor a question"
            }
          >
            <span className="listen-dot" aria-hidden="true" />
            {isThinking
              ? "Tutor is thinking..."
              : listening
              ? "Listening... (click when done)"
              : "Speak to ask the tutor a question"}
          </button>
          <form className="tutor-text-form" onSubmit={handleTutorSubmit}>
            <input
              type="text"
              className="tutor-input-field"
              placeholder="Or type a question..."
              value={tutorInput}
              disabled={isThinking}
              onChange={(e) => setTutorInput(e.target.value)}
              aria-label="Type a question for the AI tutor"
            />
            <button
              type="submit"
              className="tutor-send-btn"
              disabled={isThinking || !tutorInput.trim()}
              aria-label="Send question"
            >
              Ask
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
