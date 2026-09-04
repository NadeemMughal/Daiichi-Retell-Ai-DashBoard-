"use client";

import { useEffect, useRef } from "react";

// A popover is positioned against its trigger. On a narrow screen a trigger that
// sits mid-toolbar pushes a wide panel past the edge of the screen, leaving part
// of it unreachable. Nothing in CSS can measure that distance here: .glass sets
// backdrop-filter, which makes every card a containing block, so position: fixed
// resolves against the card rather than the viewport.
//
// The panel is repositioned by writing an explicit left offset. A margin cannot
// do it: for a panel anchored with right:0 the margin is absorbed into the
// computed left and the box does not move at all.
export function useViewportClamp<T extends HTMLElement>(open: boolean, gutter = 8) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const clamp = () => {
      node.style.left = "";
      node.style.right = "";
      node.style.maxWidth = "";
      const viewport = document.documentElement.clientWidth;
      const available = viewport - gutter * 2;
      if (node.getBoundingClientRect().width > available) node.style.maxWidth = `${available}px`;
      const rect = node.getBoundingClientRect();
      let desired = rect.left;
      if (desired + rect.width > viewport - gutter) desired = viewport - gutter - rect.width;
      if (desired < gutter) desired = gutter;
      if (Math.abs(desired - rect.left) < 1) return;
      const origin = node.offsetParent?.getBoundingClientRect().left ?? 0;
      node.style.right = "auto";
      node.style.left = `${Math.round(desired - origin)}px`;
    };
    clamp();
    window.addEventListener("resize", clamp);
    window.addEventListener("orientationchange", clamp);
    return () => {
      window.removeEventListener("resize", clamp);
      window.removeEventListener("orientationchange", clamp);
    };
  }, [gutter, open]);
  return ref;
}
