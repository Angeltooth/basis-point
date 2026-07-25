import { Fragment } from "react";

// Fuse.js finds fuzzy (typo-tolerant) matches, but its match indices are
// relative to the *searched* field (move.title), not necessarily the exact
// text rendered on screen (move.headline embeds the title plus generated
// stats). Rather than trying to remap fuzzy character-level indices across
// two different strings, this does a simpler, more predictable thing:
// highlight literal case-insensitive substring occurrences of the query in
// whatever text is actually displayed. For a typo query ("fedd rat") that
// still matches via fuzzy search but has no literal substring in the
// rendered text, nothing gets highlighted — the result still shows up, it
// just won't have a highlight. That tradeoff favors predictability over
// pixel-perfect fuzzy highlighting.
export function highlightMatch(text: string, query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return text;

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    part.toLowerCase() === trimmed.toLowerCase() ? (
      <mark key={i} className="bg-primary/25 text-foreground rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}
