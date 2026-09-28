import { permanentRedirect } from "next/navigation";

// My Profile moved to /profile; keep old links and bookmarks working.
export default function MePage() {
  permanentRedirect("/profile");
}
