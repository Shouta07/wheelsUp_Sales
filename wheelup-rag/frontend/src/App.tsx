import { Routes, Route } from "react-router-dom";
import PhaseNav from "./components/PhaseNav";
import Dashboard from "./pages/Dashboard";
import Briefing from "./pages/Briefing";
import SearchPanel from "./pages/SearchPanel";
import PostMeeting from "./pages/PostMeeting";
import Companies from "./pages/Companies";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PhaseNav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/briefing" element={<Briefing />} />
        <Route path="/search" element={<SearchPanel />} />
        <Route path="/post-meeting" element={<PostMeeting />} />
      </Routes>
    </div>
  );
}
