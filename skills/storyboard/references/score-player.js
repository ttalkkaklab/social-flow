// Offline audition of a cue's original recording. The scene clock only counts its audible interval.
(function (root) {
  'use strict';
  function clock(seconds) {
    const hundredths = Math.floor(Math.max(0, seconds) * 100 + 0.00001);
    return Math.floor(hundredths / 6000) + ':' + String(Math.floor(hundredths / 100) % 60).padStart(2, '0') +
      '.' + String(hundredths % 100).padStart(2, '0');
  }
  function mount(player, ko) {
    const audio = player.querySelector('audio'), play = player.querySelector('.score-play');
    const range = player.querySelector('input'), time = player.querySelector('.score-time');
    const mode = player.querySelector('.score-mode'), status = player.querySelector('[role="status"]');
    const track = player.querySelector('.score-name').textContent;
    const sourceStart = Number(player.dataset.sourceStart || 0), skip = Number(player.dataset.skip || 0);
    const excerpt = Number(player.dataset.length);
    let scene = !!mode, base = 0, finished = false, timer = 0;
    const length = () => scene ? excerpt : Number.isFinite(audio.duration) ? audio.duration : 0;
    const elapsed = () => finished ? length() : Math.max(0, Math.min(length(), scene ? base + audio.currentTime - sourceStart : audio.currentTime));
    const label = (action) => action + ' · ' + track;
    function display() {
      const pos = elapsed(), end = length(), running = !audio.paused && !finished;
      const verb = running ? (ko ? '일시정지' : 'Pause') : (ko ? '재생' : 'Play');
      play.setAttribute('aria-label', label(verb)); play.title = label(verb);
      play.dataset.playing = String(running);
      range.max = String(end || 1); range.value = String(pos);
      range.disabled = !(end > 0) || !Number.isFinite(audio.duration) || !!audio.error;
      range.style.setProperty('--played', (end ? pos * 100 / end : 0) + '%');
      range.setAttribute('aria-valuetext', clock(pos) + ' / ' + clock(end));
      time.textContent = clock(pos) + ' / ' + (end ? clock(end) : '–:––');
    }
    function position(pos) {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      finished = pos >= length();
      if (scene) {
        const cycle = audio.duration - sourceStart;
        if (!(cycle > 0)) return;
        const phase = (skip + pos) % cycle;
        base = pos - phase;
        audio.currentTime = sourceStart + phase;
      } else audio.currentTime = pos;
    }
    function end() {
      clearTimeout(timer); finished = true; audio.pause(); display();
    }
    function update() {
      clearTimeout(timer);
      if (!audio.paused && scene && !audio.seeking && !finished && Number.isFinite(audio.duration)) {
        const remaining = length() - elapsed();
        if (remaining <= 0.002) return end();
        timer = setTimeout(update, Math.max(20, Math.min(1000, remaining * 1000 / audio.playbackRate)));
      }
      display();
    }
    function start() {
      if (finished || audio.ended) position(0);
      finished = false;
      audio.play().catch(error => {
        if (error.name !== 'AbortError') status.textContent = ko ? '음원을 재생할 수 없습니다.' : 'Could not play this recording.';
        display();
      });
    }
    play.addEventListener('click', () => { if (audio.paused || finished) start(); else audio.pause(); });
    range.addEventListener('input', () => {
      const value = Number(range.value);
      if (value >= length()) end();
      else { position(value); update(); }
    });
    function modeLabel() {
      if (!mode) return;
      mode.textContent = scene ? (ko ? '원곡 전체' : 'Full track') : (ko ? '씬 구간' : 'Scene excerpt');
      mode.title = label(mode.textContent);
      player.querySelector('.score-listening').textContent = scene ? (ko ? '씬 구간' : 'Scene excerpt') : (ko ? '원곡 전체' : 'Full track');
    }
    if (mode) mode.addEventListener('click', () => {
      const resume = !audio.paused;
      audio.pause(); scene = !scene; finished = false; modeLabel(); position(0); update();
      if (resume) start();
    });
    audio.addEventListener('loadedmetadata', () => {
      if (scene && sourceStart >= audio.duration) {
        scene = false; modeLabel(); mode.hidden = true;
        status.textContent = ko ? '지정한 시작점이 음원 길이를 넘어 원곡을 엽니다.' : 'The excerpt starts past the recording. Playing the full track is available.';
      }
      position(0); update();
    });
    audio.addEventListener('ended', () => {
      const next = base + audio.duration - sourceStart;
      if (scene && next < excerpt - 0.002 && !finished) {
        base = next; audio.currentTime = sourceStart;
        audio.play().catch(() => { display(); });
      } else end();
    });
    audio.addEventListener('error', () => {
      clearTimeout(timer); play.disabled = true; range.disabled = true;
      if (mode) mode.disabled = true;
      status.textContent = ko ? '이 음원을 열 수 없습니다.' : 'This recording could not be opened.';
      display();
    });
    for (const event of ['timeupdate','play','playing','pause','seeked','ratechange']) audio.addEventListener(event, update);
    modeLabel(); display();
  }
  root.ReviewScorePlayer = { mount };
})(window);
