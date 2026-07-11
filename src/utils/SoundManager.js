// Procedural 8-bit style sound effects via WebAudio (no audio assets needed).
export default class SoundManager {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.lastFoot = 0;
        this.footFlip = false;

        // Sound-effect mute (independent of music). Starts muted, same as
        // music defaulting off — nothing plays until the visitor opts in.
        this.sfxGain = null;
        this.sfxMuted = true;

        // Background music state
        this.musicWanted = false;   // user toggle intent
        this.musicOn = false;       // actually scheduling notes right now
        this.musicGain = null;
        this._musicTimer = null;
        this._musicStep = 0;
        this._stepMs = 200;         // eighth note @ ~150 BPM
        // Simple A-minor-pentatonic chiptune loop (16-step lead + 4-step bass).
        this._leadPattern = [440, 0, 392, 329.63, 0, 293.66, 329.63, 0, 261.63, 0, 293.66, 329.63, 220, 0, 293.66, 0];
        this._bassPattern = [110, 130.81, 146.83, 130.81];

        // Browsers block audio until a user gesture, so unlock on first input
        const unlock = () => {
            const ctx = this.ensure();
            if (ctx && ctx.state === 'suspended') ctx.resume();
            // If the user wants music but it hasn't started (autoplay was blocked
            // until this gesture), kick it off now.
            if (this.musicWanted && !this.musicOn) this._startMusic();
        };
        window.addEventListener('pointerdown', unlock, { passive: true });
        window.addEventListener('touchstart', unlock, { passive: true });
        window.addEventListener('keydown', unlock);
    }

    ensure() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.5;
            this.master.connect(this.ctx.destination);
            // Every one-shot SFX (footstep/swing/chop/etc.) routes through this
            // so muting is one gain flip instead of tracking every voice.
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = this.sfxMuted ? 0 : 1;
            this.sfxGain.connect(this.master);
        }
        return this.ctx;
    }

    ready() {
        const ctx = this.ensure();
        return ctx && ctx.state === 'running' ? ctx : null;
    }

    noise(duration, { type = 'lowpass', from = 800, to = from, gain = 0.4, when = 0 } = {}) {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime + when;
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.setValueAtTime(from, t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + duration);
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + duration);

        src.connect(filter);
        filter.connect(g);
        g.connect(this.sfxGain);
        src.start(t);
        src.stop(t + duration);
    }

    tone(from, to, duration, { type = 'square', gain = 0.25, when = 0 } = {}) {
        const ctx = this.ready();
        if (!ctx) return;
        const t = ctx.currentTime + when;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + duration);
    }

    // Mute/unmute one-shot SFX (footsteps, chop, smash, etc.) independent of
    // music. Returns the new muted state so the UI can reflect it.
    toggleSfx() {
        this.sfxMuted = !this.sfxMuted;
        if (this.sfxGain) this.sfxGain.gain.value = this.sfxMuted ? 0 : 1;
        return this.sfxMuted;
    }

    // Soft alternating thud while walking; self-throttled so it can be called every frame
    footstep() {
        const now = performance.now();
        if (now - this.lastFoot < 240) return;
        this.lastFoot = now;
        this.footFlip = !this.footFlip;
        this.noise(0.07, { type: 'lowpass', from: this.footFlip ? 700 : 520, to: 180, gain: 0.22 });
    }

    // Whoosh for the axe swing
    swing() {
        this.noise(0.18, { type: 'bandpass', from: 2200, to: 280, gain: 0.35 });
    }

    // Airy little whoosh when the player switches facing direction.
    whoosh() {
        this.noise(0.13, { type: 'bandpass', from: 500, to: 1700, gain: 0.16 });
        this.noise(0.13, { type: 'highpass', from: 900, to: 1600, gain: 0.08 });
    }

    // Big "WOOOSH" for the dash burst — a fast high-to-low sweep (like
    // swing() but bigger/longer) layered with a short low thump so it reads
    // as a burst of speed, distinct from the little direction-change whoosh.
    dash() {
        this.noise(0.26, { type: 'bandpass', from: 4200, to: 150, gain: 0.5 });
        this.noise(0.12, { type: 'highpass', from: 2500, to: 5000, gain: 0.2 });
        this.tone(90, 40, 0.12, { type: 'sine', gain: 0.25 });
    }

    // Thunk for a successful axe hit
    chop() {
        this.tone(180, 70, 0.09, { type: 'square', gain: 0.3 });
        this.noise(0.06, { type: 'lowpass', from: 1200, to: 300, gain: 0.3 });
    }

    // Bigger crunch when something is destroyed / opens up
    smash() {
        this.tone(140, 40, 0.25, { type: 'sawtooth', gain: 0.32 });
        this.noise(0.3, { type: 'lowpass', from: 900, to: 120, gain: 0.4 });
    }

    // Rising / falling arpeggio for the 2D<->3D toggle
    toggle(on) {
        const steps = on ? [300, 450, 600] : [600, 450, 300];
        steps.forEach((f, i) => this.tone(f, f, 0.09, { gain: 0.22, when: i * 0.09 }));
    }

    // ---- Background music ----------------------------------------------------

    // Toggle the looping chiptune. Returns the new desired on/off state so the
    // UI can reflect it. Actual sound waits for the browser's audio unlock.
    toggleMusic() {
        this.musicWanted = !this.musicWanted;
        if (this.musicWanted) this._startMusic();
        else this._stopMusic();
        return this.musicWanted;
    }

    _startMusic() {
        const ctx = this.ensure();
        if (!ctx || this.musicOn) return;
        this.musicOn = true;
        if (!this.musicGain) {
            this.musicGain = ctx.createGain();
            this.musicGain.gain.value = 0.0001;
            this.musicGain.connect(this.master);
        }
        const now = ctx.currentTime;
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(Math.max(0.0001, this.musicGain.gain.value), now);
        this.musicGain.gain.linearRampToValueAtTime(0.5, now + 0.7); // gentle fade-in
        this._musicStep = 0;
        clearInterval(this._musicTimer);
        this._musicTimer = setInterval(() => this._tickMusic(), this._stepMs);
    }

    _stopMusic() {
        this.musicOn = false;
        clearInterval(this._musicTimer);
        this._musicTimer = null;
        const ctx = this.ctx;
        if (ctx && this.musicGain) {
            const now = ctx.currentTime;
            this.musicGain.gain.cancelScheduledValues(now);
            this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
            this.musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.4);
        }
    }

    _tickMusic() {
        const ctx = this.ready();
        if (!ctx) return; // still suspended — try again next tick
        const step = this._musicStep % this._leadPattern.length;
        const lead = this._leadPattern[step];
        if (lead) this._musicNote(lead, 0.18, 'square', 0.26);
        if (step % 4 === 0) {
            const bass = this._bassPattern[(this._musicStep >> 2) % this._bassPattern.length];
            this._musicNote(bass, 0.34, 'triangle', 0.34);
        }
        this._musicStep++;
    }

    _musicNote(freq, dur, type, gain) {
        const ctx = this.ready();
        if (!ctx || !this.musicGain) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    }
}
