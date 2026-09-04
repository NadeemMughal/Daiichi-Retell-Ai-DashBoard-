"use client";

import { createPortal } from "react-dom";

// A dialog opened from inside a dropdown is a DOM child of that dropdown, and a
// positioned panel with a z-index is its own stacking context. The dialog's
// z-index is then compared against the panel's siblings rather than against the
// page, so a full-screen overlay ends up painted underneath the page heading no
// matter how high its z-index is. Rendering to the body is what lets the
// z-index mean what it says.
export function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
