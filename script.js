const startBtn = document.getElementById('start-btn');
const currentNoteEl = document.getElementById('current-note');
const noteHistoryEl = document.getElementById('note-history');
const keyDisplayEl = document.getElementById('key-display');

let audioContext;
let analyser;
let dataArray;
let bufferLength;
let notes = [];

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        let val = buf[i];
        rms += val * val;
    }
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

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) {
            c[i] = c[i] + buf[j] * buf[j + i];
        }
    }
    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    let T0 = maxpos;

    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}

function freqToNote(frequency) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2)) + 69;
    const idx = Math.round(noteNum) % 12;
    return noteNames[(idx + 12) % 12];
}

function updateNotes(note) {
    const now = Date.now();
    notes.push({ note, time: now });
    const cutoff = now - 8000; // 8 second window
    notes = notes.filter(n => n.time >= cutoff);
    noteHistoryEl.textContent = 'Notes: ' + notes.map(n => n.note).join(' ');
    if (notes.length > 5) {
        keyDisplayEl.textContent = 'Likely Key: ' + guessKey();
    }
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

function process() {
    const buffer = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(buffer);
    const pitch = autoCorrelate(buffer, audioContext.sampleRate);
    if (pitch !== -1) {
        const note = freqToNote(pitch);
        currentNoteEl.textContent = 'Current Note: ' + note;
        updateNotes(note);
    }
    requestAnimationFrame(process);
}

startBtn.onclick = async () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        bufferLength = analyser.fftSize;
        source.connect(analyser);
        dataArray = new Float32Array(bufferLength);
        process();
    }
};
