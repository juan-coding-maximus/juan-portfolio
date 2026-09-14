(() => {
  const $ = (id) => document.getElementById(id);
  const order = ['connect', 'setup', 'live', 'analyze'];
  const screens = {
    connect: $('screen-connect'),
    setup: $('screen-setup'),
    live: $('screen-live'),
    analyze: $('screen-analyze'),
  };
  function showScreen(name) {
    for (const s of Object.values(screens)) s.classList.remove('active');
    screens[name].classList.add('active');
    for (const el of document.querySelectorAll('.step')) {
      el.classList.toggle('active', el.dataset.step === name);
      el.classList.toggle('done', order.indexOf(el.dataset.step) < order.indexOf(name));
    }
  }

  const PX_PER_SEC = 60;

  let ws = null;
  let audioCtx = null;
  let clickGainNode = null;
  let clockOffset = 0;
  let songs = [];
  let songCache = new Map(); // songId -> AudioBuffer
  let lastRun = null;
  let lastResults = null;
  let liveActiveSource = null;
  let isReplaying = false;

  const PLAYER_URL_BASE = 'https://juanarenas.bio/stoke';

  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      clickGainNode = audioCtx.createGain();
      clickGainNode.gain.value = 0.7;
      clickGainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function loadSong(song) {
    if (songCache.has(song.id)) return songCache.get(song.id);
    const p = fetch(song.file)
      .then((r) => r.arrayBuffer())
      .then((buf) => ensureAudioContext().decodeAudioData(buf));
    songCache.set(song.id, p);
    return p;
  }

  function connectWS(host) {
    return new Promise((resolve, reject) => {
      const clean = host.replace(/^wss?:\/\//, '').replace(/\/$/, '');
      ws = new WebSocket(`wss://${clean}`);
      const timeout = setTimeout(() => reject(new Error('Timed out, check the link')), 8000);
      ws.onopen = () => {
        clearTimeout(timeout);
        localStorage.setItem('stokeServer', clean);
        ws.send(JSON.stringify({ type: 'join_host' }));
        resolve(clean);
      };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('Could not connect, check the link')); };
      ws.onclose = () => {
        const el = document.querySelector('.screen.active .status');
        if (el) el.textContent = 'Disconnected. Use the reload button (top right).';
      };
      ws.onmessage = (evt) => handleMessage(JSON.parse(evt.data));
    });
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function syncClock(samples = 6) {
    let best = null, received = 0;
    return new Promise((resolve) => {
      const wrapped = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type !== 'pong') return;
        const t3 = Date.now();
        const rtt = t3 - msg.t0 - (msg.t2 - msg.t1);
        const offset = (msg.t1 - msg.t0 + (msg.t2 - t3)) / 2;
        if (!best || rtt < best.rtt) best = { rtt, offset };
        received++;
        if (received >= samples) { ws.removeEventListener('message', wrapped); clockOffset = best.offset; resolve(); }
      };
      ws.addEventListener('message', wrapped);
      for (let i = 0; i < samples; i++) setTimeout(() => send({ type: 'ping', t0: Date.now() }), i * 100);
    });
  }

  function handleMessage(msg) {
    if (msg.type === 'welcome_host') {
      songs = msg.songs;
      populateSongs();
      syncClock();
      buildJoinQr();
      showScreen('setup');
      return;
    }
    if (msg.type === 'members') {
      renderMembers(msg.members);
      return;
    }
    if (msg.type === 'start_at') {
      lastRun = msg.run;
      beginLive(msg.serverTime);
      return;
    }
    if (msg.type === 'run_complete') {
      lastRun = msg.run;
      lastResults = msg.results;
      renderAnalysis();
      return;
    }
    if (msg.type === 'reset') {
      showScreen('setup');
      return;
    }
  }

  function populateSongs() {
    const sel = $('songSelect');
    sel.innerHTML = songs.map((s) => `<option value="${s.id}">${s.title} — ${s.artist}</option>`).join('');
    applySongDefaults();
    sel.addEventListener('change', applySongDefaults);
  }

  function applySongDefaults() {
    const song = songs.find((s) => s.id === $('songSelect').value) || songs[0];
    $('bpmInput').value = song.bpm;
    $('offsetInput').value = song.beatOffsetMs;
    loadSong(song);
    $('startBtn').disabled = false;
  }

  function buildJoinQr() {
    const url = `${PLAYER_URL_BASE}?server=${encodeURIComponent(localStorage.getItem('stokeServer'))}`;
    $('qrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(url)}`;
    $('joinLink').textContent = url;
  }

  function renderMembers(members) {
    const html = members.map((m) => `<li><span>${m.name}</span><span class="badge">${m.hasResult ? 'done' : 'joined'}</span></li>`).join('');
    $('memberList').innerHTML = html || '<li class="empty">Waiting for phones to join…</li>';
    $('liveMemberList').innerHTML = html;
  }

  function scheduleClick(time, accent, gainNode, freq) {
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq || (accent ? 1500 : 1000);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(1, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(g).connect(gainNode);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  function beginLive(serverStartTime) {
    showScreen('live');
    $('liveTitle').textContent = `${lastRun.title} · ${lastRun.bpm} BPM`;
    $('liveSub').textContent = 'Running… results appear here when everyone finishes.';

    if (!$('playHereCheck').checked) return;
    ensureAudioContext();
    const song = songs.find((s) => s.id === lastRun.songId);
    loadSong(song).then((buffer) => {
      const estimatedLocalStartMs = serverStartTime - clockOffset;
      let delayMs = estimatedLocalStartMs - Date.now();
      if (delayMs < 50) delayMs = 50;
      const startTime = audioCtx.currentTime + delayMs / 1000;
      const beatOffsetSec = lastRun.beatOffsetMs / 1000;
      const beatIntervalSec = 60 / lastRun.bpm;
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(startTime);
      liveActiveSource = source;
      const totalBeats = Math.floor((buffer.duration - beatOffsetSec) / beatIntervalSec) + 1;
      for (let n = 0; n < totalBeats; n++) scheduleClick(startTime + beatOffsetSec + n * beatIntervalSec, n % 4 === 0, clickGainNode);

      function pulse() {
        if (screens.live.classList.contains('active') !== true) return;
        const t = audioCtx.currentTime - startTime - beatOffsetSec;
        const phase = ((t % beatIntervalSec) + beatIntervalSec) % beatIntervalSec;
        const intensity = t < 0 ? 0.15 : Math.max(0.15, 1 - phase / (beatIntervalSec * 0.5));
        $('beatPulse').style.opacity = intensity.toFixed(2);
        requestAnimationFrame(pulse);
      }
      requestAnimationFrame(pulse);
    });
  }

  function formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderAnalysis() {
    showScreen('analyze');
    $('analyzeTitle').textContent = `${lastRun.title} — results`;

    const allTaps = lastResults.flatMap((r) => r.taps);
    const summary = SCORING.summarize(allTaps);
    const tile = (color, count, label, pct) =>
      `<div class="tile" style="border-color:${color}66"><b style="color:${color}">${count}</b><span>${label}</span><small>${pct.toFixed(0)}%</small></div>`;
    $('summaryRow').innerHTML = `
      ${tile(SCORING.COLORS.perfect, summary.counts.perfect, 'Perfect', summary.pct.perfect)}
      ${tile(SCORING.COLORS.good, summary.counts.good, 'Good', summary.pct.good)}
      ${tile(SCORING.COLORS.okay, summary.counts.okay, 'Okay', summary.pct.okay)}
      ${tile(SCORING.COLORS.rushing, summary.counts.rushing, 'Rushing', summary.pct.rushing)}
      ${tile(SCORING.COLORS.dragging, summary.counts.dragging, 'Dragging', summary.pct.dragging)}
    `;

    const body = $('memberTableBody');
    body.innerHTML = '';
    const ranked = [...lastResults].sort((a, b) => a.stats.meanAbsMs - b.stats.meanAbsMs);
    ranked.forEach((r) => {
      const s = SCORING.summarize(r.taps);
      const goodPct = s.pct.perfect + s.pct.good;
      const sign = r.stats.meanMs >= 0 ? '+' : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.name}</td><td>${sign}${r.stats.meanMs.toFixed(0)} ms</td><td>${r.stats.stdMs.toFixed(0)} ms</td><td>${goodPct.toFixed(0)}%</td>`;
      body.appendChild(tr);
    });

    const song = songs.find((s) => s.id === lastRun.songId);
    loadSong(song).then((buffer) => drawTracks(buffer));
  }

  function drawTracks(buffer) {
    const beatOffsetSec = lastRun.beatOffsetMs / 1000;
    const width = Math.ceil(buffer.duration * PX_PER_SEC);
    const height = 90;
    const canvas = $('waveCanvas');
    canvas.width = width;
    canvas.height = height;
    $('trackInner').style.width = width + 'px';

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    const data = buffer.getChannelData(0);
    const samplesPerPixel = data.length / width;
    ctx.strokeStyle = '#666';
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const start = Math.floor(x * samplesPerPixel);
      const end = Math.max(start + 1, Math.floor((x + 1) * samplesPerPixel));
      let min = 1, max = -1;
      for (let i = start; i < end; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (min > max) { min = 0; max = 0; }
      ctx.moveTo(x + 0.5, (1 - (max + 1) / 2) * height);
      ctx.lineTo(x + 0.5, (1 - (min + 1) / 2) * height);
    }
    ctx.stroke();
    for (let t = 0; t <= buffer.duration; t += 10) {
      const x = t * PX_PER_SEC;
      ctx.strokeStyle = t % 30 === 0 ? '#3a3a3a' : '#1c1c1c';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const rowsEl = $('memberRows');
    rowsEl.innerHTML = '';
    rowsEl.style.width = width + 'px';
    const beatIntervalSec = 60 / lastRun.bpm;
    for (const r of lastResults) {
      const row = document.createElement('div');
      row.className = 'track-row';
      row.style.width = width + 'px';
      const label = document.createElement('span');
      label.className = 'track-label';
      label.textContent = r.name;
      row.appendChild(label);
      for (const t of r.taps) {
        const time = beatOffsetSec + t.n * beatIntervalSec + t.deltaMs / 1000;
        const c = SCORING.classify(t.deltaMs);
        const tick = document.createElement('div');
        tick.className = 'tick';
        tick.style.left = (time * PX_PER_SEC) + 'px';
        tick.style.background = c.color;
        tick.title = `${r.name} beat ${t.n + 1}: ${t.deltaMs.toFixed(0)}ms (${c.label})`;
        row.appendChild(tick);
      }
      rowsEl.appendChild(row);
    }
  }

  function scheduleTone(time, freq, gainLevel, decay, dest) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gainLevel, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + decay + 0.01);
  }

  function replay() {
    if (!lastRun || !lastResults) return;
    ensureAudioContext();
    const song = songs.find((s) => s.id === lastRun.songId);
    loadSong(song).then((buffer) => {
      const startTime = audioCtx.currentTime + 0.3;
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(startTime);

      const beatOffsetSec = lastRun.beatOffsetMs / 1000;
      const beatIntervalSec = 60 / lastRun.bpm;
      if ($('includeClickCheck').checked) {
        const totalBeats = Math.floor((buffer.duration - beatOffsetSec) / beatIntervalSec) + 1;
        for (let n = 0; n < totalBeats; n++) {
          scheduleTone(startTime + beatOffsetSec + n * beatIntervalSec, 900, 0.25, 0.03, audioCtx.destination);
        }
      }
      lastResults.forEach((r, idx) => {
        const freq = 1100 + idx * 260;
        r.taps.forEach((t) => {
          const time = beatOffsetSec + t.n * beatIntervalSec + t.deltaMs / 1000;
          scheduleTone(startTime + time, freq, 0.5, 0.05, audioCtx.destination);
        });
      });

      isReplaying = true;
      $('replayStatus').textContent = 'Replaying…';
      const scrollEl = $('trackScroll');
      const playhead = $('playhead');
      function frame() {
        if (!isReplaying) return;
        const elapsed = audioCtx.currentTime - startTime;
        if (elapsed > buffer.duration) {
          isReplaying = false;
          $('replayStatus').textContent = 'Done';
          return;
        }
        const x = Math.max(0, elapsed) * PX_PER_SEC;
        playhead.style.transform = `translateX(${x}px)`;
        scrollEl.scrollLeft = Math.max(0, x - scrollEl.clientWidth / 2);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      source.onended = () => { isReplaying = false; };
    });
  }

  // --- wiring ---
  $('connectBtn').addEventListener('click', async () => {
    const host = $('serverInput').value.trim();
    if (!host) { $('connectStatus').textContent = 'Paste the session link first.'; return; }
    $('connectStatus').textContent = 'Connecting...';
    try {
      await connectWS(host);
    } catch (e) {
      $('connectStatus').textContent = e.message;
    }
  });

  $('testClickBtn').addEventListener('click', () => {
    ensureAudioContext();
    scheduleClick(audioCtx.currentTime + 0.05, true, clickGainNode);
  });

  $('startBtn').addEventListener('click', () => {
    send({ type: 'start_request', songId: $('songSelect').value, bpm: parseFloat($('bpmInput').value), beatOffsetMs: parseFloat($('offsetInput').value) });
  });

  $('replayBtn').addEventListener('click', replay);
  $('againBtn').addEventListener('click', () => send({ type: 'reset' }));
  $('reloadBtn').addEventListener('click', () => location.reload());

  const autoHost = new URLSearchParams(location.search).get('server') || localStorage.getItem('stokeServer');
  if (autoHost) {
    $('serverInput').value = autoHost;
    $('connectStatus').textContent = 'Connecting...';
    connectWS(autoHost).catch((e) => { $('connectStatus').textContent = e.message; });
  }
})();
