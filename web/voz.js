// Accesibilidad por voz para personas invidentes (web): control por voz y lectura en audio de las incidencias de una estación.
// Usa las funciones de voz del propio navegador (Web Speech API): la síntesis de voz funciona en todos los navegadores modernos;
// el reconocimiento de voz, en Chrome, Edge y Safari (en Chrome y Edge el audio lo procesa el servicio de voz del navegador,
// no Andén, que solo recibe el texto). Todo está desactivado hasta que el usuario lo enciende.
(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const KEY = 'anden_voz';

  // ───────── Preferencias ─────────
  const prefs = { control: false, audio: false, seen: false };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* sin almacenamiento: valen los valores por defecto */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) { /* no pasa nada */ } };

  const $v = (s) => document.querySelector(s);
  const esc2 = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ───────── Lectura en voz alta ─────────
  let voice = null;
  function pickVoice() {
    if (!synth) return;
    const list = synth.getVoices();
    voice = list.find((v) => /^es[-_]ES/i.test(v.lang)) || list.find((v) => /^es/i.test(v.lang)) || null;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

  function chunks(text) {
    // Los motores de voz de algunos navegadores se cortan con textos largos: se leen por frases agrupadas
    const out = []; let cur = '';
    for (const s of text.split(/(?<=[.!?])\s+/)) {
      if ((cur + ' ' + s).length > 220 && cur) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
    }
    if (cur) out.push(cur);
    return out;
  }

  /** Lee el texto (cortando lo que se estuviera leyendo). onDone se llama al terminar o si no hay voz. */
  function speak(text, onDone) {
    if (!synth) { if (onDone) onDone(); return; }
    synth.cancel();
    const parts = chunks(text);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = 'es-ES'; u.rate = 0.97;
      if (voice) u.voice = voice;
      if (i === parts.length - 1 && onDone) { u.onend = onDone; u.onerror = onDone; }
      synth.speak(u);
    });
  }
  const stopSpeaking = () => { if (synth) synth.cancel(); };

  // ───────── Reconocer qué estación se ha pedido (misma lógica que la app Android) ─────────
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const FILLER = new Set(['estacion', 'estaciones', 'de', 'la', 'el', 'los', 'las', 'del', 'en', 'a', 'al', 'quiero', 'ir', 'abre', 'abrir', 'abreme', 'dime',
    'pon', 'ponme', 'muestrame', 'mostrar', 'informacion', 'sobre', 'info', 'parada', 'cercanias', 'tren', 'trenes', 'por', 'favor', 'que', 'como', 'esta']);
  function lev(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function matchStation(phrases, stations) {
    if (!stations.length) return null;
    const prepared = stations.map((s) => { const n = norm(s.name); return { s, n, nt: n.split(' ').filter(Boolean) }; });
    let best = null, bestScore = 0;
    phrases.forEach((phrase, idx) => {
      const q = norm(phrase);
      const qt = q.split(' ').filter((w) => w && !FILLER.has(w));
      if (!qt.length) return;
      const qj = qt.join(' '), bonus = idx === 0 ? 3 : 0;
      for (const { s, n, nt } of prepared) {
        const extras = Math.max(0, nt.length - qt.length);
        let score;
        if (n === q || n === qj) score = 100;
        else if (qt.every((w) => nt.includes(w))) score = 80 - extras * 2;
        else if (n.includes(qj)) score = 62 - extras;
        else {
          let dist = 0;
          const ok = qt.every((w) => { const d = Math.min(...nt.map((x) => lev(w, x)), 99); dist += d; return d <= Math.max(1, Math.floor(w.length / 4)); });
          score = ok ? 50 - dist * 3 - extras : 0;
        }
        if (score > 0 && score + bonus > bestScore) { bestScore = score + bonus; best = s; }
      }
    });
    return bestScore >= 40 ? best : null;
  }

  // ───────── Lo que se lee al abrir una estación ─────────
  const plural = (n, one, many) => (n === 1 ? n + ' ' + one : n + ' ' + many);
  function clean(raw, max = 260) {
    let t = String(raw ?? '').replace(/https?:\/\/\S+/g, ' ').replace(/#\w+/g, ' ').replace(/#/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length > max) {
      let cut = t.lastIndexOf('.', max); if (cut < 80) cut = t.lastIndexOf(' ', max); if (cut <= 0) cut = max;
      t = t.slice(0, cut).replace(/[,; ]+$/, '') + '.';
    }
    // Siempre acaba en punto: así la voz hace una pausa antes de la frase siguiente
    return /[.!?]$/.test(t) ? t : t + '.';
  }
  const LEAD = { strike: 'Huelga: ', works: 'Obras o mantenimiento: ', bus: 'Servicio de autobuses: ', disruption: 'Incidencia: ', accessibility: 'Accesibilidad: ', other: 'Aviso: ' };
  const PRIO = { disruption: 0, strike: 1, bus: 2, works: 3 };

  function summary(station, board, alerts, nowEpoch) {
    const parts = ['Estación de ' + station.name + '.'];
    const acc = board.accessibility ?? {};
    if (acc.stationInaccessible || acc.elevatorsOut || acc.escalatorsOut || acc.otherOut) {
      const bits = [];
      if (acc.stationInaccessible) bits.push('la estación está inaccesible para personas con movilidad reducida');
      if (acc.elevatorsOut) bits.push(plural(acc.elevatorsOut, 'ascensor fuera de servicio', 'ascensores fuera de servicio'));
      if (acc.escalatorsOut) bits.push(plural(acc.escalatorsOut, 'escalera mecánica fuera de servicio', 'escaleras mecánicas fuera de servicio'));
      if (acc.otherOut) bits.push(plural(acc.otherOut, 'otro elemento de accesibilidad averiado', 'otros elementos de accesibilidad averiados'));
      parts.push('Atención, accesibilidad: ' + bits.join(', ') + '.');
      (board.alerts ?? []).filter((a) => a.category === 'accessibility').slice(0, 2).forEach((a) => parts.push(clean(a.text, 220)));
    } else parts.push('No constan avisos de ascensores o escaleras averiados.');

    const lines = new Set([...(board.departures ?? []), ...(board.arrivals ?? [])].map((r) => r.line).filter(Boolean));
    const stationNorm = norm(station.name), seen = new Set(), spoken = [];
    const add = (cat, text) => {
      const k = norm(text).slice(0, 80); if (seen.has(k)) return; seen.add(k);
      spoken.push([PRIO[cat] ?? 4, (LEAD[cat] ?? LEAD.other) + clean(text)]);
    };
    (board.alerts ?? []).filter((a) => a.category !== 'accessibility').forEach((a) => add(a.category, a.text));
    const region = station.region;
    (alerts ?? []).filter((a) => a.active !== false && a.category !== 'accessibility' && (a.severity !== 'info' || a.category !== 'other') &&
      (!region || !(a.regions ?? []).length || a.regions.includes(region)) &&
      ((a.lines ?? []).some((l) => lines.has(l)) || (a.stationNames ?? []).some((nm) => { const n = norm(nm); return n && (stationNorm.includes(n) || n.includes(stationNorm)); })))
      .forEach((a) => add(a.category, a.text));
    const ordered = spoken.sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    if (!ordered.length) parts.push('No hay otros avisos de huelgas, obras, autobuses o incidencias para esta estación.');
    else {
      parts.push(plural(ordered.length, 'aviso que puede afectar a esta estación.', 'avisos que pueden afectar a esta estación.'));
      ordered.slice(0, 5).forEach((t) => parts.push(t));
      if (ordered.length > 5) parts.push('Hay ' + (ordered.length - 5) + ' avisos más en la pestaña Avisos.');
    }

    const upcoming = (board.departures ?? []).filter((r) => !r.expectedEpoch || r.expectedEpoch >= nowEpoch - 120).slice(0, 10);
    if (!upcoming.length) parts.push(board.scheduleReady === false ? 'Los horarios de esta estación se están cargando.' : 'No hay salidas publicadas para esta estación ahora mismo.');
    else {
      const f = upcoming[0];
      const state = f.status === 'cancelled' ? ', cancelado' : (f.delayMin ?? 0) >= 5 ? ', con ' + plural(f.delayMin, 'minuto', 'minutos') + ' de retraso' : ', a su hora';
      parts.push('Próxima salida: ' + (f.line ? 'línea ' + f.line : 'tren') + (f.otherEnd ? ' con destino ' + f.otherEnd : '') + ', a las ' + f.expectedTime + state + '.');
      const cancelled = upcoming.filter((r) => r.status === 'cancelled').length;
      const late = upcoming.filter((r) => r.status !== 'cancelled' && (r.delayMin ?? 0) >= 5);
      if (!cancelled && !late.length) parts.push('Las próximas ' + upcoming.length + ' salidas no tienen retrasos importantes.');
      else {
        const bits = [];
        if (cancelled) bits.push(plural(cancelled, 'cancelada', 'canceladas'));
        if (late.length) bits.push(late.length + ' con retraso de 5 minutos o más, el mayor de ' + Math.max(...late.map((r) => r.delayMin ?? 0)) + ' minutos');
        parts.push('De las próximas ' + upcoming.length + ' salidas: ' + bits.join(', ') + '.');
      }
    }
    parts.push('Información orientativa: consulta siempre los avisos del operador.');
    return parts.join(' ');
  }

  // ───────── Interfaz ─────────
  const live = document.createElement('div');
  live.id = 'voz-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.className = 'sr-only';
  document.body.appendChild(live);
  let liveTimer = null;
  const say = (msg) => { live.textContent = ''; clearTimeout(liveTimer); liveTimer = setTimeout(() => (live.textContent = msg), 50); };

  const TUTORIAL = [
    'Andén te lee en voz alta las incidencias de una estación: ascensores y escaleras averiados, retrasos, obras y mantenimiento, huelgas y autobuses sustitutorios.',
    'Para activarlo, enciende Control por voz e Información por audio en este panel, o pulsa Activar ahora.',
    'Con el control por voz activado aparece un botón grande de micrófono en la esquina inferior derecha. Púlsalo, o pulsa la tecla V, y di el nombre de la estación, por ejemplo: Atocha, o Sants.',
    'La web abre la estación y te lee la información. En la ficha de la estación, el botón Escuchar la repite.',
    'Puedes volver a abrir este panel con el botón Voz de la cabecera.',
  ];

  const mic = document.createElement('button');
  mic.id = 'voz-mic'; mic.type = 'button'; mic.hidden = true;
  mic.setAttribute('aria-label', 'Pedir una estación por voz. Pulsa y di el nombre de la estación.'); mic.setAttribute('aria-keyshortcuts', 'V');
  mic.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12z"/></svg>';
  document.body.appendChild(mic);

  const btn = document.createElement('button');
  btn.id = 'voz-btn'; btn.type = 'button'; btn.className = 'voz-open';
  btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-label', 'Voz para personas invidentes: abrir ajustes de voz y tutorial');
  btn.innerHTML = '🎙️ <span>Voz</span>';
  const hdr = $v('.hdr-r');
  if (hdr) hdr.insertBefore(btn, hdr.firstChild);

  const panel = document.createElement('div');
  panel.id = 'voz-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'voz-title');
  document.body.appendChild(panel);

  function renderPanel(first) {
    const srOk = !!SR, ttsOk = !!synth;
    panel.innerHTML =
      '<div class="voz-box"><h2 id="voz-title">Voz para personas invidentes</h2>' +
      '<ol>' + TUTORIAL.map((t) => '<li>' + esc2(t) + '</li>').join('') + '</ol>' +
      '<label class="voz-sw"><input type="checkbox" role="switch" id="voz-c"' + (prefs.control ? ' checked' : '') + (srOk ? '' : ' disabled') + '> <span><b>Control por voz</b><small>' +
        (srOk ? 'Aparece un botón de micrófono: di el nombre de una estación y la web la abre.' : 'Tu navegador no admite el reconocimiento de voz. Usa Chrome, Edge o Safari.') + '</small></span></label>' +
      '<label class="voz-sw"><input type="checkbox" role="switch" id="voz-a"' + (prefs.audio ? ' checked' : '') + (ttsOk ? '' : ' disabled') + '> <span><b>Información por audio</b><small>' +
        (ttsOk ? 'Al abrir una estación, la web lee en voz alta ascensores averiados, retrasos, obras, huelgas y autobuses.' : 'Tu navegador no admite la lectura en voz alta.') + '</small></span></label>' +
      '<p class="voz-note">El reconocimiento de voz lo hace tu navegador (en Chrome y Edge, mediante el servicio de voz de Google o Microsoft): Andén solo recibe el texto de lo que dices y no guarda tu voz. El navegador te pedirá permiso para usar el micrófono.</p>' +
      '<div class="voz-actions"><button type="button" id="voz-hear" class="btn2">🔊 Escuchar este tutorial</button>' +
      (first ? '<button type="button" id="voz-now" class="btn2 main">Activar ahora</button><button type="button" id="voz-no" class="btn2">Ahora no</button>' : '<button type="button" id="voz-close" class="btn2 main">Cerrar</button>') + '</div></div>';
    $v('#voz-c').onchange = (e) => { prefs.control = e.target.checked; save(); apply(); };
    $v('#voz-a').onchange = (e) => { prefs.audio = e.target.checked; save(); if (!prefs.audio) stopSpeaking(); };
    $v('#voz-hear').onclick = () => speak('Tutorial de voz para personas invidentes. ' + TUTORIAL.join(' '));
    if (first) {
      $v('#voz-now').onclick = () => { if (SR) prefs.control = true; if (synth) prefs.audio = true; prefs.seen = true; save(); apply(); closePanel(); };
      $v('#voz-no').onclick = () => { prefs.seen = true; save(); closePanel(); };
    } else $v('#voz-close').onclick = closePanel;
  }
  let lastFocus = null;
  function openPanel(first) {
    lastFocus = document.activeElement; renderPanel(first); panel.hidden = false;
    const f = panel.querySelector('button, input'); if (f) f.focus();
  }
  function closePanel() { stopSpeaking(); panel.hidden = true; prefs.seen = true; save(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  btn.onclick = () => openPanel(false);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

  function apply() { mic.hidden = !(prefs.control && SR); }
  apply();

  // ───────── Escuchar al usuario ─────────
  let rec = null, listening = false;
  function notFound(heard) {
    const msg = !S.stops.length ? 'Los datos de las estaciones todavía se están cargando. Inténtalo de nuevo en unos segundos.'
      : !heard ? 'No he entendido la estación. Pulsa el botón del micrófono para intentarlo de nuevo.'
      : 'No he encontrado la estación ' + heard + '. Pulsa el botón del micrófono para intentarlo de nuevo.';
    say(msg); if (prefs.audio) speak(msg);
  }
  function startRecognition() {
    if (!SR || listening) return;
    rec = new SR(); rec.lang = 'es-ES'; rec.maxAlternatives = 5; rec.interimResults = false; rec.continuous = false;
    let got = false;
    rec.onstart = () => { listening = true; mic.classList.add('on'); say('Escuchando. Di el nombre de la estación.'); };
    rec.onresult = (e) => {
      got = true;
      const phrases = Array.from(e.results[0] ?? []).map((a) => a.transcript);
      const st = matchStation(phrases, S.stops);
      if (st) { say('Abriendo ' + st.name); setTab('map'); openStation(st); } else notFound(phrases[0]);
    };
    rec.onerror = (e) => {
      got = true;
      const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'No tengo permiso para usar el micrófono. Actívalo en los ajustes del navegador para este sitio.'
        : e.error === 'no-speech' ? 'No te he oído. Pulsa el botón del micrófono para intentarlo de nuevo.'
        : e.error === 'audio-capture' ? 'No se detecta ningún micrófono.' : 'No se pudo reconocer la voz (' + e.error + ').';
      say(msg); if (prefs.audio) speak(msg);
    };
    rec.onend = () => { listening = false; mic.classList.remove('on'); if (!got) say('No te he oído.'); };
    try { rec.start(); } catch (_) { listening = false; }
  }
  function askStation() {
    if (!SR) { say('Tu navegador no admite el reconocimiento de voz.'); return; }
    if (listening) { try { rec.stop(); } catch (_) { /* ya parado */ } return; }
    // Se calla lo que se estuviera leyendo para que el micrófono no recoja la voz de la web
    if (prefs.audio) speak('Di el nombre de la estación.', startRecognition); else { stopSpeaking(); startRecognition(); }
  }
  mic.onclick = askStation;
  document.addEventListener('keydown', (e) => {
    if (!prefs.control || e.ctrlKey || e.metaKey || e.altKey || !panel.hidden) return;
    const t = e.target, tag = (t && t.tagName) || '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag) || (t && t.isContentEditable)) return;
    if (e.key === 'v' || e.key === 'V') { e.preventDefault(); askStation(); }
  });

  // ───────── Al abrir una estación: botón «Escuchar» y lectura automática ─────────
  window.addEventListener('station-board', (ev) => {
    const { station, board } = ev.detail;
    const text = summary(station, board, S.alerts, Math.floor(Date.now() / 1000));
    if (prefs.audio) {
      const body = $v('#detail-body');
      if (body) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'voz-listen'; b.textContent = '🔊 Escuchar la información de la estación';
        b.onclick = () => speak(text);
        const h = body.querySelector('h3'); if (h && h.nextSibling) body.insertBefore(b, h.nextSibling); else body.appendChild(b);
      }
      speak(text);
    }
  });
  const d = $v('#detail-close'); if (d) d.addEventListener('click', stopSpeaking);

  // Primera visita: se ofrece el tutorial (solo una vez)
  if (!prefs.seen && (SR || synth)) setTimeout(() => openPanel(true), 1200);

  // Para pruebas y para quien quiera usarlo desde fuera
  window.AndenVoz = { matchStation, summary, speak, prefs };
})();
