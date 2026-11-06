export const DEFAULT_PANES = [25, 47, 28];
export const MIN_PANES = [250, 360, 270];
export function paneWeights(value) {
  if (
    !Array.isArray(value) ||
    value.length !== DEFAULT_PANES.length ||
    value.some((n) => !Number.isFinite(n) || n <= 0)
  )
    return [...DEFAULT_PANES];
  const total = value.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total)) return [...DEFAULT_PANES];
  return value.map((n) => (n / total) * 100);
}
// Preserve proportions, fixing any undersized panes before sharing the rest.
export function paneWidths(available, weights, minimums = MIN_PANES) {
  let remaining = Math.max(
    available,
    minimums.reduce((a, b) => a + b, 0),
  );
  const pending = new Set(DEFAULT_PANES.map((_, i) => i)),
    result = [];
  while (pending.size) {
    const total = [...pending].reduce((sum, i) => sum + weights[i], 0);
    const small = [...pending].filter((i) => (remaining * weights[i]) / total < minimums[i]);
    if (!small.length) {
      for (const i of pending) result[i] = (remaining * weights[i]) / total;
      break;
    }
    for (const i of small) {
      result[i] = minimums[i];
      remaining -= result[i];
      pending.delete(i);
    }
  }
  return result;
}
export function moveDivider(widths, index, delta, minimums = MIN_PANES) {
  const result = [...widths],
    pair = widths[index] + widths[index + 1];
  result[index] = Math.max(
    minimums[index],
    Math.min(pair - minimums[index + 1], widths[index] + delta),
  );
  result[index + 1] = pair - result[index];
  return paneWeights(result);
}

export function detailHeights(available, ratio = 0.42) {
  const total = Math.max(340, available);
  const top = Math.max(150, Math.min(total - 190, total * ratio));
  return [top, total - top];
}
