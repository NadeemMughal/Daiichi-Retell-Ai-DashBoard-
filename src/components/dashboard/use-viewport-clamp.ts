"use client";

import { useEffect, useRef } from "react";

// A popover is positioned against its trigger, but its size is written in
// viewport units. Both axes break once the trigger is not where the author
// assumed it would be.
//
// Horizontally, a trigger sitting mid-toolbar pushes a wide panel past the edge
// of a narrow screen. CSS cannot recover it here: .glass sets backdrop-filter,
// which makes every card a containing block, so position: fixed resolves against
// the card rather than the viewport. The panel is moved by writing an explicit
// left offset; a margin cannot do it, because for a panel anchored with right:0
// the margin is absorbed into the computed left and the box never moves.
//
// Vertically, a max-height like calc(100vh - 110px) ignores how far down the
// page the trigger sits, so the foot of the panel — where Apply lives — ends up
// below the fold while the page behind it is scroll-locked. The panel is capped
// to the room actually beneath it, and flipped above the trigger when that room
// runs out.
export function useViewportClamp<T extends HTMLElement>(open: boolean, gutter = 8) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const clamp = () => {
      node.style.left = "";
      node.style.right = "";
      node.style.top = "";
      node.style.bottom = "";
      node.style.maxWidth = "";
      node.style.maxHeight = "";

      const viewportWidth = document.documentElement.clientWidth;
      // clientHeight, not innerHeight: innerHeight counts the strip hidden behind
      // mobile browser chrome, so a panel sized against it runs off the bottom of
      // the screen. It also keeps both axes measured against the same viewport.
      const viewportHeight = document.documentElement.clientHeight;
      const availableWidth = viewportWidth - gutter * 2;
      if (node.getBoundingClientRect().width > availableWidth) node.style.maxWidth = `${availableWidth}px`;

      let rect = node.getBoundingClientRect();
      let desiredLeft = rect.left;
      if (desiredLeft + rect.width > viewportWidth - gutter) desiredLeft = viewportWidth - gutter - rect.width;
      if (desiredLeft < gutter) desiredLeft = gutter;
      if (Math.abs(desiredLeft - rect.left) >= 1) {
        const origin = node.offsetParent?.getBoundingClientRect().left ?? 0;
        node.style.right = "auto";
        node.style.left = `${Math.round(desiredLeft - origin)}px`;
      }

      rect = node.getBoundingClientRect();
      const anchor = node.offsetParent?.getBoundingClientRect();
      const roomBelow = viewportHeight - rect.top - gutter;
      const roomAbove = (anchor ? anchor.top : rect.top) - gutter;
      const fullHeight = viewportHeight - gutter * 2;
      if (rect.height <= roomBelow) return;
      if (anchor && Math.min(rect.height, fullHeight) <= roomAbove) {
        node.style.top = "auto";
        node.style.bottom = "calc(100% + 10px)";
        node.style.maxHeight = `${Math.round(roomAbove)}px`;
        return;
      }
      // A trigger halfway down the page leaves too little room on either side, so
      // the panel stops tracking it and uses the height of the window instead.
      // The page is scroll-locked while a panel is open, so this stays put.
      if (anchor && fullHeight > roomBelow) {
        node.style.top = `${Math.round(gutter - anchor.top)}px`;
        node.style.bottom = "auto";
        node.style.maxHeight = `${Math.round(fullHeight)}px`;
        return;
      }
      node.style.maxHeight = `${Math.round(Math.max(200, roomBelow))}px`;
    };
    clamp();
    // The first pass runs before the browser has settled the panel's final box,
    // and a panel measured as short enough keeps its authored position for good.
    // Re-running on the next two frames catches that. A ResizeObserver would be
    // the obvious tool and is the wrong one: the clamp writes max-height, which
    // resizes the very box being observed, so it would feed itself.
    const frames: number[] = [];
    frames.push(requestAnimationFrame(() => { clamp(); frames.push(requestAnimationFrame(clamp)); }));
    window.addEventListener("resize", clamp);
    window.addEventListener("orientationchange", clamp);
    window.addEventListener("scroll", clamp, true);
    return () => {
      for (const frame of frames) cancelAnimationFrame(frame);
      window.removeEventListener("resize", clamp);
      window.removeEventListener("orientationchange", clamp);
      window.removeEventListener("scroll", clamp, true);
    };
  }, [gutter, open]);
  return ref;
}
