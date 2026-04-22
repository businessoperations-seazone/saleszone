import { BrowserRouter, Routes, Route } from "react-router-dom";
import SchedulePage from "./pages/SchedulePage";
import WaitingRoom from "./pages/WaitingRoom";
import LiveRoom from "./pages/LiveRoom";
import ThankYou from "./pages/ThankYou";
import InvalidLink from "./pages/InvalidLink";
import AdminLayout from "./pages/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import SlotsPage from "./pages/admin/SlotsPage";
import SessionsPage from "./pages/admin/SessionsPage";
import LiveControl from "./pages/admin/LiveControl";
import RegistrationsPage from "./pages/admin/RegistrationsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/:closerSlug" element={<SchedulePage />} />
        <Route path="/webinar/sala/:sessionId" element={<WaitingRoom />} />
        <Route path="/webinar/sala/:sessionId/live" element={<LiveRoom />} />
        <Route path="/webinar/obrigado" element={<ThankYou />} />
        <Route path="/webinar/invalid" element={<InvalidLink />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="slots" element={<SlotsPage />} />
          <Route path="sessoes" element={<SessionsPage />} />
          <Route path="sessoes/:sessionId/live" element={<LiveControl />} />
          <Route path="inscricoes" element={<RegistrationsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
