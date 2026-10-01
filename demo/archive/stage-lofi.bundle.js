(() => {
  // src/renderer/features/archive/canvas/archiveHologram.js
  var HOLOGRAM_DURATION = 1500;
  var HOLOGRAM_PADDING = 128;
  var clamp = (n) => Math.max(0, Math.min(1, n));
  var ease = (n) => n * n * (3 - 2 * n);
  function hologramFrame(elapsed) {
    const progress = clamp(elapsed / 1200);
    const pulse = clamp((elapsed - 1260) / 200);
    return {
      progress,
      scan: 512 * (1 - ease(clamp((progress - 0.08) / 0.76))),
      energy: progress < 0.98 ? Math.sin(Math.PI * clamp(progress / 0.98)) : 0,
      settle: ease(clamp((progress - 0.72) / 0.28)),
      distortion: progress > 0 && progress < 1 ? Math.sin(Math.PI * progress) ** 2 * (0.35 + 0.65 * Math.sin(progress * 24) ** 2) : 0,
      flash: pulse > 0 && pulse < 1 ? Math.sin(Math.PI * pulse) ** 2 : 0,
      active: elapsed < HOLOGRAM_DURATION
    };
  }
  function paintHologram(surface, source, state, tint) {
    const c = surface.getContext("2d");
    const { progress, scan, energy, settle, distortion, flash } = state;
    const pad = HOLOGRAM_PADDING;
    const scale = 512 / 310;
    c.clearRect(0, 0, surface.width, surface.height);
    c.save();
    c.beginPath();
    c.rect(0, scan, surface.width, 512 - scan);
    c.clip();
    for (let y = Math.floor(scan / 3) * 3; y < 512; y += 3) {
      const h = y / 512;
      const band = h > 0.19 && h < 0.31 ? -24 : h > 0.43 && h < 0.59 ? 34 : h > 0.7 && h < 0.79 ? -18 : 0;
      const pull = distortion * clamp((1 - h) / 0.12);
      const stretch = 512 * 0.18 * Math.exp(-(((h - 0.5) / 0.2) ** 2)) * pull;
      const left = pad + (band + Math.sin(h * 19) * 7) * pull * scale - stretch / 2;
      const width = 512 + stretch;
      const resolved = clamp((y - scan) / (75 * scale));
      const flicker = progress < 0.72 && Math.sin(progress * 83) > 0.92 ? 0.82 : 1;
      c.globalAlpha = (settle + (1 - settle) * (0.38 + 0.62 * resolved)) * flicker * (1 - 0.45 * flash);
      const bandHeight = Math.min(3, 512 - y);
      c.drawImage(source, 0, y, 512, bandHeight, left, y, width, bandHeight);
      c.globalAlpha = energy * 0.12 + flash * 0.1;
      c.fillStyle = tint;
      c.fillRect(left, y, width, bandHeight);
      if (y % 6 === 0) {
        c.globalAlpha = energy * 0.25 + flash * 0.18;
        c.fillStyle = "#000";
        c.fillRect(left, y, width, 1);
      }
    }
    c.restore();
    if (energy > 0 && progress > 0.025) {
      c.save();
      c.fillStyle = tint;
      c.globalAlpha = energy * 0.85;
      c.shadowColor = tint;
      c.shadowBlur = 12;
      c.fillRect(pad, scan, 512, 1.6);
      c.globalAlpha = energy * 0.18;
      c.fillRect(pad, scan, 512, 9);
      c.restore();
    }
  }

  // demo/archive/stage-lofi-renderer.js
  function mountArchiveStage(root) {
    const frames = /* @__PURE__ */ new Set();
    const timers = /* @__PURE__ */ new Set();
    const observers = [];
    const subscriptions = [];
    let disposed = false;
    function requestAnimationFrame2(callback) {
      if (disposed) return 0;
      const id = window.requestAnimationFrame((time) => {
        frames.delete(id);
        if (!disposed) callback(time);
      });
      frames.add(id);
      return id;
    }
    function cancelAnimationFrame2(id) {
      frames.delete(id);
      window.cancelAnimationFrame(id);
    }
    function setTimeout(callback, delay) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!disposed) callback();
      }, delay);
      timers.add(id);
      return id;
    }
    function clearTimeout(id) {
      timers.delete(id);
      window.clearTimeout(id);
    }
    function listen(target, type, callback) {
      target.addEventListener(type, callback);
      subscriptions.push(() => target.removeEventListener(type, callback));
    }
    function observe(Type, callback, target, options) {
      const observer = new Type(callback);
      observers.push(observer);
      observer.observe(target, options);
    }
    let setAlbums = () => {
    };
    const images = /* @__PURE__ */ new Set();
    (() => {
      const canvas = root.getElementById("album-stage");
      const ctx = canvas.getContext("2d");
      const hostStyle = getComputedStyle(root.host);
      const token = (name, fallback) => hostStyle.getPropertyValue(name).trim() || fallback;
      const loFi = root.host.dataset.fidelity === "lofi";
      const colors2 = {
        accent: token("--archive-color-accent-secondary", "#f72585"),
        bgCard: token("--archive-color-bg-card", "#20232d"),
        borderControl: token("--archive-color-border-control", "#334155"),
        textPrimary: token("--archive-color-text-primary", "#f8fafc"),
        textSecondary: token("--archive-color-text-secondary", "#94a3b8"),
        projection: token("--archive-color-projection", "#7be2ed")
      };
      const fonts = {
        display: token("--archive-font-display", "'Chakra Petch', sans-serif"),
        data: token("--archive-font-data", "'JetBrains Mono', monospace"),
        ui: token("--archive-font-ui", "'Rajdhani', sans-serif")
      };
      let albums2 = [];
      let albumRevision = 0;
      let revealQueuedAt = 0;
      let revealStart = null;
      let revealing = false;
      if (!ctx) return;
      const TAU = Math.PI * 2;
      let step = TAU;
      const pitch = 0.36, cp = Math.cos(pitch), sp = Math.sin(pitch), focal = 1300;
      const motion = matchMedia("(prefers-reduced-motion: reduce)");
      const title = root.getElementById("stage-title"), artist = root.getElementById("stage-artist");
      const caption = root.getElementById("stage-caption");
      const captionFace = root.getElementById("stage-caption-face");
      const captionCtx = captionFace?.getContext?.("2d");
      const position = root.getElementById("stage-position"), autoButton = root.getElementById("stage-auto");
      let angle = 0, target = 0, selected = 0, auto = !motion.matches;
      let drag = null, hovering = false, focused = false, raf = 0, lastTime = 0;
      let nextAdvance = performance.now() + 6500, timer = 0, renderScale = 1, offsetX = 0, offsetY = 0;
      let pixelRatio = 1, width = 800, height = 480, hits = [];
      const mod = (n, d) => (n % d + d) % d;
      const nearest = (a) => albums2.length ? mod(Math.round(-a / step), albums2.length) : 0;
      let selectors = [];
      function drawArtworkPlaceholder(album, surface) {
        const c = surface.getContext("2d");
        c.clearRect(0, 0, 512, 512);
        c.fillStyle = colors2.bgCard;
        c.fillRect(0, 0, 512, 512);
        c.strokeStyle = colors2.borderControl;
        c.lineWidth = 2;
        c.strokeRect(30, 30, 452, 452);
        c.fillStyle = colors2.textPrimary;
        c.font = `700 28px ${fonts.display}`;
        c.fillText(album.title, 48, 240, 416);
        c.fillStyle = colors2.textSecondary;
        c.font = `600 18px ${fonts.ui}`;
        c.fillText(album.artist, 48, 280, 416);
        c.fillText("\u6682\u65E0\u5C01\u9762", 48, 430, 416);
      }
      function artwork(album) {
        const surface = document.createElement("canvas");
        surface.width = surface.height = 512;
        const c = surface.getContext("2d");
        drawArtworkPlaceholder(album, surface);
        if (album.artworkUrl) {
          const revision = albumRevision;
          const image = new Image();
          images.add(image);
          image.onload = () => {
            images.delete(image);
            if (disposed || revision !== albumRevision) return;
            const edge = Math.min(image.naturalWidth, image.naturalHeight);
            album.artworkSettled = true;
            if (edge === 0) {
              wake();
              return;
            }
            c.drawImage(
              image,
              (image.naturalWidth - edge) / 2,
              (image.naturalHeight - edge) / 2,
              edge,
              edge,
              0,
              0,
              512,
              512
            );
            album.artworkLoaded = true;
            if (revealStart !== null && performance.now() - revealStart >= HOLOGRAM_DURATION)
              album.revealStart = performance.now();
            wake();
          };
          image.onerror = () => {
            images.delete(image);
            if (disposed || revision !== albumRevision) return;
            album.artworkSettled = true;
            wake();
          };
          image.src = album.artworkUrl;
        }
        return surface;
      }
      function fitCaptionText(ctx2, text, maxWidth) {
        if (!text || ctx2.measureText(text).width <= maxWidth) return text;
        const ellipsis = "\u2026";
        let end = text.length;
        while (end > 0 && ctx2.measureText(text.slice(0, end) + ellipsis).width > maxWidth) end--;
        return `${end > 0 ? text.slice(0, end) : text.slice(0, 1)}${ellipsis}`;
      }
      function paintCaption() {
        if (!captionCtx || disposed) return;
        const cssWidth = Math.max(0, caption.getBoundingClientRect().width);
        const cssHeight = 48;
        if (cssWidth < 2) return;
        const scale = Math.min(devicePixelRatio || 1, 2) * 2;
        const bufferWidth = Math.round(cssWidth * scale);
        const bufferHeight = Math.round(cssHeight * scale);
        if (captionFace.width !== bufferWidth) captionFace.width = bufferWidth;
        if (captionFace.height !== bufferHeight) captionFace.height = bufferHeight;
        captionCtx.setTransform(scale, 0, 0, scale, 0, 0);
        captionCtx.clearRect(0, 0, cssWidth, cssHeight);
        captionCtx.textAlign = "center";
        captionCtx.textBaseline = "middle";
        const cx = cssWidth / 2;
        const maxWidth = Math.max(24, cssWidth - 16);
        const titleText = title.textContent ?? "";
        const artistText = artist.textContent ?? "";
        captionCtx.letterSpacing = "1px";
        captionCtx.font = `700 18px ${fonts.display}`;
        captionCtx.fillStyle = colors2.textPrimary;
        captionCtx.shadowColor = "rgba(3, 3, 5, 0.55)";
        captionCtx.shadowBlur = 2;
        captionCtx.shadowOffsetY = 1;
        captionCtx.fillText(fitCaptionText(captionCtx, titleText, maxWidth), cx, 16);
        captionCtx.letterSpacing = "0.7px";
        captionCtx.font = `600 12px ${fonts.ui}`;
        captionCtx.fillStyle = colors2.textSecondary;
        captionCtx.shadowColor = "rgba(3, 3, 5, 0.4)";
        captionCtx.fillText(fitCaptionText(captionCtx, artistText, maxWidth), cx, 34);
        captionCtx.shadowBlur = 0;
        captionCtx.shadowOffsetY = 0;
        captionCtx.letterSpacing = "0px";
      }
      function redrawPlaceholderFonts(revision) {
        if (!document.fonts?.load) return;
        void Promise.allSettled([
          document.fonts.load(`700 28px ${fonts.display}`, "\u4E2D\u6587\u4E13\u8F91\u540D"),
          document.fonts.load(`600 18px ${fonts.ui}`, "\u6682\u65E0\u5C01\u9762"),
          document.fonts.load(`700 8px ${fonts.data}`, "\u65E5\u671F \xB7 \u6B21 \xB7 \u5206\u949F"),
          document.fonts.load(`700 18px ${fonts.display}`, "\u4E2D\u6587\u4E13\u8F91\u540D"),
          document.fonts.load(`600 12px ${fonts.ui}`, "\u827A\u672F\u5BB6 \xB7 \u6B21")
        ]).then(() => {
          if (disposed || revision !== albumRevision) return;
          albums2.forEach((album) => {
            if (!album.artworkLoaded) drawArtworkPlaceholder(album, album.front);
          });
          paintCaption();
          wake();
        });
      }
      setAlbums = (items) => {
        ++albumRevision;
        images.forEach((image) => {
          image.onload = null;
          image.onerror = null;
          image.removeAttribute("src");
        });
        images.clear();
        clearTimeout(timer);
        cancelAnimationFrame2(raf);
        raf = 0;
        const pointerId = drag?.id;
        drag = null;
        if (pointerId !== void 0 && canvas.hasPointerCapture(pointerId))
          canvas.releasePointerCapture(pointerId);
        canvas.classList.remove("is-dragging");
        albums2 = items.slice(0, 5).map((album) => ({
          ...album,
          paper: colors2.bgCard,
          artworkLoaded: false,
          artworkSettled: !album.artworkUrl
        }));
        revealQueuedAt = performance.now();
        revealStart = null;
        step = TAU / Math.max(1, albums2.length);
        selected = 0;
        angle = 0;
        target = 0;
        hits = [];
        const controls = root.getElementById("stage-selectors");
        controls.replaceChildren();
        selectors = albums2.map((album, i) => {
          album.front = artwork(album);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "stage-control stage-selector";
          button.textContent = String(i + 1).padStart(2, "0");
          button.setAttribute("aria-label", "\u9009\u62E9 " + album.title + " \u2014 " + album.artist);
          button.addEventListener("click", () => select(i));
          controls.appendChild(button);
          return button;
        });
        root.getElementById("stage-prev").disabled = albums2.length < 2;
        root.getElementById("stage-next").disabled = albums2.length < 2;
        autoButton.disabled = albums2.length < 2;
        canvas.tabIndex = albums2.length ? 0 : -1;
        nextAdvance = performance.now() + 6500;
        updateInfo();
        updateAuto();
        draw();
        wake();
        redrawPlaceholderFonts(albumRevision);
      };
      function project(p) {
        const depth = p.z * cp + p.y * sp, scale = focal / (focal - depth);
        return { x: 400 + p.x * scale, y: 321 + (p.z * sp - p.y * cp) * scale, depth };
      }
      function path(points) {
        ctx.beginPath();
        points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath();
      }
      function circle(radius, y = 0, cx = 0, cz = 0) {
        return Array.from({ length: 121 }, (_, i) => {
          const t = i / 120 * TAU;
          return project({ x: cx + Math.cos(t) * radius, y, z: cz + Math.sin(t) * radius });
        });
      }
      function fill(points, color) {
        path(points);
        ctx.fillStyle = color;
        ctx.fill();
      }
      function stroke(points, color, lineWidth = 1) {
        path(points);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
      function ellipse(x, y, rx, ry, color) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
        ctx.fillStyle = color;
        ctx.fill();
      }
      function cardPoint(theta, u, v, depth = 2.4) {
        const s = Math.sin(theta), c = Math.cos(theta), lateral = (u - 0.5) * 166;
        return {
          x: s * 164 + c * lateral + s * depth,
          y: 12 + (1 - v) * 166,
          z: c * 164 - s * lateral + c * depth
        };
      }
      function triangle(texture, a, b, c, sa, sb, sc) {
        const det = sa.x * (sb.y - sc.y) + sb.x * (sc.y - sa.y) + sc.x * (sa.y - sb.y);
        if (Math.abs(det) < 1e-3) return;
        const coefficient = (key) => [
          (a[key] * (sb.y - sc.y) + b[key] * (sc.y - sa.y) + c[key] * (sa.y - sb.y)) / det,
          (a[key] * (sc.x - sb.x) + b[key] * (sa.x - sc.x) + c[key] * (sb.x - sa.x)) / det,
          (a[key] * (sb.x * sc.y - sc.x * sb.y) + b[key] * (sc.x * sa.y - sa.x * sc.y) + c[key] * (sa.x * sb.y - sb.x * sa.y)) / det
        ];
        const tx = coefficient("x"), ty = coefficient("y");
        ctx.save();
        const mx = (a.x + b.x + c.x) / 3, my = (a.y + b.y + c.y) / 3;
        path(
          [a, b, c].map((p) => {
            const d = Math.hypot(p.x - mx, p.y - my) || 1;
            return { x: p.x + (p.x - mx) * 0.8 / d, y: p.y + (p.y - my) * 0.8 / d };
          })
        );
        ctx.clip();
        ctx.transform(tx[0], ty[0], tx[1], ty[1], tx[2], ty[2]);
        ctx.drawImage(texture, 0, 0);
        ctx.restore();
      }
      function textureFace(texture, theta, back, reflection = false) {
        const holographic = texture.width !== 512;
        const point = (u, v) => {
          const mappedU = holographic ? (u * texture.width - HOLOGRAM_PADDING) / 512 : u;
          const p = cardPoint(theta, mappedU, v, back ? -2.4 : 2.4);
          if (reflection) p.y = -p.y;
          return project(p);
        };
        const quad = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
        ctx.save();
        path(quad);
        ctx.clip();
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 6; x++) {
            const u = x / 6, v = y / 4, U = (x + 1) / 6, V = (y + 1) / 4;
            const a = point(u, v), b = point(U, v), c = point(U, V), d = point(u, V);
            triangle(
              texture,
              a,
              b,
              c,
              { x: u * texture.width, y: v * 512 },
              { x: U * texture.width, y: v * 512 },
              { x: U * texture.width, y: V * 512 }
            );
            triangle(
              texture,
              a,
              c,
              d,
              { x: u * texture.width, y: v * 512 },
              { x: U * texture.width, y: V * 512 },
              { x: u * texture.width, y: V * 512 }
            );
          }
        if (!reflection && !holographic) {
          const normal = (back ? -1 : 1) * Math.cos(theta);
          ctx.fillStyle = "rgba(0,0,0," + (0.08 + 0.48 * (1 - Math.max(0, normal))) + ")";
          ctx.fillRect(0, 0, 800, 480);
          const sheen = ctx.createLinearGradient(quad[0].x, quad[0].y, quad[2].x, quad[2].y);
          sheen.addColorStop(0, "rgba(255,242,218,.14)");
          sheen.addColorStop(0.45, "rgba(255,255,255,0)");
          sheen.addColorStop(1, "rgba(0,0,0,.12)");
          ctx.fillStyle = sheen;
          ctx.fillRect(0, 0, 800, 480);
        }
        ctx.restore();
        if (!reflection && !holographic) stroke(quad, "rgba(224,217,199,.35)", 0.65);
        return quad;
      }
      function draw() {
        const now = performance.now();
        if (revealStart === null && (albums2.every((album) => album.artworkSettled) || now - revealQueuedAt >= 500))
          revealStart = now;
        revealing = false;
        for (const album of albums2) {
          const state = hologramFrame(
            revealStart === null ? 0 : now - (album.revealStart ?? revealStart)
          );
          album.projecting = !motion.matches && state.active;
          if (album.projecting) {
            revealing = true;
            if (!album.hologram) {
              album.hologram = document.createElement("canvas");
              album.hologram.width = 512 + HOLOGRAM_PADDING * 2;
              album.hologram.height = 512;
            }
            paintHologram(album.hologram, album.front, state, colors2.projection);
            album.texture = album.hologram;
          } else {
            album.texture = album.front;
            album.hologram = null;
          }
        }
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.translate(offsetX, offsetY);
        ctx.scale(renderScale, renderScale);
        const ground = ctx.createRadialGradient(400, 396, 20, 400, 396, 310);
        ground.addColorStop(0, "rgba(0,0,0,.9)");
        ground.addColorStop(0.72, "rgba(0,0,0,.35)");
        ground.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.translate(400, 396);
        ctx.scale(1, 0.24);
        ctx.translate(-400, -396);
        ctx.fillStyle = ground;
        ctx.fillRect(70, 60, 660, 670);
        ctx.restore();
        let body = ctx.createLinearGradient(105, 0, 695, 0);
        body.addColorStop(0, "#121319");
        body.addColorStop(0.17, "#383b42");
        body.addColorStop(0.4, "#1b1d23");
        body.addColorStop(0.7, "#111218");
        body.addColorStop(0.9, "#2f3038");
        body.addColorStop(1, "#0d0e13");
        if (loFi) body = "#191c2b";
        for (let y = -24; y <= 0; y += 2) fill(circle(270, y), body);
        stroke(circle(270, -22), "#09090e", 2);
        let top = ctx.createLinearGradient(180, 215, 550, 402);
        top.addColorStop(0, "#5b5d65");
        top.addColorStop(0.22, "#34363d");
        top.addColorStop(0.6, "#22242b");
        top.addColorStop(1, "#393a43");
        if (loFi) top = "#37394f";
        fill(circle(270), top);
        stroke(circle(270), "#7c7b82", 1.1);
        stroke(circle(265), "#11131a", 2);
        fill(circle(253, 0.7), "#24262e");
        stroke(circle(253, 0.7), "#56565e", 0.8);
        for (let r = loFi ? 248 : 225; r <= 247; r += 3) stroke(circle(r, 1), "rgba(161,157,168,.085)", 0.5);
        stroke(circle(259, 0.3), "#08090d", 3);
        ctx.save();
        ctx.shadowColor = colors2.accent;
        ctx.shadowBlur = 6;
        stroke(circle(259, 0.4), colors2.accent, 1.2);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.85;
        stroke(circle(259, 0.4), "rgba(255, 255, 255, 0.7)", 0.5);
        ctx.restore();
        const cards = albums2.map((album, i) => ({
          album,
          i,
          theta: angle + i * step,
          z: Math.cos(angle + i * step) * 164
        })).sort((a, b) => a.z - b.z);
        ctx.save();
        path(circle(252, 1));
        ctx.clip();
        for (const card of cards) {
          const p = project(cardPoint(card.theta, 0.5, 1, 0));
          const shade = ctx.createRadialGradient(p.x + 8, p.y + 5, 1, p.x + 8, p.y + 5, 86);
          shade.addColorStop(0, "rgba(0,0,0,.75)");
          shade.addColorStop(1, "rgba(0,0,0,0)");
          ellipse(p.x + 8, p.y + 5, 86, 19, shade);
          ctx.globalAlpha = loFi ? 0 : 0.1;
          const back = Math.cos(card.theta) < 0;
          textureFace(card.album.texture, card.theta, back, true);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        for (let i = 0; i < 60; i++) {
          const t = i / 60 * TAU + angle;
          const a = project({ x: Math.sin(t) * 242, y: 2, z: Math.cos(t) * 242 });
          const b = project({
            x: Math.sin(t) * (i % 5 ? 239 : 235),
            y: 2,
            z: Math.cos(t) * (i % 5 ? 239 : 235)
          });
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = i % 5 ? "#565660" : "#8c8793";
          ctx.lineWidth = 0.65;
          ctx.stroke();
        }
        fill(circle(17, 2), "#13141c");
        stroke(circle(17, 2), "#64646c", 1);
        fill(circle(6, 5), "#7b7b80");
        const faces = [];
        for (const card of cards) {
          const p = (u, v, d) => project(cardPoint(card.theta, u, v, d));
          const front = [p(0, 0, 2.4), p(1, 0, 2.4), p(1, 1, 2.4), p(0, 1, 2.4)];
          const back = [p(1, 0, -2.4), p(0, 0, -2.4), p(0, 1, -2.4), p(1, 1, -2.4)];
          const visible = (q) => (q[1].x - q[0].x) * (q[2].y - q[0].y) - (q[1].y - q[0].y) * (q[2].x - q[0].x) > 0;
          const trayPoint = (u, y, d) => {
            const world = cardPoint(card.theta, u, 1 + (12 - y) / 166, d);
            return { ...project(world), trayDepth: project({ ...world, y: 95 }).depth };
          };
          const trayFace = (points, color) => {
            if (visible(points))
              faces.push({
                points,
                color,
                outline: false,
                depth: points.reduce((sum, point) => sum + point.trayDepth, 0) / 4
              });
          };
          for (const side of [-1, 1]) {
            const near = side === 1;
            const d0 = near ? 3.3 : -13;
            const d1 = near ? 13 : -3.3;
            const y0 = near ? 14 : 8;
            const y1 = near ? 8 : 14;
            const a = trayPoint(0.15, y0, d0), b = trayPoint(0.85, y0, d0);
            const c = trayPoint(0.85, y1, d1), d = trayPoint(0.15, y1, d1);
            const e = trayPoint(0.15, 2, d0), f = trayPoint(0.85, 2, d0);
            const g = trayPoint(0.85, 2, d1), h = trayPoint(0.15, 2, d1);
            trayFace([a, b, c, d], "#080808");
            trayFace([d, c, g, h], "#050505");
            trayFace([b, a, e, f], "#050505");
            trayFace([a, d, h, e], "#060606");
            trayFace([c, b, f, g], "#060606");
          }
          for (const [points, isBack] of [
            [front, false],
            [back, true]
          ])
            if (visible(points))
              faces.push({
                points,
                card,
                back: isBack,
                depth: points.reduce((n, p2) => n + p2.depth, 0) / 4
              });
          const sides = [
            [p(0, 0, -2.4), p(0, 0, 2.4), p(0, 1, 2.4), p(0, 1, -2.4)],
            [p(1, 0, 2.4), p(1, 0, -2.4), p(1, 1, -2.4), p(1, 1, 2.4)],
            [p(0, 0, -2.4), p(1, 0, -2.4), p(1, 0, 2.4), p(0, 0, 2.4)]
          ];
          sides.forEach((points, i) => {
            if (!card.album.projecting && visible(points))
              faces.push({
                points,
                color: i === 2 ? "#aaa394" : card.album.paper,
                depth: points.reduce((n, p2) => n + p2.depth, 0) / 4
              });
          });
        }
        hits = [];
        faces.sort((a, b) => a.depth - b.depth).forEach((face) => {
          if (face.card) {
            textureFace(face.card.album.texture, face.card.theta, face.back);
            hits.push({ points: face.points, index: face.card.i });
          } else {
            fill(face.points, face.color);
            if (face.outline !== false) stroke(face.points, "rgba(206,196,173,.2)", 0.6);
          }
        });
        const badge = project({ x: 0, y: -11, z: 270 });
        if (loFi) {
          canvas.dataset.badgeX = String((offsetX + badge.x * renderScale) / width);
          canvas.dataset.badgeY = String((offsetY + badge.y * renderScale) / height);
          canvas.dataset.badgeAccent = colors2.accent;
        } else {
          ctx.save();
          ctx.font = `700 8px ${fonts.data}`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(173,181,195,.38)";
          ctx.fillText("A U R A L I S", badge.x, badge.y + 0.7);
          ctx.fillStyle = "rgba(0,0,0,.85)";
          ctx.fillText("A U R A L I S", badge.x, badge.y - 0.4);
          const engraving = ctx.createLinearGradient(0, badge.y - 8, 0, badge.y);
          engraving.addColorStop(0, "#020305");
          engraving.addColorStop(1, "#101218");
          ctx.fillStyle = engraving;
          ctx.fillText("A U R A L I S", badge.x, badge.y);
          ctx.fillStyle = colors2.accent;
          ctx.shadowColor = colors2.accent;
          ctx.shadowBlur = 5;
          ctx.globalAlpha = 0.85;
          ctx.fillText("A U R A L I S", badge.x, badge.y);
          ctx.restore();
        }
      }
      function updateInfo() {
        title.textContent = albums2[selected]?.title ?? "";
        artist.textContent = albums2[selected] ? `${albums2[selected].artist} \xB7 ${albums2[selected].playCount} \u6B21` : "";
        paintCaption();
        caption.classList.remove("is-appearing");
        if (albums2.length && !motion.matches) {
          void caption.offsetWidth;
          caption.classList.add("is-appearing");
        }
        position.textContent = albums2.length ? `${String(selected + 1).padStart(2, "0")} / ${String(albums2.length).padStart(2, "0")}` : "00 / 00";
        selectors.forEach((button, i) => button.setAttribute("aria-pressed", String(i === selected)));
        root.getElementById("stage-selectors").style.setProperty("--active-index", String(selected));
      }
      function updateAuto() {
        autoButton.setAttribute("aria-pressed", String(auto && albums2.length > 1));
        autoButton.textContent = "AUTO";
        autoButton.title = auto && albums2.length > 1 ? "\u5173\u95ED\u81EA\u52A8\u65CB\u8F6C" : "\u5F00\u542F\u81EA\u52A8\u65CB\u8F6C";
      }
      function schedule() {
        clearTimeout(timer);
        if (albums2.length > 1 && auto && !hovering && !focused && !drag && !document.hidden && !raf)
          timer = setTimeout(
            () => {
              target -= step;
              nextAdvance = performance.now() + 6500;
              wake();
            },
            Math.max(0, nextAdvance - performance.now())
          );
      }
      function frame(now) {
        raf = 0;
        const dt = Math.min((now - lastTime) / 1e3 || 0.016, 0.05);
        lastTime = now;
        if (!drag) {
          angle += (target - angle) * (motion.matches ? 1 : 1 - Math.exp(-8 * dt));
          if (Math.abs(target - angle) < 1e-3) angle = target;
        }
        const current = nearest(angle);
        if (current !== selected) {
          selected = current;
          updateInfo();
        }
        draw();
        if (revealing || !drag && angle !== target) raf = requestAnimationFrame2(frame);
        else schedule();
      }
      function wake() {
        if (document.hidden) return;
        clearTimeout(timer);
        if (!raf) {
          lastTime = performance.now();
          raf = requestAnimationFrame2(frame);
        }
      }
      function select(index) {
        if (!albums2.length) return;
        const current = Math.round(-target / step), delta = mod(index - mod(current, albums2.length) + Math.floor(albums2.length / 2), albums2.length) - Math.floor(albums2.length / 2);
        target = -(current + delta) * step;
        nextAdvance = performance.now() + 6500;
        wake();
      }
      function move(delta) {
        if (albums2.length < 2) return;
        target = (-Math.round(-target / step) - delta) * step;
        nextAdvance = performance.now() + 6500;
        wake();
      }
      root.getElementById("stage-prev").addEventListener("click", () => move(-1));
      root.getElementById("stage-next").addEventListener("click", () => move(1));
      autoButton.addEventListener("click", () => {
        auto = !auto;
        updateAuto();
        nextAdvance = performance.now() + 6500;
        schedule();
      });
      canvas.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowRight" ? 1 : -1);
        }
        if (event.key === "Home") {
          event.preventDefault();
          select(0);
        }
        if (event.key === " ") {
          event.preventDefault();
          autoButton.click();
        }
      });
      const stage = root.querySelector(".stage-container");
      stage.addEventListener("pointerenter", () => {
        hovering = true;
        clearTimeout(timer);
      });
      stage.addEventListener("pointerleave", () => {
        hovering = false;
        nextAdvance = performance.now() + 6500;
        schedule();
      });
      stage.addEventListener("focusin", () => {
        focused = true;
        clearTimeout(timer);
      });
      stage.addEventListener("focusout", (event) => {
        focused = stage.contains(event.relatedTarget);
        nextAdvance = performance.now() + 6500;
        schedule();
      });
      canvas.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || drag || albums2.length < 2) return;
        clearTimeout(timer);
        target = angle;
        canvas.focus({ preventScroll: true });
        drag = {
          id: event.pointerId,
          x: event.clientX,
          lastX: event.clientX,
          time: performance.now(),
          velocity: 0,
          moved: 0
        };
        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add("is-dragging");
      });
      canvas.addEventListener("pointermove", (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        const now = performance.now(), dx = event.clientX - drag.lastX, dt = Math.max(8, now - drag.time);
        const da = dx / (Math.max(0.35, renderScale) * 210);
        angle += da;
        target = angle;
        drag.velocity = da / dt;
        drag.lastX = event.clientX;
        drag.time = now;
        drag.moved = Math.max(drag.moved, Math.abs(event.clientX - drag.x));
        wake();
      });
      function finishDrag(event, cancelled = false) {
        if (!drag || drag.id !== event.pointerId) return;
        const state = drag;
        drag = null;
        canvas.classList.remove("is-dragging");
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (!cancelled && state.moved < 6) {
          const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left - offsetX) / renderScale, y = (event.clientY - rect.top - offsetY) / renderScale;
          const contains = (points) => {
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
              const a = points[i], b = points[j];
              if (a.y > y !== b.y > y && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)
                inside = !inside;
            }
            return inside;
          };
          const hit = [...hits].reverse().find((hit2) => contains(hit2.points));
          if (hit) {
            select(hit.index);
            return;
          }
        }
        const velocity = performance.now() - state.time > 100 ? 0 : state.velocity;
        const inertia = cancelled || motion.matches ? 0 : Math.max(-step * 0.8, Math.min(step * 0.8, velocity * 140));
        target = Math.round((angle + inertia) / step) * step;
        nextAdvance = performance.now() + 6500;
        wake();
      }
      canvas.addEventListener("pointerup", (event) => finishDrag(event));
      canvas.addEventListener("pointercancel", (event) => finishDrag(event, true));
      canvas.addEventListener("lostpointercapture", (event) => finishDrag(event, true));
      function resize() {
        const rect = canvas.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        pixelRatio = loFi ? 320 / width : Math.min(devicePixelRatio || 1, 2);
        const bufferWidth = Math.round(width * pixelRatio), bufferHeight = Math.round(height * pixelRatio);
        if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
        if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
        renderScale = Math.min(width / 800, height / 480);
        offsetX = (width - 800 * renderScale) / 2;
        offsetY = (height - 480 * renderScale) / 2 - 28 * renderScale;
        paintCaption();
        draw();
        wake();
      }
      observe(ResizeObserver, resize, canvas);
      observe(ResizeObserver, paintCaption, caption);
      listen(window, "resize", resize);
      listen(motion, "change", () => {
        if (motion.matches) {
          auto = false;
          updateAuto();
          clearTimeout(timer);
        }
        wake();
      });
      listen(document, "visibilitychange", () => {
        clearTimeout(timer);
        if (document.hidden) {
          cancelAnimationFrame2(raf);
          raf = 0;
        } else {
          nextAdvance = performance.now() + 6500;
          resize();
        }
      });
      updateInfo();
      updateAuto();
      resize();
    })();
    return {
      setAlbums: (items) => setAlbums(items),
      dispose: () => {
        disposed = true;
        frames.forEach((id) => window.cancelAnimationFrame(id));
        timers.forEach((id) => window.clearTimeout(id));
        observers.forEach((observer) => observer.disconnect());
        subscriptions.forEach((unsubscribe) => unsubscribe());
        images.forEach((image) => {
          image.onload = null;
          image.onerror = null;
          image.removeAttribute("src");
        });
        images.clear();
      }
    };
  }

  // demo/archive/stage-lofi.js
  var colors = ["#d76e98", "#7b82c9", "#cd8757"];
  var albums = colors.map((color, i) => {
    const art = document.createElement("canvas");
    art.width = art.height = 128;
    const c = art.getContext("2d");
    c.fillStyle = color;
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = "#252436";
    c.fillRect(12, 12, 104, 104);
    c.fillStyle = color;
    c.fillRect(22, 22, 84, 60);
    c.fillStyle = "#d5cee0";
    c.fillRect(22, 94, 50, 3);
    c.fillRect(22, 103, 30, 2);
    return { title: `SIGNAL 0${i + 1}`, artist: "COLOR STUDY", playCount: 12 + i * 7, artworkUrl: art.toDataURL() };
  });
  var stages = [];
  var brandGlyphs = {
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"]
  };
  function paintBrand(ctx, source) {
    const cx = Number(source.dataset.badgeX) * 320, cy = Number(source.dataset.badgeY) * 192;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    const x = Math.round(cx - 20), y = Math.round(cy - 3);
    const letters = (dx, dy, color, alpha = 1) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      [..."AURALIS"].forEach((ch, i) => brandGlyphs[ch].forEach((row, r) => [...row].forEach((bit, c) => {
        if (bit === "1") ctx.fillRect(x + i * 6 + c + dx, y + r + dy, 1, 1);
      })));
    };
    letters(0, -1, "#04050b");
    letters(0, 1, "#a39ab6", 0.35);
    ctx.shadowColor = source.dataset.badgeAccent;
    ctx.shadowBlur = 1;
    letters(0, 0, source.dataset.badgeAccent, 0.22);
    ctx.shadowBlur = 0;
    letters(0, 0, source.dataset.badgeAccent);
    ctx.globalAlpha = 1;
  }
  for (const id of ["reference", "lofi"]) {
    const host = document.getElementById(id);
    const low = id === "lofi";
    host.style.setProperty("--archive-color-accent-secondary", "#f46bab");
    host.innerHTML = `<div class="panel-head">${low ? "02 / LO-FI" : "01 / ORIGINAL"}<span>${low ? "LIMITED COLOR \xB7 DITHER" : "HIGH FIDELITY"}</span></div><div class="stage-container"><canvas id="album-stage" class="stage-source" aria-label="${low ? "\u4F4E\u4FDD\u771F" : "\u539F\u7248"}\u4E13\u8F91\u821E\u53F0"></canvas>${low ? '<canvas class="stage-output" width="320" height="192" aria-hidden="true"></canvas><div class="scan"></div>' : ""}</div><div id="stage-caption" class="caption"><span id="stage-title" class="sr"></span><span id="stage-artist" class="sr"></span><canvas id="stage-caption-face" aria-hidden="true"></canvas></div><div class="controls"><button id="stage-prev" aria-label="\u4E0A\u4E00\u5F20">\u2190</button><div id="stage-selectors" class="selectors"></div><button id="stage-next" aria-label="\u4E0B\u4E00\u5F20">\u2192</button><button id="stage-auto"></button><span id="stage-position" class="position"></span></div>`;
    const root = { host, getElementById: (id2) => host.querySelector(`[id="${id2}"]`), querySelector: (s) => host.querySelector(s) };
    const stage = mountArchiveStage(root);
    stages.push(stage);
    stage.setAlbums(albums);
    root.getElementById("stage-auto").click();
    if (low) {
      const source = root.getElementById("album-stage"), out = host.querySelector(".stage-output"), ctx = out.getContext("2d", { willReadFrequently: true });
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const shades = bayer.map((v) => Uint8ClampedArray.from({ length: 256 }, (_, channel) => Math.round((channel + (v / 16 - 0.5) * 24) / 32) * 32));
      const alpha = Uint8ClampedArray.from({ length: 256 }, (_, value) => Math.round(value / 64) * 64);
      const sourceCtx = source.getContext("2d");
      let dirty = true;
      const clear = sourceCtx.clearRect.bind(sourceCtx);
      sourceCtx.clearRect = (...args) => {
        dirty = true;
        return clear(...args);
      };
      let frame = 0;
      const paint = () => {
        if (!dirty || document.hidden) return;
        dirty = false;
        ctx.clearRect(0, 0, 320, 192);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(source, 0, 0, 320, 192);
        const image = ctx.getImageData(0, 0, 320, 192), d = image.data;
        for (let p = 0; p < 320 * 192; p++) {
          const i = p * 4;
          if (d[i + 3] < 12) {
            d[i + 3] = 0;
            continue;
          }
          const x = p % 320, y = p / 320 | 0, lut = shades[y % 4 * 4 + x % 4];
          d[i] = lut[d[i]];
          d[i + 1] = lut[d[i + 1]];
          d[i + 2] = lut[d[i + 2]];
          d[i + 3] = alpha[d[i + 3]];
        }
        ctx.putImageData(image, 0, 0);
        paintBrand(ctx, source);
      };
      const schedule = () => {
        if (!frame && !document.hidden) frame = requestAnimationFrame(() => {
          frame = 0;
          paint();
        });
      };
      sourceCtx.clearRect = (...args) => {
        dirty = true;
        schedule();
        return clear(...args);
      };
      const start = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        dirty = true;
        schedule();
      };
      document.addEventListener("visibilitychange", start);
      start();
      addEventListener("pagehide", () => {
        cancelAnimationFrame(frame);
        document.removeEventListener("visibilitychange", start);
        sourceCtx.clearRect = clear;
      }, { once: true });
    }
  }
  document.getElementById("replay").addEventListener("click", () => stages.forEach((s) => s.setAlbums(albums)));
  addEventListener("pagehide", () => stages.forEach((s) => s.dispose()), { once: true });
})();
