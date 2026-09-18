import { useState } from "react";
import AuthShell from "../components/AuthShell.jsx";
import "./auth.css";

export default function SignUpPage({ onBackToSignIn, onSignedIn }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      setMessage("Please fill in name, email, and password.");
      return;
    }
    setMessage(`Account created for ${name}. Opening EchoCode.`);
    onSignedIn({
      email: email.trim(),
      name: name.trim(),
      initials: name
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    });
  }

  return (
    <AuthShell>
      <h1 id="page-heading" className="auth-title">Create an account</h1>
      <p className="auth-subtitle">
        Set up EchoCode with your name, email, and a passphrase.
      </p>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="full-name">Full name</label>
        <input
          id="full-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <label htmlFor="signup-email">Email address</label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@university.edu"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Create a password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button type="submit" className="submit-btn">
          Create account
        </button>
      </form>

      <p className="auth-footer">
        Already have an account?{" "}
        <button type="button" className="text-link" onClick={onBackToSignIn}>
          Sign in
        </button>
      </p>
    </AuthShell>
  );
}
