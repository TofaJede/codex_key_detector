const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
const resultsEl = document.getElementById('results');
const resetButton = document.getElementById('resetButton');

const ACCENT = 'rgb(100, 51, 162)';

let audioCtx, analyser, bufferLength, dataArray;
let notes = [];
const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const keys = [];
const keyCounts = {};

noteNames.forEach(n => {
    keys.push(`${n} major`);
    keys.push(`${n} minor`);
});
keys.forEach(k => keyCounts[k] = 0);

const bars = {};

function setupBars() {
    keys.forEach(k => {
        const bar = document.createElement('div');
        bar.className = 'key-bar';
        const inner = document.createElement('div');
        inner.className = 'key-bar-inner';
        const label = document.createElement('div');
        label.className = 'key-label';
        label.textContent = `${k}: 0%`;
        bar.appendChild(inner);
        bar.appendChild(label);
        resultsEl.appendChild(bar);
        bars[k] = {inner, label};
    });
}

function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0, r2 = SIZE - 1, thresh = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buf[i]) < thresh) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buf[SIZE - i]) < thresh) { r2 = SIZE - i; break; }
    }
    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    const c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) c[i] += buf[j] * buf[j + i];
    }
    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    let T0 = maxpos;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
    return sampleRate / T0;
}

function freqToNote(freq) {
    const noteNum = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
    const idx = Math.round(noteNum) % 12;
    return noteNames[(idx + 12) % 12];
}

function updateNotes(note) {
    const now = Date.now();
    notes.push({ note, time: now });
    const cutoff = now - 8000;
    notes = notes.filter(n => n.time >= cutoff);
}

function guessKey() {
    const pitchCounts = new Array(12).fill(0);
    notes.forEach(n => {
        const idx = noteNames.indexOf(n.note);
        if (idx >= 0) pitchCounts[idx]++;
    });
    function scoreKey(root, minor = false) {
        const intervals = minor ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
        let score = 0;
        intervals.forEach(i => { score += pitchCounts[(root + i) % 12]; });
        return score;
    }
    let bestScore = -1;
    let bestKey = '';
    for (let i = 0; i < 12; i++) {
        const majorScore = scoreKey(i, false);
        if (majorScore > bestScore) {
            bestScore = majorScore;
            bestKey = noteNames[i] + ' major';
        }
        const minorScore = scoreKey(i, true);
        if (minorScore > bestScore) {
            bestScore = minorScore;
            bestKey = noteNames[i] + ' minor';
        }
    }
    return bestKey;
}

function drawWave() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ACCENT;
    ctx.beginPath();
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
        const v = (dataArray[i] * 0.5 + 0.5) * canvas.height;
        if (i === 0) ctx.moveTo(x, v);
        else ctx.lineTo(x, v);
        x += sliceWidth;
    }
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function updateResults() {
    const total = Object.values(keyCounts).reduce((a,b)=>a+b,0) || 1;
    let dominant = '';
    let max = -1;
    keys.forEach(k => {
        const percent = (keyCounts[k] / total) * 100;
        bars[k].inner.style.width = percent + '%';
        bars[k].label.textContent = `${k}: ${percent.toFixed(1)}%`;
        if (percent > max) {
            max = percent;
            dominant = k;
        }
    });
    keys.forEach(k => {
        if (k === dominant) bars[k].label.classList.add('dominate');
        else bars[k].label.classList.remove('dominate');
    });
}

function process() {
    analyser.getFloatTimeDomainData(dataArray);
    drawWave();
    const pitch = autoCorrelate(dataArray, audioCtx.sampleRate);
    if (pitch !== -1) {
        const note = freqToNote(pitch);
        updateNotes(note);
        const key = guessKey();
        if (key) keyCounts[key]++;
    }
    updateResults();
    requestAnimationFrame(process);
}

async function start() {
    setupBars();
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        }
    });
    await audioCtx.resume();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    bufferLength = analyser.fftSize;
    dataArray = new Float32Array(bufferLength);
    source.connect(analyser);
    process();
}

resetButton.addEventListener('click', () => {
    notes = [];
    keys.forEach(k => keyCounts[k] = 0);
});

window.addEventListener('load', start);
