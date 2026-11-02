"""
synthesize_cognitara_audio.py
Synthesizes a bespoke, broadcast-grade cinematic soundscape for the CogniTara logo reveal:
- Sample Rate: 48,000 Hz, Stereo, 16/24-bit PCM
- Duration: 8.5 seconds
- Act 1 (0.0 - 1.5s): Deep space ambient drone (55Hz / 82Hz warm binaural bed)
- Act 2 (1.5 - 3.8s): Resonant kinetic riser & energy filaments
- Act 3 (3.8s): Apex Signature Star Reveal (Crystalline glass transient + cinematic sub-bass punch)
- Act 4 (5.2 - 6.8s): Wordmark resolution chime (harmonic major 9th shimmer) & airy typographic glide
- Act 5 (6.8 - 8.5s): Reverb tail decay to pristine silence
- Mastering: Precision True-Peak Limiting at -1.0 dBFS, zero clipping.
"""

import math
import wave
import struct
import numpy as np

SAMPLE_RATE = 48000
DURATION = 8.5
TOTAL_SAMPLES = int(SAMPLE_RATE * DURATION)
OUT_PATH = r"c:\COGNITARA EXAM PORTAL\CogniTara-Motion-Graphics\audio\cognitara-soundtrack-master.wav"

def generate_audio():
    t = np.linspace(0, DURATION, TOTAL_SAMPLES, endpoint=False)
    left = np.zeros(TOTAL_SAMPLES, dtype=np.float64)
    right = np.zeros(TOTAL_SAMPLES, dtype=np.float64)

    # -------------------------------------------------------------------------
    # 1. ATMOSPHERIC AMBIENT DRONE (0.0s -> 8.5s)
    # Deep sub-drone at 55Hz (A1) and 82.4Hz (E2) with gentle stereo chorusing
    # -------------------------------------------------------------------------
    drone_env = np.where(t < 1.0, t / 1.0, 1.0)
    drone_env = np.where(t > 6.5, np.maximum(0.0, 1.0 - (t - 6.5) / 2.0), drone_env)
    
    drone_f1 = 55.0
    drone_f2 = 82.41
    drone_l = 0.18 * np.sin(2 * np.pi * drone_f1 * t) + 0.12 * np.sin(2 * np.pi * drone_f2 * t + 0.2)
    drone_r = 0.18 * np.sin(2 * np.pi * (drone_f1 + 0.3) * t) + 0.12 * np.sin(2 * np.pi * (drone_f2 - 0.2) * t)
    
    # Add subtle octave warmth
    drone_l += 0.06 * np.sin(2 * np.pi * 110.0 * t)
    drone_r += 0.06 * np.sin(2 * np.pi * 110.4 * t)
    
    left += drone_l * drone_env
    right += drone_r * drone_env

    # -------------------------------------------------------------------------
    # 2. KINETIC ENERGY RISER (1.5s -> 3.8s)
    # Exponential frequency sweep representing the Luminary C formation
    # -------------------------------------------------------------------------
    riser_mask = (t >= 1.5) & (t <= 3.8)
    t_r = t[riser_mask] - 1.5
    dur_r = 2.3
    # Exponential frequency from 80Hz to 650Hz
    r_freq = 80.0 * np.exp(np.log(650.0 / 80.0) * (t_r / dur_r))
    r_phase = 2 * np.pi * np.cumsum(r_freq) / SAMPLE_RATE
    r_env = (t_r / dur_r) ** 1.8 * 0.22
    
    # Filtered sweep noise component (filament energy)
    np.random.seed(42)
    noise = np.random.uniform(-1, 1, len(t_r))
    # Modulate noise with riser frequency
    noise_filt = noise * np.sin(r_phase) * (t_r / dur_r) ** 2.2 * 0.12
    
    # Stereo panning from left to right as C sweeps
    pan_l = np.cos(np.pi / 2 * (t_r / dur_r))
    pan_r = np.sin(np.pi / 2 * (t_r / dur_r))
    
    left[riser_mask] += (r_env * np.sin(r_phase) + noise_filt) * pan_l
    right[riser_mask] += (r_env * np.sin(r_phase + 0.4) + noise_filt) * pan_r

    # -------------------------------------------------------------------------
    # 3. APEX SIGNATURE STAR REVEAL (Impact at t = 3.8s)
    # - Warm sub-bass punch (pitch drop 130Hz -> 48Hz)
    # - Crystalline glass transient (C6, C7, G7 harmonics)
    # - Stereo shimmer burst
    # -------------------------------------------------------------------------
    hit_mask = (t >= 3.8) & (t <= 6.5)
    t_hit = t[hit_mask] - 3.8
    
    # Sub-bass punch: rapid decay
    sub_decay = np.exp(-t_hit * 3.2)
    sub_freq = 48.0 + 82.0 * np.exp(-t_hit * 18.0)  # Drops from 130Hz to 48Hz
    sub_phase = 2 * np.pi * np.cumsum(sub_freq) / SAMPLE_RATE
    sub_wave = 0.55 * np.sin(sub_phase) * sub_decay
    # Warm saturation
    sub_wave = np.tanh(1.4 * sub_wave)
    
    left[hit_mask] += sub_wave
    right[hit_mask] += sub_wave

    # Crystalline Glass Transient
    glass_decay = np.exp(-t_hit * 4.5)
    f_glass = [1046.5, 1567.98, 2093.0, 3135.96, 4186.0]
    w_glass = [0.25, 0.18, 0.14, 0.10, 0.06]
    
    glass_l = np.zeros(len(t_hit))
    glass_r = np.zeros(len(t_hit))
    for f_val, w_val in zip(f_glass, w_glass):
        glass_l += w_val * np.sin(2 * np.pi * f_val * t_hit) * glass_decay
        glass_r += w_val * np.sin(2 * np.pi * f_val * t_hit + 0.3) * glass_decay
        
    # Metallic FM sparkle
    fm_mod = np.sin(2 * np.pi * 180.0 * t_hit)
    sparkle = 0.08 * np.sin(2 * np.pi * 2637.0 * t_hit + 2.0 * fm_mod) * np.exp(-t_hit * 6.0)
    
    left[hit_mask] += (glass_l + sparkle)
    right[hit_mask] += (glass_r - sparkle)

    # -------------------------------------------------------------------------
    # 4. WORDMARK RESOLUTION HARMONIC CHIME (t = 5.2s -> 8.0s)
    # Major 9th shimmer chord (C5, E5, G5, D6) as CogniTara locks up
    # -------------------------------------------------------------------------
    chord_mask = (t >= 5.2) & (t <= 8.2)
    t_ch = t[chord_mask] - 5.2
    chord_decay = np.exp(-t_ch * 1.5)
    
    f_chord = [523.25, 659.25, 783.99, 1174.66, 1567.98]
    w_chord = [0.15, 0.12, 0.10, 0.08, 0.05]
    
    chord_l = np.zeros(len(t_ch))
    chord_r = np.zeros(len(t_ch))
    for i, (fc, wc) in enumerate(zip(f_chord, w_chord)):
        phase_offset = i * 0.4
        chord_l += wc * np.sin(2 * np.pi * fc * t_ch + phase_offset) * chord_decay
        chord_r += wc * np.sin(2 * np.pi * (fc * 1.002) * t_ch + phase_offset + 0.5) * chord_decay
        
    # Gentle typographic air sweep (bandpassed noise swell around 5.2s - 5.8s)
    t_sweep = np.clip((t - 5.0) / 0.8, 0, 1)
    sweep_env = np.sin(np.pi * t_sweep) * ((t >= 5.0) & (t <= 5.8))
    sweep_noise = np.random.uniform(-0.04, 0.04, TOTAL_SAMPLES) * sweep_env
    
    left[chord_mask] += chord_l
    right[chord_mask] += chord_r
    left += sweep_noise
    right += sweep_noise

    # -------------------------------------------------------------------------
    # 5. MASTERING & GAIN STAGING
    # True Peak Limiting at -1.0 dBFS, zero distortion, smooth 10ms boundary fades
    # -------------------------------------------------------------------------
    # 10ms fade in and 50ms fade out to prevent clicks
    fade_in_len = int(SAMPLE_RATE * 0.01)
    fade_out_len = int(SAMPLE_RATE * 0.1)
    left[:fade_in_len] *= np.linspace(0, 1, fade_in_len)
    right[:fade_in_len] *= np.linspace(0, 1, fade_in_len)
    left[-fade_out_len:] *= np.linspace(1, 0, fade_out_len)
    right[-fade_out_len:] *= np.linspace(1, 0, fade_out_len)

    max_peak = max(np.max(np.abs(left)), np.max(np.abs(right)))
    target_peak = 10.0 ** (-1.0 / 20.0)  # -1.0 dBFS = ~0.89125
    if max_peak > 0:
        scale_gain = target_peak / max_peak
        left *= scale_gain
        right *= scale_gain

    # Convert to 16-bit PCM for universal cross-platform compatibility
    left_int16 = np.int16(np.clip(left * 32767.0, -32767.0, 32767.0))
    right_int16 = np.int16(np.clip(right * 32767.0, -32767.0, 32767.0))

    # Interleave stereo
    stereo = np.empty((TOTAL_SAMPLES * 2,), dtype=np.int16)
    stereo[0::2] = left_int16
    stereo[1::2] = right_int16

    with wave.open(OUT_PATH, 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(stereo.tobytes())

    print(f"Soundtrack master synthesized successfully: {OUT_PATH}")
    print(f"Sample Rate: {SAMPLE_RATE} Hz | Channels: Stereo (2) | Duration: {DURATION}s | Peak: -1.0 dBFS")

if __name__ == '__main__':
    generate_audio()
