// Mouse navigation leaves touch scrolling and node activation to the browser.
export function bindGraphNavigation(graph, { enabled = () => true, selector = 'svg', zoom }) {
  const available = (event) =>
    enabled() && graph.querySelector(selector) && !event.target.closest('.type-activities');
  graph.addEventListener(
    'wheel',
    (event) => {
      if (!available(event) || !event.deltaY) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? graph.clientHeight : 1;
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
      zoom(Math.exp(-delta * 0.002), { x: event.clientX, y: event.clientY });
    },
    { passive: false },
  );
  let pan;
  graph.addEventListener('pointerdown', (event) => {
    if (
      !available(event) ||
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      event.target.closest('.node')
    )
      return;
    pan = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: graph.scrollLeft,
      top: graph.scrollTop,
    };
    graph.setPointerCapture(event.pointerId);
    graph.classList.add('panning');
    event.preventDefault();
  });
  graph.addEventListener('pointermove', (event) => {
    if (!pan || event.pointerId !== pan.id) return;
    graph.scrollLeft = pan.left + pan.x - event.clientX;
    graph.scrollTop = pan.top + pan.y - event.clientY;
  });
  const endPan = (event) => {
    if (!pan || event.pointerId !== pan.id) return;
    pan = null;
    graph.classList.remove('panning');
    if (graph.hasPointerCapture(event.pointerId)) graph.releasePointerCapture(event.pointerId);
  };
  graph.addEventListener('pointerup', endPan);
  graph.addEventListener('pointercancel', endPan);
  graph.addEventListener('lostpointercapture', endPan);
}

// Account for SVG margins and centering as well as the container's scroll offset.
export function zoomGraphAt(graph, selector, ratio, render, point) {
  const before = graph.querySelector(selector)?.getBoundingClientRect();
  render();
  const after = graph.querySelector(selector)?.getBoundingClientRect();
  if (!before || !after) return;
  graph.scrollLeft += after.left + (point.x - before.left) * ratio - point.x;
  graph.scrollTop += after.top + (point.y - before.top) * ratio - point.y;
}
