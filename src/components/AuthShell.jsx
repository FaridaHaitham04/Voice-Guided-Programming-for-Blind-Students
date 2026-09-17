import MicIcon from "./MicIcon.jsx";
import "../pages/auth.css";

export default function AuthShell({ children }) {
  return (
    <main className="auth-page">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          <MicIcon />
        </span>
        <span className="brand-name">EchoCode</span>
      </header>
      <section className="auth-card" aria-labelledby="page-heading">
        {children}
      </section>
    </main>
  );
}
