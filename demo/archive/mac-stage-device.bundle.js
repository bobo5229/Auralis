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

  // demo/archive/mac-stage-device-renderer.js
  function mountArchiveStage(root2) {
    const frames = /* @__PURE__ */ new Set();
    const timers = /* @__PURE__ */ new Set();
    const observers = [];
    const subscriptions = [];
    let disposed2 = false;
    function requestAnimationFrame2(callback) {
      if (disposed2) return 0;
      const id = window.requestAnimationFrame((time) => {
        frames.delete(id);
        if (!disposed2) callback(time);
      });
      frames.add(id);
      return id;
    }
    function cancelAnimationFrame2(id) {
      frames.delete(id);
      window.cancelAnimationFrame(id);
    }
    function setTimeout2(callback, delay) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!disposed2) callback();
      }, delay);
      timers.add(id);
      return id;
    }
    function clearTimeout2(id) {
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
    let inspect = () => null;
    let choose = () => {
    };
    const images = /* @__PURE__ */ new Set();
    (() => {
      const canvas2 = root2.getElementById("album-stage");
      const ctx = canvas2.getContext("2d");
      const hostStyle = getComputedStyle(root2.host);
      const token = (name, fallback) => hostStyle.getPropertyValue(name).trim() || fallback;
      const loFi = root2.host.dataset.fidelity === "lofi";
      const colors = {
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
      const motion2 = matchMedia("(prefers-reduced-motion: reduce)");
      const title = root2.getElementById("stage-title"), artist = root2.getElementById("stage-artist");
      const caption = root2.getElementById("stage-caption");
      const captionFace = root2.getElementById("stage-caption-face");
      const captionCtx = captionFace?.getContext?.("2d");
      const position = root2.getElementById("stage-position"), autoButton = root2.getElementById("stage-auto");
      let angle = 0, target = 0, selected2 = 0, auto = !motion2.matches;
      let drag = null, hovering = false, focused = false, raf = 0, lastTime = 0;
      let nextAdvance = performance.now() + 6500, timer = 0, renderScale = 1, offsetX = 0, offsetY = 0;
      let pixelRatio = 1, width = 800, height = 480, hits = [];
      const mod = (n, d) => (n % d + d) % d;
      const nearest = (a) => albums2.length ? mod(Math.round(-a / step), albums2.length) : 0;
      let selectors = [];
      function drawArtworkPlaceholder(album, surface) {
        const c = surface.getContext("2d");
        c.clearRect(0, 0, 512, 512);
        c.fillStyle = colors.bgCard;
        c.fillRect(0, 0, 512, 512);
        c.strokeStyle = colors.borderControl;
        c.lineWidth = 2;
        c.strokeRect(30, 30, 452, 452);
        c.fillStyle = colors.textPrimary;
        c.font = `700 28px ${fonts.display}`;
        c.fillText(album.title, 48, 240, 416);
        c.fillStyle = colors.textSecondary;
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
            if (disposed2 || revision !== albumRevision) return;
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
            if (disposed2 || revision !== albumRevision) return;
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
        if (!captionCtx || disposed2) return;
        const cssWidth = Math.max(0, caption.getBoundingClientRect().width);
        const cssHeight = 48;
        if (cssWidth < 2) return;
        const scale = 0.75;
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
        captionCtx.fillStyle = colors.textPrimary;
        captionCtx.shadowColor = "rgba(3, 3, 5, 0.55)";
        captionCtx.shadowBlur = 2;
        captionCtx.shadowOffsetY = 1;
        captionCtx.fillText(fitCaptionText(captionCtx, titleText, maxWidth), cx, 16);
        captionCtx.letterSpacing = "0.7px";
        captionCtx.font = `600 12px ${fonts.ui}`;
        captionCtx.fillStyle = colors.textSecondary;
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
          if (disposed2 || revision !== albumRevision) return;
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
        clearTimeout2(timer);
        cancelAnimationFrame2(raf);
        raf = 0;
        const pointerId = drag?.id;
        drag = null;
        if (pointerId !== void 0 && canvas2.hasPointerCapture(pointerId))
          canvas2.releasePointerCapture(pointerId);
        canvas2.classList.remove("is-dragging");
        albums2 = items.slice(0, 5).map((album) => ({
          ...album,
          paper: colors.bgCard,
          artworkLoaded: false,
          artworkSettled: !album.artworkUrl
        }));
        revealQueuedAt = performance.now();
        revealStart = null;
        step = TAU / Math.max(1, albums2.length);
        selected2 = 0;
        angle = 0;
        target = 0;
        hits = [];
        const controls = root2.getElementById("stage-selectors");
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
        root2.getElementById("stage-prev").disabled = albums2.length < 2;
        root2.getElementById("stage-next").disabled = albums2.length < 2;
        autoButton.disabled = albums2.length < 2;
        canvas2.tabIndex = albums2.length ? 0 : -1;
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
          sheen.addColorStop(0, "rgba(255,242,218,.025)");
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
          album.projecting = !motion2.matches && state.active;
          if (album.projecting) {
            revealing = true;
            if (!album.hologram) {
              album.hologram = document.createElement("canvas");
              album.hologram.width = 512 + HOLOGRAM_PADDING * 2;
              album.hologram.height = 512;
            }
            paintHologram(album.hologram, album.front, state, colors.projection);
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
        body.addColorStop(0, "#111218");
        body.addColorStop(0.17, "#26282e");
        body.addColorStop(0.4, "#1e2026");
        body.addColorStop(0.7, "#111218");
        body.addColorStop(0.9, "#24262c");
        body.addColorStop(1, "#0d0e13");
        if (loFi) body = "#191c2b";
        for (let y = -24; y <= 0; y += 2) fill(circle(270, y), body);
        stroke(circle(270, -22), "#09090e", 2);
        let top = ctx.createLinearGradient(180, 215, 550, 402);
        top.addColorStop(0, "#32343c");
        top.addColorStop(0.22, "#292b33");
        top.addColorStop(0.6, "#22242b");
        top.addColorStop(1, "#2b2d35");
        if (loFi) top = "#37394f";
        fill(circle(270), top);
        stroke(circle(270), "#45464f", 0.8);
        stroke(circle(265), "#11131a", 2);
        fill(circle(253, 0.7), "#24262e");
        stroke(circle(253, 0.7), "#34363e", 0.65);
        stroke(circle(259, 0.3), "#08090d", 3);
        ctx.save();
        ctx.shadowColor = colors.accent;
        ctx.shadowBlur = 3;
        ctx.globalAlpha = 0.65;
        stroke(circle(259, 0.4), colors.accent, 1.2);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.85;
        stroke(circle(259, 0.4), "rgba(255, 224, 242, 0.16)", 0.5);
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
        }
        ctx.restore();
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
        root2.onGeometry?.({ selected: selected2, settled: !revealing && Math.abs(angle - target) < 0.01, points: [...hits].reverse().find((h) => h.index === selected2)?.points.map((p) => ({ x: offsetX + p.x * renderScale, y: offsetY + p.y * renderScale })) ?? [] });
        const badge = project({ x: 0, y: -11, z: 270 });
        if (loFi) {
          canvas2.dataset.badgeX = String((offsetX + badge.x * renderScale) / width);
          canvas2.dataset.badgeY = String((offsetY + badge.y * renderScale) / height);
          canvas2.dataset.badgeAccent = colors.accent;
        } else {
          ctx.save();
          ctx.font = `700 12px ${fonts.data}`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(173,181,195,.38)";
          ctx.fillText("AURALIS", badge.x, badge.y + 0.7);
          ctx.fillStyle = "rgba(0,0,0,.85)";
          ctx.fillText("AURALIS", badge.x, badge.y - 0.4);
          const engraving = ctx.createLinearGradient(0, badge.y - 8, 0, badge.y);
          engraving.addColorStop(0, "#020305");
          engraving.addColorStop(1, "#101218");
          ctx.fillStyle = engraving;
          ctx.fillText("AURALIS", badge.x, badge.y);
          ctx.fillStyle = colors.accent;
          ctx.shadowColor = colors.accent;
          ctx.shadowBlur = 2;
          ctx.globalAlpha = 0.65;
          ctx.fillText("AURALIS", badge.x, badge.y);
          ctx.restore();
        }
      }
      function updateInfo() {
        root2.onSelection?.(selected2);
        title.textContent = albums2[selected2]?.title ?? "";
        artist.textContent = albums2[selected2] ? `${albums2[selected2].artist} \xB7 ${albums2[selected2].playCount} \u6B21` : "";
        paintCaption();
        caption.classList.remove("is-appearing");
        if (albums2.length && !motion2.matches) {
          void caption.offsetWidth;
          caption.classList.add("is-appearing");
        }
        position.textContent = albums2.length ? `${String(selected2 + 1).padStart(2, "0")} / ${String(albums2.length).padStart(2, "0")}` : "00 / 00";
        selectors.forEach((button, i) => button.setAttribute("aria-pressed", String(i === selected2)));
        root2.getElementById("stage-selectors").style.setProperty("--active-index", String(selected2));
      }
      function updateAuto() {
        autoButton.setAttribute("aria-pressed", String(auto && albums2.length > 1));
        autoButton.textContent = "AUTO";
        autoButton.title = auto && albums2.length > 1 ? "\u5173\u95ED\u81EA\u52A8\u65CB\u8F6C" : "\u5F00\u542F\u81EA\u52A8\u65CB\u8F6C";
      }
      function schedule() {
        clearTimeout2(timer);
        if (albums2.length > 1 && auto && !hovering && !focused && !drag && !document.hidden && !raf)
          timer = setTimeout2(
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
          angle += (target - angle) * (motion2.matches ? 1 : 1 - Math.exp(-8 * dt));
          if (Math.abs(target - angle) < 1e-3) angle = target;
        }
        const current2 = nearest(angle);
        if (current2 !== selected2) {
          selected2 = current2;
          updateInfo();
        }
        draw();
        if (revealing || !drag && angle !== target) raf = requestAnimationFrame2(frame);
        else schedule();
      }
      function wake() {
        if (document.hidden) return;
        clearTimeout2(timer);
        if (!raf) {
          lastTime = performance.now();
          raf = requestAnimationFrame2(frame);
        }
      }
      choose = (index) => select(index);
      inspect = () => {
        const face = [...hits].reverse().find((h) => h.index === selected2);
        return { selected: selected2, settled: !revealing && Math.abs(angle - target) < 0.01, points: face?.points.map((p) => ({ x: offsetX + p.x * renderScale, y: offsetY + p.y * renderScale })) ?? [] };
      };
      function select(index) {
        if (!albums2.length) return;
        const current2 = Math.round(-target / step), delta = mod(index - mod(current2, albums2.length) + Math.floor(albums2.length / 2), albums2.length) - Math.floor(albums2.length / 2);
        target = -(current2 + delta) * step;
        nextAdvance = performance.now() + 6500;
        wake();
      }
      function move(delta) {
        if (albums2.length < 2) return;
        target = (-Math.round(-target / step) - delta) * step;
        nextAdvance = performance.now() + 6500;
        wake();
      }
      root2.getElementById("stage-prev").addEventListener("click", () => move(-1));
      root2.getElementById("stage-next").addEventListener("click", () => move(1));
      autoButton.addEventListener("click", () => {
        auto = !auto;
        updateAuto();
        nextAdvance = performance.now() + 6500;
        schedule();
      });
      canvas2.addEventListener("keydown", (event) => {
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
      const stage2 = root2.querySelector(".stage-container");
      stage2.addEventListener("pointerenter", () => {
        hovering = true;
        clearTimeout2(timer);
      });
      stage2.addEventListener("pointerleave", () => {
        hovering = false;
        nextAdvance = performance.now() + 6500;
        schedule();
      });
      stage2.addEventListener("focusin", () => {
        focused = true;
        clearTimeout2(timer);
      });
      stage2.addEventListener("focusout", (event) => {
        focused = stage2.contains(event.relatedTarget);
        nextAdvance = performance.now() + 6500;
        schedule();
      });
      canvas2.addEventListener("pointerdown", (event) => {
        if (root2.coverDragging || event.button !== 0 || drag || albums2.length < 2) return;
        clearTimeout2(timer);
        target = angle;
        canvas2.focus({ preventScroll: true });
        drag = {
          id: event.pointerId,
          x: event.clientX,
          lastX: event.clientX,
          time: performance.now(),
          velocity: 0,
          moved: 0
        };
        canvas2.setPointerCapture(event.pointerId);
        canvas2.classList.add("is-dragging");
      });
      canvas2.addEventListener("pointermove", (event) => {
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
        canvas2.classList.remove("is-dragging");
        if (canvas2.hasPointerCapture(event.pointerId)) canvas2.releasePointerCapture(event.pointerId);
        if (!cancelled && state.moved < 6) {
          const rect = canvas2.getBoundingClientRect(), x = (event.clientX - rect.left - offsetX) / renderScale, y = (event.clientY - rect.top - offsetY) / renderScale;
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
        const inertia = cancelled || motion2.matches ? 0 : Math.max(-step * 0.8, Math.min(step * 0.8, velocity * 140));
        target = Math.round((angle + inertia) / step) * step;
        nextAdvance = performance.now() + 6500;
        wake();
      }
      canvas2.addEventListener("pointerup", (event) => finishDrag(event));
      canvas2.addEventListener("pointercancel", (event) => finishDrag(event, true));
      canvas2.addEventListener("lostpointercapture", (event) => finishDrag(event, true));
      function resize() {
        const rect = canvas2.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
        const bufferWidth = Math.round(width * pixelRatio), bufferHeight = Math.round(height * pixelRatio);
        if (canvas2.width !== bufferWidth) canvas2.width = bufferWidth;
        if (canvas2.height !== bufferHeight) canvas2.height = bufferHeight;
        renderScale = Math.min(width / 800, height / 480);
        offsetX = (width - 800 * renderScale) / 2;
        offsetY = (height - 480 * renderScale) / 2 - 28 * renderScale;
        paintCaption();
        draw();
        wake();
      }
      observe(ResizeObserver, resize, canvas2);
      observe(ResizeObserver, paintCaption, caption);
      listen(window, "resize", resize);
      listen(motion2, "change", () => {
        if (motion2.matches) {
          auto = false;
          updateAuto();
          clearTimeout2(timer);
        }
        wake();
      });
      listen(document, "visibilitychange", () => {
        clearTimeout2(timer);
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
      select: (index) => choose(index),
      inspect: () => inspect(),
      dispose: () => {
        disposed2 = true;
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

  // demo/archive/mac-stage-tray.js
  function mountLoadTray(slot2, motion2) {
    slot2.insertAdjacentHTML("beforeend", '<div class="load-tray" aria-hidden="true"><div class="tray-top"><div class="tray-media"><canvas width="96" height="96"></canvas><i class="tray-point p0"></i><i class="tray-point p1"></i><i class="tray-point p2"></i><i class="tray-point p3"></i></div></div><div class="tray-front"></div><div class="tray-side left"></div><div class="tray-side right"></div></div>');
    const surface = slot2.querySelector(".tray-top"), media = slot2.querySelector(".tray-media"), cover = media.querySelector("canvas");
    let busy = false, revision = 0;
    function size() {
      slot2.style.setProperty("--tray-width", `${slot2.offsetWidth}px`);
    }
    size();
    const observer = new ResizeObserver(size);
    observer.observe(slot2);
    function open(value) {
      slot2.classList.toggle("tray-open", value);
      slot2.dataset.tray = value ? "open" : "closed";
    }
    open(false);
    function contains(x, y, r, padX, padY = padX) {
      return x >= r.left - padX && x <= r.right + padX && y >= r.top - padY && y <= r.bottom + padY;
    }
    function hit(x, y) {
      return contains(x, y, slot2.getBoundingClientRect(), 14, 20) || slot2.classList.contains("tray-open") && contains(x, y, surface.getBoundingClientRect(), 10);
    }
    function approach(x, y) {
      if (busy) return;
      const near = contains(x, y, slot2.getBoundingClientRect(), 50, 55) || slot2.classList.contains("tray-open") && contains(x, y, surface.getBoundingClientRect(), 32);
      open(near);
      slot2.classList.toggle("is-ready", hit(x, y));
    }
    function reset() {
      if (busy) return;
      open(false);
      slot2.classList.remove("is-ready", "tray-loaded");
    }
    function delay(ms, signal) {
      if (motion2.matches || signal.aborted) return Promise.resolve();
      return new Promise((resolve) => {
        let timer;
        const done = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          resolve();
        };
        timer = setTimeout(done, ms);
        signal.addEventListener("abort", done, { once: true });
      });
    }
    async function load(texture, ghost2, { x, y, signal }) {
      busy = true;
      const run = ++revision;
      let animation = null;
      const abort = () => {
        animation?.cancel();
        if (run !== revision) return;
        ghost2.hidden = true;
        open(false);
        slot2.classList.remove("is-ready", "tray-loaded");
        busy = false;
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        if (signal.aborted) return false;
        open(true);
        slot2.classList.add("is-ready");
        await delay(280, signal);
        if (signal.aborted) return false;
        cover.getContext("2d").drawImage(texture, 0, 0);
        surface.style.setProperty("--tray-cover", `url("${cover.toDataURL()}")`);
        const points = [...media.querySelectorAll(".tray-point")].map((p) => {
          const r = p.getBoundingClientRect();
          return { x: r.left, y: r.top };
        }), [p0, p1, , p3] = points;
        const width = ghost2.offsetWidth, height = ghost2.offsetHeight;
        const landing = `matrix(${(p1.x - p0.x) / width},${(p1.y - p0.y) / width},${(p3.x - p0.x) / height},${(p3.y - p0.y) / height},0,0)`;
        if (!motion2.matches) {
          animation = ghost2.animate([{ left: `${x}px`, top: `${y}px`, transform: "translate(-50%,-50%)", transformOrigin: "0 0", opacity: 1 }, { left: `${p0.x}px`, top: `${p0.y}px`, transform: landing, transformOrigin: "0 0", opacity: 1 }], { duration: 340, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
          await animation.finished.catch(() => {
          });
          if (signal.aborted) return false;
        }
        slot2.classList.add("tray-loaded");
        ghost2.hidden = true;
        animation?.cancel();
        animation = null;
        await delay(110, signal);
        if (signal.aborted) return false;
        open(false);
        slot2.classList.remove("is-ready");
        await delay(280, signal);
        return !signal.aborted;
      } finally {
        signal.removeEventListener("abort", abort);
        animation?.cancel();
        if (run === revision) {
          ghost2.hidden = true;
          open(false);
          slot2.classList.remove("is-ready", "tray-loaded");
          busy = false;
        }
      }
    }
    return { hit, approach, reset, load, dispose: () => {
      observer.disconnect();
      reset();
    } };
  }

  // demo/archive/mac-stage-classic.js
  function mountClassicMac() {
    const crt = document.getElementById("crt");
    const crtSource = document.createElement("canvas");
    crtSource.width = 512;
    crtSource.height = 342;
    const VIEW_IN_MS = 1100;
    const VIEW_OUT_MS = 700;
    const DENOISE_MS = 1e3;
    const STRONG_BLUR_PX = 3.5;
    const WEAK_BLUR_PX = 0.9;
    const NOISE_COLS = 64;
    const NOISE_ROWS = 43;
    const NOISE_START_OPACITY = 0.48;
    const NOISE_FRAME_COUNT = 7;
    const NOISE_HZ = 13;
    const PAPER = "#f3eee0";
    const SCREEN_GLYPHS = {
      "3": "000000003C4242021C020242423C0000",
      "4": "00000000040C142444447E0404040000",
      "5": "000000007E4040407C020202423C0000",
      "6": "000000001C2040407C424242423C0000",
      "7": "000000007E0202040404080808080000",
      "8": "000000003C4242423C424242423C0000",
      "9": "000000003C4242423E02020204380000",
      "0": "00000000182442464A52624224180000",
      "1": "000000000818280808080808083E0000",
      "2": "000000003C4242020C102040407E0000",
      "\u5355": "1010082004403FF8210821083FF8210821083FF801000100FFFE010001000100",
      "\u66F2": "04400440044004407FFC44444444444444447FFC44444444444444447FFC4004",
      "\u4E13": "0100010001003FF802000200FFFE040008000FF0001000200640018000400020",
      "\u8F91": "200021F82108FD0841F8500097FEFD0811F811081DF8F108513E17C810081008",
      "\u5E74": "100010001FFC2080208040801FF8108010801080FFFE00800080008000800080",
      "\u5EA6": "010000803FFE222022203FFC2220222023E020002FF02410422041C08630380E",
      "\u603B": "10100820044000001FF01010101010101FF01010010008844892481287F00000",
      "\u7ED3": "10201020202027FE4420F82011FC20004000FDFC410401041D04E10441FC0104",
      "F": "000000007E4040407C40404040400000",
      "i": "000000080800180808080808083E0000",
      "l": "000000180808080808080808083E0000",
      "e": "0000000000003C42427E4040423C0000",
      " ": "00000000000000000000000000000000",
      "E": "000000007E4040407C404040407E0000",
      "d": "0000000202023A4642424242463A0000",
      "t": "000000001010107C10101010100C0000",
      "V": "00000000414141222222141408080000",
      "w": "00000000000041494949494949360000",
      "S": "000000003C424240300C0242423C0000",
      "p": "0000000000005C6242424242625C4040",
      "c": "0000000000003C4240404040423C0000",
      "a": "0000000000003C42023E4242463A0000",
      ":": "00000000000018180000001818000000"
    };
    function bitmapWidth(value, gap = 0) {
      return [...value].reduce((sum, ch) => sum + SCREEN_GLYPHS[ch].length / 4 + gap, 0) - gap;
    }
    function drawBitmap(ctx, value, x, y, color, gap = 0) {
      ctx.fillStyle = color;
      let cursor = Math.round(x);
      for (const ch of value) {
        const hex = SCREEN_GLYPHS[ch];
        const width = hex.length / 4;
        const digits = width / 4;
        for (let row = 0; row < 16; row++) {
          const bits = parseInt(hex.slice(row * digits, (row + 1) * digits), 16);
          for (let col = 0; col < width; col++) {
            if (bits & 1 << width - col - 1) ctx.fillRect(cursor + col, y + row, 1, 1);
          }
        }
        cursor += width + gap;
      }
    }
    const ENTRIES = [
      { id: "track", label: "\u5355\u66F2", center: 108, icon: "note" },
      { id: "album", label: "\u4E13\u8F91", center: 256, icon: "record" },
      { id: "year", label: "\u5E74\u5EA6\u603B\u7ED3", center: 404, icon: "report" }
    ];
    const ICON_TOP = 140;
    const LABEL_TOP = 184;
    const BUTTON_TOP = 130;
    const BUTTON_HEIGHT = 80;
    function fillPixel(ctx, color, x, y, width, height) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, width, height);
    }
    const ENTRY_ICONS = {
      "note": [
        "00000000",
        "00000000",
        "00000000",
        "00000000",
        "000000c0",
        "00000740",
        "000078c0",
        "00038740",
        "000c7840",
        "000b8040",
        "000c0040",
        "00080040",
        "00080040",
        "00080040",
        "00080040",
        "00080040",
        "00080040",
        "00080040",
        "00080040",
        "00080040",
        "00080fc0",
        "00083f80",
        "00083f80",
        "00080f80",
        "01f80000",
        "07f00000",
        "07f00000",
        "01f00000",
        "00000000",
        "00000000",
        "00000000",
        "00000000"
      ],
      "record": [
        "00000000",
        "00000000",
        "00000000",
        "00000000",
        "00000000",
        "1ffff000",
        "10001000",
        "10001000",
        "12001f80",
        "12001060",
        "12001010",
        "127f1008",
        "12001008",
        "12001004",
        "127c1004",
        "12001e04",
        "12001a04",
        "12001e04",
        "12001004",
        "12001008",
        "12001008",
        "12001010",
        "127f1060",
        "12001f80",
        "10001000",
        "10001000",
        "10001000",
        "1ffff000",
        "00000000",
        "00000000",
        "00000000",
        "00000000"
      ],
      "report": [
        "00000000",
        "00000000",
        "00000000",
        "01fff800",
        "01000c00",
        "01000a00",
        "01000900",
        "01000880",
        "01000fc0",
        "01000040",
        "01000040",
        "011fc040",
        "01000040",
        "01000040",
        "011f0040",
        "01000040",
        "01000640",
        "01000640",
        "0100c640",
        "0100c640",
        "0100c640",
        "0118c640",
        "0118c640",
        "0118c640",
        "0118c640",
        "013fff40",
        "01000040",
        "01000040",
        "01ffffc0",
        "00000000",
        "00000000",
        "00000000"
      ]
    };
    function drawEntryIcon(ctx, icon, x, y, selected2) {
      ctx.fillStyle = selected2 ? "#315b91" : "#171612";
      ENTRY_ICONS[icon].forEach((hex, row) => {
        const bits = parseInt(hex, 16);
        for (let col = 0; col < 32; col++) {
          if (bits >>> 31 - col & 1) ctx.fillRect(x + col, y + row, 1, 1);
        }
      });
    }
    function drawEntryLabel(ctx, entry, selected2) {
      const width = bitmapWidth(entry.label, 2);
      const left = Math.round(entry.center - width / 2);
      if (selected2) fillPixel(ctx, "#315b91", left - 4, LABEL_TOP - 3, width + 8, 22);
      drawBitmap(ctx, entry.label, left, LABEL_TOP, selected2 ? "#fffdf5" : "#171612", 2);
    }
    function drawCrt() {
      const ctx = crtSource.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#f3eee0";
      ctx.fillRect(0, 0, 512, 342);
      const dither = ctx.createImageData(512, 322);
      for (let i = 0; i < dither.data.length; i += 4) {
        const p = i / 4;
        const x = p % 512;
        const y = p / 512 | 0;
        const on = (x + y) % 2 === 0;
        dither.data[i] = on ? 216 : 243;
        dither.data[i + 1] = on ? 210 : 238;
        dither.data[i + 2] = on ? 194 : 224;
        dither.data[i + 3] = 255;
      }
      ctx.putImageData(dither, 0, 20);
      ctx.fillStyle = "#f3eee0";
      ctx.fillRect(0, 0, 512, 20);
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 19, 512, 1);
      drawBitmap(ctx, "File   Edit   View   Special", 22, 1, "#111");
      ctx.fillRect(6, 5, 9, 9);
      ctx.fillStyle = "#f3eee0";
      ctx.fillRect(8, 7, 5, 5);
      ctx.fillStyle = "#111";
      const now = /* @__PURE__ */ new Date();
      const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      drawBitmap(ctx, clock, 466, 1, "#111");
      for (const entry of ENTRIES) {
        const selected2 = selectedEntry === entry.id;
        drawEntryIcon(ctx, entry.icon, entry.center - 16, ICON_TOP, selected2);
        drawEntryLabel(ctx, entry, selected2);
      }
    }
    function syncCrt() {
      drawCrt();
      const context = crt.getContext("2d");
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, crt.width, crt.height);
      context.drawImage(crtSource, 0, 0, crt.width, crt.height);
    }
    const rig = document.getElementById("rig");
    const studio = document.getElementById("studio");
    const bezelReturn = document.getElementById("bezel-return");
    const bezelPower = document.getElementById("bezel-power");
    const bodyPower = document.getElementById("body-power");
    const crtBlank = document.getElementById("crt-blank");
    const entryLayer = document.getElementById("crt-entry-layer");
    const entryButtons = [...entryLayer.querySelectorAll(".crt-entry")];
    const motion2 = matchMedia("(prefers-reduced-motion: reduce)");
    const glass2 = rig.querySelector(".crt-glass");
    const well = rig.querySelector(".crt-well");
    const fxLayer = document.getElementById("crt-fx");
    const blurWeak = document.getElementById("crt-blur-weak");
    const blurStrong = document.getElementById("crt-blur-strong");
    const noiseView = document.getElementById("crt-noise");
    const blurPad = document.createElement("canvas");
    const blurWork = document.createElement("canvas");
    const noiseFrames = [];
    let selectedEntry = null;
    let entriesReady = false;
    let crtPowered = false;
    let yaw = -32;
    let pitch = -16;
    let drag = null;
    let suppressDoubleClickUntil = 0;
    let mode = "machine";
    let operationBusy = false;
    let raf = 0;
    let lastTime = 0;
    let pauseUntil = 0;
    let viewAnimation = null;
    let denoiseAnims = [];
    let noiseRaf = 0;
    let denoiseLive = false;
    let transitionGen = 0;
    for (const entry of ENTRIES) {
      const button = entryButtons.find((item) => item.dataset.entry === entry.id);
      button.style.left = `${(entry.center - 60) / 512 * 100}%`;
      button.style.top = `${BUTTON_TOP / 342 * 100}%`;
      button.style.width = `${120 / 512 * 100}%`;
      button.style.height = `${BUTTON_HEIGHT / 342 * 100}%`;
    }
    syncCrt();
    let clockTimer = 0;
    function updateClock() {
      clearTimeout(clockTimer);
      if (document.hidden) return;
      syncCrt();
      clockTimer = setTimeout(updateClock, 6e4 - Date.now() % 6e4 + 20);
    }
    updateClock();
    function setEntriesReady(ready) {
      entriesReady = ready && mode === "screen" && crtPowered;
      entryLayer.inert = !entriesReady;
      entryLayer.setAttribute("aria-hidden", String(!entriesReady));
      for (const button of entryButtons) button.disabled = !entriesReady;
    }
    function setPowerPressed(on) {
      bezelPower.setAttribute("aria-pressed", String(on));
    }
    function syncBezel() {
      const onScreen = mode === "screen";
      const busy = Boolean(viewAnimation) || denoiseLive;
      bezelReturn.tabIndex = onScreen ? 0 : -1;
      bezelPower.disabled = !onScreen || crtPowered || busy;
      setPowerPressed(crtPowered);
      bodyPower.disabled = onScreen || busy;
      bodyPower.tabIndex = onScreen || busy ? -1 : 0;
      bodyPower.setAttribute("aria-pressed", String(crtPowered));
    }
    function setBlank(opacity) {
      for (const anim of crtBlank.getAnimations()) {
        try {
          anim.commitStyles();
        } catch {
        }
        anim.cancel();
      }
      crtBlank.style.opacity = String(opacity);
    }
    function selectEntry(id) {
      if (!entriesReady || mode !== "screen") return;
      selectedEntry = id;
      document.dispatchEvent(new CustomEvent("mac-entry-selected", { detail: { id } }));
      for (const button of entryButtons) button.setAttribute("aria-pressed", String(button.dataset.entry === id));
      syncCrt();
    }
    function prepareCrt(scale) {
      const factor = Math.max(1, Math.ceil(glass2.offsetWidth * scale * (devicePixelRatio || 1) / crtSource.width));
      const width = crtSource.width * factor;
      const height = crtSource.height * factor;
      if (crt.width !== width || crt.height !== height) {
        crt.width = width;
        crt.height = height;
      }
      const context = crt.getContext("2d");
      context.imageSmoothingEnabled = false;
      context.drawImage(crtSource, 0, 0, crt.width, crt.height);
    }
    function transitionBusy() {
      return Boolean(viewAnimation) || denoiseLive;
    }
    function paintBlurred(target, radius) {
      const pad = Math.ceil(radius * 3) + 4;
      const width = crtSource.width;
      const height = crtSource.height;
      blurPad.width = width + pad * 2;
      blurPad.height = height + pad * 2;
      const padded = blurPad.getContext("2d");
      padded.fillStyle = PAPER;
      padded.fillRect(0, 0, blurPad.width, blurPad.height);
      padded.drawImage(crtSource, pad, pad);
      padded.drawImage(crtSource, 0, 0, width, 1, pad, 0, width, pad);
      padded.drawImage(crtSource, 0, height - 1, width, 1, pad, pad + height, width, pad);
      padded.drawImage(crtSource, 0, 0, 1, height, 0, pad, pad, height);
      padded.drawImage(crtSource, width - 1, 0, 1, height, pad + width, pad, pad, height);
      blurWork.width = blurPad.width;
      blurWork.height = blurPad.height;
      const work = blurWork.getContext("2d");
      work.filter = `blur(${radius}px)`;
      work.drawImage(blurPad, 0, 0);
      work.filter = "none";
      if (target.width !== width) target.width = width;
      if (target.height !== height) target.height = height;
      const dest = target.getContext("2d");
      dest.imageSmoothingEnabled = true;
      dest.clearRect(0, 0, width, height);
      dest.drawImage(blurWork, pad, pad, width, height, 0, 0, width, height);
    }
    function ensureNoiseFrames() {
      if (noiseFrames.length) return;
      for (let i = 0; i < NOISE_FRAME_COUNT; i++) {
        const frame2 = document.createElement("canvas");
        frame2.width = NOISE_COLS;
        frame2.height = NOISE_ROWS;
        const context = frame2.getContext("2d");
        const pixels = context.createImageData(NOISE_COLS, NOISE_ROWS);
        const data = pixels.data;
        for (let p = 0; p < data.length; p += 4) {
          const grain = Math.random();
          if (grain > 0.82) continue;
          const light = grain > 0.4;
          data[p] = light ? 232 : 96;
          data[p + 1] = light ? 224 : 88;
          data[p + 2] = light ? 204 : 72;
          data[p + 3] = light ? 88 + (grain * 52 | 0) : 108 + (grain * 52 | 0);
        }
        context.putImageData(pixels, 0, 0);
        noiseFrames.push(frame2);
      }
    }
    function paintNoise(index) {
      const context = noiseView.getContext("2d");
      context.clearRect(0, 0, noiseView.width, noiseView.height);
      context.drawImage(noiseFrames[index], 0, 0);
    }
    function clearDenoise() {
      denoiseLive = false;
      if (noiseRaf) {
        cancelAnimationFrame(noiseRaf);
        noiseRaf = 0;
      }
      blurWeak.style.opacity = "0";
      blurStrong.style.opacity = "0";
      noiseView.style.opacity = "0";
      fxLayer.classList.remove("is-live");
      for (const anim of denoiseAnims) anim.cancel();
      denoiseAnims = [];
      blurWeak.style.willChange = "";
      blurStrong.style.willChange = "";
      noiseView.style.willChange = "";
    }
    function armDenoise() {
      ensureNoiseFrames();
      paintBlurred(blurWeak, WEAK_BLUR_PX);
      paintBlurred(blurStrong, STRONG_BLUR_PX);
      paintNoise(0);
      blurWeak.style.opacity = "1";
      blurStrong.style.opacity = "1";
      noiseView.style.opacity = String(NOISE_START_OPACITY);
      blurWeak.style.willChange = "opacity";
      blurStrong.style.willChange = "opacity";
      noiseView.style.willChange = "opacity";
      fxLayer.classList.add("is-live");
      denoiseLive = true;
    }
    function startNoiseLoop(gen) {
      let index = 0;
      let last = 0;
      const interval = 1e3 / NOISE_HZ;
      const tick = (now) => {
        if (gen !== transitionGen || !denoiseLive) return;
        if (!last) last = now;
        if (now - last >= interval) {
          last = now;
          index = (index + 1) % noiseFrames.length;
          paintNoise(index);
        }
        noiseRaf = requestAnimationFrame(tick);
      };
      noiseRaf = requestAnimationFrame(tick);
    }
    function startDenoise(gen) {
      if (gen !== transitionGen || mode !== "screen" || !denoiseLive) return;
      const timing = { duration: DENOISE_MS, fill: "forwards", easing: "linear" };
      denoiseAnims = [
        blurStrong.animate([
          { opacity: 1, offset: 0, easing: "ease-out" },
          { opacity: 0.92, offset: 0.18, easing: "ease-in-out" },
          { opacity: 0.08, offset: 0.55, easing: "ease-out" },
          { opacity: 0, offset: 0.7 },
          { opacity: 0, offset: 1 }
        ], timing),
        blurWeak.animate([
          { opacity: 1, offset: 0, easing: "ease-out" },
          { opacity: 1, offset: 0.18, easing: "ease-in-out" },
          { opacity: 0.82, offset: 0.55, easing: "ease-out" },
          { opacity: 0.28, offset: 0.7, easing: "ease-out" },
          { opacity: 0.1, offset: 0.85, easing: "ease-out" },
          { opacity: 0, offset: 1 }
        ], timing),
        noiseView.animate([
          { opacity: NOISE_START_OPACITY, offset: 0, easing: "linear" },
          { opacity: 0.46, offset: 0.18, easing: "linear" },
          { opacity: 0.42, offset: 0.4, easing: "ease-out" },
          { opacity: 0.18, offset: 0.55, easing: "ease-out" },
          { opacity: 0.08, offset: 0.7, easing: "ease-out" },
          { opacity: 0.03, offset: 0.85, easing: "ease-out" },
          { opacity: 0, offset: 1 }
        ], timing)
      ];
      startNoiseLoop(gen);
      Promise.all(denoiseAnims.map((anim) => anim.finished.catch(() => {
      }))).then(() => {
        if (gen !== transitionGen || mode !== "screen") return;
        finishScreenOn(gen);
      });
    }
    function finishScreenOn(gen) {
      if (gen !== transitionGen || mode !== "screen") return;
      crtPowered = true;
      syncCrt();
      setBlank(0);
      clearDenoise();
      pauseSky(false);
      rig.classList.remove("is-transitioning");
      syncBezel();
      setEntriesReady(true);
      startRotation();
    }
    function settleNow() {
      const wasDenoising = denoiseLive;
      const waiting = mode === "screen" && !crtPowered && !wasDenoising && !motion2.matches;
      transitionGen += 1;
      viewAnimation?.cancel();
      viewAnimation = null;
      clearDenoise();
      pauseSky(false);
      rig.classList.remove("is-transitioning");
      if (mode === "screen" && (wasDenoising || crtPowered || motion2.matches)) {
        crtPowered = true;
        setBlank(0);
      } else {
        setBlank(crtPowered ? 0 : 1);
      }
      layout();
      syncBezel();
      setEntriesReady(mode === "screen");
      startRotation();
    }
    function layout() {
      const focused = mode === "screen";
      const chromeX = well.offsetLeft + glass2.offsetLeft;
      const frontW = glass2.offsetWidth + chromeX * 2;
      let scale = focused ? Math.min((innerWidth - 96) / frontW, (innerHeight - 80) / glass2.offsetHeight) : Math.min((studio.clientWidth - 24) / 660, (studio.clientHeight - 24) / 760, 1);
      if (focused) {
        const dpr = devicePixelRatio || 1;
        scale = Math.max(1 / glass2.offsetWidth, Math.floor(glass2.offsetWidth * scale * dpr) / (glass2.offsetWidth * dpr));
      }
      const centerX = well.offsetLeft + glass2.offsetLeft + glass2.offsetWidth / 2;
      const centerY = well.offsetTop + glass2.offsetTop + glass2.offsetHeight / 2;
      rig.style.setProperty("--zoom", scale);
      rig.style.setProperty("--move-x", `${focused ? (rig.offsetWidth / 2 - centerX) * scale : 0}px`);
      rig.style.setProperty("--move-y", `${focused ? (rig.offsetHeight / 2 - centerY) * scale : -12}px`);
      rig.style.setProperty("--move-z", `${focused ? -170 * scale : 0}px`);
      rig.style.setProperty("--tilt-x", `${focused ? 0 : pitch}deg`);
      rig.style.setProperty("--tilt-y", `${yaw}deg`);
      if (focused) prepareCrt(scale);
    }
    function frame(time) {
      const elapsed = lastTime ? Math.min(time - lastTime, 250) : 0;
      lastTime = time;
      if (time >= pauseUntil) {
        yaw += elapsed * 360 / 6e4;
        rig.style.setProperty("--tilt-y", `${yaw}deg`);
        document.dispatchEvent(new CustomEvent("mac-view-geometry"));
      }
      raf = requestAnimationFrame(frame);
    }
    function stopRotation() {
      cancelAnimationFrame(raf);
      raf = 0;
      lastTime = 0;
    }
    function startRotation() {
      if (mode !== "machine" || operationBusy || drag || transitionBusy() || motion2.matches || document.hidden || raf) return;
      raf = requestAnimationFrame(frame);
    }
    function pauseSky(active) {
      document.dispatchEvent(new CustomEvent("mac-view-transition", { detail: { active } }));
    }
    function powerOnMachine() {
      if (mode !== "machine" || crtPowered || viewAnimation) return;
      crtPowered = true;
      drawCrt();
      setBlank(0);
      syncBezel();
    }
    function powerOn() {
      if (mode !== "screen" || crtPowered || viewAnimation || denoiseLive || motion2.matches) return;
      drawCrt();
      armDenoise();
      setBlank(0);
      pauseSky(true);
      syncBezel();
      startDenoise(transitionGen);
    }
    function setMode(next) {
      if (mode === next) return;
      endDrag();
      stopRotation();
      const before = getComputedStyle(rig).transform;
      const gen = ++transitionGen;
      viewAnimation?.cancel();
      viewAnimation = null;
      clearDenoise();
      pauseSky(true);
      mode = next;
      if (next === "machine") pitch = -16;
      yaw = Math.round(yaw / 360) * 360 + (next === "machine" ? -32 : 0);
      rig.classList.add("is-transitioning");
      studio.classList.toggle("screen-mode", next === "screen");
      document.body.classList.toggle("mac-screen-mode", next === "screen");
      document.dispatchEvent(new CustomEvent("mac-mode-change", { detail: { mode: next } }));
      rig.tabIndex = next === "screen" ? -1 : 0;
      if (next === "screen" && motion2.matches) crtPowered = true;
      setEntriesReady(false);
      if (next === "screen") drawCrt();
      setBlank(crtPowered ? 0 : 1);
      layout();
      const after = getComputedStyle(rig).transform;
      if (next === "screen") bezelReturn.focus({ preventScroll: true });
      else rig.focus({ preventScroll: true });
      const duration = motion2.matches ? 0 : next === "screen" ? VIEW_IN_MS : VIEW_OUT_MS;
      const animation = rig.animate([{ transform: before }, { transform: after }], {
        duration,
        easing: next === "screen" ? "cubic-bezier(0.4, 0, 0.2, 1)" : "cubic-bezier(0.16, 1, 0.3, 1)"
      });
      viewAnimation = animation;
      syncBezel();
      animation.finished.then(() => {
        if (gen !== transitionGen || viewAnimation !== animation) return;
        viewAnimation = null;
        rig.classList.remove("is-transitioning");
        pauseSky(false);
        if (next === "screen" && !crtPowered) {
          setBlank(1);
          syncBezel();
          bezelPower.focus({ preventScroll: true });
          return;
        }
        if (next === "screen") {
          finishScreenOn(gen);
          return;
        }
        setBlank(crtPowered ? 0 : 1);
        syncBezel();
        startRotation();
      }).catch(() => {
      });
    }
    rig.addEventListener("dblclick", (event) => {
      if (!event.target.closest("button, select, .terminal-ui, .floppy") && event.button === 0 && performance.now() >= suppressDoubleClickUntil) {
        event.preventDefault();
        setMode("screen");
      }
    });
    function endDrag(event) {
      if (!drag || event && event.pointerId !== drag.id) return;
      const ended = drag;
      drag = null;
      rig.classList.remove("is-dragging");
      if (rig.hasPointerCapture(ended.id)) rig.releasePointerCapture(ended.id);
      if (ended.moved) suppressDoubleClickUntil = performance.now() + 400;
      pauseUntil = performance.now() + 1500;
      startRotation();
    }
    rig.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || mode !== "machine" || operationBusy || transitionBusy() || drag || event.target.closest("button, select, .terminal-ui, .floppy")) return;
      stopRotation();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, moved: false };
      rig.setPointerCapture(event.pointerId);
      rig.classList.add("is-dragging");
      event.preventDefault();
    });
    rig.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      yaw = drag.yaw + dx * 0.45;
      pitch = Math.max(-55, Math.min(35, drag.pitch - dy * 0.3));
      rig.style.setProperty("--tilt-y", `${yaw}deg`);
      rig.style.setProperty("--tilt-x", `${pitch}deg`);
      document.dispatchEvent(new CustomEvent("mac-view-geometry"));
    });
    rig.addEventListener("pointerup", endDrag);
    rig.addEventListener("pointercancel", endDrag);
    rig.addEventListener("lostpointercapture", endDrag);
    addEventListener("blur", () => endDrag());
    rig.addEventListener("keydown", (event) => {
      if (event.target !== rig) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setMode("screen");
      }
    });
    for (const button of entryButtons) {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        selectEntry(button.dataset.entry);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      });
    }
    glass2.addEventListener("click", (event) => {
      if (!entriesReady || mode !== "screen" || event.target.closest(".crt-entry, .terminal-ui")) return;
      if (selectedEntry === null) return;
      selectedEntry = null;
      for (const button of entryButtons) button.setAttribute("aria-pressed", "false");
      syncCrt();
    });
    bezelReturn.addEventListener("click", (event) => {
      event.stopPropagation();
      setMode("machine");
    });
    bezelPower.addEventListener("click", (event) => {
      event.stopPropagation();
      powerOn();
    });
    bodyPower.addEventListener("pointerdown", (event) => event.stopPropagation());
    bodyPower.addEventListener("click", (event) => {
      event.stopPropagation();
      powerOnMachine();
    });
    for (const button of [bezelReturn, bezelPower, bodyPower]) {
      button.addEventListener("dblclick", (event) => event.stopPropagation());
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      });
    }
    addEventListener("keydown", (event) => {
      if (event.key === "Escape") setMode("machine");
    });
    addEventListener("resize", () => {
      endDrag();
      settleNow();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        settleNow();
        stopRotation();
        return;
      }
      updateClock();
      pauseSky(false);
      setEntriesReady(mode === "screen");
      syncBezel();
      startRotation();
    });
    motion2.addEventListener("change", () => {
      settleNow();
      stopRotation();
      startRotation();
    });
    ensureNoiseFrames();
    layout();
    syncBezel();
    startRotation();
    document.addEventListener("mac-operation-busy", (event) => {
      operationBusy = !!event.detail?.busy;
      if (operationBusy) {
        endDrag();
        stopRotation();
      } else startRotation();
    });
    document.addEventListener("mac-desktop-return", () => {
      glass2.classList.remove("mac-album-open");
      selectedEntry = null;
      for (const b of entryButtons) b.setAttribute("aria-pressed", "false");
      syncCrt();
    });
    const resizeObserver2 = new ResizeObserver(() => {
      if (mode === "machine" && !drag && !transitionBusy()) layout();
    });
    resizeObserver2.observe(studio);
    addEventListener("pagehide", () => {
      resizeObserver2.disconnect();
      stopRotation();
      clearTimeout(clockTimer);
      transitionGen++;
      viewAnimation?.cancel();
      clearDenoise();
      pauseSky(false);
    }, { once: true });
    return { inspect: () => ({ mode, yaw, pitch, powered: crtPowered, entriesReady, busy: transitionBusy(), operationBusy }), setMode };
  }

  // demo/archive/mac-stage-device.js
  var $ = (id) => document.getElementById(id);
  var formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  var today = /* @__PURE__ */ new Date();
  var past = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 137);
  var days = [{ date: formatDate(today), label: "\u4ECA\u65E5", rows: [[0, 24, 96], [1, 17, 68], [2, 12, 43], [3, 8, 31], [4, 5, 22]] }, { date: formatDate(past), label: "\u8FC7\u53BB\u7684\u4E00\u5929", rows: [[3, 31, 124], [4, 20, 76], [0, 14, 57], [5, 9, 36], [1, 4, 16]] }];
  var titles = ["Signal Garden", "Midnight Frequency", "Golden Hour", "Orbital Memory", "Blue Horizon", "Afterimage"];
  var artists = ["Glass Field", "Parallel Youth", "Solar Archive", "Satellite Room", "Soft Circuit", "Echo System"];
  var host = $("stage");
  var canvas = $("album-stage");
  var slot = document.querySelector(".floppy");
  var ghost = $("ghost");
  var glass = document.querySelector(".crt-glass");
  glass.insertAdjacentHTML("beforeend", '<div class="terminal-ui" role="region" aria-label="\u4E13\u8F91\u7EDF\u8BA1\u7A97\u53E3"><div class="terminal-title"><span>\u4E13\u8F91\u7EDF\u8BA1</span></div><div class="date-tools"><label for="date">\u65E5\u671F</label><button id="day-prev" aria-label="\u8FC7\u53BB\u4E00\u5929">&lt;</button><select id="date" aria-label="\u9009\u62E9\u7EDF\u8BA1\u65E5\u671F"></select><button id="day-next" aria-label="\u4ECA\u65E5">&gt;</button></div><div class="list-heading" aria-hidden="true"><span>\u6392\u540D</span><span>\u4E13\u8F91</span><span>\u6B21\u6570</span></div><div class="album-list" id="album-list"></div><div class="screen-status" id="screen-status"></div></div>');
  slot.removeAttribute("aria-hidden");
  slot.setAttribute("role", "button");
  slot.tabIndex = 0;
  slot.setAttribute("aria-label", "\u88C5\u5165\u9009\u4E2D\u4E13\u8F91\uFF0C\u4ECE\u7B2C\u4E00\u9996\u5F00\u59CB\u6F14\u793A\u64AD\u653E");
  $("rig").setAttribute("aria-label", "Mac \u97F3\u4E50\u6863\u6848\u7EC8\u7AEF\u3002\u957F\u6309\u62D6\u52A8\u65CB\u8F6C\uFF0C\u53CC\u51FB\u6216\u6309 Enter \u653E\u5927\u5C4F\u5E55\u3002");
  glass.querySelector(".terminal-title").insertAdjacentHTML("afterbegin", '<button id="desktop-return" type="button" aria-label="\u5173\u95ED\u4E13\u8F91\u7EDF\u8BA1\uFF0C\u8FD4\u56DE\u684C\u9762" title="\u8FD4\u56DE\u684C\u9762"></button>');
  $("desktop-return").onclick = () => document.dispatchEvent(new CustomEvent("mac-desktop-return"));
  document.addEventListener("mac-entry-selected", (event) => {
    const id = event.detail.id;
    glass.classList.toggle("mac-album-open", id === "album");
    feedback(id === "album" ? "\u5DF2\u6253\u5F00\u4E13\u8F91\u7EDF\u8BA1\uFF0C\u65E5\u671F\u548C\u821E\u53F0\u9009\u62E9\u4FDD\u6301\u8054\u52A8" : id === "track" ? "\u5DF2\u9009\u4E2D\u5355\u66F2\u5165\u53E3\uFF0C\u5185\u5BB9\u9875\u540E\u7EED\u8BBE\u8BA1" : "\u5DF2\u9009\u4E2D\u5E74\u5EA6\u603B\u7ED3\u5165\u53E3\uFF0C\u5185\u5BB9\u9875\u540E\u7EED\u8BBE\u8BA1");
  });
  document.addEventListener("mac-mode-change", () => {
    cancelGesture();
    cancelInsertion();
  });
  $("stage-position").insertAdjacentHTML("afterend", '<button id="load-album">\u88C5\u5165</button>');
  days.forEach((day, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = `${day.label} ${day.date}`;
    $("date").append(o);
  });
  $("date").hidden = true;
  $("date").insertAdjacentHTML("afterend", '<div class="date-picker"><button id="date-trigger" type="button" aria-label="\u9009\u62E9\u7EDF\u8BA1\u65E5\u671F" aria-haspopup="listbox" aria-expanded="false" aria-controls="date-menu"><span></span><svg viewBox="0 0 8 5" aria-hidden="true"><path d="M0 0H8L4 5Z"/></svg></button><div id="date-menu" role="listbox" aria-label="\u7EDF\u8BA1\u65E5\u671F" hidden></div></div>');
  var dateOptions = days.map((day, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "option");
    b.textContent = `${day.label} ${day.date}`;
    b.onclick = () => {
      $("date").value = String(i);
      showDay();
      closeDateMenu(true);
    };
    $("date-menu").append(b);
    return b;
  });
  function closeDateMenu(focus = false) {
    $("date-menu").hidden = true;
    $("date-trigger").setAttribute("aria-expanded", "false");
    if (focus) $("date-trigger").focus();
  }
  function openDateMenu() {
    $("date-menu").hidden = false;
    $("date-trigger").setAttribute("aria-expanded", "true");
    dateOptions[Number($("date").value)].focus();
  }
  $("date-trigger").onclick = () => {
    $("date-menu").hidden ? openDateMenu() : closeDateMenu();
  };
  $("date-trigger").onkeydown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openDateMenu();
    }
  };
  $("date-menu").onkeydown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeDateMenu(true);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const index = dateOptions.indexOf(document.activeElement);
      dateOptions[e.key === "Home" ? 0 : e.key === "End" ? dateOptions.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + dateOptions.length) % dateOptions.length].focus();
    }
  };
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".date-picker")) closeDateMenu();
  });
  document.addEventListener("focusin", (e) => {
    if (!e.target.closest(".date-picker")) closeDateMenu();
  });
  document.addEventListener("mac-mode-change", () => closeDateMenu());
  document.addEventListener("mac-desktop-return", () => closeDateMenu());
  var current = 0;
  var selected = 0;
  var covers = [];
  var albums = [];
  var gesture = null;
  var insertion = null;
  var playing = null;
  var disposed = false;
  function updateMacBusy() {
    document.dispatchEvent(new CustomEvent("mac-operation-busy", { detail: { busy: !!gesture || !!insertion } }));
  }
  var motion = matchMedia("(prefers-reduced-motion:reduce)");
  var tray = mountLoadTray(slot, motion);
  function feedback(text) {
    $("feedback").textContent = text;
  }
  var root = { host, coverDragging: true, getElementById: $, querySelector: (s) => host.querySelector(s), onGeometry: (geometry) => {
    canvas.dataset.coverGeometry = JSON.stringify(geometry);
  }, onSelection: (index) => {
    if (index === selected) return;
    cancelGesture();
    selected = index;
    updateSelection();
    transmit();
  } };
  var stage = mountArchiveStage(root);
  if ($("stage-auto").getAttribute("aria-pressed") === "true") $("stage-auto").click();
  function updateSelection() {
    document.querySelectorAll(".album-row").forEach((b, i) => b.setAttribute("aria-pressed", String(i === selected)));
    const a = albums[selected];
    if (a) $("screen-status").textContent = `${a.artist} / ${a.playCount} \u6B21 / ${a.minutes} min`;
  }
  function transmit() {
    const line = document.querySelector(".signal");
    line.classList.remove("sending");
    void line.getBoundingClientRect();
    line.classList.add("sending");
  }
  function showDay() {
    cancelGesture();
    cancelInsertion();
    current = Number($("date").value);
    selected = 0;
    $("date-trigger").querySelector("span").textContent = `${days[current].label} ${days[current].date}`;
    dateOptions.forEach((b, i) => b.setAttribute("aria-selected", String(i === current)));
    albums = days[current].rows.map(([id, playCount, minutes]) => ({ id, title: titles[id], artist: artists[id], playCount, minutes, artworkUrl: covers[id]?.toDataURL() }));
    $("album-list").replaceChildren(...albums.map((a, i) => {
      const b = document.createElement("button");
      b.className = "album-row";
      b.type = "button";
      b.setAttribute("aria-label", `${i + 1} ${a.title}\uFF0C${a.artist}\uFF0C${a.playCount}\u6B21\uFF0C${a.minutes}\u5206\u949F`);
      b.innerHTML = `<span class="rank">${String(i + 1).padStart(2, "0")}</span><span class="row-name">${a.title}</span><span class="count">${a.playCount}</span>`;
      b.onclick = () => {
        cancelGesture();
        stage.select(i);
      };
      return b;
    }));
    $("day-prev").disabled = current === 1;
    $("day-next").disabled = current === 0;
    stage.setAlbums(albums);
    updateSelection();
    transmit();
    feedback(playing ? `\u6F14\u793A\u64AD\u653E\u4E2D\uFF1A${playing.title} \xB7 \u7B2C 1 \u9996\uFF1B\u5F53\u524D\u6D4F\u89C8 ${days[current].date}` : `${days[current].date} \xB7 Top 5 \u5DF2\u4F20\u9001\uFF0C\u957F\u6309\u821E\u53F0\u5C01\u9762\u62D6\u5165\u69FD\u53E3`);
    $("scene").setAttribute("aria-busy", String(!covers.length));
  }
  $("date").onchange = showDay;
  $("day-prev").onclick = () => {
    $("date").value = "1";
    showDay();
  };
  $("day-next").onclick = () => {
    $("date").value = "0";
    showDay();
  };
  function cableLayout() {
    const base = $("scene").getBoundingClientRect(), jack = document.querySelector(".jack").getBoundingClientRect(), target = document.querySelector(".stage-container").getBoundingClientRect();
    const x1 = jack.left + jack.width / 2 - base.left, y1 = jack.top + jack.height / 2 - base.top, x2 = target.left + target.width * 0.18 - base.left, y2 = target.top + target.height * 0.77 - base.top;
    const sag = Math.min(base.height - 8, Math.max(y1, y2) + 100);
    document.querySelectorAll("#cable path").forEach((p) => p.setAttribute("d", `M${x1} ${y1} C${x1 + 100} ${sag},${x2 - 90} ${sag},${x2} ${y2}`));
  }
  document.addEventListener("mac-view-geometry", cableLayout);
  var cableFrame = 0;
  function followCable() {
    cableLayout();
    cableFrame = requestAnimationFrame(followCable);
  }
  document.addEventListener("mac-view-transition", (event) => {
    cancelAnimationFrame(cableFrame);
    cableFrame = 0;
    cableLayout();
    if (event.detail.active) cableFrame = requestAnimationFrame(followCable);
  });
  addEventListener("pagehide", () => cancelAnimationFrame(cableFrame), { once: true });
  addEventListener("resize", () => {
    cancelGesture();
    cancelInsertion();
  });
  var resizeObserver = new ResizeObserver(cableLayout);
  resizeObserver.observe($("scene"));
  resizeObserver.observe($("studio"));
  resizeObserver.observe(host);
  function insidePolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if (a.y > y !== b.y > y && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function inSlot(x, y) {
    return tray.hit(x, y);
  }
  function moveGhost(x, y) {
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    tray.approach(x, y);
  }
  function cancelGesture(keepTray = false) {
    if (!gesture) return;
    const state = gesture;
    gesture = null;
    clearTimeout(state.timer);
    if (canvas.hasPointerCapture(state.pointerId)) canvas.releasePointerCapture(state.pointerId);
    ghost.hidden = true;
    host.classList.remove("is-picked");
    canvas.classList.remove("is-carrying");
    if (!keepTray) tray.reset();
    updateMacBusy();
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || gesture || insertion || !covers.length) return;
    const scene = stage.inspect(), rect = canvas.getBoundingClientRect();
    if (!scene?.settled || !insidePolygon(e.clientX - rect.left, e.clientY - rect.top, scene.points)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const state = gesture = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, album: albums[selected], active: false };
    updateMacBusy();
    state.timer = setTimeout(() => {
      if (gesture !== state) return;
      state.active = true;
      ghost.getContext("2d").drawImage(covers[state.album.id], 0, 0);
      ghost.hidden = false;
      host.classList.add("is-picked");
      canvas.classList.add("is-carrying");
      moveGhost(state.x, state.y);
      feedback(`\u5C06 ${state.album.title} \u62D6\u5230 Mac \u8F6F\u76D8\u69FD\uFF0C\u677E\u624B\u88C5\u5165`);
    }, 320);
  });
  document.addEventListener("pointermove", (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    gesture.x = e.clientX;
    gesture.y = e.clientY;
    if (!gesture.active) {
      if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 10) cancelGesture();
      return;
    }
    moveGhost(e.clientX, e.clientY);
  });
  document.addEventListener("pointerup", (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const state = gesture, accept = state.active && inSlot(e.clientX, e.clientY), x = e.clientX, y = e.clientY;
    cancelGesture(accept);
    if (accept) insertAlbum(state.album, x, y);
    else if (state.active) feedback("\u672A\u88C5\u5165\uFF0C\u5C01\u9762\u5DF2\u8FD4\u56DE\u821E\u53F0\u3002\u957F\u6309\u540E\u62D6\u5230\u4EAE\u8D77\u7684\u69FD\u53E3\u3002");
  });
  document.addEventListener("pointercancel", () => cancelGesture());
  canvas.addEventListener("lostpointercapture", () => cancelGesture());
  function cancelInsertion() {
    if (!insertion) return;
    const state = insertion;
    insertion = null;
    state.controller.abort();
    ghost.hidden = true;
    updateMacBusy();
  }
  async function insertAlbum(album, x, y) {
    if (!covers.length || insertion) return;
    cancelGesture();
    ghost.getContext("2d").drawImage(covers[album.id], 0, 0);
    ghost.hidden = false;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    const state = insertion = { album, controller: new AbortController() };
    feedback(`\u6B63\u5728\u88C5\u5165 ${album.title}\u2026`);
    updateMacBusy();
    const loaded = await tray.load(covers[album.id], ghost, { x, y, signal: state.controller.signal });
    if (!loaded || insertion !== state || disposed) return;
    insertion = null;
    playing = { ...album, track: 1 };
    $("scene").dataset.playing = String(album.id);
    $("scene").dataset.track = "1";
    feedback(`\u6F14\u793A\u64AD\u653E\uFF1A${album.title} \xB7 ${album.artist} \xB7 \u4ECE\u7B2C 1 \u9996\u5F00\u59CB`);
    updateMacBusy();
  }
  function loadSelected() {
    const a = albums[selected];
    if (!a || !covers.length) return;
    const r = canvas.getBoundingClientRect();
    insertAlbum(a, r.left + r.width * 0.5, r.top + r.height * 0.4);
  }
  $("load-album").onclick = loadSelected;
  slot.onclick = loadSelected;
  slot.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      loadSelected();
    }
  };
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cancelGesture();
      cancelInsertion();
      feedback("\u5DF2\u53D6\u6D88\u88C5\u5165");
    }
  });
  addEventListener("blur", () => {
    cancelGesture();
    cancelInsertion();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelGesture();
      cancelInsertion();
    }
  });
  showDay();
  $("load-album").disabled = true;
  var worker = null;
  var workerURL = null;
  async function prepare() {
    try {
      const inputs = await Promise.all(SAMPLE_COVERS.slice(0, 6).map(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = c.height = 96;
        const cctx = c.getContext("2d"), edge = Math.min(image.naturalWidth, image.naturalHeight);
        cctx.drawImage(image, (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2, edge, edge, 0, 0, 96, 96);
        return { size: 96, colors: 32, pixels: cctx.getImageData(0, 0, 96, 96).data.buffer };
      }));
      if (disposed) return;
      workerURL = URL.createObjectURL(new Blob(['(()=>{var vt=Object.defineProperty,si=(t,i,e)=>i in t?vt(t,i,{enumerable:!0,configurable:!0,writable:!0,value:e}):t[i]=e,L=(t,i)=>{for(var e in i)vt(t,e,{get:i[e],enumerable:!0})},l=(t,i,e)=>(si(t,typeof i!="symbol"?i+"":i,e),e),ai={};L(ai,{bt709:()=>bt});var bt={};L(bt,{Y:()=>Pt,x:()=>Rt,y:()=>It});var Pt=(t=>(t[t.RED=.2126]="RED",t[t.GREEN=.7152]="GREEN",t[t.BLUE=.0722]="BLUE",t[t.WHITE=1]="WHITE",t))(Pt||{}),Rt=(t=>(t[t.RED=.64]="RED",t[t.GREEN=.3]="GREEN",t[t.BLUE=.15]="BLUE",t[t.WHITE=.3127]="WHITE",t))(Rt||{}),It=(t=>(t[t.RED=.33]="RED",t[t.GREEN=.6]="GREEN",t[t.BLUE=.06]="BLUE",t[t.WHITE=.329]="WHITE",t))(It||{}),ni={};L(ni,{lab2rgb:()=>ci,lab2xyz:()=>Dt,rgb2hsl:()=>mt,rgb2lab:()=>nt,rgb2xyz:()=>Et,xyz2lab:()=>Nt,xyz2rgb:()=>Ht});function dt(t){return t>.04045?((t+.055)/1.055)**2.4:t/12.92}function Et(t,i,e){return t=dt(t/255),i=dt(i/255),e=dt(e/255),{x:t*.4124+i*.3576+e*.1805,y:t*.2126+i*.7152+e*.0722,z:t*.0193+i*.1192+e*.9505}}var Ct={};L(Ct,{degrees2radians:()=>U,inRange0to255:()=>G,inRange0to255Rounded:()=>D,intInRange:()=>ri,max3:()=>Gt,min3:()=>qt,stableSort:()=>xt});function U(t){return t*(Math.PI/180)}function Gt(t,i,e){let s=t;return s<i&&(s=i),s<e&&(s=e),s}function qt(t,i,e){let s=t;return s>i&&(s=i),s>e&&(s=e),s}function ri(t,i,e){return t>e&&(t=e),t<i&&(t=i),t|0}function D(t){return t=Math.round(t),t>255?t=255:t<0&&(t=0),t}function G(t){return t>255?t=255:t<0&&(t=0),t}function xt(t,i){let e=typeof t[0],s;if(e==="number"||e==="string"){let a=Object.create(null);for(let r=0,n=t.length;r<n;r++){let h=t[r];a[h]||a[h]===0||(a[h]=r)}s=t.sort((r,n)=>i(r,n)||a[r]-a[n])}else{let a=t.slice(0);s=t.sort((r,n)=>i(r,n)||a.indexOf(r)-a.indexOf(n))}return s}function mt(t,i,e){let s=qt(t,i,e),a=Gt(t,i,e),r=a-s,n=(s+a)/510,h=0;n>0&&n<1&&(h=r/(n<.5?a+s:510-a-s));let o=0;return r>0&&(a===t?o=(i-e)/r:a===i?o=2+(e-t)/r:o=4+(t-i)/r,o*=60,o<0&&(o+=360)),{h:o,s:h,l:n}}var hi=.95047,li=1,oi=1.08883;function gt(t){return t>.008856?t**(1/3):7.787*t+16/116}function Nt(t,i,e){if(t=gt(t/hi),i=gt(i/li),e=gt(e/oi),116*i-16<0)throw new Error("xxx");return{L:Math.max(0,116*i-16),a:500*(t-i),b:200*(i-e)}}function nt(t,i,e){let s=Et(t,i,e);return Nt(s.x,s.y,s.z)}var mi=.95047,_i=1,ui=1.08883;function Mt(t){return t>.206893034?t**3:(t-16/116)/7.787}function Dt(t,i,e){let s=(t+16)/116,a=i/500+s,r=s-e/200;return{x:mi*Mt(a),y:_i*Mt(s),z:ui*Mt(r)}}function pt(t){return t>.0031308?1.055*t**(1/2.4)-.055:12.92*t}function Ht(t,i,e){let s=pt(t*3.2406+i*-1.5372+e*-.4986),a=pt(t*-.9689+i*1.8758+e*.0415),r=pt(t*.0557+i*-.204+e*1.057);return{r:D(s*255),g:D(a*255),b:D(r*255)}}function ci(t,i,e){let s=Dt(t,i,e);return Ht(s.x,s.y,s.z)}var wt={};L(wt,{AbstractDistanceCalculator:()=>F,AbstractEuclidean:()=>_t,AbstractManhattan:()=>ut,CIE94GraphicArts:()=>Tt,CIE94Textiles:()=>Lt,CIEDE2000:()=>H,CMetric:()=>Wt,Euclidean:()=>Ut,EuclideanBT709:()=>Ft,EuclideanBT709NoAlpha:()=>jt,Manhattan:()=>Ot,ManhattanBT709:()=>$t,ManhattanNommyde:()=>Xt,PNGQuant:()=>Jt});var F=class{constructor(){l(this,"_maxDistance"),l(this,"_whitePoint"),this._setDefaults(),this.setWhitePoint(255,255,255,255)}setWhitePoint(t,i,e,s){this._whitePoint={r:t>0?255/t:0,g:i>0?255/i:0,b:e>0?255/e:0,a:s>0?255/s:0},this._maxDistance=this.calculateRaw(t,i,e,s,0,0,0,0)}calculateNormalized(t,i){return this.calculateRaw(t.r,t.g,t.b,t.a,i.r,i.g,i.b,i.a)/this._maxDistance}},Qt=class extends F{calculateRaw(t,i,e,s,a,r,n,h){let o=nt(G(t*this._whitePoint.r),G(i*this._whitePoint.g),G(e*this._whitePoint.b)),_=nt(G(a*this._whitePoint.r),G(r*this._whitePoint.g),G(n*this._whitePoint.b)),m=o.L-_.L,u=o.a-_.a,c=o.b-_.b,p=Math.sqrt(o.a*o.a+o.b*o.b),f=Math.sqrt(_.a*_.a+_.b*_.b),d=p-f,g=u*u+c*c-d*d;g=g<0?0:Math.sqrt(g);let y=(h-s)*this._whitePoint.a*this._kA;return Math.sqrt((m/this._Kl)**2+(d/(1+this._K1*p))**2+(g/(1+this._K2*p))**2+y**2)}},Lt=class extends Qt{_setDefaults(){this._Kl=2,this._K1=.048,this._K2=.014,this._kA=.25*50/255}},Tt=class extends Qt{_setDefaults(){this._Kl=1,this._K1=.045,this._K2=.015,this._kA=.25*100/255}},A=class extends F{_setDefaults(){}static _calculatehp(t,i){let e=Math.atan2(t,i);return e>=0?e:e+A._deg360InRad}static _calculateRT(t,i){let e=i**7,s=2*Math.sqrt(e/(e+A._pow25to7)),a=A._deg30InRad*Math.exp(-(((t-A._deg275InRad)/A._deg25InRad)**2));return-Math.sin(2*a)*s}static _calculateT(t){return 1-.17*Math.cos(t-A._deg30InRad)+.24*Math.cos(t*2)+.32*Math.cos(t*3+A._deg6InRad)-.2*Math.cos(t*4-A._deg63InRad)}static _calculate_ahp(t,i,e,s){let a=e+s;return t===0?a:i<=A._deg180InRad?a/2:a<A._deg360InRad?(a+A._deg360InRad)/2:(a-A._deg360InRad)/2}static _calculate_dHp(t,i,e,s){let a;return t===0?a=0:i<=A._deg180InRad?a=e-s:e<=s?a=e-s+A._deg360InRad:a=e-s-A._deg360InRad,2*Math.sqrt(t)*Math.sin(a/2)}calculateRaw(t,i,e,s,a,r,n,h){let o=nt(G(t*this._whitePoint.r),G(i*this._whitePoint.g),G(e*this._whitePoint.b)),_=nt(G(a*this._whitePoint.r),G(r*this._whitePoint.g),G(n*this._whitePoint.b)),m=(h-s)*this._whitePoint.a*A._kA,u=this.calculateRawInLab(o,_);return Math.sqrt(u+m*m)}calculateRawInLab(t,i){let e=t.L,s=t.a,a=t.b,r=i.L,n=i.a,h=i.b,o=Math.sqrt(s*s+a*a),_=Math.sqrt(n*n+h*h),m=((o+_)/2)**7,u=.5*(1-Math.sqrt(m/(m+A._pow25to7))),c=(1+u)*s,p=(1+u)*n,f=Math.sqrt(c*c+a*a),d=Math.sqrt(p*p+h*h),g=f*d,y=A._calculatehp(a,c),k=A._calculatehp(h,p),z=Math.abs(y-k),b=r-e,R=d-f,N=A._calculate_dHp(g,z,k,y),M=A._calculate_ahp(g,z,y,k),tt=A._calculateT(M),it=(f+d)/2,ot=((e+r)/2-50)**2,W=1+.015*ot/Math.sqrt(20+ot),et=1+.045*it,st=1+.015*tt*it,j=A._calculateRT(M,it),O=b/W,yt=R/et,kt=N/st;return O**2+yt**2+kt**2+j*yt*kt}},H=A;l(H,"_kA",.25*100/255);l(H,"_pow25to7",25**7);l(H,"_deg360InRad",U(360));l(H,"_deg180InRad",U(180));l(H,"_deg30InRad",U(30));l(H,"_deg6InRad",U(6));l(H,"_deg63InRad",U(63));l(H,"_deg275InRad",U(275));l(H,"_deg25InRad",U(25));var Wt=class extends F{calculateRaw(t,i,e,s,a,r,n,h){let o=(t+a)/2*this._whitePoint.r,_=(t-a)*this._whitePoint.r,m=(i-r)*this._whitePoint.g,u=(e-n)*this._whitePoint.b,c=((512+o)*_*_>>8)+4*m*m+((767-o)*u*u>>8),p=(h-s)*this._whitePoint.a;return Math.sqrt(c+p*p)}_setDefaults(){}},_t=class extends F{calculateRaw(t,i,e,s,a,r,n,h){let o=a-t,_=r-i,m=n-e,u=h-s;return Math.sqrt(this._kR*o*o+this._kG*_*_+this._kB*m*m+this._kA*u*u)}},Ut=class extends _t{_setDefaults(){this._kR=1,this._kG=1,this._kB=1,this._kA=1}},Ft=class extends _t{_setDefaults(){this._kR=.2126,this._kG=.7152,this._kB=.0722,this._kA=1}},jt=class extends _t{_setDefaults(){this._kR=.2126,this._kG=.7152,this._kB=.0722,this._kA=0}},ut=class extends F{calculateRaw(t,i,e,s,a,r,n,h){let o=a-t,_=r-i,m=n-e,u=h-s;return o<0&&(o=0-o),_<0&&(_=0-_),m<0&&(m=0-m),u<0&&(u=0-u),this._kR*o+this._kG*_+this._kB*m+this._kA*u}},Ot=class extends ut{_setDefaults(){this._kR=1,this._kG=1,this._kB=1,this._kA=1}},Xt=class extends ut{_setDefaults(){this._kR=.4984,this._kG=.8625,this._kB=.2979,this._kA=1}},$t=class extends ut{_setDefaults(){this._kR=.2126,this._kG=.7152,this._kB=.0722,this._kA=1}},Jt=class extends F{calculateRaw(t,i,e,s,a,r,n,h){let o=(h-s)*this._whitePoint.a;return this._colordifferenceCh(t*this._whitePoint.r,a*this._whitePoint.r,o)+this._colordifferenceCh(i*this._whitePoint.g,r*this._whitePoint.g,o)+this._colordifferenceCh(e*this._whitePoint.b,n*this._whitePoint.b,o)}_colordifferenceCh(t,i,e){let s=t-i,a=s+e;return s*s+a*a}_setDefaults(){}},di={};L(di,{AbstractPaletteQuantizer:()=>rt,ColorHistogram:()=>lt,NeuQuant:()=>B,NeuQuantFloat:()=>v,RGBQuant:()=>Vt,WuColorCube:()=>Yt,WuQuant:()=>V});var rt=class{quantizeSync(){for(let t of this.quantize())if(t.palette)return t.palette;throw new Error("unreachable")}},q=class{constructor(){l(this,"r"),l(this,"g"),l(this,"b"),l(this,"a"),l(this,"uint32"),l(this,"rgba"),this.uint32=-1>>>0,this.r=this.g=this.b=this.a=0,this.rgba=new Array(4),this.rgba[0]=0,this.rgba[1]=0,this.rgba[2]=0,this.rgba[3]=0}static createByQuadruplet(t){let i=new q;return i.r=t[0]|0,i.g=t[1]|0,i.b=t[2]|0,i.a=t[3]|0,i._loadUINT32(),i._loadQuadruplet(),i}static createByRGBA(t,i,e,s){let a=new q;return a.r=t|0,a.g=i|0,a.b=e|0,a.a=s|0,a._loadUINT32(),a._loadQuadruplet(),a}static createByUint32(t){let i=new q;return i.uint32=t>>>0,i._loadRGBA(),i._loadQuadruplet(),i}from(t){this.r=t.r,this.g=t.g,this.b=t.b,this.a=t.a,this.uint32=t.uint32,this.rgba[0]=t.r,this.rgba[1]=t.g,this.rgba[2]=t.b,this.rgba[3]=t.a}getLuminosity(t){let i=this.r,e=this.g,s=this.b;return t&&(i=Math.min(255,255-this.a+this.a*i/255),e=Math.min(255,255-this.a+this.a*e/255),s=Math.min(255,255-this.a+this.a*s/255)),i*.2126+e*.7152+s*.0722}_loadUINT32(){this.uint32=(this.a<<24|this.b<<16|this.g<<8|this.r)>>>0}_loadRGBA(){this.r=this.uint32&255,this.g=this.uint32>>>8&255,this.b=this.uint32>>>16&255,this.a=this.uint32>>>24&255}_loadQuadruplet(){this.rgba[0]=this.r,this.rgba[1]=this.g,this.rgba[2]=this.b,this.rgba[3]=this.a}},Q=class{constructor(){l(this,"_pointArray"),l(this,"_width"),l(this,"_height"),this._width=0,this._height=0,this._pointArray=[]}getWidth(){return this._width}getHeight(){return this._height}setWidth(t){this._width=t}setHeight(t){this._height=t}getPointArray(){return this._pointArray}clone(){let t=new Q;t._width=this._width,t._height=this._height;for(let i=0,e=this._pointArray.length;i<e;i++)t._pointArray[i]=q.createByUint32(this._pointArray[i].uint32|0);return t}toUint32Array(){let t=this._pointArray.length,i=new Uint32Array(t);for(let e=0;e<t;e++)i[e]=this._pointArray[e].uint32;return i}toUint8Array(){return new Uint8Array(this.toUint32Array().buffer)}static fromHTMLImageElement(t){let i=t.naturalWidth,e=t.naturalHeight,s=document.createElement("canvas");return s.width=i,s.height=e,s.getContext("2d").drawImage(t,0,0,i,e,0,0,i,e),Q.fromHTMLCanvasElement(s)}static fromHTMLCanvasElement(t){let i=t.width,e=t.height,a=t.getContext("2d").getImageData(0,0,i,e);return Q.fromImageData(a)}static fromImageData(t){let i=t.width,e=t.height;return Q.fromUint8Array(t.data,i,e)}static fromUint8Array(t,i,e){switch(Object.prototype.toString.call(t)){case"[object Uint8ClampedArray]":case"[object Uint8Array]":break;default:t=new Uint8Array(t)}let s=new Uint32Array(t.buffer);return Q.fromUint32Array(s,i,e)}static fromUint32Array(t,i,e){let s=new Q;s._width=i,s._height=e;for(let a=0,r=t.length;a<r;a++)s._pointArray[a]=q.createByUint32(t[a]|0);return s}static fromBuffer(t,i,e){let s=new Uint32Array(t.buffer,t.byteOffset,t.byteLength/Uint32Array.BYTES_PER_ELEMENT);return Q.fromUint32Array(s,i,e)}},zt=10;function ft(t,i){let s=360/i,a=s/2;for(let r=1,n=s-a;r<i;r++,n+=s)if(t>=n&&t<n+s)return r;return 0}var ht=class{constructor(){l(this,"_pointContainer"),l(this,"_pointArray",[]),l(this,"_i32idx",{}),this._pointContainer=new Q,this._pointContainer.setHeight(1),this._pointArray=this._pointContainer.getPointArray()}add(t){this._pointArray.push(t),this._pointContainer.setWidth(this._pointArray.length)}has(t){for(let i=this._pointArray.length-1;i>=0;i--)if(t.uint32===this._pointArray[i].uint32)return!0;return!1}getNearestColor(t,i){return this._pointArray[this._getNearestIndex(t,i)|0]}getPointContainer(){return this._pointContainer}_nearestPointFromCache(t){return typeof this._i32idx[t]=="number"?this._i32idx[t]:-1}_getNearestIndex(t,i){let e=this._nearestPointFromCache(""+i.uint32);if(e>=0)return e;let s=Number.MAX_VALUE;e=0;for(let a=0,r=this._pointArray.length;a<r;a++){let n=this._pointArray[a],h=t.calculateRaw(i.r,i.g,i.b,i.a,n.r,n.g,n.b,n.a);h<s&&(s=h,e=a)}return this._i32idx[i.uint32]=e,e}sort(){this._i32idx={},this._pointArray.sort((t,i)=>{let e=mt(t.r,t.g,t.b),s=mt(i.r,i.g,i.b),a=t.r===t.g&&t.g===t.b?0:1+ft(e.h,zt),n=(i.r===i.g&&i.g===i.b?0:1+ft(s.h,zt))-a;if(n)return-n;let h=t.getLuminosity(!0),o=i.getLuminosity(!0);if(o-h!==0)return o-h;let _=(s.s*100|0)-(e.s*100|0);return _?-_:0})}},St={};L(St,{HueStatistics:()=>Zt,Palette:()=>ht,Point:()=>q,PointContainer:()=>Q,ProgressTracker:()=>T,arithmetic:()=>Ct});var gi=class{constructor(){l(this,"num",0),l(this,"cols",[])}},Zt=class{constructor(t,i){l(this,"_numGroups"),l(this,"_minCols"),l(this,"_stats"),l(this,"_groupsFull"),this._numGroups=t,this._minCols=i,this._stats=[];for(let e=0;e<=t;e++)this._stats[e]=new gi;this._groupsFull=0}check(t){this._groupsFull===this._numGroups+1&&(this.check=()=>{});let i=t&255,e=t>>>8&255,s=t>>>16&255,a=i===e&&e===s?0:1+ft(mt(i,e,s).h,this._numGroups),r=this._stats[a],n=this._minCols;r.num++,!(r.num>n)&&(r.num===n&&this._groupsFull++,r.num<=n&&this._stats[a].cols.push(t))}injectIntoDictionary(t){for(let i=0;i<=this._numGroups;i++)this._stats[i].num<=this._minCols&&this._stats[i].cols.forEach(e=>{t[e]?t[e]++:t[e]=1})}injectIntoArray(t){for(let i=0;i<=this._numGroups;i++)this._stats[i].num<=this._minCols&&this._stats[i].cols.forEach(e=>{t.indexOf(e)===-1&&t.push(e)})}},Kt=class{constructor(t,i){l(this,"progress"),l(this,"_step"),l(this,"_range"),l(this,"_last"),l(this,"_progressRange"),this._range=t,this._progressRange=i,this._step=Math.max(1,this._range/(Kt.steps+1)|0),this._last=-this._step,this.progress=0}shouldNotify(t){return t-this._last>=this._step?(this._last=t,this.progress=Math.min(this._progressRange*this._last/this._range,this._progressRange),!0):!1}},T=Kt;l(T,"steps",100);var I=3,Mi=class{constructor(t){l(this,"r"),l(this,"g"),l(this,"b"),l(this,"a"),this.r=this.g=this.b=this.a=t}toPoint(){return q.createByRGBA(this.r>>I,this.g>>I,this.b>>I,this.a>>I)}subtract(t,i,e,s){this.r-=t|0,this.g-=i|0,this.b-=e|0,this.a-=s|0}},w=class extends rt{constructor(t,i=256){super(),l(this,"_pointArray"),l(this,"_networkSize"),l(this,"_network"),l(this,"_sampleFactor"),l(this,"_radPower"),l(this,"_freq"),l(this,"_bias"),l(this,"_distance"),this._distance=t,this._pointArray=[],this._sampleFactor=1,this._networkSize=i,this._distance.setWhitePoint(255<<I,255<<I,255<<I,255<<I)}sample(t){this._pointArray=this._pointArray.concat(t.getPointArray())}*quantize(){this._init(),yield*this._learn(),yield{palette:this._buildPalette(),progress:100}}_init(){this._freq=[],this._bias=[],this._radPower=[],this._network=[];for(let t=0;t<this._networkSize;t++)this._network[t]=new Mi((t<<I+8)/this._networkSize|0),this._freq[t]=w._initialBias/this._networkSize|0,this._bias[t]=0}*_learn(){let t=this._sampleFactor,i=this._pointArray.length;i<w._minpicturebytes&&(t=1);let e=30+(t-1)/3|0,s=i/t|0,a=s/w._nCycles|0,r=w._initAlpha,n=(this._networkSize>>3)*w._radiusBias,h=n>>w._radiusBiasShift;h<=1&&(h=0);for(let m=0;m<h;m++)this._radPower[m]=r*((h*h-m*m)*w._radBias/(h*h))>>>0;let o;i<w._minpicturebytes?o=1:i%w._prime1!==0?o=w._prime1:i%w._prime2!==0?o=w._prime2:i%w._prime3!==0?o=w._prime3:o=w._prime4;let _=new T(s,99);for(let m=0,u=0;m<s;){_.shouldNotify(m)&&(yield{progress:_.progress});let c=this._pointArray[u],p=c.b<<I,f=c.g<<I,d=c.r<<I,g=c.a<<I,y=this._contest(p,f,d,g);if(this._alterSingle(r,y,p,f,d,g),h!==0&&this._alterNeighbour(h,y,p,f,d,g),u+=o,u>=i&&(u-=i),m++,a===0&&(a=1),m%a===0){r-=r/e|0,n-=n/w._radiusDecrease|0,h=n>>w._radiusBiasShift,h<=1&&(h=0);for(let k=0;k<h;k++)this._radPower[k]=r*((h*h-k*k)*w._radBias/(h*h))>>>0}}}_buildPalette(){let t=new ht;return this._network.forEach(i=>{t.add(i.toPoint())}),t.sort(),t}_alterNeighbour(t,i,e,s,a,r){let n=i-t;n<-1&&(n=-1);let h=i+t;h>this._networkSize&&(h=this._networkSize);let o=i+1,_=i-1,m=1;for(;o<h||_>n;){let u=this._radPower[m++]/w._alphaRadBias;if(o<h){let c=this._network[o++];c.subtract(u*(c.r-a),u*(c.g-s),u*(c.b-e),u*(c.a-r))}if(_>n){let c=this._network[_--];c.subtract(u*(c.r-a),u*(c.g-s),u*(c.b-e),u*(c.a-r))}}}_alterSingle(t,i,e,s,a,r){t/=w._initAlpha;let n=this._network[i];n.subtract(t*(n.r-a),t*(n.g-s),t*(n.b-e),t*(n.a-r))}_contest(t,i,e,s){let a=1020<<I,r=~(1<<31),n=r,h=-1,o=h;for(let _=0;_<this._networkSize;_++){let m=this._network[_],u=this._distance.calculateNormalized(m,{r:e,g:i,b:t,a:s})*a|0;u<r&&(r=u,h=_);let c=u-(this._bias[_]>>w._initialBiasShift-I);c<n&&(n=c,o=_);let p=this._freq[_]>>w._betaShift;this._freq[_]-=p,this._bias[_]+=p<<w._gammaShift}return this._freq[h]+=w._beta,this._bias[h]-=w._betaGamma,o}},B=w;l(B,"_prime1",499);l(B,"_prime2",491);l(B,"_prime3",487);l(B,"_prime4",503);l(B,"_minpicturebytes",w._prime4);l(B,"_nCycles",100);l(B,"_initialBiasShift",16);l(B,"_initialBias",1<<w._initialBiasShift);l(B,"_gammaShift",10);l(B,"_betaShift",10);l(B,"_beta",w._initialBias>>w._betaShift);l(B,"_betaGamma",w._initialBias<<w._gammaShift-w._betaShift);l(B,"_radiusBiasShift",6);l(B,"_radiusBias",1<<w._radiusBiasShift);l(B,"_radiusDecrease",30);l(B,"_alphaBiasShift",10);l(B,"_initAlpha",1<<w._alphaBiasShift);l(B,"_radBiasShift",8);l(B,"_radBias",1<<w._radBiasShift);l(B,"_alphaRadBiasShift",w._alphaBiasShift+w._radBiasShift);l(B,"_alphaRadBias",1<<w._alphaRadBiasShift);var E=3,pi=class{constructor(t){l(this,"r"),l(this,"g"),l(this,"b"),l(this,"a"),this.r=this.g=this.b=this.a=t}toPoint(){return q.createByRGBA(this.r>>E,this.g>>E,this.b>>E,this.a>>E)}subtract(t,i,e,s){this.r-=t,this.g-=i,this.b-=e,this.a-=s}},S=class extends rt{constructor(t,i=256){super(),l(this,"_pointArray"),l(this,"_networkSize"),l(this,"_network"),l(this,"_sampleFactor"),l(this,"_radPower"),l(this,"_freq"),l(this,"_bias"),l(this,"_distance"),this._distance=t,this._pointArray=[],this._sampleFactor=1,this._networkSize=i,this._distance.setWhitePoint(255<<E,255<<E,255<<E,255<<E)}sample(t){this._pointArray=this._pointArray.concat(t.getPointArray())}*quantize(){this._init(),yield*this._learn(),yield{palette:this._buildPalette(),progress:100}}_init(){this._freq=[],this._bias=[],this._radPower=[],this._network=[];for(let t=0;t<this._networkSize;t++)this._network[t]=new pi((t<<E+8)/this._networkSize),this._freq[t]=S._initialBias/this._networkSize,this._bias[t]=0}*_learn(){let t=this._sampleFactor,i=this._pointArray.length;i<S._minpicturebytes&&(t=1);let e=30+(t-1)/3,s=i/t,a=s/S._nCycles|0,r=S._initAlpha,n=(this._networkSize>>3)*S._radiusBias,h=n>>S._radiusBiasShift;h<=1&&(h=0);for(let m=0;m<h;m++)this._radPower[m]=r*((h*h-m*m)*S._radBias/(h*h));let o;i<S._minpicturebytes?o=1:i%S._prime1!==0?o=S._prime1:i%S._prime2!==0?o=S._prime2:i%S._prime3!==0?o=S._prime3:o=S._prime4;let _=new T(s,99);for(let m=0,u=0;m<s;){_.shouldNotify(m)&&(yield{progress:_.progress});let c=this._pointArray[u],p=c.b<<E,f=c.g<<E,d=c.r<<E,g=c.a<<E,y=this._contest(p,f,d,g);if(this._alterSingle(r,y,p,f,d,g),h!==0&&this._alterNeighbour(h,y,p,f,d,g),u+=o,u>=i&&(u-=i),m++,a===0&&(a=1),m%a===0){r-=r/e,n-=n/S._radiusDecrease,h=n>>S._radiusBiasShift,h<=1&&(h=0);for(let k=0;k<h;k++)this._radPower[k]=r*((h*h-k*k)*S._radBias/(h*h))}}}_buildPalette(){let t=new ht;return this._network.forEach(i=>{t.add(i.toPoint())}),t.sort(),t}_alterNeighbour(t,i,e,s,a,r){let n=i-t;n<-1&&(n=-1);let h=i+t;h>this._networkSize&&(h=this._networkSize);let o=i+1,_=i-1,m=1;for(;o<h||_>n;){let u=this._radPower[m++]/S._alphaRadBias;if(o<h){let c=this._network[o++];c.subtract(u*(c.r-a),u*(c.g-s),u*(c.b-e),u*(c.a-r))}if(_>n){let c=this._network[_--];c.subtract(u*(c.r-a),u*(c.g-s),u*(c.b-e),u*(c.a-r))}}}_alterSingle(t,i,e,s,a,r){t/=S._initAlpha;let n=this._network[i];n.subtract(t*(n.r-a),t*(n.g-s),t*(n.b-e),t*(n.a-r))}_contest(t,i,e,s){let a=1020<<E,r=~(1<<31),n=r,h=-1,o=h;for(let _=0;_<this._networkSize;_++){let m=this._network[_],u=this._distance.calculateNormalized(m,{r:e,g:i,b:t,a:s})*a;u<r&&(r=u,h=_);let c=u-(this._bias[_]>>S._initialBiasShift-E);c<n&&(n=c,o=_);let p=this._freq[_]>>S._betaShift;this._freq[_]-=p,this._bias[_]+=p<<S._gammaShift}return this._freq[h]+=S._beta,this._bias[h]-=S._betaGamma,o}},v=S;l(v,"_prime1",499);l(v,"_prime2",491);l(v,"_prime3",487);l(v,"_prime4",503);l(v,"_minpicturebytes",S._prime4);l(v,"_nCycles",100);l(v,"_initialBiasShift",16);l(v,"_initialBias",1<<S._initialBiasShift);l(v,"_gammaShift",10);l(v,"_betaShift",10);l(v,"_beta",S._initialBias>>S._betaShift);l(v,"_betaGamma",S._initialBias<<S._gammaShift-S._betaShift);l(v,"_radiusBiasShift",6);l(v,"_radiusBias",1<<S._radiusBiasShift);l(v,"_radiusDecrease",30);l(v,"_alphaBiasShift",10);l(v,"_initAlpha",1<<S._alphaBiasShift);l(v,"_radBiasShift",8);l(v,"_radBias",1<<S._radBiasShift);l(v,"_alphaRadBiasShift",S._alphaBiasShift+S._radBiasShift);l(v,"_alphaRadBias",1<<S._alphaRadBiasShift);var at=class{constructor(t,i){l(this,"_method"),l(this,"_hueStats"),l(this,"_histogram"),l(this,"_initColors"),l(this,"_minHueCols"),this._method=t,this._minHueCols=i<<2,this._initColors=i<<2,this._hueStats=new Zt(at._hueGroups,this._minHueCols),this._histogram=Object.create(null)}sample(t){switch(this._method){case 1:this._colorStats1D(t);break;case 2:this._colorStats2D(t);break}}getImportanceSortedColorsIDXI32(){let t=xt(Object.keys(this._histogram),(e,s)=>this._histogram[s]-this._histogram[e]);if(t.length===0)return[];let i;switch(this._method){case 1:let e=Math.min(t.length,this._initColors),s=t[e-1],a=this._histogram[s];i=t.slice(0,e);let r=e,n=t.length;for(;r<n&&this._histogram[t[r]]===a;)i.push(t[r++]);this._hueStats.injectIntoArray(i);break;case 2:i=t;break;default:throw new Error("Incorrect method")}return i.map(e=>+e)}_colorStats1D(t){let i=this._histogram,e=t.getPointArray(),s=e.length;for(let a=0;a<s;a++){let r=e[a].uint32;this._hueStats.check(r),r in i?i[r]++:i[r]=1}}_colorStats2D(t){let i=t.getWidth(),e=t.getHeight(),s=t.getPointArray(),a=at._boxSize[0],r=at._boxSize[1],n=a*r,h=this._makeBoxes(i,e,a,r),o=this._histogram;h.forEach(_=>{let m=Math.round(_.w*_.h/n)*at._boxPixels;m<2&&(m=2);let u={};this._iterateBox(_,i,c=>{let p=s[c].uint32;this._hueStats.check(p),p in o?o[p]++:p in u?++u[p]>=m&&(o[p]=u[p]):u[p]=1})}),this._hueStats.injectIntoDictionary(o)}_iterateBox(t,i,e){let s=t,a=s.y*i+s.x,r=(s.y+s.h-1)*i+(s.x+s.w-1),n=i-s.w+1,h=0,o=a;do e.call(this,o),o+=++h%s.w===0?n:1;while(o<=r)}_makeBoxes(t,i,e,s){let a=t%e,r=i%s,n=t-a,h=i-r,o=[];for(let _=0;_<i;_+=s)for(let m=0;m<t;m+=e)o.push({x:m,y:_,w:m===n?a:e,h:_===h?r:s});return o}},lt=at;l(lt,"_boxSize",[64,64]);l(lt,"_boxPixels",2);l(lt,"_hueGroups",10);var fi=class{constructor(t,i,e){l(this,"index"),l(this,"color"),l(this,"distance"),this.index=t,this.color=i,this.distance=e}},Vt=class extends rt{constructor(t,i=256,e=2){super(),l(this,"_colors"),l(this,"_initialDistance"),l(this,"_distanceIncrement"),l(this,"_histogram"),l(this,"_distance"),this._distance=t,this._colors=i,this._histogram=new lt(e,i),this._initialDistance=.01,this._distanceIncrement=.005}sample(t){this._histogram.sample(t)}*quantize(){let t=this._histogram.getImportanceSortedColorsIDXI32();if(t.length===0)throw new Error("No colors in image");yield*this._buildPalette(t)}*_buildPalette(t){let i=new ht,e=i.getPointContainer().getPointArray(),s=new Array(t.length);for(let m=0;m<t.length;m++)e.push(q.createByUint32(t[m])),s[m]=1;let a=e.length,r=[],n=a,h=this._initialDistance,o=new T(n-this._colors,99);for(;n>this._colors;){r.length=0;for(let m=0;m<a;m++){if(o.shouldNotify(a-n)&&(yield{progress:o.progress}),s[m]===0)continue;let u=e[m];for(let c=m+1;c<a;c++){if(s[c]===0)continue;let p=e[c],f=this._distance.calculateNormalized(u,p);f<h&&(r.push(new fi(c,p,f)),s[c]=0,n--)}}h+=n>this._colors*3?this._initialDistance:this._distanceIncrement}if(n<this._colors){xt(r,(u,c)=>c.distance-u.distance);let m=0;for(;n<this._colors&&m<r.length;){let u=r[m];s[u.index]=1,n++,m++}}let _=e.length;for(let m=_-1;m>=0;m--)s[m]===0&&(m!==_-1&&(e[m]=e[_-1]),--_);e.length=_,i.sort(),yield{palette:i,progress:100}}};function X(t){let i=[];for(let e=0;e<t;e++)i[e]=0;return i}function $(t,i,e,s){let a=new Array(t);for(let r=0;r<t;r++){a[r]=new Array(i);for(let n=0;n<i;n++){a[r][n]=new Array(e);for(let h=0;h<e;h++){a[r][n][h]=new Array(s);for(let o=0;o<s;o++)a[r][n][h][o]=0}}}return a}function J(t,i,e){let s=new Array(t);for(let a=0;a<t;a++){s[a]=new Array(i);for(let r=0;r<i;r++){s[a][r]=new Array(e);for(let n=0;n<e;n++)s[a][r][n]=0}}return s}function Z(t,i,e,s,a){for(let r=0;r<i;r++){t[r]=[];for(let n=0;n<e;n++){t[r][n]=[];for(let h=0;h<s;h++)t[r][n][h]=a}}}function K(t,i,e){for(let s=0;s<i;s++)t[s]=e}var Yt=class{constructor(){l(this,"redMinimum"),l(this,"redMaximum"),l(this,"greenMinimum"),l(this,"greenMaximum"),l(this,"blueMinimum"),l(this,"blueMaximum"),l(this,"volume"),l(this,"alphaMinimum"),l(this,"alphaMaximum")}},x=class extends rt{constructor(t,i=256,e=5){super(),l(this,"_reds"),l(this,"_greens"),l(this,"_blues"),l(this,"_alphas"),l(this,"_sums"),l(this,"_weights"),l(this,"_momentsRed"),l(this,"_momentsGreen"),l(this,"_momentsBlue"),l(this,"_momentsAlpha"),l(this,"_moments"),l(this,"_table"),l(this,"_pixels"),l(this,"_cubes"),l(this,"_colors"),l(this,"_significantBitsPerChannel"),l(this,"_maxSideIndex"),l(this,"_alphaMaxSideIndex"),l(this,"_sideSize"),l(this,"_alphaSideSize"),l(this,"_distance"),this._distance=t,this._setQuality(e),this._initialize(i)}sample(t){let i=t.getPointArray();for(let e=0,s=i.length;e<s;e++)this._addColor(i[e]);this._pixels=this._pixels.concat(i)}*quantize(){yield*this._preparePalette();let t=new ht;for(let i=0;i<this._colors;i++)if(this._sums[i]>0){let e=this._sums[i],s=this._reds[i]/e,a=this._greens[i]/e,r=this._blues[i]/e,n=this._alphas[i]/e,h=q.createByRGBA(s|0,a|0,r|0,n|0);t.add(h)}t.sort(),yield{palette:t,progress:100}}*_preparePalette(){yield*this._calculateMoments();let t=0,i=X(this._colors);for(let n=1;n<this._colors;++n){this._cut(this._cubes[t],this._cubes[n])?(i[t]=this._cubes[t].volume>1?this._calculateVariance(this._cubes[t]):0,i[n]=this._cubes[n].volume>1?this._calculateVariance(this._cubes[n]):0):(i[t]=0,n--),t=0;let h=i[0];for(let o=1;o<=n;++o)i[o]>h&&(h=i[o],t=o);if(h<=0){this._colors=n+1;break}}let e=[],s=[],a=[],r=[];for(let n=0;n<this._colors;++n){let h=x._volume(this._cubes[n],this._weights);h>0?(e[n]=x._volume(this._cubes[n],this._momentsRed)/h|0,s[n]=x._volume(this._cubes[n],this._momentsGreen)/h|0,a[n]=x._volume(this._cubes[n],this._momentsBlue)/h|0,r[n]=x._volume(this._cubes[n],this._momentsAlpha)/h|0):(e[n]=0,s[n]=0,a[n]=0,r[n]=0)}this._reds=X(this._colors+1),this._greens=X(this._colors+1),this._blues=X(this._colors+1),this._alphas=X(this._colors+1),this._sums=X(this._colors+1);for(let n=0,h=this._pixels.length;n<h;n++){let o=this._pixels[n],m=-1,u=Number.MAX_VALUE;for(let c=0;c<this._colors;c++){let p=e[c],f=s[c],d=a[c],g=r[c],y=this._distance.calculateRaw(p,f,d,g,o.r,o.g,o.b,o.a);y<u&&(u=y,m=c)}this._reds[m]+=o.r,this._greens[m]+=o.g,this._blues[m]+=o.b,this._alphas[m]+=o.a,this._sums[m]++}}_addColor(t){let i=8-this._significantBitsPerChannel,e=(t.r>>i)+1,s=(t.g>>i)+1,a=(t.b>>i)+1,r=(t.a>>i)+1;this._weights[r][e][s][a]++,this._momentsRed[r][e][s][a]+=t.r,this._momentsGreen[r][e][s][a]+=t.g,this._momentsBlue[r][e][s][a]+=t.b,this._momentsAlpha[r][e][s][a]+=t.a,this._moments[r][e][s][a]+=this._table[t.r]+this._table[t.g]+this._table[t.b]+this._table[t.a]}*_calculateMoments(){let t=[],i=[],e=[],s=[],a=[],r=[],n=J(this._sideSize,this._sideSize,this._sideSize),h=J(this._sideSize,this._sideSize,this._sideSize),o=J(this._sideSize,this._sideSize,this._sideSize),_=J(this._sideSize,this._sideSize,this._sideSize),m=J(this._sideSize,this._sideSize,this._sideSize),u=J(this._sideSize,this._sideSize,this._sideSize),c=0,p=new T(this._alphaMaxSideIndex*this._maxSideIndex,99);for(let f=1;f<=this._alphaMaxSideIndex;++f){Z(n,this._sideSize,this._sideSize,this._sideSize,0),Z(h,this._sideSize,this._sideSize,this._sideSize,0),Z(o,this._sideSize,this._sideSize,this._sideSize,0),Z(_,this._sideSize,this._sideSize,this._sideSize,0),Z(m,this._sideSize,this._sideSize,this._sideSize,0),Z(u,this._sideSize,this._sideSize,this._sideSize,0);for(let d=1;d<=this._maxSideIndex;++d,++c){p.shouldNotify(c)&&(yield{progress:p.progress}),K(t,this._sideSize,0),K(i,this._sideSize,0),K(e,this._sideSize,0),K(s,this._sideSize,0),K(a,this._sideSize,0),K(r,this._sideSize,0);for(let g=1;g<=this._maxSideIndex;++g){let y=0,k=0,z=0,b=0,R=0,N=0;for(let M=1;M<=this._maxSideIndex;++M)y+=this._weights[f][d][g][M],k+=this._momentsRed[f][d][g][M],z+=this._momentsGreen[f][d][g][M],b+=this._momentsBlue[f][d][g][M],R+=this._momentsAlpha[f][d][g][M],N+=this._moments[f][d][g][M],t[M]+=y,i[M]+=k,e[M]+=z,s[M]+=b,a[M]+=R,r[M]+=N,n[d][g][M]=n[d-1][g][M]+t[M],h[d][g][M]=h[d-1][g][M]+i[M],o[d][g][M]=o[d-1][g][M]+e[M],_[d][g][M]=_[d-1][g][M]+s[M],m[d][g][M]=m[d-1][g][M]+a[M],u[d][g][M]=u[d-1][g][M]+r[M],this._weights[f][d][g][M]=this._weights[f-1][d][g][M]+n[d][g][M],this._momentsRed[f][d][g][M]=this._momentsRed[f-1][d][g][M]+h[d][g][M],this._momentsGreen[f][d][g][M]=this._momentsGreen[f-1][d][g][M]+o[d][g][M],this._momentsBlue[f][d][g][M]=this._momentsBlue[f-1][d][g][M]+_[d][g][M],this._momentsAlpha[f][d][g][M]=this._momentsAlpha[f-1][d][g][M]+m[d][g][M],this._moments[f][d][g][M]=this._moments[f-1][d][g][M]+u[d][g][M]}}}}static _volumeFloat(t,i){return i[t.alphaMaximum][t.redMaximum][t.greenMaximum][t.blueMaximum]-i[t.alphaMaximum][t.redMaximum][t.greenMinimum][t.blueMaximum]-i[t.alphaMaximum][t.redMinimum][t.greenMaximum][t.blueMaximum]+i[t.alphaMaximum][t.redMinimum][t.greenMinimum][t.blueMaximum]-i[t.alphaMinimum][t.redMaximum][t.greenMaximum][t.blueMaximum]+i[t.alphaMinimum][t.redMaximum][t.greenMinimum][t.blueMaximum]+i[t.alphaMinimum][t.redMinimum][t.greenMaximum][t.blueMaximum]-i[t.alphaMinimum][t.redMinimum][t.greenMinimum][t.blueMaximum]-(i[t.alphaMaximum][t.redMaximum][t.greenMaximum][t.blueMinimum]-i[t.alphaMinimum][t.redMaximum][t.greenMaximum][t.blueMinimum]-i[t.alphaMaximum][t.redMaximum][t.greenMinimum][t.blueMinimum]+i[t.alphaMinimum][t.redMaximum][t.greenMinimum][t.blueMinimum]-i[t.alphaMaximum][t.redMinimum][t.greenMaximum][t.blueMinimum]+i[t.alphaMinimum][t.redMinimum][t.greenMaximum][t.blueMinimum]+i[t.alphaMaximum][t.redMinimum][t.greenMinimum][t.blueMinimum]-i[t.alphaMinimum][t.redMinimum][t.greenMinimum][t.blueMinimum])}static _volume(t,i){return x._volumeFloat(t,i)|0}static _top(t,i,e,s){let a;switch(i){case x._alpha:a=s[e][t.redMaximum][t.greenMaximum][t.blueMaximum]-s[e][t.redMaximum][t.greenMinimum][t.blueMaximum]-s[e][t.redMinimum][t.greenMaximum][t.blueMaximum]+s[e][t.redMinimum][t.greenMinimum][t.blueMaximum]-(s[e][t.redMaximum][t.greenMaximum][t.blueMinimum]-s[e][t.redMaximum][t.greenMinimum][t.blueMinimum]-s[e][t.redMinimum][t.greenMaximum][t.blueMinimum]+s[e][t.redMinimum][t.greenMinimum][t.blueMinimum]);break;case x._red:a=s[t.alphaMaximum][e][t.greenMaximum][t.blueMaximum]-s[t.alphaMaximum][e][t.greenMinimum][t.blueMaximum]-s[t.alphaMinimum][e][t.greenMaximum][t.blueMaximum]+s[t.alphaMinimum][e][t.greenMinimum][t.blueMaximum]-(s[t.alphaMaximum][e][t.greenMaximum][t.blueMinimum]-s[t.alphaMaximum][e][t.greenMinimum][t.blueMinimum]-s[t.alphaMinimum][e][t.greenMaximum][t.blueMinimum]+s[t.alphaMinimum][e][t.greenMinimum][t.blueMinimum]);break;case x._green:a=s[t.alphaMaximum][t.redMaximum][e][t.blueMaximum]-s[t.alphaMaximum][t.redMinimum][e][t.blueMaximum]-s[t.alphaMinimum][t.redMaximum][e][t.blueMaximum]+s[t.alphaMinimum][t.redMinimum][e][t.blueMaximum]-(s[t.alphaMaximum][t.redMaximum][e][t.blueMinimum]-s[t.alphaMaximum][t.redMinimum][e][t.blueMinimum]-s[t.alphaMinimum][t.redMaximum][e][t.blueMinimum]+s[t.alphaMinimum][t.redMinimum][e][t.blueMinimum]);break;case x._blue:a=s[t.alphaMaximum][t.redMaximum][t.greenMaximum][e]-s[t.alphaMaximum][t.redMaximum][t.greenMinimum][e]-s[t.alphaMaximum][t.redMinimum][t.greenMaximum][e]+s[t.alphaMaximum][t.redMinimum][t.greenMinimum][e]-(s[t.alphaMinimum][t.redMaximum][t.greenMaximum][e]-s[t.alphaMinimum][t.redMaximum][t.greenMinimum][e]-s[t.alphaMinimum][t.redMinimum][t.greenMaximum][e]+s[t.alphaMinimum][t.redMinimum][t.greenMinimum][e]);break;default:throw new Error("impossible")}return a|0}static _bottom(t,i,e){switch(i){case x._alpha:return-e[t.alphaMinimum][t.redMaximum][t.greenMaximum][t.blueMaximum]+e[t.alphaMinimum][t.redMaximum][t.greenMinimum][t.blueMaximum]+e[t.alphaMinimum][t.redMinimum][t.greenMaximum][t.blueMaximum]-e[t.alphaMinimum][t.redMinimum][t.greenMinimum][t.blueMaximum]-(-e[t.alphaMinimum][t.redMaximum][t.greenMaximum][t.blueMinimum]+e[t.alphaMinimum][t.redMaximum][t.greenMinimum][t.blueMinimum]+e[t.alphaMinimum][t.redMinimum][t.greenMaximum][t.blueMinimum]-e[t.alphaMinimum][t.redMinimum][t.greenMinimum][t.blueMinimum]);case x._red:return-e[t.alphaMaximum][t.redMinimum][t.greenMaximum][t.blueMaximum]+e[t.alphaMaximum][t.redMinimum][t.greenMinimum][t.blueMaximum]+e[t.alphaMinimum][t.redMinimum][t.greenMaximum][t.blueMaximum]-e[t.alphaMinimum][t.redMinimum][t.greenMinimum][t.blueMaximum]-(-e[t.alphaMaximum][t.redMinimum][t.greenMaximum][t.blueMinimum]+e[t.alphaMaximum][t.redMinimum][t.greenMinimum][t.blueMinimum]+e[t.alphaMinimum][t.redMinimum][t.greenMaximum][t.blueMinimum]-e[t.alphaMinimum][t.redMinimum][t.greenMinimum][t.blueMinimum]);case x._green:return-e[t.alphaMaximum][t.redMaximum][t.greenMinimum][t.blueMaximum]+e[t.alphaMaximum][t.redMinimum][t.greenMinimum][t.blueMaximum]+e[t.alphaMinimum][t.redMaximum][t.greenMinimum][t.blueMaximum]-e[t.alphaMinimum][t.redMinimum][t.greenMinimum][t.blueMaximum]-(-e[t.alphaMaximum][t.redMaximum][t.greenMinimum][t.blueMinimum]+e[t.alphaMaximum][t.redMinimum][t.greenMinimum][t.blueMinimum]+e[t.alphaMinimum][t.redMaximum][t.greenMinimum][t.blueMinimum]-e[t.alphaMinimum][t.redMinimum][t.greenMinimum][t.blueMinimum]);case x._blue:return-e[t.alphaMaximum][t.redMaximum][t.greenMaximum][t.blueMinimum]+e[t.alphaMaximum][t.redMaximum][t.greenMinimum][t.blueMinimum]+e[t.alphaMaximum][t.redMinimum][t.greenMaximum][t.blueMinimum]-e[t.alphaMaximum][t.redMinimum][t.greenMinimum][t.blueMinimum]-(-e[t.alphaMinimum][t.redMaximum][t.greenMaximum][t.blueMinimum]+e[t.alphaMinimum][t.redMaximum][t.greenMinimum][t.blueMinimum]+e[t.alphaMinimum][t.redMinimum][t.greenMaximum][t.blueMinimum]-e[t.alphaMinimum][t.redMinimum][t.greenMinimum][t.blueMinimum]);default:return 0}}_calculateVariance(t){let i=x._volume(t,this._momentsRed),e=x._volume(t,this._momentsGreen),s=x._volume(t,this._momentsBlue),a=x._volume(t,this._momentsAlpha),r=x._volumeFloat(t,this._moments),n=x._volume(t,this._weights),h=i*i+e*e+s*s+a*a;return r-h/n}_maximize(t,i,e,s,a,r,n,h,o){let _=x._bottom(t,i,this._momentsRed)|0,m=x._bottom(t,i,this._momentsGreen)|0,u=x._bottom(t,i,this._momentsBlue)|0,c=x._bottom(t,i,this._momentsAlpha)|0,p=x._bottom(t,i,this._weights)|0,f=0,d=-1;for(let g=e;g<s;++g){let y=_+x._top(t,i,g,this._momentsRed),k=m+x._top(t,i,g,this._momentsGreen),z=u+x._top(t,i,g,this._momentsBlue),b=c+x._top(t,i,g,this._momentsAlpha),R=p+x._top(t,i,g,this._weights);if(R!==0){let N=y*y+k*k+z*z+b*b,M=N/R;y=a-y,k=r-k,z=n-z,b=h-b,R=o-R,R!==0&&(N=y*y+k*k+z*z+b*b,M+=N/R,M>f&&(f=M,d=g))}}return{max:f,position:d}}_cut(t,i){let e,s=x._volume(t,this._momentsRed),a=x._volume(t,this._momentsGreen),r=x._volume(t,this._momentsBlue),n=x._volume(t,this._momentsAlpha),h=x._volume(t,this._weights),o=this._maximize(t,x._red,t.redMinimum+1,t.redMaximum,s,a,r,n,h),_=this._maximize(t,x._green,t.greenMinimum+1,t.greenMaximum,s,a,r,n,h),m=this._maximize(t,x._blue,t.blueMinimum+1,t.blueMaximum,s,a,r,n,h),u=this._maximize(t,x._alpha,t.alphaMinimum+1,t.alphaMaximum,s,a,r,n,h);if(u.max>=o.max&&u.max>=_.max&&u.max>=m.max){if(e=x._alpha,u.position<0)return!1}else o.max>=u.max&&o.max>=_.max&&o.max>=m.max?e=x._red:_.max>=u.max&&_.max>=o.max&&_.max>=m.max?e=x._green:e=x._blue;switch(i.redMaximum=t.redMaximum,i.greenMaximum=t.greenMaximum,i.blueMaximum=t.blueMaximum,i.alphaMaximum=t.alphaMaximum,e){case x._red:i.redMinimum=t.redMaximum=o.position,i.greenMinimum=t.greenMinimum,i.blueMinimum=t.blueMinimum,i.alphaMinimum=t.alphaMinimum;break;case x._green:i.greenMinimum=t.greenMaximum=_.position,i.redMinimum=t.redMinimum,i.blueMinimum=t.blueMinimum,i.alphaMinimum=t.alphaMinimum;break;case x._blue:i.blueMinimum=t.blueMaximum=m.position,i.redMinimum=t.redMinimum,i.greenMinimum=t.greenMinimum,i.alphaMinimum=t.alphaMinimum;break;case x._alpha:i.alphaMinimum=t.alphaMaximum=u.position,i.blueMinimum=t.blueMinimum,i.redMinimum=t.redMinimum,i.greenMinimum=t.greenMinimum;break}return t.volume=(t.redMaximum-t.redMinimum)*(t.greenMaximum-t.greenMinimum)*(t.blueMaximum-t.blueMinimum)*(t.alphaMaximum-t.alphaMinimum),i.volume=(i.redMaximum-i.redMinimum)*(i.greenMaximum-i.greenMinimum)*(i.blueMaximum-i.blueMinimum)*(i.alphaMaximum-i.alphaMinimum),!0}_initialize(t){this._colors=t,this._cubes=[];for(let i=0;i<t;i++)this._cubes[i]=new Yt;this._cubes[0].redMinimum=0,this._cubes[0].greenMinimum=0,this._cubes[0].blueMinimum=0,this._cubes[0].alphaMinimum=0,this._cubes[0].redMaximum=this._maxSideIndex,this._cubes[0].greenMaximum=this._maxSideIndex,this._cubes[0].blueMaximum=this._maxSideIndex,this._cubes[0].alphaMaximum=this._alphaMaxSideIndex,this._weights=$(this._alphaSideSize,this._sideSize,this._sideSize,this._sideSize),this._momentsRed=$(this._alphaSideSize,this._sideSize,this._sideSize,this._sideSize),this._momentsGreen=$(this._alphaSideSize,this._sideSize,this._sideSize,this._sideSize),this._momentsBlue=$(this._alphaSideSize,this._sideSize,this._sideSize,this._sideSize),this._momentsAlpha=$(this._alphaSideSize,this._sideSize,this._sideSize,this._sideSize),this._moments=$(this._alphaSideSize,this._sideSize,this._sideSize,this._sideSize),this._table=[];for(let i=0;i<256;++i)this._table[i]=i*i;this._pixels=[]}_setQuality(t=5){this._significantBitsPerChannel=t,this._maxSideIndex=1<<this._significantBitsPerChannel,this._alphaMaxSideIndex=this._maxSideIndex,this._sideSize=this._maxSideIndex+1,this._alphaSideSize=this._alphaMaxSideIndex+1}},V=x;l(V,"_alpha",3);l(V,"_red",2);l(V,"_green",1);l(V,"_blue",0);var Y={};L(Y,{AbstractImageQuantizer:()=>ct,ErrorDiffusionArray:()=>wi,ErrorDiffusionArrayKernel:()=>ti,ErrorDiffusionRiemersma:()=>ii,NearestColor:()=>xi});var ct=class{quantizeSync(t,i){for(let e of this.quantize(t,i))if(e.pointContainer)return e.pointContainer;throw new Error("unreachable")}},xi=class extends ct{constructor(t){super(),l(this,"_distance"),this._distance=t}*quantize(t,i){let e=t.getPointArray(),s=t.getWidth(),a=t.getHeight(),r=new T(a,99);for(let n=0;n<a;n++){r.shouldNotify(n)&&(yield{progress:r.progress});for(let h=0,o=n*s;h<s;h++,o++){let _=e[o];_.from(i.getNearestColor(this._distance,_))}}yield{pointContainer:t,progress:100}}},ti=(t=>(t[t.FloydSteinberg=0]="FloydSteinberg",t[t.FalseFloydSteinberg=1]="FalseFloydSteinberg",t[t.Stucki=2]="Stucki",t[t.Atkinson=3]="Atkinson",t[t.Jarvis=4]="Jarvis",t[t.Burkes=5]="Burkes",t[t.Sierra=6]="Sierra",t[t.TwoSierra=7]="TwoSierra",t[t.SierraLite=8]="SierraLite",t))(ti||{}),wi=class extends ct{constructor(t,i,e=!0,s=0,a=!1){super(),l(this,"_minColorDistance"),l(this,"_serpentine"),l(this,"_kernel"),l(this,"_calculateErrorLikeGIMP"),l(this,"_distance"),this._setKernel(i),this._distance=t,this._minColorDistance=s,this._serpentine=e,this._calculateErrorLikeGIMP=a}*quantize(t,i){let e=t.getPointArray(),s=new q,a=t.getWidth(),r=t.getHeight(),n=[],h=1,o=1;for(let m of this._kernel){let u=m[2]+1;o<u&&(o=u)}for(let m=0;m<o;m++)this._fillErrorLine(n[m]=[],a);let _=new T(r,99);for(let m=0;m<r;m++){_.shouldNotify(m)&&(yield{progress:_.progress}),this._serpentine&&(h*=-1);let u=m*a,c=h===1?0:a-1,p=h===1?a:-1;this._fillErrorLine(n[0],a),n.push(n.shift());let f=n[0];for(let d=c,g=u+c;d!==p;d+=h,g+=h){let y=e[g],k=f[d];s.from(y);let z=q.createByRGBA(D(y.r+k[0]),D(y.g+k[1]),D(y.b+k[2]),D(y.a+k[3])),b=i.getNearestColor(this._distance,z);if(y.from(b),this._minColorDistance&&this._distance.calculateNormalized(s,b)<this._minColorDistance)continue;let R,N,M,tt;this._calculateErrorLikeGIMP?(R=z.r-b.r,N=z.g-b.g,M=z.b-b.b,tt=z.a-b.a):(R=s.r-b.r,N=s.g-b.g,M=s.b-b.b,tt=s.a-b.a);let it=h===1?0:this._kernel.length-1,ot=h===1?this._kernel.length:-1;for(let W=it;W!==ot;W+=h){let et=this._kernel[W][1]*h,st=this._kernel[W][2];if(et+d>=0&&et+d<a&&st+m>=0&&st+m<r){let j=this._kernel[W][0],O=n[st][et+d];O[0]+=R*j,O[1]+=N*j,O[2]+=M*j,O[3]+=tt*j}}}}yield{pointContainer:t,progress:100}}_fillErrorLine(t,i){t.length>i&&(t.length=i);let e=t.length;for(let s=0;s<e;s++){let a=t[s];a[0]=a[1]=a[2]=a[3]=0}for(let s=e;s<i;s++)t[s]=[0,0,0,0]}_setKernel(t){switch(t){case 0:this._kernel=[[7/16,1,0],[3/16,-1,1],[5/16,0,1],[1/16,1,1]];break;case 1:this._kernel=[[3/8,1,0],[3/8,0,1],[2/8,1,1]];break;case 2:this._kernel=[[8/42,1,0],[4/42,2,0],[2/42,-2,1],[4/42,-1,1],[8/42,0,1],[4/42,1,1],[2/42,2,1],[1/42,-2,2],[2/42,-1,2],[4/42,0,2],[2/42,1,2],[1/42,2,2]];break;case 3:this._kernel=[[1/8,1,0],[1/8,2,0],[1/8,-1,1],[1/8,0,1],[1/8,1,1],[1/8,0,2]];break;case 4:this._kernel=[[7/48,1,0],[5/48,2,0],[3/48,-2,1],[5/48,-1,1],[7/48,0,1],[5/48,1,1],[3/48,2,1],[1/48,-2,2],[3/48,-1,2],[5/48,0,2],[3/48,1,2],[1/48,2,2]];break;case 5:this._kernel=[[8/32,1,0],[4/32,2,0],[2/32,-2,1],[4/32,-1,1],[8/32,0,1],[4/32,1,1],[2/32,2,1]];break;case 6:this._kernel=[[5/32,1,0],[3/32,2,0],[2/32,-2,1],[4/32,-1,1],[5/32,0,1],[4/32,1,1],[2/32,2,1],[2/32,-1,2],[3/32,0,2],[2/32,1,2]];break;case 7:this._kernel=[[4/16,1,0],[3/16,2,0],[1/16,-2,1],[2/16,-1,1],[3/16,0,1],[2/16,1,1],[1/16,2,1]];break;case 8:this._kernel=[[2/4,1,0],[1/4,-1,1],[1/4,0,1]];break;default:throw new Error(`ErrorDiffusionArray: unknown kernel = ${t}`)}}};function*Si(t,i,e){let s=Math.max(t,i),a=Math.floor(Math.log(s)/Math.log(2)+1),r=new T(t*i,99),n={width:t,height:i,level:a,callback:e,tracker:r,index:0,x:0,y:0};yield*P(n,1),C(n,0)}function*P(t,i){if(!(t.level<1)){switch(t.tracker.shouldNotify(t.index)&&(yield{progress:t.tracker.progress}),t.level--,i){case 2:yield*P(t,1),C(t,3),yield*P(t,2),C(t,4),yield*P(t,2),C(t,2),yield*P(t,4);break;case 3:yield*P(t,4),C(t,2),yield*P(t,3),C(t,1),yield*P(t,3),C(t,3),yield*P(t,1);break;case 1:yield*P(t,2),C(t,4),yield*P(t,1),C(t,3),yield*P(t,1),C(t,1),yield*P(t,3);break;case 4:yield*P(t,3),C(t,1),yield*P(t,4),C(t,2),yield*P(t,4),C(t,4),yield*P(t,2);break;default:break}t.level++}}function C(t,i){switch(t.x>=0&&t.x<t.width&&t.y>=0&&t.y<t.height&&(t.callback(t.x,t.y),t.index++),i){case 2:t.x--;break;case 3:t.x++;break;case 1:t.y--;break;case 4:t.y++;break}}var ii=class extends ct{constructor(t,i=16,e=1){super(),l(this,"_distance"),l(this,"_weights"),l(this,"_errorQueueSize"),this._distance=t,this._errorQueueSize=i,this._weights=ii._createWeights(e,i)}*quantize(t,i){let e=t.getPointArray(),s=t.getWidth(),a=t.getHeight(),r=[],n=0;for(let h=0;h<this._errorQueueSize;h++)r[h]={r:0,g:0,b:0,a:0};yield*Si(s,a,(h,o)=>{let _=e[h+o*s],{r:m,g:u,b:c,a:p}=_;for(let y=0;y<this._errorQueueSize;y++){let k=this._weights[y],z=r[(y+n)%this._errorQueueSize];m+=z.r*k,u+=z.g*k,c+=z.b*k,p+=z.a*k}let f=q.createByRGBA(D(m),D(u),D(c),D(p)),d=i.getNearestColor(this._distance,f);n=(n+1)%this._errorQueueSize;let g=(n+this._errorQueueSize-1)%this._errorQueueSize;r[g].r=_.r-d.r,r[g].g=_.g-d.g,r[g].b=_.b-d.b,r[g].a=_.a-d.a,_.from(d)}),yield{pointContainer:t,progress:100}}static _createWeights(t,i){let e=[],s=Math.exp(Math.log(i)/(i-1));for(let a=0,r=1;a<i;a++)e[a]=(r+.5|0)/i*t,r*=s;return e}},yi={};L(yi,{ssim:()=>Ai});var ki=.01,zi=.03;function Ai(t,i){if(t.getHeight()!==i.getHeight()||t.getWidth()!==i.getWidth())throw new Error("Images have different sizes!");let s=(1<<8)-1,a=(ki*s)**2,r=(zi*s)**2,n=0,h=0;return Bi(t,i,(o,_,m,u)=>{let c=0,p=0,f=0;for(let z=0;z<o.length;z++)p+=(o[z]-m)**2,f+=(_[z]-u)**2,c+=(o[z]-m)*(_[z]-u);let d=o.length-1;p/=d,f/=d,c/=d;let g=(2*m*u+a)*(2*c+r),y=(m**2+u**2+a)*(p+f+r),k=g/y;h+=k,n++}),h/n}function Bi(t,i,e){let a=t.getWidth(),r=t.getHeight();for(let n=0;n<r;n+=8)for(let h=0;h<a;h+=8){let o=Math.min(8,a-h),_=Math.min(8,r-n),m=At(t,h,n,o,_),u=At(i,h,n,o,_),c=Bt(m),p=Bt(u);e(m,u,c,p)}}function At(t,i,e,s,a){let r=t.getPointArray(),n=[],h=0;for(let o=e;o<e+a;o++){let _=o*t.getWidth();for(let m=i;m<i+s;m++){let u=r[_+m];n[h]=u.r*.2126+u.g*.7152+u.b*.0722,h++}}return n}function Bt(t){let i=0;for(let e of t)i+=e;return i/t.length}var Pi=typeof setImmediate=="function"?setImmediate:typeof process<"u"&&typeof(process==null?void 0:process.nextTick)=="function"?t=>process.nextTick(t):t=>setTimeout(t,0);function ei(t,{colorDistanceFormula:i,paletteQuantization:e,colors:s}={}){let a=vi(i),r=bi(a,e,s);return t.forEach(n=>r.sample(n)),r.quantizeSync()}function vi(t="euclidean-bt709"){switch(t){case"cie94-graphic-arts":return new Tt;case"cie94-textiles":return new Lt;case"ciede2000":return new H;case"color-metric":return new Wt;case"euclidean":return new Ut;case"euclidean-bt709":return new Ft;case"euclidean-bt709-noalpha":return new jt;case"manhattan":return new Ot;case"manhattan-bt709":return new $t;case"manhattan-nommyde":return new Xt;case"pngquant":return new Jt;default:throw new Error(`Unknown colorDistanceFormula ${t}`)}}function bi(t,i="wuquant",e=256){switch(i){case"neuquant":return new B(t,e);case"rgbquant":return new Vt(t,e);case"wuquant":return new V(t,e);case"neuquant-float":return new v(t,e);default:throw new Error(`Unknown paletteQuantization ${i}`)}}self.onmessage=({data:t})=>{try{let i=t.inputs.map(e=>{let s=St.PointContainer.fromUint8Array(new Uint8ClampedArray(e.pixels),e.size,e.size),a={colors:e.colors,paletteQuantization:"wuquant",colorDistanceFormula:"euclidean-bt709"},r=ei([s],a),n=new wt.EuclideanBT709,o=(t.strength===0?new Y.NearestColor(n):new Y.ErrorDiffusionArray(n,t.algorithm==="atkinson"?Y.ErrorDiffusionArrayKernel.Atkinson:Y.ErrorDiffusionArrayKernel.FloydSteinberg,!0,(1-t.strength)*.2)).quantizeSync(s,r).toUint8Array();return{size:e.size,pixels:o.buffer,palette:r.getPointContainer().getPointArray().map(_=>[_.r,_.g,_.b])}});self.postMessage({output:i},i.map(e=>e.pixels))}catch(i){self.postMessage({error:i.message})}};})();\n/*! Bundled license information:\n\nimage-q/dist/esm/image-q.mjs:\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * cie94.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * ciede2000.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * cmetric.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * common.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * constants.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * ditherErrorDiffusionArray.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * euclidean.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * helper.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * hueStatistics.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * iq.ts - Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * lab2rgb.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * lab2xyz.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * manhattanNeuQuant.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * nearestColor.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * palette.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * pngQuant.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * point.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * pointContainer.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * rgb2hsl.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * rgb2lab.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * rgb2xyz.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * ssim.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * wuQuant.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * xyz2lab.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * xyz2rgb.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve\n   * MIT License\n   *\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   *\n   * Permission is hereby granted, free of charge, to any person obtaining a copy\n   * of this software and associated documentation files (the "Software"), to\n   * deal in the Software without restriction, including without limitation the\n   * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or\n   * sell copies of the Software, and to permit persons to whom the Software is\n   * furnished to do so, subject to the following conditions:\n   *\n   * The above copyright notice and this permission notice shall be included in\n   * all copies or substantial portions of the Software.\n   *\n   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL\n   * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\n   * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS\n   * IN THE SOFTWARE.\n   *\n   * riemersma.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve TypeScript port:\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * colorHistogram.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve TypeScript port:\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * neuquant.ts - part of Image Quantization Library\n   *)\n  (**\n   * @preserve TypeScript port:\n   * Copyright 2015-2018 Igor Bezkrovnyi\n   * All rights reserved. (MIT Licensed)\n   *\n   * rgbquant.ts - part of Image Quantization Library\n   *)\n*/\n'], { type: "text/javascript" }));
      worker = new Worker(workerURL);
      worker.onerror = (e) => fail(e.message);
      worker.onmessage = ({ data }) => {
        if (data.error) {
          fail(data.error);
          return;
        }
        covers = data.output.map((o) => {
          const c = document.createElement("canvas");
          c.width = c.height = 96;
          c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(o.pixels), 96, 96), 0, 0);
          const ctx = c.getContext("2d");
          ctx.fillStyle = "rgba(9,11,22,.045)";
          for (let y = 2; y < 96; y += 3) ctx.fillRect(0, y, 96, 1);
          return c;
        });
        worker.terminate();
        worker = null;
        URL.revokeObjectURL(workerURL);
        workerURL = null;
        $("load-album").disabled = false;
        showDay();
      };
      worker.postMessage({ inputs, strength: 0.65, algorithm: "floyd" }, inputs.map((i) => i.pixels));
    } catch (e) {
      fail(e.message);
    }
  }
  function fail(message) {
    worker?.terminate();
    worker = null;
    if (workerURL) URL.revokeObjectURL(workerURL);
    workerURL = null;
    $("scene").setAttribute("aria-busy", "false");
    feedback(`\u5C01\u9762\u51C6\u5907\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\uFF1A${message}`);
  }
  prepare();
  var classic = mountClassicMac();
  window.macStageDevice = { inspect: () => ({ ...classic.inspect(), selected, current, dragging: !!gesture, inserting: !!insertion, playing }) };
  addEventListener("pagehide", () => {
    disposed = true;
    cancelGesture();
    cancelInsertion();
    tray.dispose();
    resizeObserver.disconnect();
    stage.dispose();
    worker?.terminate();
    if (workerURL) URL.revokeObjectURL(workerURL);
  }, { once: true });
})();
