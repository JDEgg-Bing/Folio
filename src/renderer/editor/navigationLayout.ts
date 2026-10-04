export const NAVIGATION_TOP_MARGIN = 16;

/** Add only the space needed by an explicit jump near the document end. */
export function navigationBottomPadding(viewportHeight: number, remainingHeight: number, ordinaryPadding: number): number {
  return Math.max(ordinaryPadding, viewportHeight - NAVIGATION_TOP_MARGIN - remainingHeight);
}
