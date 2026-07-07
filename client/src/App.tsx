import { Route, Routes, useLocation } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { ToastProvider } from "./components/Toast";
import { CreatePollPage } from "./pages/CreatePollPage";
import { PollLandingPage } from "./pages/PollLandingPage";
import { JoinPage } from "./pages/JoinPage";
import { RespondPage } from "./pages/RespondPage";
import { SubmittedPage } from "./pages/SubmittedPage";
import { ResultsPage } from "./pages/ResultsPage";

function roleLabelForPath(pathname: string): string {
  if (pathname === "/") return "생성자 · 투표 만들기";
  if (/\/join$/.test(pathname)) return "참가자";
  if (/\/respond$/.test(pathname)) return "참가자 · 시간 입력";
  if (/\/submitted$/.test(pathname)) return "참가자";
  if (/\/results$/.test(pathname)) return "생성자 · 결과";
  if (/^\/vote\/[^/]+$/.test(pathname)) return "생성자 · 공유";
  return "";
}

function Shell() {
  const location = useLocation();
  return (
    <>
      <NavBar roleLabel={roleLabelForPath(location.pathname)} />
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
      <div style={{ fontSize: 18, color: "var(--color-ink-muted)" }}>페이지를 찾을 수 없습니다.</div>
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
