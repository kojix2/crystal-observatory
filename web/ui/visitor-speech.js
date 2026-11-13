import { visitorAction } from '../core/visitation.js';
import { t } from '../i18n/index.js';
import { visitorKey } from './event-labels.js';

export function visitorSpeech(model, visit) {
  const action = visitorAction(model, visit);
  if (!action) return undefined;
  const { kind, event } = action;
  const type = kind === 'type' ? Array.from(event.after || '') : [];
  const value = type.length > 40 ? `${type.slice(0, 39).join('')}…` : type.join('');
  const key = kind === 'type' && event.node_id !== visit.focus.node_id ? 'typeOther' : kind;
  return t(`ast.speech.${key}`, { type: value, node: event.node_id });
}

const overlap = (a, b) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Prefer blank space beside the Visitor. Above/below placements keep the
// current node unobscured when its right side is close to the viewport edge.
export function speechPlacement(viewport, anchor, target, size, obstacles = []) {
  const { width, height } = size;
  const left = viewport.left + 8,
    right = viewport.right - 8;
  const top = viewport.top + 8,
    bottom = viewport.bottom - 8;
  const x = clamp(anchor.x - width * 0.3, left, right - width);
  const y = clamp(anchor.y - height / 2, top, bottom - height);
  const candidates = [
    { side: 'left', x: anchor.x + anchor.radius + 10, y },
    { side: 'bottom', x, y: target.top - height - 12 },
    { side: 'top', x, y: target.bottom + 12 },
    { side: 'right', x: target.left - width - 12, y },
  ];
  return candidates
    .map((candidate, order) => {
      const box = {
        left: candidate.x,
        top: candidate.y,
        right: candidate.x + width,
        bottom: candidate.y + height,
      };
      const outside = box.left < left || box.top < top || box.right > right || box.bottom > bottom;
      const collision = overlap(box, target);
      const score = obstacles.reduce((sum, obstacle) => sum + overlap(box, obstacle), 0);
      return { ...candidate, outside, collision, score, order };
    })
    .filter((candidate) => !candidate.outside && !candidate.collision)
    .sort((a, b) => a.score - b.score || a.order - b.order)[0];
}

export function renderVisitorSpeech(graph, model, visit) {
  const text = visitorSpeech(model, visit);
  const ball = graph.querySelector('.visitor-ball-current');
  if (!text || !ball || graph.clientWidth < 120 || graph.clientHeight < 80) return;
  const matrix = ball.getScreenCTM();
  if (!matrix) return;
  const area = graph.getBoundingClientRect();
  const viewport = {
    left: area.left,
    top: area.top,
    right: area.left + graph.clientWidth,
    bottom: area.top + graph.clientHeight,
  };
  const circle = ball.querySelector('.visitor-ball-body');
  const radius = Number(circle.getAttribute('r')) * Math.hypot(matrix.a, matrix.b);
  const anchor = { x: matrix.e, y: matrix.f, radius };
  const targetElement = ball.closest('.node').querySelector('.tile, .radial-dot');
  const target = targetElement.getBoundingClientRect();
  const bubble = document.createElement('div');
  bubble.className = 'visitor-speech';
  bubble.dataset.visitor = visitorKey(visit.focus.visitor);
  bubble.setAttribute('role', 'note');
  bubble.textContent = text;
  const rightSpace = viewport.right - anchor.x - radius - 18;
  bubble.style.maxWidth = `${Math.min(232, rightSpace >= 112 ? rightSpace : graph.clientWidth - 16)}px`;
  bubble.style.visibility = 'hidden';
  bubble.style.left = '0px';
  bubble.style.top = '0px';
  graph.append(bubble);
  const size = bubble.getBoundingClientRect();
  const obstacles = [...graph.querySelectorAll('.node .tile, .node .radial-dot')]
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => overlap(rect, viewport));
  const position = speechPlacement(viewport, anchor, target, size, obstacles);
  if (!position) {
    bubble.remove();
    return;
  }
  bubble.dataset.side = position.side;
  bubble.style.left = `${position.x - area.left + graph.scrollLeft}px`;
  bubble.style.top = `${position.y - area.top + graph.scrollTop}px`;
  const tail =
    position.side === 'left' || position.side === 'right'
      ? clamp(anchor.y - position.y, 12, size.height - 12)
      : clamp(anchor.x - position.x, 12, size.width - 12);
  bubble.style.setProperty('--speech-tail', `${tail}px`);
  bubble.style.visibility = '';
}
