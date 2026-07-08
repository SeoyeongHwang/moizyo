import { Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { ToastProvider } from "./components/Toast";
import { sectionTitle } from "./components/uiStyles";
import { CreatePollPage } from "./pages/CreatePollPage";
import { PollLandingPage } from "./pages/PollLandingPage";
import { JoinPage } from "./pages/JoinPage";
import { RespondPage } from "./pages/RespondPage";
import { SubmittedPage } from "./pages/SubmittedPage";
import { ResultsPage } from "./pages/ResultsPage";

function Shell() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<CreatePollPage />} />
        <Route path="/vote/:id" element={<PollLandingPage />} />
        <Route path="/vote/:id/join" element={<JoinPage />} />
        <Route path="/vote/:id/respond" element={<RespondPage />} />
        <Route path="/vote/:id/submitted" element={<SubmittedPage />} />
        <Route path="/vote/:id/results" element={<ResultsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

function NotFound() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ ...sectionTitle, color: "var(--color-ink-muted)" }}>페이지를 찾을 수 없습니다.</div>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

export default App;
