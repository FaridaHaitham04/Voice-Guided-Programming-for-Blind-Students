import { useState } from "react";
import SignInPage from "./pages/SignInPage.jsx";
import SignUpPage from "./pages/SignUpPage.jsx";

export default function App() {
  const [view, setView] = useState("signin");

  if (view === "signup") {
    return <SignUpPage onBackToSignIn={() => setView("signin")} />;
  }

  return <SignInPage onCreateAccount={() => setView("signup")} />;
}
