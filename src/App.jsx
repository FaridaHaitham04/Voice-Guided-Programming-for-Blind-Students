import { useState } from "react";
import SignInPage from "./pages/SignInPage.jsx";
import SignUpPage from "./pages/SignUpPage.jsx";
import WorkspacePage from "./pages/WorkspacePage.jsx";

export default function App() {
  const [view, setView] = useState("signin");
  const [user, setUser] = useState(null);

  function signIn(nextUser) {
    setUser(nextUser);
    setView("workspace");
  }

  function signOut() {
    setUser(null);
    setView("signin");
  }

  if (view === "workspace" && user) {
    return <WorkspacePage user={user} onSignOut={signOut} />;
  }

  if (view === "signup") {
    return (
      <SignUpPage
        onBackToSignIn={() => setView("signin")}
        onSignedIn={signIn}
      />
    );
  }

  return (
    <SignInPage
      onCreateAccount={() => setView("signup")}
      onSignedIn={signIn}
    />
  );
}
