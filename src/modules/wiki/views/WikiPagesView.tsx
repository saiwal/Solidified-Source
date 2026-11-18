// src/modules/wiki/views/WikiPagesView.tsx
// Thin redirect: /:nick/:wikiName → /:nick/:wikiName/Home
// No data loading here — WikiPageView owns all fetching.
import { useParams, useNavigate } from "@solidjs/router";
import { onSettled } from "solid-js";

export default function WikiPagesView() {
  const params   = useParams<{ nick: string; wikiName: string }>();
  const navigate = useNavigate();

  onSettled(() => {
    navigate(`/wiki/${params.nick}/${params.wikiName}/Home`, { replace: true });
  });

  return null;
}
