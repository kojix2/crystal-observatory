import { t } from '../i18n/index.js';
import { esc } from './dom.js';
import { shortVisitor, visitorKey } from './event-labels.js';

const visitorLetters = new Map([
  ['TypeGuessVisitor', 'G'],
  ['TypeDeclarationVisitor', 'D'],
  ['ToSVisitor', 'S'],
]);

function visitorLetter(visitor) {
  const key = visitorKey(visitor);
  const mark = visitorLetters.get(key);
  const name = key.split('::').at(-1) || '?';
  return mark || Array.from(Array.from(name)[0].toUpperCase())[0];
}

export function visitDecoration(id, visit, { width, radius, unit = 1, reference = false }) {
  if (reference) return { classes: '', attributes: '', shape: '' };
  const active = visit.focus?.node_id === id;
  const visitors = [
    ...new Set(
      (visit.stack || []).filter((frame) => frame.node_id === id).map((frame) => frame.visitor),
    ),
  ];
  if (active) {
    const index = visitors.indexOf(visit.focus.visitor);
    if (index >= 0) visitors.splice(index, 1);
    visitors.unshift(visit.focus.visitor);
  }
  if (!visitors.length) return { classes: '', attributes: '', shape: '' };
  const classes = active ? ` visit-current visit-${visit.mode}` : ' visit-parent';
  const attributes = ` data-visitor="${esc(visitorKey(visitors[0]))}"`;
  // The balls sit outside the text area. Waiting balls form a small cluster
  // along the right edge, without changing node dimensions during playback.
  const shape = visitors
    .slice(0, radius === undefined ? 3 : 1)
    .map((visitor, i) => {
      const current = active && i === 0;
      const r = (current ? 13 : 8) * unit;
      const x = radius === undefined ? width + 3 + i * 17 : radius + 3 * unit;
      const y = radius === undefined ? 8 : -radius - 3 * unit;
      const size = radius === undefined ? r : (current ? 9 : 7) * unit;
      const fontSize = (current ? (radius === undefined ? 15 : 12) : 11) * unit;
      const label = `${shortVisitor(visitor)} · ${t(current ? `ast.visit.${visit.mode}` : 'ast.visit.waiting')}`;
      return `<g class="visitor-ball ${current ? 'visitor-ball-current' : 'visitor-ball-waiting'}" data-visitor="${esc(visitorKey(visitor))}" data-visit-node="${id}" data-visit-index="${visit.index}" transform="translate(${x} ${y})" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><g class="visitor-orb"><circle class="visitor-ball-body" r="${size}"/><text class="visitor-ball-letter" font-size="${fontSize}" dy=".35em" aria-hidden="true">${esc(visitorLetter(visitor))}</text></g></g>`;
    })
    .join('');
  const count = Math.min(visitors.length, radius === undefined ? 3 : 1);
  const right =
    radius === undefined
      ? Math.ceil(3 + (count - 1) * 17 + (active && count === 1 ? 13 : 8) + 3)
      : 0;
  return { classes, attributes, shape, right };
}

export function captureVisitorBall(graph) {
  const ball = graph.querySelector('.visitor-ball-current');
  if (!ball?.getBoundingClientRect) return null;
  return {
    rect: ball.getBoundingClientRect(),
    visitor: ball.dataset.visitor,
    node: ball.dataset.visitNode,
    index: Number(ball.dataset.visitIndex),
    layout: ball.ownerSVGElement?.getAttribute('class'),
    snapshot: ball.ownerSVGElement?.getAttribute('data-snapshot'),
  };
}

export function animateVisitorBall(graph, previous) {
  const ball = graph.querySelector('.visitor-ball-current');
  const orb = ball?.querySelector?.('.visitor-orb');
  if (
    !previous ||
    !orb?.animate ||
    typeof window === 'undefined' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
    return;
  if (
    Math.abs(Number(ball.dataset.visitIndex) - previous.index) !== 1 ||
    ball.ownerSVGElement?.getAttribute('class') !== previous.layout ||
    ball.ownerSVGElement?.getAttribute('data-snapshot') !== previous.snapshot
  )
    return;
  if (ball.dataset.visitor !== previous.visitor) {
    orb.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1)' }], {
      duration: 150,
      easing: 'ease-out',
    });
    return;
  }
  if (ball.dataset.visitNode === previous.node) return;
  const rect = ball.getBoundingClientRect();
  const matrix = orb.getScreenCTM();
  if (!matrix) return;
  const dx = previous.rect.x + previous.rect.width / 2 - rect.x - rect.width / 2;
  const dy = previous.rect.y + previous.rect.height / 2 - rect.y - rect.height / 2;
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!determinant) return;
  const x = (matrix.d * dx - matrix.c * dy) / determinant;
  const y = (matrix.a * dy - matrix.b * dx) / determinant;
  orb.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], {
    duration: 180,
    easing: 'ease-out',
  });
}
