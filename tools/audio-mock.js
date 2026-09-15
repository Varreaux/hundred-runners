// A Web Audio mock that enforces the rules the real API enforces, so the freeze
// harness actually exercises the sound module instead of silently skipping it.
function makeAudioMock(stats) {
  const chk = (what, v, lo, hi) => {
    if (typeof v !== 'number' || !isFinite(v)) throw new Error(`${what} is not finite: ${v}`);
    if (lo !== undefined && (v < lo || v > hi)) throw new Error(`${what} out of range [${lo},${hi}]: ${v}`);
    return v;
  };
  function param(name, lo, hi, init = 0) {
    let val = init;
    return {
      get value() { return val; },
      set value(v) { val = chk(name, v, lo, hi); },
      setValueAtTime(v, t) { chk(name, v, lo, hi); chk(name + ' time', t); return this; },
      linearRampToValueAtTime(v, t) { chk(name, v, lo, hi); chk(name + ' time', t); return this; },
      exponentialRampToValueAtTime(v, t) {
        chk(name, v, lo, hi); chk(name + ' time', t);
        if (v === 0) throw new Error(`${name}: exponentialRamp to exactly 0 is a RangeError in Web Audio`);
        return this;
      },
      cancelScheduledValues() { return this; },
      setTargetAtTime(v, t) { chk(name, v, lo, hi); chk(name + ' time', t); return this; },
    };
  }
  const node = extra => Object.assign({
    connect(d) { if (!d) throw new Error('connect(undefined)'); return d; },
    disconnect() {},
  }, extra);
  class Ctx {
    constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = node({}); }
    resume() { this.state = 'running'; }
    createGain() { stats.nodes++; return node({ gain: param('gain', 0, 100, 1) }); }
    createOscillator() {
      stats.nodes++; stats.live++;
      return node({ type: 'sine', frequency: param('frequency', 0, 24000, 440), detune: param('detune', -5000, 5000),
        start(t) { if (t !== undefined) chk('osc start', t); }, stop(t) { if (t !== undefined) chk('osc stop', t); stats.live--; } });
    }
    createBufferSource() {
      stats.nodes++; stats.live++;
      let buf = null;
      return node({ set buffer(b) { if (!b) throw new Error('buffer set to null'); buf = b; }, get buffer() { return buf; },
        loop: false, playbackRate: param('playbackRate', 0.01, 100, 1), detune: param('detune', -5000, 5000),
        start(t) { if (t !== undefined) chk('src start', t); }, stop(t) { if (t !== undefined) chk('src stop', t); stats.live--; } });
    }
    createBiquadFilter() { stats.nodes++; return node({ type: 'lowpass', frequency: param('filter frequency', 0, 24000, 350), Q: param('Q', -1000, 1000, 1), gain: param('filter gain', -100, 100) }); }
    createStereoPanner() { stats.nodes++; return node({ pan: param('pan', -1, 1) }); }
    createDelay(max) { stats.nodes++; return node({ delayTime: param('delayTime', 0, max || 1) }); }
    createConvolver() { stats.nodes++; return node({ buffer: null, normalize: true }); }
    createWaveShaper() { stats.nodes++; return node({ curve: null, oversample: 'none' }); }
    createDynamicsCompressor() { stats.nodes++; return node({ threshold: param('threshold', -100, 0, -24), knee: param('knee', 0, 40, 30), ratio: param('ratio', 1, 20, 12), attack: param('attack', 0, 1), release: param('release', 0, 1) }); }
    createBuffer(ch, len, rate) {
      chk('buffer channels', ch, 1, 32); chk('buffer length', len, 1, 1e9); chk('buffer rate', rate, 3000, 768000);
      stats.nodes++;
      const data = new Float32Array(Math.min(len, 1 << 16));
      return { numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate, getChannelData: () => data };
    }
    decodeAudioData() { return Promise.resolve(this.createBuffer(1, 1000, 48000)); }
  }
  return Ctx;
}
module.exports = { makeAudioMock };
