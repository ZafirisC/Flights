// The side panel / bottom sheet (#panel) is shared by the aircraft and airport panels.
// Opening one closes the other through its close function.
let owner = null;

export function claimPanel(close) {
  if (owner && owner !== close) {
    const previous = owner;
    owner = null;
    previous();
  }
  owner = close;
}

export function releasePanel(close) {
  if (owner === close) owner = null;
}
