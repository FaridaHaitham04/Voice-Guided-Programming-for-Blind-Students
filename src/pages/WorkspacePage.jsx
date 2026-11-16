import { useEffect, useMemo, useRef, useState } from "react";
import MicIcon from "../components/MicIcon.jsx";
import { highlightPython } from "../utils/highlightPython.js";
import { runSimplePython } from "../utils/runPython.js";
import "./workspace.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SPEECH_RATE_PRESETS = {
  slow: { label: "Slow (Clear)", lengthScale: 1.42, browserRate: 0.75 },
  calm: { label: "Calm (Default)", lengthScale: 1.28, browserRate: 0.85 },
  normal: { label: "Normal", lengthScale: 1.1, browserRate: 0.95 },
};

const DEFAULT_LESSONS = [
  {
    id: "lesson-1",
    title: "Lesson 1 · Variables",
    file: "lesson1.py",
    summary: "Store a piece of text or a number inside a labeled variable and print it out.",
    concept_explanation:
      "Think of a variable like a labeled jar on your desk where you can tuck away a piece of information to reuse later. On the left side of the equals sign, you write the label name, and on the right side you put the value you want to store. Whenever you pass that label into the print command, Python opens the jar and speaks out whatever is inside.",
    objectives: [
      "Create a string variable using a label, an equals sign, and quotation marks.",
      "Print the value stored inside a variable using print(name).",
      "Change a variable's value and run the file to hear the updated output.",
    ],
    code_walkthrough: [
      {
        line: 1,
        code: "# Store a name, then print it",
        explanation:
          "Line 1 starts with a hash symbol, making it a comment that Python skips while explaining the goal to you.",
      },
      {
        line: 2,
        code: 'name = "Ada"',
        explanation:
          "Line 2 creates a variable called name and stores the text Ada inside double quotation marks.",
      },
      {
        line: 3,
        code: "print(name)",
        explanation:
          "Line 3 calls print, open parenthesis, name, close parenthesis, so Python outputs Ada.",
      },
    ],
    practice_prompt:
      'Try changing "Ada" on line 2 to your own name, or add a second variable called greeting on line 4 and print it.',
    starter_code: '# Store a name, then print it\nname = "Ada"\nprint(name)\n',
    default_output: ["Ada"],
    assessments: [
      { name: "Assessment 1", score: "9/10" },
      { name: "Assessment 2", score: "10/10" },
    ],
  },
  {
    id: "lesson-2",
    title: "Lesson 2 · For loops",
    file: "lesson2.py",
    summary: "Repeat an action automatically for each number in a sequence using a for loop.",
    concept_explanation:
      "A for loop is like stepping through a short playlist track by track without rewriting the play command each time. With range(1, 6), Python counts starting at 1 and stops right before 6, giving you 1, 2, 3, 4, and 5. Every line indented four spaces underneath the colon belongs inside the loop and runs once per number.",
    objectives: [
      "Understand how range(1, 6) generates numbers from 1 through 5.",
      "Recognize why the colon and four-space indentation group code inside the loop.",
      "Predict and hear each line printed as the loop variable updates.",
    ],
    code_walkthrough: [
      {
        line: 1,
        code: "# Print each number from 1 to 5",
        explanation: "Line 1 is a comment describing what this counting loop does.",
      },
      {
        line: 2,
        code: "for number in range(1, 6):",
        explanation:
          "Line 2 starts the loop, assigning number to 1, then 2, up to 5, and ends with a colon.",
      },
      {
        line: 3,
        code: "    print(number)",
        explanation:
          "Line 3 is indented four spaces inside the loop and prints the current value of number on each pass.",
      },
    ],
    practice_prompt:
      "Try changing range(1, 6) on line 2 so the loop prints numbers from 1 to 10, then click Run to hear the output.",
    starter_code:
      "# Print each number from 1 to 5\nfor number in range(1, 6):\n    print(number)\n",
    default_output: ["1", "2", "3", "4", "5"],
    assessments: [
      { name: "Assessment 1", score: "8/10" },
      { name: "Assessment 2", score: null },
    ],
  },
  {
    id: "lesson-3",
    title: "Lesson 3 · While loops",
    file: "lesson3.py",
    summary:
      "Keep repeating a block of code as long as a condition stays true, like a countdown timer.",
    concept_explanation:
      "A while loop acts like a countdown timer that keeps ticking only while a check remains true. Before every pass, Python checks whether count is still greater than zero. Inside the indented body, we print count and subtract one from it so the loop eventually reaches zero and stops safely.",
    objectives: [
      "Check a condition before each repetition using while count > 0.",
      "Update the loop variable inside the indented body so the loop ends cleanly.",
      "Trace how count changes from 3 down to 1 step by step.",
    ],
    code_walkthrough: [
      {
        line: 1,
        code: "# Count down with a while loop",
        explanation: "Line 1 is a comment introducing our countdown program.",
      },
      {
        line: 2,
        code: "count = 3",
        explanation: "Line 2 sets the starting variable count to 3.",
      },
      {
        line: 3,
        code: "while count > 0:",
        explanation:
          "Line 3 checks if count is greater than zero; while that stays true, the indented lines keep repeating.",
      },
      {
        line: 4,
        code: "    print(count)",
        explanation: "Line 4 is indented four spaces and prints the current countdown number.",
      },
      {
        line: 5,
        code: "    count = count - 1",
        explanation:
          "Line 5 is also indented four spaces and subtracts 1 from count so the countdown moves closer to zero.",
      },
    ],
    practice_prompt:
      'Try changing count on line 2 to 5, or add an unindented print("Liftoff!") on line 6 after the loop finishes.',
    starter_code:
      "# Count down with a while loop\ncount = 3\nwhile count > 0:\n    print(count)\n    count = count - 1\n",
    default_output: ["3", "2", "1"],
    assessments: [
      { name: "Assessment 1", score: null },
      { name: "Assessment 2", score: null },
    ],
  },
];

const INITIAL_FILES = {
  "lesson1.py": DEFAULT_LESSONS[0].starter_code,
  "lesson2.py": DEFAULT_LESSONS[1].starter_code,
  "lesson3.py": DEFAULT_LESSONS[2].starter_code,
  "trial.py": '# Practice in this file\nprint("hello")\n',
  "test.py": "# Quick test\nprint(1 + 1)\n",
};

const INITIAL_CHAT = [
  {
    from: "ai",
    text: "Line 3 prints each value of number as the loop runs. Want me to read the output aloud?",
    audio: true,
  },
  { from: "you", text: "Yes, read it out." },
  {
    from: "ai",
    text: "It prints one, two, three, four, five — five lines total, counted correctly.",
    audio: true,
  },
];

export default function WorkspacePage({ user, onSignOut }) {
  const [lessons, setLessons] = useState(DEFAULT_LESSONS);
  const [files, setFiles] = useState(INITIAL_FILES);
  const [activeFile, setActiveFile] = useState("lesson2.py");
  const [openFiles, setOpenFiles] = useState(["lesson2.py", "trial.py"]);
  const [activeLesson, setActiveLesson] = useState("lesson-2");
  const [lessonViewerOpen, setLessonViewerOpen] = useState(true);
  const [lessonTab, setLessonTab] = useState("concept");
  const [isReadingLesson, setIsReadingLesson] = useState(false);

  const [cursorLine, setCursorLine] = useState(3);
  const [output, setOutput] = useState(["1", "2", "3", "4", "5"]);
  const [chat, setChat] = useState(INITIAL_CHAT);
  const [listening, setListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [announce, setAnnounce] = useState("Opened Lesson 2, for loops.");
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
  const currentLesson = useMemo(
    () => lessons.find((l) => l.id === activeLesson) || lessons[0],
    [lessons, activeLesson]
  );

  useEffect(() => {
    document.title = "BlindCode — Workspace";
    setAnnounce(`Signed in as ${user.email}. Lesson 2, for loops is open.`);
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
    setIsReadingLesson(false);
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

  function selectLesson(lesson) {
    cancelSpeech();
    setActiveLesson(lesson.id);
    setLessonViewerOpen(true);
    setLessonTab("concept");
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

  function toggleReadLesson() {
    if (isReadingLesson) {
      cancelSpeech();
      setAnnounce("Stopped reading lesson.");
      return;
    }
    if (!currentLesson) return;

    const walkthroughText = (currentLesson.code_walkthrough || [])
      .map((item) => item.explanation)
      .join(" ");
    const fullScript = [
      `${currentLesson.title}. ${currentLesson.summary}`,
      currentLesson.concept_explanation,
      walkthroughText,
      `Practice task: ${currentLesson.practice_prompt}`,
    ]
      .filter(Boolean)
      .join(" ");

    setIsReadingLesson(true);
    setAnnounce(`Reading ${currentLesson.title} aloud.`);
    speakText(fullScript, () => setIsReadingLesson(false));
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
          <p className="nav-course">Intro to Loops</p>
          <ul className="lesson-list">
            {lessons.map((lesson) => {
              const isSelected = activeLesson === lesson.id;
              return (
                <li key={lesson.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    className={`lesson-btn${isSelected ? " is-active" : ""}`}
                    onClick={() => selectLesson(lesson)}
                  >
                    <span className="lesson-dot" aria-hidden="true" />
                    <span className="lesson-btn-title">{lesson.title}</span>
                  </button>
                  <ul className="assessment-list">
                    {(lesson.assessments || []).map((item) => (
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
              );
            })}
          </ul>

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
              <button
                type="button"
                className={`guide-toggle-btn${lessonViewerOpen ? " is-open" : ""}`}
                aria-expanded={lessonViewerOpen}
                onClick={() => setLessonViewerOpen((prev) => !prev)}
              >
                {lessonViewerOpen ? "Hide Lesson Guide" : "Lesson Guide"}
              </button>
              <button type="button" className="run-btn" onClick={runCode}>
                Run
              </button>
            </div>
          </div>

          {lessonViewerOpen && currentLesson ? (
            <section
              className="lesson-viewer"
              aria-label={`${currentLesson.title} guide`}
            >
              <div className="lesson-viewer-header">
                <div className="lesson-viewer-titles">
                  <div className="lesson-title-row">
                    <h2>{currentLesson.title}</h2>
                    <span className="lesson-file-badge">{currentLesson.file}</span>
                  </div>
                  <p className="lesson-summary">{currentLesson.summary}</p>
                </div>
                <div className="lesson-viewer-actions">
                  <button
                    type="button"
                    className={`lesson-action-btn${isReadingLesson ? " is-active" : ""}`}
                    onClick={toggleReadLesson}
                  >
                    {isReadingLesson ? "⏹ Stop Reading" : "🔊 Read Lesson Aloud"}
                  </button>
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
                    💬 Ask Vision to Teach Me
                  </button>
                </div>
              </div>

              <div className="lesson-subtabs" role="tablist" aria-label="Lesson sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={lessonTab === "concept"}
                  aria-controls="lesson-tabpanel"
                  className={`lesson-subtab${lessonTab === "concept" ? " is-active" : ""}`}
                  onClick={() => setLessonTab("concept")}
                >
                  Concept &amp; Objectives
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
                  Practice Task &amp; Assessments
                </button>
              </div>

              <div id="lesson-tabpanel" role="tabpanel" className="lesson-tabpanel">
                {lessonTab === "concept" && (
                  <div className="lesson-concept-view">
                    <p className="lesson-explanation">
                      {currentLesson.concept_explanation}
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
                    <ul className="lesson-assessment-cards">
                      {(currentLesson.assessments || []).map((a) => (
                        <li key={a.name} className="assessment-card">
                          <span>{a.name}</span>
                          <span className={a.score ? "score" : "pending"}>
                            {a.score || "Not attempted"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          ) : null}

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
