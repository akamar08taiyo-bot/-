# オリジナルのテーマ曲：MIDI を作って FluidSynth（FluidR3_GM, MIT）で鳴らす
import json, subprocess
from pathlib import Path
import numpy as np
import pretty_midi as pm
import soundfile as sf

root = Path(__file__).resolve().parents[2]
T = json.loads((root / 'src' / 'timeline.json').read_text())
XF = T['crossfade']
starts = {}; s = 0.0
for sh in T['shots']:
    starts[sh['id']] = s; s += sh['dur'] - XF
TOTAL = s + XF

F4, G4, A4, Bb4, C5, D5, E5, F5 = 65, 67, 69, 70, 72, 74, 76, 77
THEME_A = [  # (音, 拍) 8小節
    [(C5, 1.5), (A4, .5), (C5, 1), (D5, 1)], [(C5, 2), (A4, 1), (G4, 1)], [(A4, 1.5), (G4, .5), (A4, 1), (C5, 1)], [(D5, 3), (C5, 1)],
    [(Bb4, 1.5), (A4, .5), (G4, 1), (F4, 1)], [(G4, 2), (A4, 1), (C5, 1)], [(A4, 1.5), (G4, .5), (F4, 2)], [(F4, 4)]]
CHORDS_A = [[46, 53, 57, 62], [48, 55, 60, 64], [45, 52, 55, 60], [50, 57, 60, 65], [43, 50, 53, 58], [48, 55, 58, 64], [41, 48, 52, 57], [41, 48, 53, 57]]
THEME_B = [
    [(A4, 1), (C5, 1), (F5, 1.5), (E5, .5)], [(E5, 2), (D5, 1), (C5, 1)], [(D5, 1.5), (C5, .5), (Bb4, 1), (A4, 1)], [(G4, 3), (C5, 1)],
    [(D5, 1), (F5, 1), (E5, 1), (D5, 1)], [(C5, 2), (A4, 2)], [(Bb4, 1), (C5, 1), (D5, 1), (E5, 1)], [(F5, 4)]]
CHORDS_B = [[41, 48, 53, 57], [45, 52, 57, 60], [46, 53, 58, 62], [48, 55, 60, 64], [50, 57, 62, 65], [45, 52, 57, 60], [46, 53, 58, 62], [41, 48, 53, 60]]
CHORDS_AM = [[46, 53, 57, 62], [45, 52, 55, 60], [50, 57, 60, 65], [48, 57, 60, 65], [43, 50, 53, 58], [45, 52, 55, 61], [50, 57, 62, 65], [50, 57, 62, 65]]

midi = pm.PrettyMIDI(initial_tempo=72)
def inst(prog, name):
    i = pm.Instrument(program=prog, name=name); midi.instruments.append(i); return i
mbox = inst(10, 'music box'); piano = inst(0, 'piano'); strings = inst(48, 'strings'); bass = inst(32, 'bass')
flute = inst(73, 'flute'); celesta = inst(8, 'celesta'); pad = inst(89, 'warm pad')

def note(ins, p, t0, d, v):
    ins.notes.append(pm.Note(velocity=int(np.clip(v, 1, 127)), pitch=int(p), start=float(t0), end=float(t0 + d)))

def melody(ins, theme, t0, beat, vel, octave=0, bars=None, human=0.0, seed=0):
    r = np.random.default_rng(seed); t = t0
    for b, bar in enumerate(theme[:bars] if bars else theme):
        for p, d in bar:
            dt = r.uniform(-human, human)
            note(ins, p + 12 * octave, t + max(0, dt), d * beat * 0.95, vel + r.integers(-6, 6)); t += d * beat
    return t

def arpeggio(ins, chords, t0, beat, vel, pattern=(0, 1, 2, 3, 2, 1, 2, 3), seed=1):
    r = np.random.default_rng(seed); t = t0
    for ch in chords:
        for k, idx in enumerate(pattern):
            note(ins, ch[idx % len(ch)] + 12, t + k * beat / 2, beat * 1.4, vel + r.integers(-8, 5))
        t += 4 * beat
    return t

def pads(ins, chords, t0, beat, vel, top=True):
    t = t0
    for ch in chords:
        for p in ch[1:] if top else ch:
            note(ins, p + 12, t, 4 * beat * 0.98, vel)
        t += 4 * beat
    return t

def basses(ins, chords, t0, beat, vel):
    t = t0
    for ch in chords:
        note(ins, ch[0], t, 2 * beat * 0.9, vel); note(ins, ch[0] + 7 if ch[0] + 7 < 60 else ch[0], t + 2 * beat, 2 * beat * 0.9, vel - 8)
        t += 4 * beat
    return t

beat = 60 / 72  # 0.833 秒
# 序：オルゴールの前奏（短い動機）＋ パッド
t = 2.0
pads(pad, CHORDS_A[:4], t, beat * 1.4, 34)
for k, (p, d) in enumerate([(C5, 1.5), (A4, .5), (C5, 1), (D5, 1), (C5, 3)]):
    pass
melody(mbox, THEME_A, 6.0, beat * 1.15, 62, octave=1, bars=4, human=0.01)
# 一 夜明け：オルゴール＋ピアノ（主題A）
t1 = starts['A1'] + 0.5
melody(mbox, THEME_A, t1, beat, 66, octave=1, human=0.01, seed=2)
arpeggio(piano, CHORDS_A, t1, beat, 46, seed=3)
# 二 朝：ピアノ旋律＋弦＋低音（主題A×2、2回目は変奏）
t2 = starts['B1'] + 0.3
e = melody(piano, THEME_A, t2, beat, 70, human=0.008, seed=4)
arpeggio(piano, CHORDS_A, t2, beat, 44, seed=5); pads(strings, CHORDS_A, t2, beat, 46); basses(bass, CHORDS_A, t2, beat, 52)
melody(celesta, THEME_A, e, beat, 60, octave=1, seed=6); e2 = melody(piano, THEME_A, e, beat, 64, seed=7)
arpeggio(piano, CHORDS_A, e, beat, 44, seed=8); pads(strings, CHORDS_A, e, beat, 50); basses(bass, CHORDS_A, e, beat, 52)
# 二の後半（回覧板・電器店・教室）：軽くしたオルゴールで3巡目 → ピアノだけの半分の句で静かに閉じる
e3 = melody(mbox, THEME_A, e2, beat, 58, octave=1, human=0.01, seed=31)
arpeggio(piano, CHORDS_A, e2, beat, 38, seed=32); pads(strings, CHORDS_A, e2, beat, 38)
if e3 + 16 * beat < starts['C1'] - 2.0:
    melody(piano, THEME_A, e3, beat * 1.1, 56, bars=4, human=0.01, seed=33)
    pads(strings, CHORDS_A[:4], e3, beat * 1.1, 34)
# 三 昼さがり：明るい主題B（フルート）×2 ＋ 主題A（オルゴール）で締め
t3 = starts['C1'] + 0.3
e = melody(flute, THEME_B, t3, beat, 74, human=0.01, seed=9)
arpeggio(piano, CHORDS_B, t3, beat, 48, pattern=(0, 2, 1, 3, 0, 2, 1, 3), seed=10); pads(strings, CHORDS_B, t3, beat, 40); basses(bass, CHORDS_B, t3, beat, 54)
e2 = melody(flute, THEME_B, e, beat, 70, seed=11)
arpeggio(piano, CHORDS_B, e, beat, 48, pattern=(0, 2, 1, 3, 0, 2, 1, 3), seed=12); pads(strings, CHORDS_B, e, beat, 44); basses(bass, CHORDS_B, e, beat, 54)
melody(mbox, THEME_A, e2, beat, 62, octave=1, seed=13); arpeggio(piano, CHORDS_A, e2, beat, 42, seed=14); pads(strings, CHORDS_A, e2, beat, 40)
# 四 夕暮れ：チャイムの間は休み → ゆっくり哀愁の主題A'（弦＋ピアノ）
t4 = starts['D1'] + 16.0
slow = 60 / 60
melody(piano, THEME_A, t4, slow, 60, seed=15); pads(strings, CHORDS_AM, t4, slow, 50); basses(bass, CHORDS_AM, t4, slow, 46)
arpeggio(piano, CHORDS_AM, t4, slow, 38, pattern=(0, 2, 3, 2, 1, 2, 3, 2), seed=16)
# 五 夏祭り：音楽は休み（祭り囃子と花火）。屋上の二人でオルゴールが戻る
t5 = starts['E4'] + 2.0
melody(mbox, THEME_A, t5, beat * 1.2, 56, octave=1, bars=4, seed=17); pads(pad, CHORDS_A[:4], t5, beat * 1.2, 30)
# 結：主題Aの再現（オルゴール→ピアノ＋弦）、最後の和音
t6 = starts['F0'] + 0.5
e = melody(mbox, THEME_A, t6, beat, 60, octave=1, seed=18)
arpeggio(piano, CHORDS_A, t6, beat, 42, seed=19); pads(strings, CHORDS_A, t6, beat, 40)
for p in (41, 53, 57, 60, 65, 69):
    note(piano if p < 60 else strings, p, min(e, TOTAL - 4.5), 4.0, 44)

mid = root / 'audio' / 'out' / 'theme.mid'; midi.write(str(mid))
raw = root / 'audio' / 'out' / 'theme_raw.wav'
subprocess.run(['fluidsynth', '-ni', '-q', '-g', '0.55', '-r', '48000', '-R', '1', '-C', '1', '-F', str(raw), '/usr/share/sounds/sf2/FluidR3_GM.sf2', str(mid)], check=True)
y, sr = sf.read(raw)
n = int(TOTAL * sr)
out = np.zeros((n, 2)); m = min(n, len(y)); out[:m] = y[:m]
# 仕上げ：低域と高域を少し整え、終わりを閉じる
from scipy import signal
sos = signal.butter(2, [45, 11000], btype='band', fs=sr, output='sos'); out = signal.sosfilt(sos, out, axis=0)
fade = np.ones(n); fe = int(3.0 * sr); fade[-fe:] = np.linspace(1, 0, fe); out *= fade[:, None]
sf.write(root / 'audio' / 'out' / 'music.wav', out.astype(np.float32), sr)
print('music', round(TOTAL, 1), 's  sections:', {k: round(v, 1) for k, v in starts.items() if k in ('A1', 'B1', 'C1', 'D1', 'E4', 'F0')})
