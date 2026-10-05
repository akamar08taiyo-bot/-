"""音の大きさを10ミリ秒ごとに出す。短い動画の切れ目さがしと、終わりの音を消す長さに使う。"""
import array, math, subprocess, sys
SR = 16000; STEP = 160
def env(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"], capture_output=True, check=True).stdout
    a = array.array("h"); a.frombytes(raw)
    return [math.sqrt(sum(v * v for v in a[i:i + STEP]) / STEP) for i in range(0, len(a) - STEP, STEP)]
def db(x): return 20 * math.log10(max(x, 1) / 32768)
if __name__ == "__main__":
  VIS = {
      "kaisei1p": [20.27, 30.80, 42.93, 56.07],
      "kaisei2p": [18.63, 30.90, 38.57, 50.87],
      "seido1p": [22.93, 31.73, 46.57, 59.37],
      "seido2p": [15.33, 33.23, 44.37, 58.13],
      "seido3p": [18.63, 35.53, 49.80],
  }
  for k, vs in VIS.items():
      e = env(f"src/videos/{k}_duo.mp4")
      for v in vs:
          t0 = v - 0.7
          row = []
          for j in range(80):
              t = t0 + j * 0.01
              row.append(f"{db(e[int(round(t * 100))]):.0f}")
          # 0.1秒ごとに区切って表示
          chunks = [" ".join(row[i:i + 10]) for i in range(0, 80, 10)]
          print(f"{k} vis {v:.2f} (from {t0:.2f})")
          for i, c in enumerate(chunks):
              print(f"   {t0 + i * 0.1:6.2f} | {c}")
