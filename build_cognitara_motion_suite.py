"""
build_cognitara_motion_suite.py
Constructs the complete, refined EffectCraft motion graphics suite for CogniTara.
Features:
- Clean, velvety Midnight Navy background with sapphire vignette (zero cheap spark particles)
- Anamorphic cyan light rays & optical flare on the Tara star strike at 3.8s
- Kinetic C crescent sweep & smooth overshoot deceleration
- Coordinated docking glide into master horizontal lockup
- Synchronized wordmark & tagline reveal with subtle cyan sheen
- Pristine resting hold from 6.8s to 8.5s
- Full multi-format suite: Master 1080p, Transparent Alpha, Square 1:1, Vertical 9:16, Short 4s
"""

import os
import subprocess

PROJECT_DIR = r"c:\COGNITARA EXAM PORTAL\CogniTara-Motion-Graphics"
EC_CLI = r"C:\Program Files\EffectCraft\effectcraft-cli.exe"
JSX_FILE = os.path.join(PROJECT_DIR, "generate_project.jsx")
ECPROJ_FILE = os.path.join(PROJECT_DIR, "cognitara-motion-identity.ecproj")

jsx_script = r'''
// ============================================================================
// COGNITARA REFINED CINEMATIC MOTION IDENTITY SUITE
// EffectCraft JavaScript Object Model Script
// ============================================================================

app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);

// Helper for Keyframe Easing
function ease75() { return [new KeyframeEase(0, 75)]; }
function ease85() { return [new KeyframeEase(0, 85)]; }

// Import Verified Motion Assets
var ioC = new ImportOptions(new File("c:/COGNITARA EXAM PORTAL/CogniTara-Motion-Graphics/assets/asset_c_crescent.png"));
var itemC = app.project.importFile(ioC);

var ioStar = new ImportOptions(new File("c:/COGNITARA EXAM PORTAL/CogniTara-Motion-Graphics/assets/asset_star_beacon.png"));
var itemStar = app.project.importFile(ioStar);

var ioWord = new ImportOptions(new File("c:/COGNITARA EXAM PORTAL/CogniTara-Motion-Graphics/assets/asset_wordmark_full.png"));
var itemWord = app.project.importFile(ioWord);

var ioTag = new ImportOptions(new File("c:/COGNITARA EXAM PORTAL/CogniTara-Motion-Graphics/assets/asset_tagline.png"));
var itemTag = app.project.importFile(ioTag);

var ioAudioMaster = new ImportOptions(new File("c:/COGNITARA EXAM PORTAL/CogniTara-Motion-Graphics/audio/cognitara-soundtrack-master.wav"));
var itemAudioMaster = app.project.importFile(ioAudioMaster);

var ioAudioShort = new ImportOptions(new File("c:/COGNITARA EXAM PORTAL/CogniTara-Motion-Graphics/audio/cognitara-soundtrack-short.wav"));
var itemAudioShort = app.project.importFile(ioAudioShort);

// ============================================================================
// 1. MASTER COMPOSITION (1920x1080, 8.5s, 30fps)
// ============================================================================
var compMaster = app.project.items.addComp("Comp_Master_1080p", 1920, 1080, 1.0, 8.5, 30);
compMaster.bgColor = [0.039, 0.055, 0.102]; // #0A0E1A

// --- Layer 1: Pristine Midnight Sapphire Background ---
var bg = compMaster.layers.addSolid([0.039, 0.055, 0.102], "Deep_Space_BG", 1920, 1080, 1.0);
var ramp = bg.Effects.addProperty("ADBE Ramp");
ramp.property(1).setValue([960, 540]);               // Start of Ramp (Center)
ramp.property(2).setValue([0.055, 0.088, 0.165, 1]); // Inner Sapphire Radiance
ramp.property(3).setValue([960, 1080]);              // End of Ramp
ramp.property(4).setValue([0.020, 0.028, 0.055, 1]); // Outer Deep Void
ramp.property(5).setValue(2);                        // Radial Ramp

// Subtle background breathing at focal point
ramp.property(2).setValueAtTime(0.0, [0.050, 0.080, 0.150, 1]);
ramp.property(2).setValueAtTime(3.84, [0.075, 0.120, 0.220, 1]); // Expands at star strike
ramp.property(2).setValueAtTime(5.5, [0.055, 0.088, 0.165, 1]);

// --- Layer 2: Anamorphic Light Rays (Apex Strike Only 3.75s -> 4.45s) ---
var burstLayer = compMaster.layers.addSolid([0, 0, 0], "Anamorphic_Light_Rays", 1920, 1080, 1.0);
burstLayer.blendingMode = BlendingMode.ADD;
var burst = burstLayer.Effects.addProperty("ec.generate.cclightburst");
burst.property(1).setValue([979, 540]); // Star Center
burst.property(3).setValue(75);         // Ray Length
burst.property(6).setValue([0.0, 0.824, 1.0, 1]); // Electric Cyan Ray Color
burst.property(2).setValueAtTime(0.0, 0);
burst.property(2).setValueAtTime(3.75, 0);
burst.property(2).setValueAtTime(3.83, 240);
burst.property(2).setValueAtTime(4.45, 0);
burstLayer.transform.opacity.setValueAtTime(0.0, 0);
burstLayer.transform.opacity.setValueAtTime(3.75, 0);
burstLayer.transform.opacity.setValueAtTime(3.83, 100);
burstLayer.transform.opacity.setValueAtTime(4.45, 0);

// --- Layer 3: Luminary C Crescent ---
var layerC = compMaster.layers.add(itemC);
layerC.name = "Luminary_C_Crescent";

// Opacity Keyframes
layerC.transform.opacity.setValueAtTime(0.0, 0);
layerC.transform.opacity.setValueAtTime(1.5, 0);
layerC.transform.opacity.setValueAtTime(2.4, 100);

// Scale Keyframes: 20% at 1.5s -> 52% at 3.5s -> 50% at 3.8s -> 36.46% at 5.8s
layerC.transform.scale.setValueAtTime(1.5, [20, 20, 100]);
layerC.transform.scale.setValueAtTime(3.5, [52, 52, 100]);
layerC.transform.scale.setValueAtTime(3.8, [50, 50, 100]);
layerC.transform.scale.setValueAtTime(4.8, [50, 50, 100]);
layerC.transform.scale.setValueAtTime(5.8, [36.46, 36.46, 100]);

// Position Keyframes: (960, 540) -> (560, 540)
layerC.transform.position.setValueAtTime(1.5, [960, 540, 0]);
layerC.transform.position.setValueAtTime(4.8, [960, 540, 0]);
layerC.transform.position.setValueAtTime(5.8, [560, 540, 0]);

// Rotation Keyframes: -35 deg -> 0 deg
layerC.transform.rotation.setValueAtTime(1.5, -35);
layerC.transform.rotation.setValueAtTime(3.5, 0);

try {
    layerC.transform.position.setTemporalEaseAtKey(2, ease85(), ease85());
    layerC.transform.position.setTemporalEaseAtKey(3, ease85(), ease85());
    layerC.transform.scale.setTemporalEaseAtKey(1, ease75(), ease75());
    layerC.transform.scale.setTemporalEaseAtKey(4, ease85(), ease85());
    layerC.transform.scale.setTemporalEaseAtKey(5, ease85(), ease85());
    layerC.transform.rotation.setTemporalEaseAtKey(1, ease75(), ease75());
    layerC.transform.rotation.setTemporalEaseAtKey(2, ease85(), ease85());
} catch(e) {}

// Light Sweep on C Crescent during formation (1.8s -> 3.5s)
var sweepC = layerC.Effects.addProperty("ec.generate.cclightsweep");
sweepC.property(2).setValue(-45); // Direction
sweepC.property(4).setValue(65);  // Width
sweepC.property(5).setValue(85);  // Intensity
sweepC.property(1).setValueAtTime(1.8, [350, 750]);
sweepC.property(1).setValueAtTime(3.5, [650, 250]);
sweepC.property(5).setValueAtTime(3.6, 85);
sweepC.property(5).setValueAtTime(3.8, 0); // Fades completely after formation

// Pure Titanium White Glow on C
var glowC = layerC.Effects.addProperty("ADBE Glo2");
glowC.property(2).setValue(70);
glowC.property(3).setValue(16);
glowC.property(4).setValue(0.60);

// --- Layer 4: Tara Guiding Star Beacon ---
var layerStar = compMaster.layers.add(itemStar);
layerStar.name = "Tara_Star_Beacon";

// Opacity Keyframes
layerStar.transform.opacity.setValueAtTime(0.0, 0);
layerStar.transform.opacity.setValueAtTime(3.75, 0);
layerStar.transform.opacity.setValueAtTime(3.80, 100);

// Scale Keyframes: 0% at 3.75s -> 85% at 3.84s (Kinetic Pop) -> 50% at 4.2s -> 36.46% at 5.8s
layerStar.transform.scale.setValueAtTime(3.75, [0, 0, 100]);
layerStar.transform.scale.setValueAtTime(3.84, [85, 85, 100]);
layerStar.transform.scale.setValueAtTime(4.20, [50, 50, 100]);
layerStar.transform.scale.setValueAtTime(4.80, [50, 50, 100]);
layerStar.transform.scale.setValueAtTime(5.80, [36.46, 36.46, 100]);

// Position Keyframes: (979, 540) -> (574, 540)
layerStar.transform.position.setValueAtTime(3.75, [979, 540, 0]);
layerStar.transform.position.setValueAtTime(4.80, [979, 540, 0]);
layerStar.transform.position.setValueAtTime(5.80, [574, 540, 0]);

try {
    layerStar.transform.scale.setTemporalEaseAtKey(2, ease85(), ease85());
    layerStar.transform.scale.setTemporalEaseAtKey(3, ease85(), ease85());
    layerStar.transform.position.setTemporalEaseAtKey(2, ease85(), ease85());
    layerStar.transform.position.setTemporalEaseAtKey(3, ease85(), ease85());
} catch(e) {}

// Radiant Electric Cyan Glow on Star
var glowStar = layerStar.Effects.addProperty("ADBE Glo2");
glowStar.property(2).setValue(40);
glowStar.property(7).setValue(2);
glowStar.property(13).setValue([0.0, 0.824, 1.0, 1]); // Color A (Electric Cyan)
glowStar.property(14).setValue([0.0, 0.40, 0.90, 1]); // Color B (Deep Cyan)
glowStar.property(3).setValueAtTime(3.75, 15);
glowStar.property(3).setValueAtTime(3.84, 95);
glowStar.property(3).setValueAtTime(4.60, 20);
glowStar.property(4).setValueAtTime(3.75, 0.5);
glowStar.property(4).setValueAtTime(3.84, 2.5);
glowStar.property(4).setValueAtTime(4.60, 1.1);

// --- Layer 5: Wordmark ("CogniTara") ---
var layerWord = compMaster.layers.add(itemWord);
layerWord.name = "Wordmark_CogniTara";
layerWord.transform.scale.setValue([48.08, 48.08, 100]);

layerWord.transform.opacity.setValueAtTime(0.0, 0);
layerWord.transform.opacity.setValueAtTime(5.2, 0);
layerWord.transform.opacity.setValueAtTime(5.8, 100);

layerWord.transform.position.setValueAtTime(5.2, [1240, 528, 0]);
layerWord.transform.position.setValueAtTime(6.2, [1195, 528, 0]);

try {
    layerWord.transform.position.setTemporalEaseAtKey(1, ease85(), ease85());
    layerWord.transform.position.setTemporalEaseAtKey(2, ease85(), ease85());
} catch(e) {}

var sweepWord = layerWord.Effects.addProperty("ec.generate.cclightsweep");
sweepWord.property(2).setValue(-30);
sweepWord.property(4).setValue(75);
sweepWord.property(5).setValue(70);
sweepWord.property(8).setValue([0.0, 0.824, 1.0, 1]); // Electric Cyan Sheen
sweepWord.property(1).setValueAtTime(5.4, [300, 225]);
sweepWord.property(1).setValueAtTime(6.6, [1600, 225]);
sweepWord.property(5).setValueAtTime(6.7, 70);
sweepWord.property(5).setValueAtTime(7.0, 0); // Settles into clean print lockup

// --- Layer 6: Tagline ("INTELLIGENT SYSTEMS & SOFTWARE") ---
var layerTag = compMaster.layers.add(itemTag);
layerTag.name = "Tagline_Descriptor";
layerTag.transform.scale.setValue([60.0, 60.0, 100]);
layerTag.transform.position.setValue([1195, 650, 0]);

layerTag.transform.opacity.setValueAtTime(0.0, 0);
layerTag.transform.opacity.setValueAtTime(6.0, 0);
layerTag.transform.opacity.setValueAtTime(6.8, 100);

// --- Layer 7: Audio Soundtrack Master ---
var layerAudio = compMaster.layers.add(itemAudioMaster);
layerAudio.name = "Soundtrack_Master";

writeLn("Master composition created successfully!");

// ============================================================================
// 2. TRANSPARENT COMPOSITION (1920x1080, 8.5s, Alpha Channel)
// ============================================================================
var compTrans = app.project.items.addComp("Comp_Transparent", 1920, 1080, 1.0, 8.5, 30);

var tBurstLayer = compTrans.layers.addSolid([0, 0, 0], "Anamorphic_Light_Rays", 1920, 1080, 1.0);
tBurstLayer.blendingMode = BlendingMode.ADD;
var tBurst = tBurstLayer.Effects.addProperty("ec.generate.cclightburst");
tBurst.property(1).setValue([979, 540]);
tBurst.property(3).setValue(75);
tBurst.property(6).setValue([0.0, 0.824, 1.0, 1]);
tBurst.property(2).setValueAtTime(0.0, 0);
tBurst.property(2).setValueAtTime(3.75, 0);
tBurst.property(2).setValueAtTime(3.83, 240);
tBurst.property(2).setValueAtTime(4.45, 0);
tBurstLayer.transform.opacity.setValueAtTime(0.0, 0);
tBurstLayer.transform.opacity.setValueAtTime(3.75, 0);
tBurstLayer.transform.opacity.setValueAtTime(3.83, 100);
tBurstLayer.transform.opacity.setValueAtTime(4.45, 0);

var tLayerC = compTrans.layers.add(itemC);
tLayerC.name = "Luminary_C_Crescent";
tLayerC.transform.opacity.setValueAtTime(0.0, 0);
tLayerC.transform.opacity.setValueAtTime(1.5, 0);
tLayerC.transform.opacity.setValueAtTime(2.4, 100);
tLayerC.transform.scale.setValueAtTime(1.5, [20, 20, 100]);
tLayerC.transform.scale.setValueAtTime(3.5, [52, 52, 100]);
tLayerC.transform.scale.setValueAtTime(3.8, [50, 50, 100]);
tLayerC.transform.scale.setValueAtTime(4.8, [50, 50, 100]);
tLayerC.transform.scale.setValueAtTime(5.8, [36.46, 36.46, 100]);
tLayerC.transform.position.setValueAtTime(1.5, [960, 540, 0]);
tLayerC.transform.position.setValueAtTime(4.8, [960, 540, 0]);
tLayerC.transform.position.setValueAtTime(5.8, [560, 540, 0]);
tLayerC.transform.rotation.setValueAtTime(1.5, -35);
tLayerC.transform.rotation.setValueAtTime(3.5, 0);

var tLayerStar = compTrans.layers.add(itemStar);
tLayerStar.name = "Tara_Star_Beacon";
tLayerStar.transform.opacity.setValueAtTime(0.0, 0);
tLayerStar.transform.opacity.setValueAtTime(3.75, 0);
tLayerStar.transform.opacity.setValueAtTime(3.80, 100);
tLayerStar.transform.scale.setValueAtTime(3.75, [0, 0, 100]);
tLayerStar.transform.scale.setValueAtTime(3.84, [85, 85, 100]);
tLayerStar.transform.scale.setValueAtTime(4.20, [50, 50, 100]);
tLayerStar.transform.scale.setValueAtTime(4.80, [50, 50, 100]);
tLayerStar.transform.scale.setValueAtTime(5.80, [36.46, 36.46, 100]);
tLayerStar.transform.position.setValueAtTime(3.75, [979, 540, 0]);
tLayerStar.transform.position.setValueAtTime(4.80, [979, 540, 0]);
tLayerStar.transform.position.setValueAtTime(5.80, [574, 540, 0]);
var tGlow = tLayerStar.Effects.addProperty("ADBE Glo2");
tGlow.property(13).setValue([0.0, 0.824, 1.0, 1]);

var tLayerWord = compTrans.layers.add(itemWord);
tLayerWord.name = "Wordmark_CogniTara";
tLayerWord.transform.scale.setValue([48.08, 48.08, 100]);
tLayerWord.transform.opacity.setValueAtTime(0.0, 0);
tLayerWord.transform.opacity.setValueAtTime(5.2, 0);
tLayerWord.transform.opacity.setValueAtTime(5.8, 100);
tLayerWord.transform.position.setValueAtTime(5.2, [1240, 528, 0]);
tLayerWord.transform.position.setValueAtTime(6.2, [1195, 528, 0]);

var tLayerTag = compTrans.layers.add(itemTag);
tLayerTag.name = "Tagline_Descriptor";
tLayerTag.transform.scale.setValue([60.0, 60.0, 100]);
tLayerTag.transform.position.setValue([1195, 650, 0]);
tLayerTag.transform.opacity.setValueAtTime(0.0, 0);
tLayerTag.transform.opacity.setValueAtTime(6.0, 0);
tLayerTag.transform.opacity.setValueAtTime(6.8, 100);

writeLn("Transparent composition created successfully!");

// ============================================================================
// 3. SQUARE COMPOSITION (1080x1080, 8.5s, 1:1 Social)
// ============================================================================
var compSquare = app.project.items.addComp("Comp_Square_1080p", 1080, 1080, 1.0, 8.5, 30);
compSquare.bgColor = [0.039, 0.055, 0.102];

var sqBG = compSquare.layers.addSolid([0.039, 0.055, 0.102], "BG", 1080, 1080, 1.0);
var sqRamp = sqBG.Effects.addProperty("ADBE Ramp");
sqRamp.property(1).setValue([540, 540]);
sqRamp.property(2).setValue([0.055, 0.088, 0.165, 1]);
sqRamp.property(3).setValue([540, 1080]);
sqRamp.property(4).setValue([0.020, 0.028, 0.055, 1]);
sqRamp.property(5).setValue(2);

var sqBurstLayer = compSquare.layers.addSolid([0, 0, 0], "Burst", 1080, 1080, 1.0);
sqBurstLayer.blendingMode = BlendingMode.ADD;
var sqBurst = sqBurstLayer.Effects.addProperty("ec.generate.cclightburst");
sqBurst.property(1).setValue([557, 540]);
sqBurst.property(6).setValue([0.0, 0.824, 1.0, 1]);
sqBurst.property(2).setValueAtTime(0.0, 0);
sqBurst.property(2).setValueAtTime(3.75, 0);
sqBurst.property(2).setValueAtTime(3.83, 200);
sqBurst.property(2).setValueAtTime(4.40, 0);
sqBurstLayer.transform.opacity.setValueAtTime(0.0, 0);
sqBurstLayer.transform.opacity.setValueAtTime(3.75, 0);
sqBurstLayer.transform.opacity.setValueAtTime(3.83, 100);
sqBurstLayer.transform.opacity.setValueAtTime(4.40, 0);

var sqC = compSquare.layers.add(itemC);
sqC.name = "Luminary_C";
sqC.transform.opacity.setValueAtTime(0.0, 0);
sqC.transform.opacity.setValueAtTime(1.5, 0);
sqC.transform.opacity.setValueAtTime(2.4, 100);
sqC.transform.scale.setValueAtTime(1.5, [18, 18, 100]);
sqC.transform.scale.setValueAtTime(3.5, [48, 48, 100]);
sqC.transform.scale.setValueAtTime(4.8, [45, 45, 100]);
sqC.transform.scale.setValueAtTime(5.8, [42, 42, 100]);
sqC.transform.position.setValueAtTime(1.5, [540, 540, 0]);
sqC.transform.position.setValueAtTime(4.8, [540, 540, 0]);
sqC.transform.position.setValueAtTime(5.8, [540, 420, 0]);

var sqStar = compSquare.layers.add(itemStar);
sqStar.name = "Star_Beacon";
sqStar.transform.opacity.setValueAtTime(0.0, 0);
sqStar.transform.opacity.setValueAtTime(3.75, 0);
sqStar.transform.opacity.setValueAtTime(3.80, 100);
sqStar.transform.scale.setValueAtTime(3.75, [0, 0, 100]);
sqStar.transform.scale.setValueAtTime(3.84, [75, 75, 100]);
sqStar.transform.scale.setValueAtTime(4.20, [45, 45, 100]);
sqStar.transform.scale.setValueAtTime(4.80, [45, 45, 100]);
sqStar.transform.scale.setValueAtTime(5.80, [42, 42, 100]);
sqStar.transform.position.setValueAtTime(3.75, [557, 540, 0]);
sqStar.transform.position.setValueAtTime(4.80, [557, 540, 0]);
sqStar.transform.position.setValueAtTime(5.80, [556, 420, 0]);

var sqGlow = sqStar.Effects.addProperty("ADBE Glo2");
sqGlow.property(13).setValue([0.0, 0.824, 1.0, 1]);

var sqWord = compSquare.layers.add(itemWord);
sqWord.name = "Wordmark";
sqWord.transform.scale.setValue([50.0, 50.0, 100]);
sqWord.transform.position.setValue([540, 660, 0]);
sqWord.transform.opacity.setValueAtTime(0.0, 0);
sqWord.transform.opacity.setValueAtTime(5.2, 0);
sqWord.transform.opacity.setValueAtTime(5.8, 100);

var sqTag = compSquare.layers.add(itemTag);
sqTag.name = "Tagline";
sqTag.transform.scale.setValue([55.0, 55.0, 100]);
sqTag.transform.position.setValue([540, 775, 0]);
sqTag.transform.opacity.setValueAtTime(0.0, 0);
sqTag.transform.opacity.setValueAtTime(6.0, 0);
sqTag.transform.opacity.setValueAtTime(6.8, 100);

var sqAudio = compSquare.layers.add(itemAudioMaster);
sqAudio.name = "Soundtrack";

writeLn("Square composition created successfully!");

// ============================================================================
// 4. VERTICAL 9:16 COMPOSITION (1080x1920, 8.5s, Mobile Story)
// ============================================================================
var compVert = app.project.items.addComp("Comp_Vertical_9x16", 1080, 1920, 1.0, 8.5, 30);
compVert.bgColor = [0.039, 0.055, 0.102];

var vBG = compVert.layers.addSolid([0.039, 0.055, 0.102], "BG", 1080, 1920, 1.0);
var vRamp = vBG.Effects.addProperty("ADBE Ramp");
vRamp.property(1).setValue([540, 960]);
vRamp.property(2).setValue([0.055, 0.088, 0.165, 1]);
vRamp.property(3).setValue([540, 1920]);
vRamp.property(4).setValue([0.020, 0.028, 0.055, 1]);
vRamp.property(5).setValue(2);

var vBurstLayer = compVert.layers.addSolid([0, 0, 0], "Burst", 1080, 1920, 1.0);
vBurstLayer.blendingMode = BlendingMode.ADD;
var vBurst = vBurstLayer.Effects.addProperty("ec.generate.cclightburst");
vBurst.property(1).setValue([562, 960]);
vBurst.property(6).setValue([0.0, 0.824, 1.0, 1]);
vBurst.property(2).setValueAtTime(0.0, 0);
vBurst.property(2).setValueAtTime(3.75, 0);
vBurst.property(2).setValueAtTime(3.83, 220);
vBurst.property(2).setValueAtTime(4.40, 0);
vBurstLayer.transform.opacity.setValueAtTime(0.0, 0);
vBurstLayer.transform.opacity.setValueAtTime(3.75, 0);
vBurstLayer.transform.opacity.setValueAtTime(3.83, 100);
vBurstLayer.transform.opacity.setValueAtTime(4.40, 0);

var vC = compVert.layers.add(itemC);
vC.name = "Luminary_C";
vC.transform.opacity.setValueAtTime(0.0, 0);
vC.transform.opacity.setValueAtTime(1.5, 0);
vC.transform.opacity.setValueAtTime(2.4, 100);
vC.transform.scale.setValueAtTime(1.5, [22, 22, 100]);
vC.transform.scale.setValueAtTime(3.5, [60, 60, 100]);
vC.transform.scale.setValueAtTime(4.8, [58, 58, 100]);
vC.transform.scale.setValueAtTime(5.8, [56, 56, 100]);
vC.transform.position.setValueAtTime(1.5, [540, 960, 0]);
vC.transform.position.setValueAtTime(4.8, [540, 960, 0]);
vC.transform.position.setValueAtTime(5.8, [540, 800, 0]);

var vStar = compVert.layers.add(itemStar);
vStar.name = "Star_Beacon";
vStar.transform.opacity.setValueAtTime(0.0, 0);
vStar.transform.opacity.setValueAtTime(3.75, 0);
vStar.transform.opacity.setValueAtTime(3.80, 100);
vStar.transform.scale.setValueAtTime(3.75, [0, 0, 100]);
vStar.transform.scale.setValueAtTime(3.84, [95, 95, 100]);
vStar.transform.scale.setValueAtTime(4.20, [58, 58, 100]);
vStar.transform.scale.setValueAtTime(4.80, [58, 58, 100]);
vStar.transform.scale.setValueAtTime(5.80, [56, 56, 100]);
vStar.transform.position.setValueAtTime(3.75, [562, 960, 0]);
vStar.transform.position.setValueAtTime(4.80, [562, 960, 0]);
vStar.transform.position.setValueAtTime(5.80, [561, 800, 0]);

var vGlow = vStar.Effects.addProperty("ADBE Glo2");
vGlow.property(13).setValue([0.0, 0.824, 1.0, 1]);

var vWord = compVert.layers.add(itemWord);
vWord.name = "Wordmark";
vWord.transform.scale.setValue([64.0, 64.0, 100]);
vWord.transform.position.setValue([540, 1100, 0]);
vWord.transform.opacity.setValueAtTime(0.0, 0);
vWord.transform.opacity.setValueAtTime(5.2, 0);
vWord.transform.opacity.setValueAtTime(5.8, 100);

var vTag = compVert.layers.add(itemTag);
vTag.name = "Tagline";
vTag.transform.scale.setValue([70.0, 70.0, 100]);
vTag.transform.position.setValue([540, 1230, 0]);
vTag.transform.opacity.setValueAtTime(0.0, 0);
vTag.transform.opacity.setValueAtTime(6.0, 0);
vTag.transform.opacity.setValueAtTime(6.8, 100);

var vAudio = compVert.layers.add(itemAudioMaster);
vAudio.name = "Soundtrack";

writeLn("Vertical composition created successfully!");

// ============================================================================
// 5. SHORT 4-SECOND COMPOSITION (1920x1080, 4.0s, Snappy Social Cut)
// ============================================================================
var compShort = app.project.items.addComp("Comp_Short_4s", 1920, 1080, 1.0, 4.0, 30);
compShort.bgColor = [0.039, 0.055, 0.102];

var sBG = compShort.layers.addSolid([0.039, 0.055, 0.102], "BG", 1920, 1080, 1.0);
var sRamp = sBG.Effects.addProperty("ADBE Ramp");
sRamp.property(1).setValue([960, 540]);
sRamp.property(2).setValue([0.055, 0.088, 0.165, 1]);
sRamp.property(3).setValue([960, 1080]);
sRamp.property(4).setValue([0.020, 0.028, 0.055, 1]);
sRamp.property(5).setValue(2);

var sBurstLayer = compShort.layers.addSolid([0, 0, 0], "Burst", 1920, 1080, 1.0);
sBurstLayer.blendingMode = BlendingMode.ADD;
var sBurst = sBurstLayer.Effects.addProperty("ec.generate.cclightburst");
sBurst.property(1).setValue([979, 540]);
sBurst.property(6).setValue([0.0, 0.824, 1.0, 1]);
sBurst.property(2).setValueAtTime(0.0, 0);
sBurst.property(2).setValueAtTime(1.75, 0);
sBurst.property(2).setValueAtTime(1.82, 220);
sBurst.property(2).setValueAtTime(2.40, 0);

var sC = compShort.layers.add(itemC);
sC.name = "Luminary_C";
sC.transform.opacity.setValueAtTime(0.0, 0);
sC.transform.opacity.setValueAtTime(0.3, 0);
sC.transform.opacity.setValueAtTime(1.0, 100);
sC.transform.scale.setValueAtTime(0.3, [20, 20, 100]);
sC.transform.scale.setValueAtTime(1.7, [50, 50, 100]);
sC.transform.scale.setValueAtTime(2.2, [50, 50, 100]);
sC.transform.scale.setValueAtTime(2.8, [36.46, 36.46, 100]);
sC.transform.position.setValueAtTime(0.3, [960, 540, 0]);
sC.transform.position.setValueAtTime(2.2, [960, 540, 0]);
sC.transform.position.setValueAtTime(2.8, [560, 540, 0]);
sC.transform.rotation.setValueAtTime(0.3, -30);
sC.transform.rotation.setValueAtTime(1.7, 0);

var sStar = compShort.layers.add(itemStar);
sStar.name = "Star_Beacon";
sStar.transform.opacity.setValueAtTime(0.0, 0);
sStar.transform.opacity.setValueAtTime(1.75, 0);
sStar.transform.opacity.setValueAtTime(1.80, 100);
sStar.transform.scale.setValueAtTime(1.75, [0, 0, 100]);
sStar.transform.scale.setValueAtTime(1.85, [85, 85, 100]);
sStar.transform.scale.setValueAtTime(2.10, [50, 50, 100]);
sStar.transform.scale.setValueAtTime(2.20, [50, 50, 100]);
sStar.transform.scale.setValueAtTime(2.80, [36.46, 36.46, 100]);
sStar.transform.position.setValueAtTime(1.75, [979, 540, 0]);
sStar.transform.position.setValueAtTime(2.20, [979, 540, 0]);
sStar.transform.position.setValueAtTime(2.80, [574, 540, 0]);

var sGlow = sStar.Effects.addProperty("ADBE Glo2");
sGlow.property(13).setValue([0.0, 0.824, 1.0, 1]);

var sWord = compShort.layers.add(itemWord);
sWord.name = "Wordmark";
sWord.transform.scale.setValue([48.08, 48.08, 100]);
sWord.transform.opacity.setValueAtTime(0.0, 0);
sWord.transform.opacity.setValueAtTime(2.4, 0);
sWord.transform.opacity.setValueAtTime(2.9, 100);
sWord.transform.position.setValueAtTime(2.4, [1240, 528, 0]);
sWord.transform.position.setValueAtTime(3.0, [1195, 528, 0]);

var sTag = compShort.layers.add(itemTag);
sTag.name = "Tagline";
sTag.transform.scale.setValue([60.0, 60.0, 100]);
sTag.transform.position.setValue([1195, 650, 0]);
sTag.transform.opacity.setValueAtTime(0.0, 0);
sTag.transform.opacity.setValueAtTime(2.8, 0);
sTag.transform.opacity.setValueAtTime(3.3, 100);

var sAudio = compShort.layers.add(itemAudioShort);
sAudio.name = "Soundtrack_Short";

writeLn("Short composition created successfully!");

// Save native project
var saveFile = new File("c:/COGNITARA EXAM PORTAL/CogniTara-Motion-Graphics/cognitara-motion-identity.ecproj");
app.project.save(saveFile);
writeLn("EffectCraft project saved successfully to: " + saveFile.fsName);
'''

with open(JSX_FILE, "w", encoding="utf-8") as f:
    f.write(jsx_script)

print(f"Written JSX script to {JSX_FILE}")

cmd = [EC_CLI, "script", JSX_FILE]
subprocess.run(cmd, check=True)
print("Project regenerated with pristine refined styling!")
