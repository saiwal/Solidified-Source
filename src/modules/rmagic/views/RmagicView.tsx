import { useNavigate } from "@solidjs/router";

// Remote login is now part of the combined login page.
export default function RmagicView() {
  useNavigate()("/login", { replace: true });
  return null;
}
