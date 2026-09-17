import { useState } from "react";
import AuthShell from "../components/AuthShell.jsx";
import MicIcon from "../components/MicIcon.jsx";
import "./auth.css";

export default function SignInPage({ onCreateAccount }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [message, setMessage] = useState("");
  function announce(text) {
    setMessage(text);
  }

  function handlePasswordChange(event) {
    const next = event.target.value;
    setPassword(next);

    if (next.length === 0) {
      announce("Password cleared.");
      return;
    }

    const lastChar = next[next.length - 1];
    announce(`Character ${next.length}: ${describeChar(lastChar)}.`);
  }

  function handleEmailSubmit(event) {
    event.preventDefault();
    if (!email.trim() || !password) {
      announce("Please enter both email and password.");
      return;
    }
    announce(`Signing in as ${email}.`);
  }

  function handleVoiceSignIn() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceStatus("unsupported");
      announce(
        "Voice sign-in is not supported in this browser. Use email and password instead."
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setVoiceStatus("listening");
    announce("Listening. Say your name and passphrase when ready.");

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setVoiceStatus("heard");
      announce(`Heard: ${transcript}. Voice sign-in is ready to connect.`);
    };

    recognition.onerror = () => {
      setVoiceStatus("error");
      announce("Voice sign-in did not complete. You can try again or use email.");
    };

    recognition.onend = () => {
      setVoiceStatus((current) => (current === "listening" ? "idle" : current));
    };

    recognition.start();
  }

  const voiceLabel =
    voiceStatus === "listening"
      ? "Listening for your name and passphrase"
      : "Say your name and passphrase when ready";

  return (
    <AuthShell>
      <h1 id="page-heading" className="auth-title">Welcome back</h1>
      <p className="auth-subtitle">
        Sign in by voice, or use your email if you&apos;d rather type.
      </p>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </div>

      <button
        type="button"
        className={`voice-btn${voiceStatus === "listening" ? " is-listening" : ""}`}
        onClick={handleVoiceSignIn}
        aria-describedby="voice-help"
      >
        <span className="voice-icon" aria-hidden="true">
          <MicIcon />
        </span>
        <span className="voice-copy">
          <strong>Sign in with your voice</strong>
          <span id="voice-help">{voiceLabel}</span>
        </span>
      </button>

      <div className="divider" role="separator" aria-label="or sign in with email">
        <span>or sign in with email</span>
      </div>

      <form className="auth-form" onSubmit={handleEmailSubmit}>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@university.edu"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={handlePasswordChange}
          aria-describedby="password-help"
        />
        <p id="password-help" className="field-help">
          Your screen reader will announce each character as you type.
        </p>

        <button type="submit" className="submit-btn">
          Sign in
        </button>
      </form>

      <p className="auth-footer">
        New to EchoCode?{" "}
        <button type="button" className="text-link" onClick={onCreateAccount}>
          Create an account
        </button>
      </p>
    </AuthShell>
  );
}

function describeChar(char) {
  if (char === " ") return "space";
  if (/[A-Z]/.test(char)) return `capital ${char}`;
  if (/[a-z]/.test(char)) return char;
  if (/[0-9]/.test(char)) return char;
  return char;
}
