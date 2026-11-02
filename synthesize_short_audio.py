"""
synthesize_short_audio.py
Synthesizes a tailored 4.0-second high-impact audio master for the social cut.
"""

import numpy as np
import wave

SAMPLE_RATE = 48000
DURATION = 4.0
TOTAL_SAMPLES = int(SAMPLE_RATE * DURATION)
OUT_PATH = r"c:\COGNITARA EXAM PORTAL\CogniTara-Motion-Graphics\audio\cognitara-soundtrack-short.wav"

t = np.linspace(0, DURATION, TOTAL_SAMPLES, endpoint=False)
left = np.zeros(TOTAL_SAMPLES, dtype=np.float64)
right = np.zeros(TOTAL_SAMPLES, dtype=np.float64)

# 1. Quick ambient bed (0.0 -> 4.0)
drone_env = np.where(t < 0.3, t / 0.3, 1.0)
drone_env = np.where(t > 3.0, np.maximum(0.0, 1.0 - (t - 3.0) / 1.0), drone_env)
drone_l = 0.14 * np.sin(2 * np.pi * 55.0 * t) + 0.08 * np.sin(2 * np.pi * 82.4 * t)
drone_r = 0.14 * np.sin(2 * np.pi * 55.3 * t) + 0.08 * np.sin(2 * np.pi * 82.2 * t)
left += drone_l * drone_env
right += drone_r * drone_env

# 2. Snappy riser (0.3 -> 1.8s)
riser_mask = (t >= 0.3) & (t <= 1.8)
t_r = t[riser_mask] - 0.3
dur_r = 1.5
r_freq = 100.0 * np.exp(np.log(700.0 / 100.0) * (t_r / dur_r))
r_phase = 2 * np.pi * np.cumsum(r_freq) / SAMPLE_RATE
r_env = (t_r / dur_r) ** 2.0 * 0.22
left[riser_mask] += r_env * np.sin(r_phase)
right[riser_mask] += r_env * np.sin(r_phase + 0.4)

# 3. Apex Impact (t = 1.8s)
hit_mask = (t >= 1.8) & (t <= 3.8)
t_hit = t[hit_mask] - 1.8
sub_decay = np.exp(-t_hit * 3.5)
sub_freq = 48.0 + 90.0 * np.exp(-t_hit * 20.0)
sub_phase = 2 * np.pi * np.cumsum(sub_freq) / SAMPLE_RATE
sub_wave = np.tanh(1.5 * (0.6 * np.sin(sub_phase) * sub_decay))
left[hit_mask] += sub_wave
right[hit_mask] += sub_wave

glass_decay = np.exp(-t_hit * 5.0)
f_glass = [1046.5, 1567.98, 2093.0, 3135.96]
w_glass = [0.24, 0.18, 0.14, 0.10]
for f_val, w_val in zip(f_glass, w_glass):
    left[hit_mask] += w_val * np.sin(2 * np.pi * f_val * t_hit) * glass_decay
    right[hit_mask] += w_val * np.sin(2 * np.pi * f_val * t_hit + 0.3) * glass_decay

# 4. Harmonic Chime (t = 2.4s -> 3.9s)
chord_mask = (t >= 2.4) & (t <= 3.9)
t_ch = t[chord_mask] - 2.4
chord_decay = np.exp(-t_ch * 2.0)
for fc, wc in zip([523.25, 659.25, 783.99, 1174.66], [0.15, 0.12, 0.10, 0.08]):
    left[chord_mask] += wc * np.sin(2 * np.pi * fc * t_ch) * chord_decay
    right[chord_mask] += wc * np.sin(2 * np.pi * (fc * 1.002) * t_ch + 0.4) * chord_decay

# Normalize to -1.0 dBFS
max_peak = max(np.max(np.abs(left)), np.max(np.abs(right)))
if max_peak > 0:
    scale_gain = (10.0 ** (-1.0 / 20.0)) / max_peak
    left *= scale_gain
    right *= scale_gain

left_int16 = np.int16(np.clip(left * 32767.0, -32767.0, 32767.0))
right_int16 = np.int16(np.clip(right * 32767.0, -32767.0, 32767.0))
stereo = np.empty((TOTAL_SAMPLES * 2,), dtype=np.int16)
stereo[0::2] = left_int16
stereo[1::2] = right_int16

with wave.open(OUT_PATH, 'wb') as wf:
    wf.setnchannels(2)
    wf.setsampwidth(2)
    wf.setframerate(SAMPLE_RATE)
    wf.writeframes(stereo.tobytes())

print(f"Short soundtrack synthesized: {OUT_PATH}")
