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


# 曲の入り方は章（timeline.json の chapter：序・一・二・三・四・五・結）の頭で決める。
# 章の数や並びが違う作品では、下の区切り（一〜結）を自分の構成に合わせて書き換える
def chapter_start(ch, last=False):
    ss = [starts[sh['id']] for sh in T['shots'] if sh.get('chapter') == ch]
    assert ss, f'timeline.json に章「{ch}」のカットがありません。compose.py の区切りを構成に合わせて書き換える'
    return ss[-1] if last else ss[0]


# 第二章：序（2026年）・一〜三・あの頃（昭和の回想）・四・五・結・予告
SEC = {k: chapter_start(k) for k in ('一', '二', '三', 'あの頃', '四', '五', '結', '予告')}
SEC.update({'P1': starts['P1'], 'B5': starts['B5'], 'C3': starts['C3'], 'R6': starts['R6'], 'D2': starts['D2'], 'E4': starts['E4']})

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
# 序：2026年の浜は、曲なし（風と通知音だけ）。砂が晴れて題が出るところで、オルゴールの動機が入る
t = SEC['P1'] + 4.5
pads(pad, CHORDS_A[:4], t, beat * 1.4, 30)
melody(mbox, THEME_A, t + 2.5, beat * 1.15, 60, octave=1, bars=4, human=0.01)
# 一 夜明け：オルゴール＋ピアノ（主題A）
t1 = SEC['一'] + 0.5
melody(mbox, THEME_A, t1, beat, 64, octave=1, human=0.01, seed=2)
arpeggio(piano, CHORDS_A, t1, beat, 44, seed=3)
# 二 朝：ピアノ旋律＋弦＋低音（主題A×2）→ 昭和のコース（B5）からはオルゴールだけ
t2 = SEC['二'] + 0.3
e = melody(piano, THEME_A, t2, beat, 68, human=0.008, seed=4)
arpeggio(piano, CHORDS_A, t2, beat, 42, seed=5); pads(strings, CHORDS_A, t2, beat, 44); basses(bass, CHORDS_A, t2, beat, 50)
e2 = melody(piano, THEME_A, e, beat, 62, seed=7)
melody(celesta, THEME_A, e, beat, 52, octave=1, seed=6)
arpeggio(piano, CHORDS_A, e, beat, 40, seed=8); pads(strings, CHORDS_A, e, beat, 46); basses(bass, CHORDS_A, e, beat, 50)
tb5 = max(e2, SEC['B5'] + 0.4)
melody(mbox, THEME_A, tb5, beat * 1.1, 56, octave=1, human=0.012, seed=31)
pads(pad, CHORDS_A, tb5, beat * 1.1, 26)
# 三 昼さがり：牛丼屋と船は明るい主題B（フルート）1回 → 麦茶（C3）から、ピアノだけの静かな主題A → 柱の傷まで和音だけ
t3 = SEC['三'] + 0.3
e = melody(flute, THEME_B, t3, beat, 58, human=0.01, seed=9)
arpeggio(piano, CHORDS_B, t3, beat, 38, pattern=(0, 2, 1, 3, 0, 2, 1, 3), seed=10); pads(strings, CHORDS_B, t3, beat, 34); basses(bass, CHORDS_B, t3, beat, 46)
tc3 = max(e, SEC['C3'] + 1.0); slow = 60 / 60
e = melody(piano, THEME_A, tc3, slow, 54, human=0.012, seed=15)
pads(strings, CHORDS_A, tc3, slow, 34)
if e + 4 * slow * 6 < SEC['あの頃'] - 1.0:
    arpeggio(piano, CHORDS_AM[:6], e, slow, 34, pattern=(0, 2, 3, 2, 1, 2, 3, 2), seed=16); pads(strings, CHORDS_AM[:6], e, slow, 36)
# あの頃：オルゴールだけ（ゆっくり、2巡）。別れの朝（R6）は和音をのばして消える
t4 = SEC['あの頃'] + 0.6; mem = beat * 1.25
e = melody(mbox, THEME_A, t4, mem, 58, octave=1, human=0.015, seed=21)
pads(pad, CHORDS_A, t4, mem, 24)
if e + 32 * mem < SEC['R6'] + 6:
    e = melody(mbox, THEME_A, e, mem, 54, octave=1, human=0.015, seed=22); pads(pad, CHORDS_A, e - 32 * mem, mem, 22)
for p_ in (53, 57, 60, 65):
    note(pad, p_ + 12, min(e, SEC['四'] - 9.0), 8.0, 26)
# 四 夕暮れ：神社（D1）の五時のチャイムの間は休み → 缶蹴り（D2）で、ゆっくりした主題A'（弦＋ピアノ）を半分
t5 = SEC['D2'] + 1.0
melody(piano, THEME_A, t5, slow, 58, bars=4, seed=23); pads(strings, CHORDS_AM[:4], t5, slow, 46); basses(bass, CHORDS_AM[:4], t5, slow, 42)
# 五 線香花火：曲は休み（虫と花火の音）。屋上の三人（E4）でオルゴールが戻り（主題Aの前半）、
# 結はそのまま後半の4小節へ続けて（オルゴール＋ピアノ＋弦）、最後の和音は予告の前に消える
t6 = SEC['E4'] + 2.0
e6 = melody(mbox, THEME_A, t6, slow, 54, octave=1, bars=4, seed=17); pads(pad, CHORDS_A[:4], t6, slow, 28)
e = melody(mbox, THEME_A[4:], e6, slow, 58, octave=1, seed=18)
arpeggio(piano, CHORDS_A[4:], e6, slow, 40, seed=19); pads(strings, CHORDS_A[4:], e6, slow, 38); basses(bass, CHORDS_A[4:], e6, slow, 40)
for p_ in (41, 53, 57, 60, 65, 69):
    note(piano if p_ < 60 else strings, p_, min(e, SEC['予告'] - 5.0), 4.5, 42)

mid = root / 'audio' / 'out' / 'theme.mid'; midi.write(str(mid))
raw = root / 'audio' / 'out' / 'theme_raw.wav'
subprocess.run(['fluidsynth', '-ni', '-q', '-g', '0.55', '-r', '48000', '-R', '1', '-C', '1', '-F', str(raw), '/usr/share/sounds/sf2/FluidR3_GM.sf2', str(mid)], check=True)
y, sr = sf.read(raw)
n = int(TOTAL * sr)
out = np.zeros((n, 2)); m = min(n, len(y)); out[:m] = y[:m]
# 仕上げ：低域と高域を少し整え、終わりを閉じる
from scipy import signal
sos = signal.butter(2, [45, 11000], btype='band', fs=sr, output='sos'); out = signal.sosfilt(sos, out, axis=0)
fade = np.ones(n); a_ = int((SEC['予告'] - 1.0) * sr); fe = int(2.5 * sr); fade[a_:a_ + fe] = np.linspace(1, 0, fe)[:max(0, min(fe, n - a_))]; fade[a_ + fe:] = 0; out *= fade[:, None]
sf.write(root / 'audio' / 'out' / 'music.wav', out.astype(np.float32), sr)
print('music', round(TOTAL, 1), 's  sections:', {k: round(v, 1) for k, v in SEC.items()})
