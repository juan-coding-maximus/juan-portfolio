(() => {
  const $ = (id) => document.getElementById(id);
  const screens = {
    connect: $('screen-connect'),
    join: $('screen-join'),
    play: $('screen-play'),
    result: $('screen-result'),
  };
  function showScreen(name) {
    for (const s of Object.values(screens)) s.classList.remove('active');
    screens[name].classList.add('active');
    for (const el of document.querySelectorAll('.step')) {
      el.classList.toggle('active', el.dataset.step === name);
      el.classList.toggle('done', order.indexOf(el.dataset.step) < order.indexOf(name));
    }
  }
  const order = ['connect', 'join', 'play', 'result'];

  let ws = null;
  let audioCtx = null;
  let songBuffer = null;
  let songReady = false;

  let clockOffset = 0;
  let run = null; // { songId, songFile, title, artist, bpm, beatOffsetMs }
  let songStartAudioTime = 0;
  let beatIntervalSec = 0.6452;
  let totalBeats = 0;
  let isPlaying = false;
  let tapLog = [];
  let clickGainNode = null;
  let activeSource = null;

  function serverHost() {
    const params = new URLSearchParams(location.search);
    return params.get('server') || localStorage.getItem('stokeServer') || '';
  }

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

  async function loadSong(url) {
    songReady = false;
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    songBuffer = await audioCtx.decodeAudioData(buf);
    songReady = true;
  }

  function connectWS(host) {
    return new Promise((resolve, reject) => {
      const clean = host.replace(/^wss?:\/\//, '').replace(/\/$/, '');
      const url = `wss://${clean}`;
      ws = new WebSocket(url);
      const timeout = setTimeout(() => reject(new Error('Timed out, check the link')), 8000);
      ws.onopen = () => {
        clearTimeout(timeout);
        localStorage.setItem('stokeServer', clean);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Could not connect, check the link'));
      };
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
        if (received >= samples) {
          ws.removeEventListener('message', wrapped);
          clockOffset = best.offset;
          resolve();
        }
      };
      ws.addEventListener('message', wrapped);
      for (let i = 0; i < samples; i++) setTimeout(() => send({ type: 'ping', t0: Date.now() }), i * 100);
    });
  }

  function handleMessage(msg) {
    if (msg.type === 'welcome') {
      showScreen('play');
      screens.play.classList.remove('active');
      showScreen('join');
      $('joinSub').textContent = 'Connected. Pick a name and wait for the host.';
      return;
    }
    if (msg.type === 'join_rejected') {
      $('joinStatus').textContent = msg.reason;
      return;
    }
    if (msg.type === 'members') {
      return;
    }
    if (msg.type === 'start_at') {
      run = msg.run;
      beginCountdownAndPlay(msg.serverTime);
      return;
    }
    if (msg.type === 'reset') {
      isPlaying = false;
      tapLog = [];
      showScreen('join');
      return;
    }
  }

  function beginCountdownAndPlay(serverStartTime) {
    ensureAudioContext();
    beatIntervalSec = 60 / run.bpm;
    const beatOffsetSec = run.beatOffsetMs / 1000;

    showScreen('play');
    $('playSongLine').textContent = `${run.title} · ${run.artist} · ${run.bpm} BPM`;
    $('playStatus').textContent = 'Loading song...';
    $('lastTaps').textContent = '';
    tapLog = [];

    loadSong(run.songFile).then(() => {
      const estimatedLocalStartMs = serverStartTime - clockOffset;
      let delayMs = estimatedLocalStartMs - Date.now();
      if (delayMs < 50) delayMs = 50;
      const startAudioTime = audioCtx.currentTime + delayMs / 1000;
      schedulePlayback(startAudioTime, beatOffsetSec);
      $('playStatus').textContent = 'Starting...';
      setTimeout(() => {
        isPlaying = true;
        $('playStatus').textContent = 'Tap on the beat';
        startPulse(beatOffsetSec);
      }, delayMs);
    });
  }

  function schedulePlayback(startTime, beatOffsetSec) {
    songStartAudioTime = startTime;
    totalBeats = Math.floor((songBuffer.duration - beatOffsetSec) / beatIntervalSec) + 1;
    const source = audioCtx.createBufferSource();
    source.buffer = songBuffer;
    source.connect(audioCtx.destination);
    source.start(startTime);
    source.onended = onSongEnded;
    activeSource = source;
    for (let n = 0; n < totalBeats; n++) {
      scheduleClick(startTime + beatOffsetSec + n * beatIntervalSec, n % 4 === 0);
    }
  }

  function scheduleClick(time, accent) {
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? 1500 : 1000;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(1, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(g).connect(clickGainNode);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  function startPulse(beatOffsetSec) {
    function frame() {
      if (!isPlaying) return;
      const t = audioCtx.currentTime - songStartAudioTime - beatOffsetSec;
      const phase = ((t % beatIntervalSec) + beatIntervalSec) % beatIntervalSec;
      const intensity = t < 0 ? 0.15 : Math.max(0.15, 1 - phase / (beatIntervalSec * 0.5));
      $('beatPulse').style.opacity = intensity.toFixed(2);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function audioTimeForEvent(e) {
    const ts = audioCtx.getOutputTimestamp();
    return ts.contextTime + (e.timeStamp - ts.performanceTime) / 1000;
  }

  function onTap(e) {
    e.preventDefault();
    if (!isPlaying) return;
    const audioNow = audioTimeForEvent(e);
    const beatOffsetSec = run.beatOffsetMs / 1000;
    const rel = audioNow - songStartAudioTime - beatOffsetSec;
    let n = Math.round(rel / beatIntervalSec);
    if (n < 0) n = 0;
    if (n > totalBeats - 1) n = totalBeats - 1;
    const deltaMs = (rel - n * beatIntervalSec) * 1000;
    tapLog.push({ n, deltaMs });
    const c = SCORING.classify(deltaMs);
    const sign = deltaMs >= 0 ? '+' : '';
    $('lastTaps').textContent = `${sign}${deltaMs.toFixed(0)} ms · ${c.label}`;
    $('lastTaps').style.color = c.color;
  }

  function onSongEnded() {
    isPlaying = false;
    computeAndSendResults();
  }

  function computeAndSendResults() {
    const n = tapLog.length;
    const meanMs = n ? tapLog.reduce((a, t) => a + t.deltaMs, 0) / n : 0;
    const meanAbsMs = n ? tapLog.reduce((a, t) => a + Math.abs(t.deltaMs), 0) / n : 0;
    const variance = n ? tapLog.reduce((a, t) => a + (t.deltaMs - meanMs) ** 2, 0) / n : 0;
    const stdMs = Math.sqrt(variance);
    const uniqueBeats = new Set(tapLog.map((t) => t.n)).size;
    const summary = SCORING.summarize(tapLog);

    const stats = { meanMs, meanAbsMs, stdMs, count: n, totalBeats, missed: Math.max(0, totalBeats - uniqueBeats) };
    showScreen('result');
    $('myStats').innerHTML = `
      <div>Average offset: <strong>${meanMs >= 0 ? '+' : ''}${meanMs.toFixed(0)} ms</strong></div>
      <div>Beats tapped: <strong>${uniqueBeats} / ${totalBeats}</strong></div>
      <div class="legendRow"><span style="color:${SCORING.COLORS.perfect}">Perfect ${summary.counts.perfect}</span>
      <span style="color:${SCORING.COLORS.okay}">Okay ${summary.counts.okay}</span>
      <span style="color:${SCORING.COLORS.dragging}">Off ${summary.counts.rushing + summary.counts.dragging}</span></div>
    `;
    $('resultStatus').textContent = 'Sent. See the full board on the host screen.';
    send({ type: 'result', stats, taps: tapLog });
  }

  // --- wiring ---
  $('connectBtn').addEventListener('click', async () => {
    const host = $('serverInput').value.trim();
    if (!host) {
      $('connectStatus').textContent = 'Paste the session link first.';
      return;
    }
    $('connectStatus').textContent = 'Connecting...';
    try {
      await connectWS(host);
      showScreen('join');
    } catch (e) {
      $('connectStatus').textContent = e.message;
    }
  });

  $('joinBtn').addEventListener('click', () => {
    const name = $('nameInput').value.trim();
    if (!name) {
      $('joinStatus').textContent = 'Enter your name first.';
      return;
    }
    ensureAudioContext();
    send({ type: 'join', name });
  });

  $('tapBtn').addEventListener('pointerdown', onTap);
  $('reloadBtn').addEventListener('click', () => location.reload());
  document.querySelectorAll('.step').forEach((el) => {
    el.addEventListener('click', () => showScreen(el.dataset.step));
  });

  // auto-connect if a server link was shared via QR/URL
  const auto = serverHost();
  if (auto) {
    $('serverInput').value = auto;
    $('connectStatus').textContent = 'Connecting...';
    connectWS(auto)
      .then(() => showScreen('join'))
      .catch((e) => { $('connectStatus').textContent = e.message; });
  }
})();
