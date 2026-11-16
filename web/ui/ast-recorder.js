const svgStyles = [
  'color',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'paint-order',
  'vector-effect',
  'visibility',
  'display',
  'shape-rendering',
  'overflow',
];

function snapshot(graph) {
  const svg = graph.querySelector('.ast-svg');
  if (!svg) throw new Error('AST is not visible');
  const graphRect = graph.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true);
  const originals = [svg, ...svg.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((node, index) => {
    const style = globalThis.getComputedStyle(node);
    for (const property of svgStyles) {
      const value = style.getPropertyValue(property);
      if (value) copies[index].style.setProperty(property, value);
    }
  });
  clone.querySelector('.visitor-ball-current')?.remove();
  clone.setAttribute('width', svgRect.width);
  clone.setAttribute('height', svgRect.height);
  return {
    xml: new globalThis.XMLSerializer().serializeToString(clone),
    x: svgRect.left - graphRect.left,
    y: svgRect.top - graphRect.top,
    width: svgRect.width,
    height: svgRect.height,
    background: globalThis.getComputedStyle(graph).backgroundColor,
  };
}

function marker(graph) {
  const ball = graph.querySelector('.visitor-ball-current');
  const circle = ball?.querySelector('.visitor-ball-body');
  if (!circle) return null;
  // A fresh Web Animation places the live ball at the previous node. An
  // unanimated SVG copy reveals its destination without interrupting the UI.
  const orb = ball.querySelector('.visitor-orb');
  let target;
  if (orb?.parentNode) {
    const copy = orb.cloneNode(true);
    copy.style.opacity = '0';
    copy.style.pointerEvents = 'none';
    orb.parentNode.append(copy);
    try {
      target = copy.querySelector('.visitor-ball-body')?.getBoundingClientRect();
    } finally {
      copy.remove();
    }
  }
  const graphRect = graph.getBoundingClientRect();
  const rect = target || circle.getBoundingClientRect();
  const style = globalThis.getComputedStyle(circle);
  return {
    x: rect.left + rect.width / 2 - graphRect.left,
    y: rect.top + rect.height / 2 - graphRect.top,
    radius: Math.min(rect.width, rect.height) / 2,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: parseFloat(style.strokeWidth) || 0,
    letter: ball.querySelector('.visitor-ball-letter')?.textContent || '',
    visitor: ball.dataset.visitor,
    node: ball.dataset.visitNode,
    snapshot: ball.ownerSVGElement?.dataset.snapshot,
    layout: ball.ownerSVGElement?.getAttribute('class'),
  };
}

function drawMarker(ctx, point) {
  if (!point) return;
  ctx.beginPath();
  ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
  ctx.fillStyle = point.fill;
  ctx.fill();
  if (point.strokeWidth) {
    ctx.strokeStyle = point.stroke;
    ctx.lineWidth = point.strokeWidth;
    ctx.stroke();
  }
  ctx.fillStyle = point.stroke;
  ctx.font = `700 ${Math.max(11, point.radius * 1.15)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(point.letter, point.x, point.y);
}

function speech(graph) {
  const bubble = graph.querySelector('.visitor-speech');
  if (!bubble) return null;
  const viewport = graph.getBoundingClientRect();
  const rect = bubble.getBoundingClientRect();
  const style = globalThis.getComputedStyle(bubble);
  const glyphs = [];
  const node = bubble.firstChild;
  if (node && globalThis.document.createRange) {
    const range = document.createRange();
    let offset = 0;
    for (const char of bubble.textContent) {
      range.setStart(node, offset);
      offset += char.length;
      range.setEnd(node, offset);
      const bounds = range.getBoundingClientRect();
      glyphs.push({ char, x: bounds.left - viewport.left, y: bounds.top - viewport.top });
    }
  } else {
    glyphs.push({
      char: bubble.textContent,
      x: rect.left - viewport.left + 11,
      y: rect.top - viewport.top + 8,
    });
  }
  return {
    x: rect.left - viewport.left,
    y: rect.top - viewport.top,
    width: rect.width,
    height: rect.height,
    side: bubble.dataset.side,
    tail: parseFloat(bubble.style.getPropertyValue('--speech-tail')) || 16,
    background: style.backgroundColor,
    border: style.borderTopColor,
    borderWidth: parseFloat(style.borderTopWidth) || 1.5,
    radius: parseFloat(style.borderTopLeftRadius) || 12,
    color: style.color,
    font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
    glyphs,
  };
}

function roundRect(ctx, x, y, width, height, radius) {
  const right = x + width,
    bottom = y + height;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(right - radius, y);
  ctx.quadraticCurveTo(right, y, right, y + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(x + radius, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawSpeech(ctx, bubble) {
  if (!bubble) return;
  const { x, y, width, height, tail } = bubble;
  ctx.save();
  ctx.fillStyle = bubble.background;
  ctx.strokeStyle = bubble.border;
  ctx.lineWidth = bubble.borderWidth;
  ctx.shadowColor = '#0002';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, x, y, width, height, bubble.radius);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  const points = {
    left: [
      [x + 1, y + tail - 5],
      [x - 7, y + tail],
      [x + 1, y + tail + 5],
    ],
    right: [
      [x + width - 1, y + tail - 5],
      [x + width + 7, y + tail],
      [x + width - 1, y + tail + 5],
    ],
    top: [
      [x + tail - 5, y + 1],
      [x + tail, y - 7],
      [x + tail + 5, y + 1],
    ],
    bottom: [
      [x + tail - 5, y + height - 1],
      [x + tail, y + height + 7],
      [x + tail + 5, y + height - 1],
    ],
  }[bubble.side];
  if (points) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    ctx.lineTo(...points[1]);
    ctx.lineTo(...points[2]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = bubble.color;
  ctx.font = bubble.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (const glyph of bubble.glyphs) ctx.fillText(glyph.char, glyph.x, glyph.y);
  ctx.restore();
}

function imageFromSVG(xml) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    const image = new globalThis.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render AST frame'));
    };
    image.src = url;
  });
}

export class AstRecorder {
  constructor({ onSave, onStop, onError }) {
    this.onSave = onSave;
    this.onStop = onStop;
    this.onError = onError;
  }

  static supported() {
    return Boolean(
      globalThis.MediaRecorder && globalThis.HTMLCanvasElement?.prototype.captureStream,
    );
  }

  async start(graph, isCurrent = () => true) {
    if (this.recorder || this.stopping) return false;
    if (!AstRecorder.supported()) throw new Error('AST video recording is unavailable');
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, graph.clientWidth);
    canvas.height = Math.max(1, graph.clientHeight);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas is unavailable');
    const first = snapshot(graph);
    const image = await imageFromSVG(first.xml);
    if (!isCurrent() || this.recorder || this.stopping) {
      canvas.width = canvas.height = 0;
      return false;
    }
    context.fillStyle = first.background;
    this.background = first.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, first.x, first.y, first.width, first.height);
    drawMarker(context, marker(graph));
    drawSpeech(context, speech(graph));
    const stream = canvas.captureStream(30);
    try {
      const mimeType = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ].find((type) => globalThis.MediaRecorder.isTypeSupported(type));
      const recorder = new globalThis.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      let failed = false;
      this.canvas = canvas;
      this.context = context;
      this.stream = stream;
      this.recorder = recorder;
      this.failed = false;
      this.pending = Promise.resolve();
      let finish;
      this.finished = new Promise((resolve) => (finish = resolve));
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        failed = true;
        this.failed = true;
        this.onError(event.error || new Error('Recording failed'));
      };
      recorder.onstop = () => {
        try {
          if (chunks.length && !failed && !this.failed) {
            const type = recorder.mimeType || mimeType || 'video/webm';
            this.onSave(new Blob(chunks, { type }), type.includes('mp4') ? 'mp4' : 'webm');
          } else if (!chunks.length && !failed && !this.failed) {
            this.onError(new Error('No video frames recorded'));
          }
        } finally {
          chunks.length = 0;
          this.release();
          finish();
          this.onStop();
        }
      };
      recorder.start(1000);
      context.fillRect(0, 0, 1, 1); // Emit the first canvas frame after recording begins.
      return true;
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      canvas.width = canvas.height = 0;
      this.release();
      throw error;
    }
  }

  release() {
    if (this.recorder)
      this.recorder.ondataavailable = this.recorder.onerror = this.recorder.onstop = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.canvas = this.context = this.stream = this.recorder = this.pending = this.finished = null;
    this.stopping = false;
  }

  capture(graph, previous, duration) {
    if (this.recorder?.state !== 'recording' || this.stopping) return Promise.resolve();
    const recorder = this.recorder;
    const frame = snapshot(graph);
    const current = marker(graph);
    const bubble = speech(graph);
    const moving =
      previous &&
      current &&
      previous.visitor === current.visitor &&
      previous.node !== current.node &&
      previous.snapshot === current.snapshot &&
      previous.layout === current.layout;
    this.pending = this.pending.then(async () => {
      const image = await imageFromSVG(frame.xml);
      if (this.recorder !== recorder) return;
      const paint = (progress) => {
        const ctx = this.context;
        this.background = frame.background;
        ctx.fillStyle = frame.background;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height);
        drawMarker(
          ctx,
          moving
            ? {
                ...current,
                x: previous.x + (current.x - previous.x) * progress,
                y: previous.y + (current.y - previous.y) * progress,
              }
            : current,
        );
        if (!moving || progress >= 0.6) drawSpeech(ctx, bubble);
      };
      if (moving) {
        for (let i = 0; i < 6; i++) {
          if (this.recorder !== recorder) return;
          paint(i / 5);
          await new Promise((resolve) => setTimeout(resolve, Math.max(30, duration / 6)));
        }
      } else {
        paint(1);
        await new Promise((resolve) => setTimeout(resolve, duration));
      }
    });
    return this.pending;
  }

  async stop() {
    if (!this.recorder) return;
    if (this.stopping) return this.finished;
    this.stopping = true;
    const recorder = this.recorder;
    const finished = this.finished;
    try {
      await this.pending;
    } catch (error) {
      if (this.recorder === recorder) {
        this.failed = true;
        this.onError(error);
      }
    }
    if (this.recorder === recorder && recorder.state !== 'inactive') {
      this.context.fillStyle = this.background;
      this.context.fillRect(0, 0, 1, 1);
      this.stream.getVideoTracks()[0].requestFrame?.();
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (this.recorder === recorder && recorder.state !== 'inactive') recorder.stop();
    }
    return finished;
  }
}

export { marker as astMarker };
