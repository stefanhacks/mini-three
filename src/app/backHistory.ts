import type { Store } from "./store";

const MARK = "hanto-detail";

const isOurEntry = (): boolean => (history.state as { hanto?: string } | null)?.hanto === MARK;

/**
 * Lets the phone's back gesture or button close the mobile detail pane. Opening the pane in the mobile layout pushes
 * a history entry for the same URL; going back pops it and closes the pane. Closing the pane any other way (Back
 * button, tab) pops that entry too, so the history never collects stale entries. `history.back()` is only called
 * while the current entry is the one pushed here, so it can never leave the page. Desktop never pushes.
 */
export const syncBackHistory = (store: Store, isMobile: () => boolean): { layoutChanged: () => void } => {
  // A reload keeps the history state, but the pane starts closed: drop the mark so Back can't pop the page.
  if (isOurEntry()) {
    history.replaceState(null, "");
  }
  let popping = false;
  window.addEventListener("popstate", () => {
    if (store.get().detailOpen) {
      popping = true;
      store.set({ detailOpen: false });
      popping = false;
    }
  });
  store.subscribe((state, previous) => {
    if (state.detailOpen && !previous.detailOpen && isMobile() && !isOurEntry()) {
      history.pushState({ hanto: MARK }, "");
    } else if (!state.detailOpen && previous.detailOpen && !popping && isOurEntry()) {
      history.back();
    }
  });
  return {
    // A pane opened on desktop has no entry; when the layout turns mobile with it open, add one.
    layoutChanged: () => {
      if (isMobile() && store.get().detailOpen && !isOurEntry()) {
        history.pushState({ hanto: MARK }, "");
      }
    },
  };
};
