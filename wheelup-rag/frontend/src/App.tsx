import { Routes, Route } from "react-router-dom";
import PhaseNav from "./components/PhaseNav";
import Dashboard from "./pages/Dashboard";
import Briefing from "./pages/Briefing";
import SearchPanel from "./pages/SearchPanel";
import PostMeeting from "./pages/PostMeeting";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PhaseNav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/briefing" element={<Briefing />} />
        <Route path="/search" element={<SearchPanel />} />
        <Route path="/post-meeting" element={<PostMeeting />} />
      </Routes>
    </div>
  );
}
