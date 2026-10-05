/**
 * proctor.js – Real-Time AI/CV Exam Proctoring System
 * Features:
 *  - Explicit Camera State Machine & Resilient Hardware Recovery
 *  - YCbCr Connected-Component + Hardware FaceDetector Multi-Face & Obstruction Analysis
 *  - Real-Time Iris/Pupil Eye-Gaze Estimation with Blink Filtering & EMA Smoothing
 *  - 3D Head-Pose Estimation (Yaw, Pitch, Roll) from Facial Geometry
 *  - Combined "Looking Out of Monitor" Multi-Signal Decision System
 *  - Adaptive Noise-Floor & Spectral Formant Voice Activity Detection (VAD)
 *  - Central Proctoring Event Engine with Deduplication & Privacy-Safe Telemetry
 *  - Compact Floating/Dockable Status Panel & Developer Diagnostic Mode
 */

const PROCTOR = (() => {

  // ─── Camera & Pipeline States ───────────────────────────────────────────────
  const CAMERA_STATES = {
    INITIALIZING: 'INITIALIZING',
    WAITING_FOR_PERMISSION: 'WAITING_FOR_PERMISSION',
    CAMERA_READY: 'CAMERA_READY',
    ANALYZING: 'ANALYZING',
    CAMERA_ERROR: 'CAMERA_ERROR',
    CAMERA_DISCONNECTED: 'CAMERA_DISCONNECTED',
    RECOVERING: 'RECOVERING',
    STOPPED: 'STOPPED'
  };

  const GAZE_STATES = {
    CENTER: 'GAZE_CENTER',
    LEFT: 'GAZE_LEFT',
    RIGHT: 'GAZE_RIGHT',
    UP: 'GAZE_UP',
    DOWN: 'GAZE_DOWN',
    UNKNOWN: 'GAZE_UNKNOWN'
  };

  const HEAD_STATES = {
    CENTER: 'CENTER',
    LOOKING_LEFT: 'LOOKING_LEFT',
    LOOKING_RIGHT: 'LOOKING_RIGHT',
    LOOKING_UP: 'LOOKING_UP',
    LOOKING_DOWN: 'LOOKING_DOWN',
    EXTREME_ANGLE: 'EXTREME_ANGLE'
  };

  const VAD_STATES = {
    SPEECH: 'SPEECH',
    NON_SPEECH: 'NON_SPEECH',
    BACKGROUND_NOISE: 'BACKGROUND_NOISE',
    UNCERTAIN: 'UNCERTAIN'
  };

  const MOUTH_STATES = {
    CLOSED: 'MOUTH_CLOSED',
    SLIGHTLY_OPEN: 'MOUTH_SLIGHTLY_OPEN',
    MOVING: 'MOUTH_MOVING',
    POSSIBLE_SPEAKING: 'POSSIBLE_SPEAKING'
  };

  const BOT_STATES = {
    IDLE: 'IDLE',
    WATCHING: 'WATCHING',
    ANALYZING: 'ANALYZING',
    WARNING: 'WARNING',
    VOICE_DETECTED: 'VOICE_DETECTED',
    LOOKING_AWAY: 'LOOKING_AWAY',
    MULTIPLE_FACE: 'MULTIPLE_FACE',
    CAMERA_ERROR: 'CAMERA_ERROR',
    MIC_ERROR: 'MIC_ERROR'
  };

  // ─── Centralized Proctoring Configuration (Section 23) ──────────────────────
  const proctorConfig = {
    gaze: {
      deviation_threshold: 0.19,
      warning_duration_ms: 2800,
      event_duration_ms: 5500
    },
    head_pose: {
      yaw_threshold_deg: 25,
      pitch_threshold_deg: 20,
      roll_threshold_deg: 24,
      extreme_deg: 40,
      duration_ms: 2600
    },
    mouth: {
      open_ratio_threshold: 0.15,
      variance_threshold: 0.008,
      window_frames: 8
    },
    speech: {
      min_duration_ms: 650,
      confidence_threshold: 0.65,
      noise_floor_adaptation: 0.008
    },
    tab_switch: {
      warning_limit: 2,
      max_switches: 10
    },
    fullscreen: {
      mode: 'required_with_warning' // 'optional' | 'required' | 'required_with_warning'
    },
    bot: {
      message_cooldown_ms: 6000
    },
    speaking_confidence_threshold: 0.65,
    mouth_open_threshold: 0.15,
    gaze_deviation_threshold: 0.19,
    head_yaw_threshold: 25,
    head_pitch_threshold: 20,
    speech_duration_threshold_ms: 650,
    bot_message_cooldown_ms: 6000
  };

  // ─── Configurable Proctoring Thresholds (Synced with proctorConfig) ─────────
  let thresholds = {
    analysisIntervalMs: 180,          // ~5.5 FPS throttled CV analysis (keeps UI 60fps)
    faceMissingWarnMs: 2500,          // 2.5s continuous absence -> warning
    faceMissingHighMs: 8000,          // 8.0s continuous absence -> high severity event
    multipleFacesWarnMs: 1800,        // 1.8s continuous multi-face -> warning
    multipleFacesHighMs: 4500,        // 4.5s continuous multi-face -> high event
    gazeDeviationWarnMs: proctorConfig.gaze.warning_duration_ms,
    gazeDeviationEventMs: proctorConfig.gaze.event_duration_ms,
    headYawWarnDeg: proctorConfig.head_pose.yaw_threshold_deg,
    headPitchWarnDeg: proctorConfig.head_pose.pitch_threshold_deg,
    headRollWarnDeg: proctorConfig.head_pose.roll_threshold_deg,
    headExtremeDeg: proctorConfig.head_pose.extreme_deg,
    headSustainedWarnMs: proctorConfig.head_pose.duration_ms,
    headSustainedEventMs: 5200,
    lookingAwayWarnMs: 2200,          // combined gaze + head away warning
    lookingAwayEventMs: 4800,         // combined gaze + head away high event
    minSpeechDurationMs: proctorConfig.speech.min_duration_ms,
    speechConfidenceThreshold: proctorConfig.speech.confidence_threshold,
    lowLightLumThreshold: 36,         // minimum average luminance (0-255)
    obstructionStdDevThreshold: 12,   // minimum pixel std-dev before camera considered obstructed
    eventCooldownMs: 6500             // deduplication cooldown per event type
  };

  // ─── Runtime State ──────────────────────────────────────────────────────────
  let cameraState = CAMERA_STATES.STOPPED;
  let stream = null;
  let videoEl = null;
  let canvasEl = null;
  let detectionIntervalId = null;
  let toolCheckIntervalId = null;
  let recoveryTimerId = null;
  let faceDetector = null;
  let enabled = false;
  let fullscreenGrace = false;
  let fullscreenGraceTimer = null;
  let blurDebounceTimer = null;
  let tabSwitchFrozenUntil = 0;
  let hotkeyToastTimer = null;
  let screenStream = null;
  let videoStream = null;
  let audioStream = null;
  let speechRecognizer = null;
  let lastUserPhysicalActionTime = 0;
  let simulatedStreamInterval = null;
  let isUsingSimulatedStream = false;

  // Counters & Violation State
  let tabSwitchCount = 0;
  let windowBlurCount = 0;
  let fullscreenExitCount = 0;
  let focusLostStartTime = null;
  let fullscreenExitStartTime = null;
  let soundWarningCount = 0;
  let lastSoundWarningTime = 0;
  let lastViolationReason = '';
  let lastViolationTime = 0;
  let awayStartTime = null;

  // Active Per-Quiz Policy
  let activeOptions = {
    camera: true,
    mic: true,
    allowApps: false,
    fullscreen: true,
    fullscreenMode: 'required_with_warning', // 'optional' | 'required' | 'required_with_warning'
    maxTabs: 10,
    maxMalpracticeAttempts: 10,
    maxSounds: 10,
    maxAwaySec: 25
  };

  // Web Audio Pipeline Nodes
  let audioContext = null;
  let audioAnalyser = null;
  let audioHighpassFilter = null;
  let audioAnimFrame = null;

  // Callbacks
  let onMalpractice = null;
  let onTabWarning = null;
  let onSoundWarning = null;
  let onAwayCountdown = null;
  let onLightingWarning = null;

  // ─── Temporal Smoothing & Diagnostic Telemetry State ────────────────────────
  const telemetry = {
    camera: {
      state: CAMERA_STATES.STOPPED,
      deviceLabel: 'None',
      resolution: '0x0',
      fps: 0,
      framesReceived: 0,
      lastFrameTime: 0,
      permission: 'prompt',
      isSimulated: false
    },
    face: {
      detected: false,
      count: 0,
      confidence: 0,
      partiallyOutOfFrame: false,
      obstructed: false,
      lowLighting: false,
      avgLuminance: 0,
      identitySimilarity: 1.0,
      smoothedBox: null,
      baselineSignature: null,
      baselineFrames: 0
    },
    gaze: {
      direction: GAZE_STATES.UNKNOWN,
      confidence: 0,
      relX: 0.5,
      relY: 0.5,
      isBlinking: false
    },
    head: {
      state: HEAD_STATES.CENTER,
      yaw: 0,
      pitch: 0,
      roll: 0,
      confidence: 0
    },
    mouth: {
      state: MOUTH_STATES.CLOSED,
      openRatio: 0,
      variance: 0,
      confidence: 0
    },
    audio: {
      rms: 0,
      noiseFloor: 8.0,
      vadState: VAD_STATES.NON_SPEECH,
      speechConfidence: 0,
      voiceBandEnergy: 0,
      highBandEnergy: 0,
      zcr: 0,
      spectralRatio: 0,
      sustainedSpeechMs: 0
    },
    speakingFusion: {
      audioConfidence: 0,
      mouthConfidence: 0,
      eyeFaceConfidence: 0,
      combinedConfidence: 0,
      isSpeaking: false,
      fusionState: 'SILENT' // SILENT | NOISE_REJECTED | MOUTH_ONLY_IGNORED | AUDIO_ONLY_SPEECH | MULTI_SIGNAL_SPEAKING
    },
    bot: {
      state: BOT_STATES.IDLE,
      message: 'AI Proctor Ready — Monitoring active.',
      lastMessageTime: 0
    },
    focus: {
      tabSwitches: 0,
      windowBlurs: 0,
      fullscreenExits: 0,
      fullscreenActive: false
    },
    compiler: {
      language: 'python',
      compileTimeMs: 0,
      runTimeMs: 0,
      status: 'IDLE'
    },
    overallStatus: 'NORMAL' // NORMAL, WARNING, ERROR, PROCESSING, DISCONNECTED
  };

  // Track physical mouse & keyboard actions to suppress mechanical click/typing transients
  const recordPhysicalAction = () => { lastUserPhysicalActionTime = Date.now(); };
  if (typeof window !== 'undefined') {
    window.addEventListener('mousedown', recordPhysicalAction, { capture: true, passive: true });
    window.addEventListener('mouseup',   recordPhysicalAction, { capture: true, passive: true });
    window.addEventListener('click',     recordPhysicalAction, { capture: true, passive: true });
    window.addEventListener('keydown',   recordPhysicalAction, { capture: true, passive: true });
    window.addEventListener('keyup',     recordPhysicalAction, { capture: true, passive: true });
  }

  // ─── Structured Diagnostic Logger ───────────────────────────────────────────
  let lastDiagLogKey = '';
  function logDiag(category, message, data = null) {
    const key = `${category}:${message}`;
    if (key === lastDiagLogKey) return;
    lastDiagLogKey = key;
    const prefix = `[ProctorIQ:${category}]`;
    if (data !== null) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }

  function setCameraState(newState, reason = '') {
    if (cameraState !== newState) {
      cameraState = newState;
      telemetry.camera.state = newState;
      logDiag('CameraState', `${newState}${reason ? ' — ' + reason : ''}`);
      updateProctorStatusUI();
    }
  }

  // ─── CENTRAL PROCTORING EVENT ENGINE (Sections 6, 9, 10, 14, 21) ───────────
  const ProctorEventEngine = (() => {
    const activeTrackers = {}; // conditionKey -> { startTime, lastSeen, maxConfidence, warned, escalated, eventObj }
    const eventHistory = [];   // Stored privacy-safe metadata events (max 200 in memory)
    const lastAlertByType = {};

    function reset() {
      Object.keys(activeTrackers).forEach(k => delete activeTrackers[k]);
    }

    /**
     * Feed structured detector observations into the unified Event Engine.
     * Combines signals to compute confidence, tracks persistence duration,
     * deduplicates continuous conditions into a single event with duration_ms,
     * and triggers tiered alerts (INFO -> WARNING -> HIGH / SYSTEM_ERROR).
     */
    function processFrameObservations(obs, dtMs) {
      if (!enabled || window._isBugReportModalOpen) return;
      const now = Date.now();

      // 1. Evaluate Combined "LOOKING_AWAY" ("Looking Out of Monitor") Signal
      // Combines: Eye Gaze + Head Pose + Face Orientation + Persistence
      let lookingAwayScore = 0;
      let lookingAwayReasons = [];

      const gazeAway = (obs.gaze.state !== GAZE_STATES.CENTER && obs.gaze.state !== GAZE_STATES.UNKNOWN && !obs.gaze.isBlinking);
      const headTurned = (obs.head.state !== HEAD_STATES.CENTER);
      const headExtreme = (obs.head.state === HEAD_STATES.EXTREME_ANGLE);

      if (headExtreme) {
        lookingAwayScore += 0.65 * obs.head.confidence;
        lookingAwayReasons.push(`head ${obs.head.state.toLowerCase()} (yaw ${Math.round(obs.head.yaw)}°, pitch ${Math.round(obs.head.pitch)}°)`);
      } else if (headTurned) {
        lookingAwayScore += 0.48 * obs.head.confidence;
        lookingAwayReasons.push(`head ${obs.head.state.toLowerCase()}`);
      }

      if (gazeAway) {
        if (headTurned || headExtreme) {
          // Strong multi-signal agreement: both head turned AND eyes averted
          lookingAwayScore += 0.45 * obs.gaze.confidence;
          lookingAwayReasons.push(`eyes ${obs.gaze.state.toLowerCase()}`);
        } else {
          // Head centered + slight eye deviation -> weak evidence unless very strong gaze angle
          lookingAwayScore += 0.28 * obs.gaze.confidence;
          lookingAwayReasons.push(`gaze ${obs.gaze.state.toLowerCase()} (head centered)`);
        }
      }

      if (obs.face.partiallyOutOfFrame) {
        lookingAwayScore += 0.25;
        lookingAwayReasons.push('face partially outside frame');
      }

      lookingAwayScore = Math.min(0.99, lookingAwayScore);

      // Update condition trackers with temporal hysteresis
      updateConditionTracker(
        'NO_FACE',
        !obs.face.detected && !obs.face.obstructed,
        0.92,
        now,
        thresholds.faceMissingWarnMs,
        thresholds.faceMissingHighMs,
        'Candidate face not visible in camera frame'
      );

      updateConditionTracker(
        'CAMERA_OBSTRUCTED',
        obs.face.obstructed,
        0.90,
        now,
        3000,
        7500,
        'Camera lens obstructed or extremely dark frame'
      );

      updateConditionTracker(
        'MULTIPLE_FACES',
        obs.face.count > 1,
        obs.face.confidence,
        now,
        thresholds.multipleFacesWarnMs,
        thresholds.multipleFacesHighMs,
        `Multiple faces (${obs.face.count}) detected in examination frame`
      );

      updateConditionTracker(
        'LOOKING_AWAY',
        obs.face.detected && lookingAwayScore >= 0.52,
        lookingAwayScore,
        now,
        thresholds.lookingAwayWarnMs,
        thresholds.lookingAwayEventMs,
        `Looking away from monitor (${lookingAwayReasons.join(' + ') || 'gaze/head deviation'})`
      );

      updateConditionTracker(
        'UNUSUAL_HEAD_POSE',
        obs.face.detected && headExtreme,
        obs.head.confidence,
        now,
        thresholds.headSustainedWarnMs,
        thresholds.headSustainedEventMs,
        `Sustained extreme head pose (yaw ${Math.round(obs.head.yaw)}°, pitch ${Math.round(obs.head.pitch)}°)`
      );

      updateConditionTracker(
        'LOW_LIGHTING',
        obs.face.lowLighting && !obs.face.obstructed,
        0.80,
        now,
        3500,
        15000,
        'Insufficient room lighting on candidate face'
      );

      // Compute overall proctor visual status
      if (cameraState === CAMERA_STATES.CAMERA_ERROR || cameraState === CAMERA_STATES.CAMERA_DISCONNECTED) {
        telemetry.overallStatus = 'DISCONNECTED';
      } else if (cameraState === CAMERA_STATES.INITIALIZING || cameraState === CAMERA_STATES.WAITING_FOR_PERMISSION || cameraState === CAMERA_STATES.RECOVERING) {
        telemetry.overallStatus = 'PROCESSING';
      } else if (
        isTrackerActive('NO_FACE', 1200) ||
        isTrackerActive('MULTIPLE_FACES', 1000) ||
        isTrackerActive('LOOKING_AWAY', 1400) ||
        isTrackerActive('SPEECH_DETECTED', 400)
      ) {
        telemetry.overallStatus = 'WARNING';
      } else {
        telemetry.overallStatus = 'NORMAL';
      }
    }

    function isTrackerActive(type, minDurationMs = 500) {
      const t = activeTrackers[type];
      if (!t) return false;
      return (t.lastSeen - t.startTime) >= minDurationMs;
    }

    function updateConditionTracker(type, isActive, confidence, now, warnDurationMs, highDurationMs, reason) {
      let tracker = activeTrackers[type];

      if (isActive) {
        if (!tracker) {
          tracker = {
            type,
            startTime: now,
            lastSeen: now,
            maxConfidence: confidence,
            warned: false,
            escalated: false,
            reason,
            eventObj: {
              event_type: type,
              type: type,
              start_time: new Date(now).toISOString(),
              end_time: new Date(now).toISOString(),
              timestamp: now,
              duration_ms: 0,
              confidence: Number(confidence.toFixed(2)),
              severity: 'INFO',
              reason
            }
          };
          activeTrackers[type] = tracker;
        } else {
          tracker.lastSeen = now;
          tracker.maxConfidence = Math.max(tracker.maxConfidence, confidence);
          tracker.reason = reason;
          tracker.eventObj.end_time = new Date(now).toISOString();
          tracker.eventObj.duration_ms = now - tracker.startTime;
          tracker.eventObj.confidence = Number(tracker.maxConfidence.toFixed(2));
          tracker.eventObj.reason = reason;
        }

        const duration = now - tracker.startTime;

        // Tier 1: Persistent for warnDurationMs -> WARNING
        if (!tracker.warned && duration >= warnDurationMs) {
          tracker.warned = true;
          tracker.eventObj.severity = 'WARNING';
          recordOrUpdateEvent(tracker.eventObj);
          dispatchEngineAlert(tracker.eventObj);
        }

        // Tier 2: Persistent for highDurationMs -> HIGH severity event
        if (!tracker.escalated && duration >= highDurationMs) {
          tracker.escalated = true;
          tracker.eventObj.severity = 'HIGH';
          recordOrUpdateEvent(tracker.eventObj, true);
          dispatchEngineAlert(tracker.eventObj);
        }
      } else if (tracker) {
        // Grace decay: allow up to 450ms of brief recovery before closing an active tracker
        if (now - tracker.lastSeen > 450) {
          if (tracker.warned || tracker.escalated) {
            tracker.eventObj.end_time = new Date(tracker.lastSeen).toISOString();
            tracker.eventObj.duration_ms = tracker.lastSeen - tracker.startTime;
            recordOrUpdateEvent(tracker.eventObj, true);
          }
          delete activeTrackers[type];
        }
      }
    }

    function recordInstantEvent(type, severity, confidence, durationMs, reason) {
      const now = Date.now();
      const lastTime = lastAlertByType[type] || 0;
      if (now - lastTime < thresholds.eventCooldownMs && severity !== 'SYSTEM_ERROR') {
        return null;
      }
      lastAlertByType[type] = now;

      const evt = {
        event_type: type,
        type: type,
        start_time: new Date(now - durationMs).toISOString(),
        end_time: new Date(now).toISOString(),
        timestamp: now,
        duration_ms: Math.round(durationMs),
        confidence: Number(Number(confidence || 0.9).toFixed(2)),
        severity: severity,
        reason: reason
      };
      recordOrUpdateEvent(evt, true);
      dispatchEngineAlert(evt);
      return evt;
    }

    function recordOrUpdateEvent(evtObj, sendToBackend = false) {
      const existingIdx = eventHistory.findIndex(e => e.type === evtObj.type && e.start_time === evtObj.start_time);
      const snapshot = { ...evtObj };
      if (existingIdx !== -1) {
        eventHistory[existingIdx] = snapshot;
      } else {
        eventHistory.push(snapshot);
        if (eventHistory.length > 200) eventHistory.shift();
      }

      updateDiagnosticEventsUI();

      if (sendToBackend) {
        try {
          fetch('/api/proctor/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot)
          }).catch(() => {});
        } catch (_) {}
      }
    }

    function dispatchEngineAlert(evt) {
      const now = Date.now();
      logDiag('EventEngine', `[${evt.severity}] ${evt.event_type} (${evt.duration_ms}ms, conf=${evt.confidence}): ${evt.reason}`);

      if (evt.event_type === 'LOW_LIGHTING') {
        onLightingWarning && onLightingWarning(true);
        return;
      }

      if (evt.event_type === 'SPEECH_DETECTED') {
        handleVoiceWarning(`${evt.reason} (conf: ${Math.round(evt.confidence * 100)}%, ${(evt.duration_ms / 1000).toFixed(1)}s)`);
        return;
      }

      if (evt.event_type === 'MULTIPLE_FACES' && evt.severity === 'HIGH') {
        handleMalpracticeViolation(evt.reason);
        return;
      }

      if ((evt.event_type === 'LOOKING_AWAY' || evt.event_type === 'UNUSUAL_HEAD_POSE') && evt.severity === 'HIGH') {
        // Count as a malpractice warning strike (with cooldown) rather than single-frame termination
        if (now - (lastAlertByType['GAZE_STRIKE'] || 0) > 10000) {
          lastAlertByType['GAZE_STRIKE'] = now;
          handleMalpracticeViolation(evt.reason);
        }
      }
    }

    return {
      reset,
      processFrameObservations,
      recordInstantEvent,
      getHistory: () => [...eventHistory],
      getActiveTrackers: () => ({ ...activeTrackers })
    };
  })();

  // ─── Initialise Proctoring ───────────────────────────────────────────────────
  async function init(callbacks, options = {}) {
    if (typeof callbacks === 'function') {
      onMalpractice = callbacks;
    } else if (callbacks) {
      onMalpractice     = callbacks.onMalpractice;
      onTabWarning      = callbacks.onTabWarning;
      onSoundWarning    = callbacks.onSoundWarning;
      onAwayCountdown   = callbacks.onAwayCountdown;
      onLightingWarning = callbacks.onLightingWarning;
    }

    const configuredAttempts = Math.max(10, Number(options.maxMalpracticeAttempts || options.maxTabs || (typeof CONFIG !== 'undefined' && CONFIG.MAX_TAB_SWITCHES) || 10));
    const fsOpt = options.fullscreen !== undefined ? Boolean(options.fullscreen) : (typeof CONFIG !== 'undefined' ? CONFIG.FULLSCREEN_LOCKDOWN !== false : true);
    const fsMode = options.fullscreenMode || (fsOpt ? 'required_with_warning' : 'optional');

    activeOptions = {
      camera: options.camera !== undefined ? Boolean(options.camera) : true,
      mic: options.mic !== undefined ? Boolean(options.mic) : true,
      allowApps: options.allowApps !== undefined ? Boolean(options.allowApps) : false,
      fullscreen: fsOpt,
      fullscreenMode: fsMode,
      maxTabs: configuredAttempts,
      maxMalpracticeAttempts: configuredAttempts,
      maxSounds: options.maxSounds !== undefined ? Number(options.maxSounds) : (typeof CONFIG !== 'undefined' && CONFIG.MAX_SOUND_WARNINGS !== undefined ? CONFIG.MAX_SOUND_WARNINGS : 10),
      maxAwaySec: options.maxAwaySec !== undefined ? Number(options.maxAwaySec) : (typeof CONFIG !== 'undefined' && CONFIG.MAX_AWAY_SECONDS !== undefined ? CONFIG.MAX_AWAY_SECONDS : 25)
    };
    proctorConfig.fullscreen.mode = fsMode;
    proctorConfig.tab_switch.max_switches = configuredAttempts;

    tabSwitchCount = 0;
    windowBlurCount = 0;
    fullscreenExitCount = 0;
    focusLostStartTime = null;
    fullscreenExitStartTime = null;
    soundWarningCount = 0;
    awayStartTime = null;
    lastSoundWarningTime = 0;
    enabled = true;
    tabSwitchFrozenUntil = Date.now() + 1800;
    telemetry.face.baselineSignature = null;
    telemetry.face.baselineFrames = 0;
    telemetry.face.smoothedBox = null;
    telemetry.camera.framesReceived = 0;
    telemetry.focus.tabSwitches = 0;
    telemetry.focus.windowBlurs = 0;
    telemetry.focus.fullscreenExits = 0;
    telemetry.focus.fullscreenActive = Boolean(document.fullscreenElement);
    telemetry.bot.state = BOT_STATES.WATCHING;
    telemetry.bot.message = 'AI Proctor active — Monitoring face, gaze, and voice.';
    ProctorEventEngine.reset();

    setCameraState(CAMERA_STATES.INITIALIZING, 'Starting proctoring engine');

    // 1. Enter fullscreen if configured
    if (activeOptions.fullscreen) {
      enterFullscreen();
    }
    updateFullscreenHudBadge();

    // Update Top HUD badges
    const hudSoundBadge = document.getElementById('hudSoundBadge');
    if (hudSoundBadge) {
      hudSoundBadge.style.display = activeOptions.mic ? 'inline-flex' : 'none';
    }

    // 2. Initialize hardware FaceDetector API if supported by Chromium
    if (activeOptions.camera && 'FaceDetector' in window) {
      try {
        faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
        logDiag('Init', 'Hardware ShapeDetection FaceDetector initialized');
      } catch (_) {
        faceDetector = null;
      }
    } else {
      faceDetector = null;
    }

    // 3. Ensure live status, Animated AI Proctor Bot & diagnostic UI panels exist
    ensureProctorTelemetryUI();
    const botEl = document.getElementById('aiProctorBot');
    if (botEl) botEl.style.display = 'flex';

    // 4. Request Media Devices and start analysis ONLY after valid frames are verified
    await requestMediaDevices();

    // 5. Start external AI process scanner if external apps are forbidden
    if (!activeOptions.allowApps && (typeof CONFIG === 'undefined' || CONFIG.ANTI_AI_SCANNER !== false)) {
      clearInterval(toolCheckIntervalId);
      toolCheckIntervalId = setInterval(checkProhibitedProcesses, 4000);
    }

    // 6. Security Event Listeners
    document.addEventListener('visibilitychange', onVisibilityChange, { capture: true });
    window.addEventListener('blur', onWindowBlur, { capture: true });
    window.addEventListener('focus', onWindowFocus, { capture: true });
    document.addEventListener('fullscreenchange', onFullscreenChange, { capture: true });
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('contextmenu', blockEvent, { capture: true });
    document.addEventListener('copy', blockEvent, { capture: true });
    document.addEventListener('cut', blockEvent, { capture: true });
    document.addEventListener('paste', blockEvent, { capture: true });
    window.addEventListener('keydown', onSecurityKeydown, { capture: true });
    document.addEventListener('keydown', onSecurityKeydown, { capture: true });

    // Optional screen share
    requestScreenShare().catch(() => {});
  }

  function onBeforeUnload(e) {
    if (!enabled) return;
    ProctorEventEngine.recordInstantEvent('EXAM_NAVIGATION_ATTEMPT', 'WARNING', 1.0, 0, 'Attempted to navigate away or reload exam page');
    e.preventDefault();
    e.returnValue = 'Examination in progress. Leaving this page will be recorded by the proctoring engine.';
    return e.returnValue;
  }

  function updateFullscreenHudBadge() {
    const isFs = Boolean(document.fullscreenElement);
    telemetry.focus.fullscreenActive = isFs;
    let fsBadge = document.getElementById('hudFullscreenBadge');
    const hudLeft = document.querySelector('#proctorHUD .hud-left-group');
    if (!fsBadge && hudLeft) {
      fsBadge = document.createElement('div');
      fsBadge.id = 'hudFullscreenBadge';
      fsBadge.className = 'security-badge';
      hudLeft.appendChild(fsBadge);
    }
    if (fsBadge) {
      if (isFs) {
        fsBadge.className = 'security-badge ok';
        fsBadge.innerHTML = '<span class="strike-icon">⛶</span><span>FULLSCREEN ACTIVE ✓</span>';
      } else {
        fsBadge.className = activeOptions.fullscreen ? 'security-badge warn' : 'security-badge';
        fsBadge.innerHTML = `<span class="strike-icon">⛶</span><span>${activeOptions.fullscreen ? 'FULLSCREEN EXIT ⚠' : 'WINDOWED MODE'}</span>`;
      }
    }
  }

  // ─── Native Fullscreen Management (Section 5) ────────────────────────────────
  function enterFullscreen() {
    fullscreenGrace = true;
    clearTimeout(fullscreenGraceTimer);
    fullscreenGraceTimer = setTimeout(() => {
      fullscreenGrace = false;
      updateFullscreenHudBadge();
    }, 1800);

    if (typeof API !== 'undefined' && API.enterFullscreen) {
      API.enterFullscreen().catch(() => {});
    }
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    setTimeout(updateFullscreenHudBadge, 250);
  }

  function onFullscreenChange() {
    updateFullscreenHudBadge();
    if (!enabled) return;
    if (!document.fullscreenElement) {
      fullscreenExitStartTime = Date.now();
      fullscreenExitCount++;
      telemetry.focus.fullscreenExits = fullscreenExitCount;
      ProctorEventEngine.recordInstantEvent(
        'FULLSCREEN_EXIT',
        activeOptions.fullscreen ? 'WARNING' : 'INFO',
        1.0,
        0,
        `Candidate exited fullscreen mode (exit #${fullscreenExitCount})`
      );
      if (activeOptions.fullscreen && activeOptions.fullscreenMode !== 'optional') {
        enterFullscreen();
        setTimeout(() => {
          if (!document.fullscreenElement && enabled && activeOptions.fullscreen) {
            handleMalpracticeViolation('Exited fullscreen mode during examination', 'FULLSCREEN_EXIT');
          }
        }, 2000);
      }
    } else if (fullscreenExitStartTime) {
      fullscreenExitStartTime = null;
    }
  }

  // ─── Resilient Media Device Acquisition & Camera State Machine (Section 2) ──
  async function requestMediaDevices() {
    videoEl  = document.getElementById('cameraFeed');
    canvasEl = document.getElementById('detectionCanvas');
    const pipEl = document.getElementById('proctorPip');
    const pipVideoContainer = document.querySelector('.pip-video-container');
    const pipAudioMonitor = document.querySelector('.pip-audio-monitor');

    if (!activeOptions.camera && !activeOptions.mic) {
      if (pipEl) pipEl.style.display = 'none';
      setCameraState(CAMERA_STATES.STOPPED, 'Camera and mic disabled by exam policy');
      return;
    }

    if (pipEl) pipEl.style.display = 'flex';
    if (pipVideoContainer) pipVideoContainer.style.display = activeOptions.camera ? 'block' : 'none';
    if (pipAudioMonitor) pipAudioMonitor.style.display = activeOptions.mic ? 'flex' : 'none';

    setupPipDrag();
    setCameraState(CAMERA_STATES.WAITING_FOR_PERMISSION, 'Requesting camera/microphone permissions');

    videoStream = null;
    audioStream = null;
    isUsingSimulatedStream = false;
    let lastCameraError = null;

    // Step 1: Enumerate devices to check hardware existence
    let hasVideoHardware = true;
    let hasAudioHardware = true;
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        hasVideoHardware = videoInputs.length > 0;
        hasAudioHardware = audioInputs.length > 0;
        console.log(`Camera device: ${hasVideoHardware ? 'detected (' + videoInputs.length + ')' : 'none found'}`);
        if (videoInputs[0]?.label) telemetry.camera.deviceLabel = videoInputs[0].label;
      } catch (e) {
        console.warn('[ProctorIQ] enumerateDevices notice:', e.message);
      }
    }

    // Step 2: Combined getUserMedia request
    if (activeOptions.camera && activeOptions.mic && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const combined = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (combined) {
          if (combined.getVideoTracks().length > 0) videoStream = new MediaStream(combined.getVideoTracks());
          if (combined.getAudioTracks().length > 0) audioStream = new MediaStream(combined.getAudioTracks());
          telemetry.camera.permission = 'granted';
          console.log('Camera permission: granted');
        }
      } catch (err) {
        lastCameraError = err;
        console.warn('[ProctorIQ] Combined getUserMedia fallback:', err.name, err.message);
      }
    }

    // Step 3: Video fallback constraints if not acquired yet
    if (!videoStream && activeOptions.camera && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const videoAttempts = [
        { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } },
        { video: { width: { ideal: 320 }, height: { ideal: 240 } } },
        { video: true }
      ];
      for (const vConstraint of videoAttempts) {
        try {
          videoStream = await navigator.mediaDevices.getUserMedia(vConstraint);
          if (videoStream && videoStream.getVideoTracks().length > 0) {
            telemetry.camera.permission = 'granted';
            console.log('Camera permission: granted');
            break;
          }
        } catch (err) {
          lastCameraError = err;
        }
      }
    }

    // Step 4: Audio fallback constraints if not acquired yet
    if (!audioStream && activeOptions.mic && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const audioAttempts = [
        { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
        { audio: true }
      ];
      for (const aConstraint of audioAttempts) {
        try {
          audioStream = await navigator.mediaDevices.getUserMedia(aConstraint);
          if (audioStream && audioStream.getAudioTracks().length > 0) break;
        } catch (err) {
          console.warn('[ProctorIQ] Audio constraint fallback:', err.name);
        }
      }
    }

    // Step 5: Diagnose any camera error accurately (Permission denied vs In use by another app vs No hardware)
    if (!videoStream && activeOptions.camera) {
      let errReason = 'Camera unavailable';
      if (lastCameraError) {
        if (lastCameraError.name === 'NotAllowedError' || lastCameraError.name === 'PermissionDeniedError') {
          telemetry.camera.permission = 'denied';
          errReason = 'Camera permission denied by user/browser';
        } else if (lastCameraError.name === 'NotReadableError' || lastCameraError.name === 'TrackStartError') {
          errReason = 'Camera is currently in use by another application';
        } else if (lastCameraError.name === 'NotFoundError' || lastCameraError.name === 'DevicesNotFoundError' || !hasVideoHardware) {
          errReason = 'No physical camera hardware detected';
        } else {
          errReason = `${lastCameraError.name}: ${lastCameraError.message}`;
        }
      }
      setCameraState(CAMERA_STATES.CAMERA_ERROR, errReason);
      ProctorEventEngine.recordInstantEvent('CAMERA_INTERRUPTED', 'SYSTEM_ERROR', 0.95, 0, errReason);
    }

    // Step 6: Attach video stream and verify frames before starting analysis
    if (videoEl && activeOptions.camera) {
      if (videoStream) {
        if (simulatedStreamInterval) {
          clearInterval(simulatedStreamInterval);
          simulatedStreamInterval = null;
        }
        isUsingSimulatedStream = false;
        telemetry.camera.isSimulated = false;

        const vTrack = videoStream.getVideoTracks()[0];
        if (vTrack) {
          telemetry.camera.deviceLabel = vTrack.label || 'Hardware Webcam';
          attachTrackRecoveryListeners(vTrack, 'video');
        }

        await attachStreamAndVerifyFrames(videoStream, false, null);
      } else {
        // Resilient fallback: start simulated stream so UI preview works while showing actionable hardware status
        const simStream = startSimulatedCameraStream();
        if (simStream) {
          isUsingSimulatedStream = true;
          telemetry.camera.isSimulated = true;
          telemetry.camera.deviceLabel = 'Simulated Fallback Stream';
          await attachStreamAndVerifyFrames(simStream, true, lastCameraError);
        } else {
          showPipCamFallback(false, lastCameraError);
        }
      }

      const resumeVideoPlay = () => {
        if (videoEl && videoEl.paused) videoEl.play().catch(() => {});
      };
      window.addEventListener('click', resumeVideoPlay, { passive: true });
      window.addEventListener('keydown', resumeVideoPlay, { passive: true });
    }

    // Step 7: Attach audio stream & VAD
    if (audioStream) {
      const aTrack = audioStream.getAudioTracks()[0];
      if (aTrack) attachTrackRecoveryListeners(aTrack, 'audio');
      setupAudioMonitoring(audioStream);
      setupSpeechRecognition();
    }

    updatePipHeaderBadge();
    updateProctorStatusUI();
  }

  function attachTrackRecoveryListeners(track, kind) {
    track.onended = () => {
      if (!enabled) return;
      logDiag('Recovery', `${kind.toUpperCase()} track ended unexpectedly — initiating recovery`);
      if (kind === 'video') {
        setCameraState(CAMERA_STATES.CAMERA_DISCONNECTED, 'Video track disconnected');
        ProctorEventEngine.recordInstantEvent('CAMERA_INTERRUPTED', 'WARNING', 0.95, 0, 'Camera disconnected during exam');
        scheduleHardwareRecovery();
      } else if (kind === 'audio') {
        scheduleHardwareRecovery();
      }
    };
  }

  function scheduleHardwareRecovery() {
    if (!enabled) return;
    clearTimeout(recoveryTimerId);
    setCameraState(CAMERA_STATES.RECOVERING, 'Attempting automatic camera/mic reconnection');
    setPipStatus('Recovering...', 'warn');
    recoveryTimerId = setTimeout(async () => {
      if (!enabled) return;
      await retryCamera();
    }, 2500);
  }

  async function attachStreamAndVerifyFrames(mediaStream, isSim, hardwareErr) {
    if (!videoEl) return;
    videoEl.srcObject = mediaStream;
    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('autoplay', '');
    videoEl.setAttribute('muted', '');
    videoEl.setAttribute('playsinline', '');
    videoEl.style.display = 'block';

    try {
      await videoEl.play();
    } catch (_) {}

    // Wait up to 3 seconds for readyState >= 2 and non-zero dimensions
    const startWait = Date.now();
    while (enabled && (videoEl.readyState < 2 || videoEl.videoWidth === 0) && (Date.now() - startWait < 3000)) {
      await new Promise(r => setTimeout(r, 80));
    }

    if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
      telemetry.camera.resolution = `${videoEl.videoWidth}x${videoEl.videoHeight}`;
      console.log('Video stream: active');
      setCameraState(CAMERA_STATES.CAMERA_READY, `Stream active (${telemetry.camera.resolution})`);

      if (isSim) {
        showPipCamFallback(true, hardwareErr);
      } else {
        hidePipCamFallback();
      }

      const eyeBadge = document.getElementById('pipEyeTracker');
      if (eyeBadge) eyeBadge.style.display = 'inline-flex';

      // Start continuous vision analysis loop ONLY after stream is ready
      startVisionLoop();
    } else {
      setCameraState(CAMERA_STATES.CAMERA_ERROR, 'Video stream failed to produce valid frames');
      showPipCamFallback(false, hardwareErr);
    }
  }

  function startVisionLoop() {
    clearInterval(detectionIntervalId);
    if (!activeOptions.camera || !enabled) return;
    console.log('Analysis pipeline: running');
    detectionIntervalId = setInterval(runVisualDetection, thresholds.analysisIntervalMs);
  }

  function updatePipHeaderBadge() {
    if (videoStream && !isUsingSimulatedStream && audioStream) {
      setPipStatus('● Camera Active', 'ok');
    } else if (videoStream && !isUsingSimulatedStream) {
      setPipStatus('● Cam Active', 'ok');
    } else if (isUsingSimulatedStream) {
      setPipStatus('● Sim Standby', 'warn');
    } else if (audioStream) {
      setPipStatus('● Mic Active', 'warn');
    } else {
      setPipStatus('● Disconnected', 'warn');
    }
  }

  // ─── Simulated Fallback Stream (When No Physical Webcam Available) ───────────
  function startSimulatedCameraStream() {
    if (!canvasEl) canvasEl = document.getElementById('detectionCanvas');
    if (!videoEl) videoEl = document.getElementById('cameraFeed');
    if (!canvasEl || !videoEl) return null;

    const simCanvas = document.createElement('canvas');
    simCanvas.width = 320;
    simCanvas.height = 240;
    const ctx = simCanvas.getContext('2d');

    let eyeOffsetX = 0;
    let eyeOffsetY = 0;
    let blinkState = false;
    let frameCount = 0;

    if (simulatedStreamInterval) clearInterval(simulatedStreamInterval);

    function drawSimulatedFrame() {
      frameCount++;
      if (frameCount % 60 === 0) {
        eyeOffsetX = (Math.random() - 0.5) * 3;
        eyeOffsetY = (Math.random() - 0.5) * 1.5;
      }
      blinkState = (frameCount % 120 >= 116);

      ctx.fillStyle = '#141826';
      ctx.fillRect(0, 0, 320, 240);

      const glow = ctx.createRadialGradient(160, 120, 30, 160, 120, 140);
      glow.addColorStop(0, 'rgba(99, 102, 241, 0.28)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 320, 240);

      // Shoulders
      ctx.fillStyle = '#1e243b';
      ctx.beginPath();
      ctx.ellipse(160, 232, 92, 58, 0, 0, Math.PI * 2);
      ctx.fill();

      //Realistic warm skin-tone face so YCbCr & eye landmark detector can analyze simulated feed too
      ctx.fillStyle = '#d8a484';
      ctx.beginPath();
      ctx.ellipse(160, 118, 46, 58, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hair / forehead top
      ctx.fillStyle = '#232738';
      ctx.beginPath();
      ctx.arc(160, 88, 47, Math.PI, 0);
      ctx.fill();

      // Eyebrows
      ctx.strokeStyle = '#3b2e2a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(132, 98); ctx.lineTo(150, 97);
      ctx.moveTo(170, 97); ctx.lineTo(188, 98);
      ctx.stroke();

      // Eyes
      if (blinkState) {
        ctx.strokeStyle = '#3b2e2a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(134, 110); ctx.lineTo(150, 110);
        ctx.moveTo(170, 110); ctx.lineTo(186, 110);
        ctx.stroke();
      } else {
        // Sclera
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.ellipse(142, 110, 9, 5.5, 0, 0, Math.PI * 2);
        ctx.ellipse(178, 110, 9, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Iris + Pupil
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(142 + eyeOffsetX, 110 + eyeOffsetY, 3.8, 0, Math.PI * 2);
        ctx.arc(178 + eyeOffsetX, 110 + eyeOffsetY, 3.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.arc(142 + eyeOffsetX, 110 + eyeOffsetY, 2.0, 0, Math.PI * 2);
        ctx.arc(178 + eyeOffsetX, 110 + eyeOffsetY, 2.0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Nose bridge & mouth
      ctx.strokeStyle = '#b57c5c';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(160, 110); ctx.lineTo(158, 132); ctx.lineTo(164, 134);
      ctx.stroke();

      ctx.strokeStyle = '#8c4f41';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(160, 146, 12, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = 'rgba(16, 185, 129, 0.85)';
      ctx.font = 'bold 9px Segoe UI, sans-serif';
      ctx.fillText('● PROCTOR FEED: ACTIVE', 10, 230);
    }

    drawSimulatedFrame();
    simulatedStreamInterval = setInterval(drawSimulatedFrame, 40);

    if (simCanvas.captureStream) {
      try {
        return simCanvas.captureStream(25);
      } catch (_) {}
    }
    return null;
  }

  function showPipCamFallback(hasSimStream = false, err = null) {
    const cont = document.querySelector('.pip-video-container');
    if (!cont) return;
    let fallback = document.getElementById('pipCamFallbackPrompt');
    if (!fallback) {
      fallback = document.createElement('div');
      fallback.id = 'pipCamFallbackPrompt';
      fallback.className = 'pip-cam-fallback-prompt';
      cont.appendChild(fallback);
    }
    let reasonShort = 'Standby Mode';
    if (err) {
      if (err.name === 'NotAllowedError') reasonShort = 'Permission Denied';
      else if (err.name === 'NotReadableError') reasonShort = 'Cam In Use';
      else if (err.name === 'NotFoundError') reasonShort = 'No Webcam Found';
    }
    if (hasSimStream) {
      fallback.className = 'pip-cam-fallback-prompt minimal';
      fallback.innerHTML = `
        <span style="font-size:0.65rem; color:#fcd34d; font-weight:600;" title="${err ? err.message : ''}">⚠️ ${reasonShort}</span>
        <button type="button" class="pip-cam-retry-btn" onclick="PROCTOR.retryCamera()">📷 Retry Cam</button>
      `;
    } else {
      fallback.className = 'pip-cam-fallback-prompt';
      fallback.innerHTML = `
        <div style="font-size:1.3rem; margin-bottom:0.15rem;">📷</div>
        <div style="font-size:0.72rem; font-weight:700; color:#e2e8f0;">${reasonShort}</div>
        <button type="button" class="pip-cam-retry-btn" onclick="PROCTOR.retryCamera()">Connect Camera</button>
      `;
    }
    fallback.style.display = 'flex';
  }

  function hidePipCamFallback() {
    const fallback = document.getElementById('pipCamFallbackPrompt');
    if (fallback) fallback.style.display = 'none';
  }

  async function retryCamera() {
    try {
      setCameraState(CAMERA_STATES.RECOVERING, 'Manual/auto camera retry');
      const vStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      if (vStream && vStream.getVideoTracks().length > 0) {
        if (simulatedStreamInterval) {
          clearInterval(simulatedStreamInterval);
          simulatedStreamInterval = null;
        }
        isUsingSimulatedStream = false;
        telemetry.camera.isSimulated = false;
        videoStream = vStream;
        const vTrack = vStream.getVideoTracks()[0];
        if (vTrack) {
          telemetry.camera.deviceLabel = vTrack.label || 'Hardware Webcam';
          attachTrackRecoveryListeners(vTrack, 'video');
        }
        await attachStreamAndVerifyFrames(vStream, false, null);
        updatePipHeaderBadge();
      }
    } catch (err) {
      console.warn('[ProctorIQ] Camera retry failed:', err.name, err.message);
      setCameraState(CAMERA_STATES.CAMERA_ERROR, err.message || 'Retry failed');
      updatePipHeaderBadge();
    }
  }

  // ─── Live Telemetry Overlay, AI Proctor Bot, Status Panel & Diagnostic Mode UI ──
  function ensureProctorTelemetryUI() {
    const pipEl = document.getElementById('proctorPip');
    if (pipEl && !document.getElementById('pipTelemetryStrip')) {
      const strip = document.createElement('div');
      strip.id = 'pipTelemetryStrip';
      strip.className = 'pip-telemetry-strip';
      strip.innerHTML = `
        <div class="pts-item" id="ptsFace"><span class="pts-dot"></span><span class="pts-label">Face:</span> <strong id="ptsFaceVal">Init</strong></div>
        <div class="pts-item" id="ptsGaze"><span class="pts-dot"></span><span class="pts-label">Gaze:</span> <strong id="ptsGazeVal">Center</strong></div>
        <div class="pts-item" id="ptsHead"><span class="pts-dot"></span><span class="pts-label">Head:</span> <strong id="ptsHeadVal">Normal</strong></div>
        <div class="pts-item" id="ptsMouth"><span class="pts-dot"></span><span class="pts-label">Mouth:</span> <strong id="ptsMouthVal">Closed</strong></div>
        <div class="pts-item" id="ptsAudio"><span class="pts-dot"></span><span class="pts-label">Audio:</span> <strong id="ptsAudioVal">Quiet</strong></div>
      `;
      pipEl.appendChild(strip);

      // Add Diagnostic toggle button to PiP header controls if not present
      const controls = pipEl.querySelector('.pip-header-controls');
      if (controls && !document.getElementById('pipDiagBtn')) {
        const diagBtn = document.createElement('button');
        diagBtn.type = 'button';
        diagBtn.id = 'pipDiagBtn';
        diagBtn.className = 'pip-toggle-btn';
        diagBtn.title = 'Toggle Proctor Status & Diagnostic Telemetry (Ctrl+Shift+D)';
        diagBtn.textContent = '📊';
        diagBtn.onclick = (e) => {
          e.stopPropagation();
          toggleDiagnosticsPanel();
        };
        controls.insertBefore(diagBtn, controls.firstChild);
      }
    }

    // Create Persistent Animated AI Proctor Bot (Sections 10, 11, 12, 20)
    if (!document.getElementById('aiProctorBot')) {
      const botEl = document.createElement('div');
      botEl.id = 'aiProctorBot';
      botEl.className = 'ai-proctor-bot state-watching';
      botEl.style.display = 'none';
      botEl.innerHTML = `
        <div class="ai-bot-avatar" id="aiBotAvatar" title="AI Proctor Assistant — Click to toggle diagnostics">
          <div class="ai-bot-ScannerRing"></div>
          <div class="ai-bot-face">
            <div class="ai-bot-eye" id="aiBotEyeLeft"><div class="ai-bot-pupil" id="aiBotPupilLeft"></div></div>
            <div class="ai-bot-eye" id="aiBotEyeRight"><div class="ai-bot-pupil" id="aiBotPupilRight"></div></div>
          </div>
          <span class="ai-bot-pulse-dot" id="aiBotPulseDot"></span>
        </div>
        <div class="ai-bot-info">
          <div class="ai-bot-top-row">
            <span class="ai-bot-title">AI PROCTOR</span>
            <span class="ai-bot-state-badge" id="aiBotStateBadge">WATCHING</span>
          </div>
          <div class="ai-bot-msg" id="aiBotMessageBubble">Monitoring active — Keep eyes focused on screen.</div>
        </div>
      `;
      botEl.querySelector('#aiBotAvatar').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDiagnosticsPanel();
      });
      document.body.appendChild(botEl);
    }
    const botWidget = document.getElementById('aiProctorBot');
    if (botWidget && enabled) {
      botWidget.style.display = 'flex';
    }

    // Create collapsible Diagnostic & Proctor Status Drawer if not present
    if (!document.getElementById('proctorDiagnosticsDrawer')) {
      const drawer = document.createElement('div');
      drawer.id = 'proctorDiagnosticsDrawer';
      drawer.className = 'proctor-diag-drawer';
      drawer.style.display = 'none';
      drawer.innerHTML = `
        <div class="pdd-header">
          <div class="pdd-title-row">
            <span>🛡️ PROCTORING STATUS & DIAGNOSTICS</span>
            <span id="pddOverallBadge" class="pdd-state-pill normal">NORMAL</span>
          </div>
          <button type="button" class="pdd-close-btn" onclick="PROCTOR.toggleDiagnosticsPanel()">✕</button>
        </div>
        <div class="pdd-body">
          <div class="pdd-section">
            <div class="pdd-sec-title">PROCTORING STATUS</div>
            <div class="pdd-status-grid">
              <div class="pdd-stat-row"><span>Camera</span><strong id="pddStatCam">✓ Active</strong></div>
              <div class="pdd-stat-row"><span>Face</span><strong id="pddStatFace">✓ Detected</strong></div>
              <div class="pdd-stat-row"><span>Eye Gaze</span><strong id="pddStatGaze">✓ Normal</strong></div>
              <div class="pdd-stat-row"><span>Head Pose</span><strong id="pddStatHead">✓ Normal</strong></div>
              <div class="pdd-stat-row"><span>Mouth</span><strong id="pddStatMouth">✓ Closed</strong></div>
              <div class="pdd-stat-row"><span>Microphone</span><strong id="pddStatMic">✓ Monitoring</strong></div>
              <div class="pdd-stat-row"><span>3-Signal Fusion</span><strong id="pddStatFusion">✓ Silent</strong></div>
            </div>
          </div>
          <div class="pdd-section">
            <div class="pdd-sec-title">REAL-TIME TELEMETRY (DIAGNOSTIC MODE)</div>
            <pre id="pddTelemetryPre" class="pdd-telemetry-pre">Initializing telemetry...</pre>
          </div>
          <div class="pdd-section">
            <div class="pdd-sec-title">RECENT EVENT ENGINE LOG</div>
            <div id="pddEventsList" class="pdd-events-list">No suspicious events recorded.</div>
          </div>
        </div>
      `;
      document.body.appendChild(drawer);
    }
  }

  // ─── Persistent Animated AI Proctor Bot Controller (Sections 10, 11, 12) ─────
  function updateAiProctorBot() {
    const botEl = document.getElementById('aiProctorBot');
    if (!botEl) return;
    if (!enabled) {
      botEl.style.display = 'none';
      return;
    }
    botEl.style.display = 'flex';

    const badgeEl = document.getElementById('aiBotStateBadge');
    const msgEl = document.getElementById('aiBotMessageBubble');
    const pupilL = document.getElementById('aiBotPupilLeft');
    const pupilR = document.getElementById('aiBotPupilRight');
    const eyeL = document.getElementById('aiBotEyeLeft');
    const eyeR = document.getElementById('aiBotEyeRight');

    // 1. Determine Bot State & Contextual Message (Sections 11 & 12)
    let nextState = BOT_STATES.WATCHING;
    let candidateMsg = 'AI Proctor watching — Face, gaze, and audio normal.';
    let isUrgent = false;

    if (cameraState === CAMERA_STATES.CAMERA_ERROR || cameraState === CAMERA_STATES.CAMERA_DISCONNECTED) {
      nextState = BOT_STATES.CAMERA_ERROR;
      candidateMsg = 'Camera connection needs attention.';
      isUrgent = true;
    } else if (activeOptions.mic && !audioStream && cameraState === CAMERA_STATES.ANALYZING) {
      nextState = BOT_STATES.MIC_ERROR;
      candidateMsg = 'Microphone monitoring unavailable.';
      isUrgent = true;
    } else if (telemetry.face.count > 1) {
      nextState = BOT_STATES.MULTIPLE_FACE;
      candidateMsg = 'More than one person detected.';
      isUrgent = true;
    } else if (telemetry.speakingFusion.isSpeaking || telemetry.audio.vadState === VAD_STATES.SPEECH) {
      nextState = BOT_STATES.VOICE_DETECTED;
      candidateMsg = 'Voice activity detected. Please remain silent during the exam.';
      isUrgent = true;
    } else if (!telemetry.face.detected) {
      nextState = BOT_STATES.WARNING;
      candidateMsg = telemetry.face.obstructed
        ? 'Camera connection needs attention.'
        : 'Please face the screen.';
      isUrgent = true;
    } else if (telemetry.head.state !== HEAD_STATES.CENTER) {
      nextState = BOT_STATES.LOOKING_AWAY;
      candidateMsg = 'Please face the screen.';
      isUrgent = true;
    } else if (telemetry.gaze.direction !== GAZE_STATES.CENTER && telemetry.gaze.direction !== GAZE_STATES.UNKNOWN && !telemetry.gaze.isBlinking) {
      nextState = BOT_STATES.LOOKING_AWAY;
      candidateMsg = 'Please keep your eyes focused on the exam screen.';
      isUrgent = true;
    } else if (cameraState === CAMERA_STATES.INITIALIZING || cameraState === CAMERA_STATES.WAITING_FOR_PERMISSION || cameraState === CAMERA_STATES.RECOVERING) {
      nextState = BOT_STATES.ANALYZING;
      candidateMsg = 'Initializing camera & microphone sensors...';
    } else {
      nextState = BOT_STATES.WATCHING;
      candidateMsg = 'AI Proctor watching — Face, gaze, and audio normal.';
    }

    telemetry.bot.state = nextState;

    // 2. Cooldown-controlled message transitions to prevent rapid flickering (Section 12)
    const now = Date.now();
    const cooldownMs = (proctorConfig.bot && proctorConfig.bot.message_cooldown_ms) || proctorConfig.bot_message_cooldown_ms || 6000;
    if (isUrgent) {
      // Allow immediate escalation to a warning message, or switching between urgent states after 1.5s
      if (telemetry.bot.message !== candidateMsg && (now - telemetry.bot.lastMessageTime > 1500 || !botEl.classList.contains('is-alert'))) {
        telemetry.bot.message = candidateMsg;
        telemetry.bot.lastMessageTime = now;
      }
    } else if (now - telemetry.bot.lastMessageTime >= cooldownMs) {
      telemetry.bot.message = candidateMsg;
      telemetry.bot.lastMessageTime = now;
    }

    if (badgeEl) badgeEl.textContent = nextState;
    if (msgEl) msgEl.textContent = telemetry.bot.message;

    const stateClass = `state-${nextState.toLowerCase().replace(/_/g, '-')}`;
    botEl.className = `ai-proctor-bot ${stateClass} ${isUrgent ? 'is-alert' : 'is-calm'}`;

    // 3. Animate dual bot pupils tracking candidate gaze & blink state (Section 10)
    if (pupilL && pupilR) {
      const dx = Math.max(-4, Math.min(4, (0.5 - (telemetry.gaze.relX || 0.5)) * 14));
      const dy = Math.max(-3, Math.min(3, ((telemetry.gaze.relY || 0.5) - 0.48) * 12));
      pupilL.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      pupilR.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }
    if (eyeL && eyeR) {
      const blinking = Boolean(telemetry.gaze.isBlinking);
      eyeL.classList.toggle('blinking', blinking);
      eyeR.classList.toggle('blinking', blinking);
    }
  }

  function toggleDiagnosticsPanel() {
    ensureProctorTelemetryUI();
    const drawer = document.getElementById('proctorDiagnosticsDrawer');
    if (!drawer) return;
    const isHidden = drawer.style.display === 'none';
    drawer.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      updateProctorStatusUI();
      updateDiagnosticEventsUI();
    }
  }

  function updateDiagnosticEventsUI() {
    const listEl = document.getElementById('pddEventsList');
    if (!listEl) return;
    const hist = ProctorEventEngine.getHistory();
    if (!hist.length) {
      listEl.innerHTML = '<div class="pdd-evt-empty">No proctoring events triggered.</div>';
      return;
    }
    listEl.innerHTML = hist.slice(-6).reverse().map(e => `
      <div class="pdd-evt-item sev-${(e.severity || 'INFO').toLowerCase()}">
        <div class="pdd-evt-top">
          <strong>${e.event_type}</strong>
          <span>${(e.duration_ms / 1000).toFixed(1)}s · conf ${Math.round((e.confidence || 0) * 100)}%</span>
        </div>
        <div class="pdd-evt-reason">${e.reason || ''}</div>
      </div>
    `).join('');
  }

  function updateProctorStatusUI() {
    // Update AI Proctor Bot on every status refresh
    updateAiProctorBot();

    // 1. Update Compact PiP Telemetry Strip (Section 12)
    const faceVal = document.getElementById('ptsFaceVal');
    const gazeVal = document.getElementById('ptsGazeVal');
    const headVal = document.getElementById('ptsHeadVal');
    const mouthVal = document.getElementById('ptsMouthVal');
    const audioVal = document.getElementById('ptsAudioVal');

    const ptsFace = document.getElementById('ptsFace');
    const ptsGaze = document.getElementById('ptsGaze');
    const ptsHead = document.getElementById('ptsHead');
    const ptsMouth = document.getElementById('ptsMouth');
    const ptsAudio = document.getElementById('ptsAudio');

    if (faceVal) {
      if (telemetry.face.count > 1) {
        faceVal.textContent = `${telemetry.face.count} Faces!`;
        if (ptsFace) ptsFace.className = 'pts-item err';
      } else if (telemetry.face.detected) {
        faceVal.textContent = 'Detected';
        if (ptsFace) ptsFace.className = 'pts-item ok';
      } else if (telemetry.face.obstructed) {
        faceVal.textContent = 'Obstructed';
        if (ptsFace) ptsFace.className = 'pts-item err';
      } else {
        faceVal.textContent = 'Missing';
        if (ptsFace) ptsFace.className = 'pts-item warn';
      }
    }

    if (gazeVal) {
      const gMap = {
        GAZE_CENTER: 'Center',
        GAZE_LEFT: 'Left',
        GAZE_RIGHT: 'Right',
        GAZE_UP: 'Up',
        GAZE_DOWN: 'Down',
        GAZE_UNKNOWN: '—'
      };
      gazeVal.textContent = gMap[telemetry.gaze.direction] || 'Center';
      if (ptsGaze) {
        ptsGaze.className = (telemetry.gaze.direction === GAZE_STATES.CENTER) ? 'pts-item ok' : 'pts-item warn';
      }
    }

    if (headVal) {
      const hMap = {
        CENTER: 'Normal',
        LOOKING_LEFT: 'Left',
        LOOKING_RIGHT: 'Right',
        LOOKING_UP: 'Up',
        LOOKING_DOWN: 'Down',
        EXTREME_ANGLE: 'Extreme'
      };
      headVal.textContent = hMap[telemetry.head.state] || 'Normal';
      if (ptsHead) {
        ptsHead.className = (telemetry.head.state === HEAD_STATES.CENTER) ? 'pts-item ok' : 'pts-item warn';
      }
    }

    if (mouthVal) {
      const mMap = {
        MOUTH_CLOSED: 'Closed',
        MOUTH_SLIGHTLY_OPEN: 'Open',
        MOUTH_MOVING: 'Moving',
        POSSIBLE_SPEAKING: 'Speaking!'
      };
      mouthVal.textContent = mMap[telemetry.mouth.state] || 'Closed';
      if (ptsMouth) {
        ptsMouth.className = (telemetry.mouth.state === MOUTH_STATES.POSSIBLE_SPEAKING)
          ? 'pts-item err'
          : (telemetry.mouth.state === MOUTH_STATES.MOVING ? 'pts-item warn' : 'pts-item ok');
      }
    }

    if (audioVal) {
      if (telemetry.speakingFusion.isSpeaking || telemetry.audio.vadState === VAD_STATES.SPEECH) {
        audioVal.textContent = 'Speech!';
        if (ptsAudio) ptsAudio.className = 'pts-item err';
      } else if (telemetry.audio.vadState === VAD_STATES.BACKGROUND_NOISE) {
        audioVal.textContent = 'Noise Ignored';
        if (ptsAudio) ptsAudio.className = 'pts-item ok';
      } else {
        audioVal.textContent = 'Monitoring';
        if (ptsAudio) ptsAudio.className = 'pts-item ok';
      }
    }

    // 2. Update Proctor Status & Diagnostic Drawer if visible (Sections 13 & 20)
    const drawer = document.getElementById('proctorDiagnosticsDrawer');
    if (!drawer || drawer.style.display === 'none') return;

    const badge = document.getElementById('pddOverallBadge');
    if (badge) {
      badge.textContent = telemetry.overallStatus;
      badge.className = `pdd-state-pill ${telemetry.overallStatus.toLowerCase()}`;
    }

    const sCam = document.getElementById('pddStatCam');
    const sFace = document.getElementById('pddStatFace');
    const sGaze = document.getElementById('pddStatGaze');
    const sHead = document.getElementById('pddStatHead');
    const sMouth = document.getElementById('pddStatMouth');
    const sMic = document.getElementById('pddStatMic');
    const sFusion = document.getElementById('pddStatFusion');

    if (sCam) sCam.textContent = (cameraState === CAMERA_STATES.ANALYZING || cameraState === CAMERA_STATES.CAMERA_READY) ? '✓ Active' : `⚠ ${cameraState}`;
    if (sFace) sFace.textContent = telemetry.face.detected ? (telemetry.face.count > 1 ? `⚠ ${telemetry.face.count} Faces` : '✓ Detected') : '✗ Missing';
    if (sGaze) sGaze.textContent = telemetry.gaze.direction === GAZE_STATES.CENTER ? '✓ Normal (Center)' : `⚠ ${telemetry.gaze.direction}`;
    if (sHead) sHead.textContent = telemetry.head.state === HEAD_STATES.CENTER ? '✓ Normal' : `⚠ ${telemetry.head.state}`;
    if (sMouth) sMouth.textContent = telemetry.mouth.state === MOUTH_STATES.CLOSED ? '✓ Closed' : `⚠ ${telemetry.mouth.state}`;
    if (sMic) sMic.textContent = telemetry.audio.vadState === VAD_STATES.SPEECH ? '⚠ Speech Detected' : '✓ Monitoring';
    if (sFusion) sFusion.textContent = telemetry.speakingFusion.isSpeaking ? `⚠ ${telemetry.speakingFusion.state}` : `✓ ${telemetry.speakingFusion.state}`;

    const pre = document.getElementById('pddTelemetryPre');
    if (pre) {
      pre.textContent =
`Camera:
  state:           ${telemetry.camera.state}
  device:          ${telemetry.camera.deviceLabel}
  resolution:      ${telemetry.camera.resolution}
  fps:             ${telemetry.camera.fps}
  frames_received: ${telemetry.camera.framesReceived}

Face:
  detected:        ${telemetry.face.detected} (count: ${telemetry.face.count})
  confidence:      ${telemetry.face.confidence.toFixed(2)}
  luminance:       ${Math.round(telemetry.face.avgLuminance)} / 255
  obstructed:      ${telemetry.face.obstructed}

Gaze:
  direction:       ${telemetry.gaze.direction}
  confidence:      ${telemetry.gaze.confidence.toFixed(2)}
  iris_rel:        (${telemetry.gaze.relX.toFixed(2)}, ${telemetry.gaze.relY.toFixed(2)})

Head:
  state:           ${telemetry.head.state}
  yaw:             ${telemetry.head.yaw.toFixed(1)}°
  pitch:           ${telemetry.head.pitch.toFixed(1)}°
  roll:            ${telemetry.head.roll.toFixed(1)}°

Mouth:
  state:           ${telemetry.mouth.state}
  open_ratio:      ${telemetry.mouth.openRatio.toFixed(3)}
  variance:        ${telemetry.mouth.variance.toFixed(4)}
  confidence:      ${telemetry.mouth.confidence.toFixed(2)}

Speaking Fusion (Audio + Mouth + Eye/Face):
  state:           ${telemetry.speakingFusion.state}
  is_speaking:     ${telemetry.speakingFusion.isSpeaking}
  audio_conf:      ${telemetry.speakingFusion.audioConfidence.toFixed(2)}
  mouth_conf:      ${telemetry.speakingFusion.mouthConfidence.toFixed(2)}
  eye_face_conf:   ${telemetry.speakingFusion.eyeFaceConfidence.toFixed(2)}
  combined_conf:   ${telemetry.speakingFusion.combinedConfidence.toFixed(2)}

Audio / VAD:
  RMS:             ${telemetry.audio.rms.toFixed(1)}
  noise_floor:     ${telemetry.audio.noiseFloor.toFixed(1)}
  VAD:             ${telemetry.audio.vadState}
  speech_conf:     ${telemetry.audio.speechConfidence.toFixed(2)}
  zcr:             ${telemetry.audio.zcr.toFixed(3)}

Focus & Security:
  fullscreen:      ${telemetry.focus.fullscreenActive} (exits: ${telemetry.focus.fullscreenExits})
  tab_switches:    ${telemetry.focus.tabSwitches}
  window_blurs:    ${telemetry.focus.windowBlurs}

AI Proctor Bot:
  state:           ${telemetry.bot.state}
  message:         ${telemetry.bot.message}

Compiler:
  language:        ${telemetry.compiler.language}
  compile_time:    ${telemetry.compiler.compileTimeMs} ms
  run_time:        ${telemetry.compiler.runTimeMs} ms
  status:          ${telemetry.compiler.status}`;
    }
  }

  // ─── PiP Draggable & Minimize Controls ────────────────────────────────────────
  function setupPipDrag() {
    const pipEl = document.getElementById('proctorPip');
    const pipHeader = document.getElementById('pipHeader');
    if (!pipEl || !pipHeader || pipEl._dragInitialized) return;
    pipEl._dragInitialized = true;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    pipHeader.addEventListener('mousedown', (e) => {
      if (e.target.closest('.pip-toggle-btn') || e.target.closest('#pipStatusText')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = pipEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      pipEl.style.transition = 'none';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = Math.max(8, Math.min(window.innerWidth - pipEl.offsetWidth - 8, initialLeft + dx));
      const newTop = Math.max(8, Math.min(window.innerHeight - pipEl.offsetHeight - 8, initialTop + dy));
      pipEl.style.left = `${newLeft}px`;
      pipEl.style.top = `${newTop}px`;
      pipEl.style.right = 'auto';
      pipEl.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        pipEl.style.transition = '';
        document.body.style.userSelect = '';
      }
    });

    // Keep PiP within viewport on window resize
    window.addEventListener('resize', () => {
      if (!pipEl || pipEl.style.display === 'none') return;
      const rect = pipEl.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8 && pipEl.style.left) {
        pipEl.style.left = `${Math.max(8, window.innerWidth - pipEl.offsetWidth - 12)}px`;
      }
      if (rect.bottom > window.innerHeight - 8 && pipEl.style.top) {
        pipEl.style.top = `${Math.max(8, window.innerHeight - pipEl.offsetHeight - 12)}px`;
      }
    });
  }

  function togglePipMinimize() {
    const pipEl = document.getElementById('proctorPip');
    const toggleBtn = document.getElementById('pipToggleBtn');
    if (!pipEl) return;
    const isMin = pipEl.classList.toggle('minimized');
    if (toggleBtn) {
      toggleBtn.textContent = isMin ? '▲' : '―';
      toggleBtn.title = isMin ? 'Expand Camera View' : 'Minimize Camera View';
    }
  }

  // ─── Multi-Stage Audio / Voice Activity Detection (VAD) Pipeline (Section 8) ─
  function setupAudioMonitoring(streamToMonitor) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioCtx();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      const unlockAudio = () => {
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }
      };
      window.addEventListener('click', unlockAudio, { once: true });
      window.addEventListener('keydown', unlockAudio, { once: true });

      const source = audioContext.createMediaStreamSource(streamToMonitor);

      // Stage 1: Preprocessing High-Pass Filter (strips < 90Hz AC/fan/table rumble)
      audioHighpassFilter = audioContext.createBiquadFilter();
      audioHighpassFilter.type = 'highpass';
      audioHighpassFilter.frequency.value = 90;
      audioHighpassFilter.Q.value = 0.7;

      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 1024;
      audioAnalyser.smoothingTimeConstant = 0.25;

      source.connect(audioHighpassFilter);
      audioHighpassFilter.connect(audioAnalyser);

      const freqBins = audioAnalyser.frequencyBinCount; // 512 bins
      const freqData = new Uint8Array(freqBins);
      const timeData = new Uint8Array(audioAnalyser.fftSize);

      const sampleRate = audioContext.sampleRate || 48000;
      const binHz = sampleRate / audioAnalyser.fftSize; // ~46.8 Hz per bin

      let lastAudioTick = performance.now();
      let sustainedSpeechMs = 0;
      let smoothedSpeechConf = 0;

      function checkAudio(nowPerf) {
        if (!enabled || !activeOptions.mic) return;
        const dt = Math.min(100, Math.max(8, nowPerf - lastAudioTick));
        lastAudioTick = nowPerf;

        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }

        audioAnalyser.getByteFrequencyData(freqData);
        audioAnalyser.getByteTimeDomainData(timeData);

        // 1. Time-Domain RMS & Zero-Crossing Rate (ZCR)
        let sumSq = 0;
        let zeroCrossings = 0;
        let peakAmp = 0;
        let prevSample = (timeData[0] - 128) / 128;

        for (let i = 0; i < timeData.length; i++) {
          const norm = (timeData[i] - 128) / 128;
          const absVal = Math.abs(norm);
          if (absVal > peakAmp) peakAmp = absVal;
          sumSq += norm * norm;
          if ((norm >= 0 && prevSample < 0) || (norm < 0 && prevSample >= 0)) {
            zeroCrossings++;
          }
          prevSample = norm;
        }
        const rmsRaw = Math.sqrt(sumSq / timeData.length) * 200; // scaled 0..200
        const zcr = zeroCrossings / timeData.length;
        const crestFactor = rmsRaw > 0.5 ? (peakAmp * 200) / rmsRaw : 1;

        // 2. Frequency Band Analysis (Fundamental + F1/F2 Vocal Formants vs Noise)
        // Vocal fundamental + formants: 160 Hz to 2900 Hz
        const voiceStartBin = Math.max(2, Math.floor(160 / binHz));
        const voiceEndBin   = Math.min(freqBins - 1, Math.ceil(2900 / binHz));
        // Core formant peak zone: 300 Hz to 1400 Hz (vowels/voiced phonemes)
        const formantStartBin = Math.max(3, Math.floor(300 / binHz));
        const formantEndBin   = Math.min(freqBins - 1, Math.ceil(1400 / binHz));
        // High-frequency transient band: 3600 Hz to 10500 Hz (mouse clicks, keyboard clacks, coughs)
        const highStartBin = Math.min(freqBins - 1, Math.floor(3600 / binHz));
        const highEndBin   = Math.min(freqBins - 1, Math.ceil(10500 / binHz));

        let voiceSum = 0, formantSum = 0, highSum = 0;
        let maxFormantBinVal = 0;
        for (let i = voiceStartBin; i <= voiceEndBin; i++) {
          voiceSum += freqData[i];
          if (i >= formantStartBin && i <= formantEndBin) {
            formantSum += freqData[i];
            if (freqData[i] > maxFormantBinVal) maxFormantBinVal = freqData[i];
          }
        }
        for (let i = highStartBin; i <= highEndBin; i++) {
          highSum += freqData[i];
        }

        const voiceAvg   = voiceSum / Math.max(1, (voiceEndBin - voiceStartBin + 1));
        const formantAvg = formantSum / Math.max(1, (formantEndBin - formantStartBin + 1));
        const highAvg    = highSum / Math.max(1, (highEndBin - highStartBin + 1));

        // 3. Adaptive Noise Floor Tracking
        // Slowly adapt noise floor when signal is steady or quiet
        if (voiceAvg < telemetry.audio.noiseFloor + 12) {
          telemetry.audio.noiseFloor = telemetry.audio.noiseFloor * 0.992 + voiceAvg * 0.008;
        } else {
          telemetry.audio.noiseFloor = Math.min(45, telemetry.audio.noiseFloor * 0.999 + voiceAvg * 0.001);
        }
        const snrOverFloor = Math.max(0, voiceAvg - telemetry.audio.noiseFloor);

        // 4. Reject Mechanical Clicks, Keyboard Typing, Coughs, Drops & Fan Noise
        const msSincePhysicalAction = Date.now() - lastUserPhysicalActionTime;
        const isKeyboardOrMouseTransient = (msSincePhysicalAction < 380);
        // Impulsive spike (object drop / clap / cough): very high crest factor or high-band dominating formants
        const isImpulsiveOrCough = (highAvg > formantAvg * 1.15) || (crestFactor > 6.2 && sustainedSpeechMs < 150);

        // Harmonic/formant concentration score (0..1)
        const formantDominance = formantAvg / Math.max(1, highAvg + 10);
        const harmonicPeakRatio = maxFormantBinVal / Math.max(1, voiceAvg);
        const zcrInSpeechRange = (zcr >= 0.02 && zcr <= 0.24);

        // Compute instantaneous speech confidence (0.0 to 1.0)
        let rawSpeechConf = 0;
        if (!isKeyboardOrMouseTransient && !isImpulsiveOrCough && snrOverFloor > 14 && voiceAvg > 32 && formantAvg > 38) {
          const snrScore = Math.min(1, (snrOverFloor - 12) / 35);
          const formantScore = Math.min(1, Math.max(0, (formantDominance - 1.0) / 1.5));
          const peakScore = Math.min(1, Math.max(0, (harmonicPeakRatio - 1.15) / 1.2));
          const zcrScore = zcrInSpeechRange ? 1.0 : 0.35;
          rawSpeechConf = (snrScore * 0.40) + (formantScore * 0.30) + (peakScore * 0.15) + (zcrScore * 0.15);
        }

        smoothedSpeechConf = smoothedSpeechConf * 0.72 + rawSpeechConf * 0.28;

        // 5. Classify VAD State: SPEECH / NON_SPEECH / BACKGROUND_NOISE / UNCERTAIN
        let vadState = VAD_STATES.NON_SPEECH;
        if (smoothedSpeechConf >= thresholds.speechConfidenceThreshold) {
          vadState = VAD_STATES.SPEECH;
          sustainedSpeechMs += dt;
        } else if (rawSpeechConf >= 0.38) {
          vadState = VAD_STATES.UNCERTAIN;
          sustainedSpeechMs = Math.max(0, sustainedSpeechMs - dt * 0.5);
        } else if (voiceAvg > telemetry.audio.noiseFloor + 8 || isKeyboardOrMouseTransient || isImpulsiveOrCough) {
          vadState = VAD_STATES.BACKGROUND_NOISE;
          sustainedSpeechMs = Math.max(0, sustainedSpeechMs - dt * 1.8);
        } else {
          vadState = VAD_STATES.NON_SPEECH;
          sustainedSpeechMs = Math.max(0, sustainedSpeechMs - dt * 2.0);
        }

        // Update Telemetry
        telemetry.audio.rms = rmsRaw;
        telemetry.audio.vadState = vadState;
        telemetry.audio.speechConfidence = smoothedSpeechConf;
        telemetry.audio.voiceBandEnergy = voiceAvg;
        telemetry.audio.highBandEnergy = highAvg;
        telemetry.audio.zcr = zcr;
        telemetry.audio.spectralRatio = formantDominance;
        telemetry.audio.sustainedSpeechMs = sustainedSpeechMs;

        // Evaluate 3-Signal Speaking Fusion (Audio + Mouth + Eye/Face)
        evaluateSpeakingFusion();

        // Update PiP Audio Meter UI
        const pct = Math.min(100, Math.round((voiceAvg / 85) * 100));
        const audioFill = document.getElementById('pipAudioLevel');
        if (audioFill) {
          audioFill.style.width = `${Math.max(5, pct)}%`;
          audioFill.style.background = (telemetry.speakingFusion.isSpeaking || vadState === VAD_STATES.SPEECH)
            ? '#ef4444'
            : (vadState === VAD_STATES.UNCERTAIN ? '#eab308' : '#10b981');
        }

        // Temporal confirmation: emit SPEECH_DETECTED to Central Event Engine only when sustained
        if (sustainedSpeechMs >= thresholds.minSpeechDurationMs) {
          const confirmedDuration = sustainedSpeechMs;
          sustainedSpeechMs = 0;
          const fusionConf = Math.max(smoothedSpeechConf, telemetry.speakingFusion.combinedConfidence || 0);
          const fusionLabel = telemetry.speakingFusion.state === 'MULTI_SIGNAL_SPEAKING'
            ? 'Multi-signal speaking confirmed (Audio + Mouth movement + Facial activity)'
            : 'Sustained human speech detected by VAD';
          ProctorEventEngine.recordInstantEvent(
            'SPEECH_DETECTED',
            telemetry.speakingFusion.state === 'MULTI_SIGNAL_SPEAKING' ? 'HIGH' : 'WARNING',
            fusionConf,
            confirmedDuration,
            fusionLabel
          );
          if (telemetry.speakingFusion.state === 'MULTI_SIGNAL_SPEAKING') {
            ProctorEventEngine.recordInstantEvent(
              'MOUTH_MOVEMENT_WITH_AUDIO',
              'WARNING',
              fusionConf,
              confirmedDuration,
              'Correlated lip/mouth movement with active voice energy'
            );
          }
        }

        audioAnimFrame = requestAnimationFrame(checkAudio);
      }

      audioAnimFrame = requestAnimationFrame(checkAudio);
    } catch (e) {
      console.warn('[ProctorIQ] Audio VAD init error:', e);
    }
  }

  function handleVoiceWarning(reason = 'Talking / voice detected') {
    if (!enabled || !activeOptions.mic) return;
    const now = Date.now();
    if (now - lastSoundWarningTime < 7000) return;
    lastSoundWarningTime = now;
    soundWarningCount++;
    const maxSounds = (activeOptions.maxSounds !== undefined) ? activeOptions.maxSounds : 10;
    const soundText = document.getElementById('soundStrikeText');
    if (soundText) soundText.textContent = `Voice: ${soundWarningCount} / ${maxSounds}`;
    if (soundWarningCount >= maxSounds) {
      trigger(`Excessive talking violation: ${maxSounds} confirmed speech warnings reached. Examination disqualified.`);
    } else {
      onSoundWarning && onSoundWarning(soundWarningCount, maxSounds, reason);
    }
  }

  function setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    try {
      speechRecognizer = new SpeechRec();
      speechRecognizer.continuous = true;
      speechRecognizer.interimResults = true;
      speechRecognizer.lang = 'en-US';
      speechRecognizer.onresult = (evt) => {
        if (!enabled || !activeOptions.mic) return;
        for (let i = evt.resultIndex; i < evt.results.length; i++) {
          const resItem = evt.results[i][0];
          const transcript = resItem?.transcript?.trim();
          const conf = resItem?.confidence || 0.85;
          if (transcript) {
            const words = transcript.split(/\s+/).filter(w => w.length > 1);
            if (words.length >= 1 && transcript.length >= 3) {
              ProctorEventEngine.recordInstantEvent(
                'SPEECH_DETECTED',
                'WARNING',
                Math.max(0.75, conf),
                1200,
                `Spoken words recognized ("${transcript.substring(0, 24)}")`
              );
              break;
            }
          }
        }
      };
      speechRecognizer.onerror = (e) => {
        if (e.error !== 'not-allowed' && enabled && activeOptions.mic) {
          setTimeout(() => {
            try { speechRecognizer && speechRecognizer.start(); } catch (_) {}
          }, 3000);
        }
      };
      speechRecognizer.onend = () => {
        if (enabled && activeOptions.mic) {
          setTimeout(() => {
            try { speechRecognizer && speechRecognizer.start(); } catch (_) {}
          }, 1200);
        }
      };
      speechRecognizer.start();
    } catch (_) {}
  }

  // ─── Real-Time Computer Vision Pipeline (Face, Gaze, Head Pose, Mouth) (Sections 3-7, 13-17) ─
  let lastFrameAnalysisTimestamp = 0;

  async function runVisualDetection() {
    if (!enabled || !activeOptions.camera || !videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
      return;
    }
    if (window._isBugReportModalOpen) {
      if (awayStartTime) {
        awayStartTime = null;
        onAwayCountdown && onAwayCountdown(null);
      }
      return;
    }

    const now = performance.now();
    const dtMs = lastFrameAnalysisTimestamp ? (now - lastFrameAnalysisTimestamp) : thresholds.analysisIntervalMs;
    lastFrameAnalysisTimestamp = now;

    if (!canvasEl) canvasEl = document.getElementById('detectionCanvas');
    if (!canvasEl) return;

    const W = 320, H = 240;
    if (canvasEl.width !== W) canvasEl.width = W;
    if (canvasEl.height !== H) canvasEl.height = H;

    const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoEl, 0, 0, W, H);

    const frame = ctx.getImageData(0, 0, W, H);
    const data = frame.data;

    // Update FPS & frame reception diagnostics
    telemetry.camera.framesReceived++;
    telemetry.camera.fps = Math.min(30, Math.round(1000 / Math.max(16, dtMs)));
    if (telemetry.camera.framesReceived === 1) {
      console.log('Frame received: YES');
      setCameraState(CAMERA_STATES.ANALYZING, 'Receiving and analyzing live video frames');
    }

    // ── Step 1: Luminance, Obstruction & YCbCr Connected-Component Face Detection ──
    const faceAnalysis = await analyzeFacesAndLighting(data, W, H);

    // ── Step 2: Eye-Gaze Estimation (Left/Right/Up/Down/Center + Blink Filter) ──
    const gazeAnalysis = analyzeEyeGaze(data, W, H, faceAnalysis.primaryBox, faceAnalysis.detected);

    // ── Step 3: 3D Head-Pose Estimation (Yaw, Pitch, Roll) ──
    const headAnalysis = analyzeHeadPose(data, W, H, faceAnalysis.primaryBox, faceAnalysis.detected, gazeAnalysis);

    // ── Step 4: Mouth Movement & Lip Aperture Analysis (Section 14) ──
    const mouthAnalysis = analyzeMouthMovement(data, W, H, faceAnalysis.primaryBox, faceAnalysis.detected);

    // Update Telemetry State
    telemetry.face.detected = faceAnalysis.detected;
    telemetry.face.count = faceAnalysis.count;
    telemetry.face.confidence = faceAnalysis.confidence;
    telemetry.face.partiallyOutOfFrame = faceAnalysis.partiallyOutOfFrame;
    telemetry.face.obstructed = faceAnalysis.obstructed;
    telemetry.face.lowLighting = faceAnalysis.lowLighting;
    telemetry.face.avgLuminance = faceAnalysis.avgLum;

    telemetry.gaze.direction = gazeAnalysis.state;
    telemetry.gaze.confidence = gazeAnalysis.confidence;
    telemetry.gaze.relX = gazeAnalysis.relX;
    telemetry.gaze.relY = gazeAnalysis.relY;
    telemetry.gaze.isBlinking = gazeAnalysis.isBlinking;

    telemetry.head.state = headAnalysis.state;
    telemetry.head.yaw = headAnalysis.yaw;
    telemetry.head.pitch = headAnalysis.pitch;
    telemetry.head.roll = headAnalysis.roll;
    telemetry.head.confidence = headAnalysis.confidence;

    telemetry.mouth.state = mouthAnalysis.state;
    telemetry.mouth.openRatio = mouthAnalysis.openRatio;
    telemetry.mouth.variance = mouthAnalysis.variance;
    telemetry.mouth.confidence = mouthAnalysis.confidence;

    // ── Step 5: Three-Signal Speaking Detection Fusion (Audio + Mouth + Eye/Face) ──
    evaluateSpeakingFusion();

    if (telemetry.camera.framesReceived === 2 && faceAnalysis.detected) {
      console.log('Face detected: YES');
    }

    // Lighting callback
    onLightingWarning && onLightingWarning(faceAnalysis.lowLighting && !faceAnalysis.obstructed);

    // ── Step 6: Feed Structured Observations to Central Event Engine ──
    ProctorEventEngine.processFrameObservations({
      face: faceAnalysis,
      gaze: gazeAnalysis,
      head: headAnalysis,
      mouth: mouthAnalysis
    }, dtMs);

    // ── Step 7: Update Live PiP Overlay Badges & Status UI ──
    updateEyeAndPoseOverlayBadge(faceAnalysis, gazeAnalysis, headAnalysis);
    updateProctorStatusUI();

    // ── Step 8: Sustained Away / Absence Countdown (Configurable maxAwaySec) ──
    const maxAway = activeOptions.maxAwaySec !== undefined ? activeOptions.maxAwaySec : 25;
    const nowWall = Date.now();
    const isAttentive = faceAnalysis.detected &&
                        faceAnalysis.count === 1 &&
                        (gazeAnalysis.state === GAZE_STATES.CENTER || gazeAnalysis.isBlinking) &&
                        (headAnalysis.state !== HEAD_STATES.EXTREME_ANGLE);

    if (!isAttentive) {
      if (!awayStartTime) awayStartTime = nowWall;
      const elapsedSec = Math.floor((nowWall - awayStartTime) / 1000);
      const remainingSec = Math.max(0, maxAway - elapsedSec);

      // Only show countdown banner after 2 seconds of continuous deviation (prevents single-frame flicker)
      if (elapsedSec >= 2) {
        onAwayCountdown && onAwayCountdown(remainingSec);
      }

      if (remainingSec <= 0) {
        trigger(`Sustained absence / looking away from monitor exceeded maximum allowed threshold (${maxAway}s).`);
      }
    } else {
      if (awayStartTime) {
        awayStartTime = null;
        onAwayCountdown && onAwayCountdown(null);
      }
    }
  }

  /**
   * Multi-Cue Face & Obstruction Analyzer:
   * Combines Chromium FaceDetector (when available) with a YCbCr Connected-Component
   * cluster detector on an 80x60 grid so 0, 1, or multiple faces are accurately detected
   * without external CDN dependencies.
   */
  async function analyzeFacesAndLighting(data, W, H) {
    const gridW = 80, gridH = 60; // 4x4 pixel cells
    const skinGrid = new Uint8Array(gridW * gridH);

    let totalLum = 0;
    let totalLumSq = 0;
    const sampleCount = gridW * gridH;

    for (let gy = 0; gy < gridH; gy++) {
      const py = gy * 4 + 2;
      for (let gx = 0; gx < gridW; gx++) {
        const px = gx * 4 + 2;
        const idx = (py * W + px) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];

        const y  = 0.299 * r + 0.587 * g + 0.114 * b;
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        totalLum += y;
        totalLumSq += y * y;

        // YCbCr human skin locus + RGB sanity guard
        const isSkinYCbCr = (y > 35 && y < 242 && cb >= 76 && cb <= 130 && cr >= 131 && cr <= 178);
        const isSkinRgb   = (r > 55 && g > 35 && b > 20 && r > g && r > b && (r - Math.min(g, b) > 12));
        if (isSkinYCbCr && isSkinRgb) {
          skinGrid[gy * gridW + gx] = 1;
        }
      }
    }

    const avgLum = totalLum / sampleCount;
    const variance = Math.max(0, (totalLumSq / sampleCount) - (avgLum * avgLum));
    const stdDev = Math.sqrt(variance);

    const isLowLighting = (typeof CONFIG === 'undefined' || CONFIG.LIGHTING_GUARD !== false) && (avgLum < thresholds.lowLightLumThreshold);
    const isObstructed  = (avgLum < 14) || (stdDev < thresholds.obstructionStdDevThreshold && avgLum < 60);

    // 1. Try Hardware FaceDetector first if available
    let detectedBoxes = [];
    if (faceDetector && videoEl) {
      try {
        const hwFaces = await faceDetector.detect(videoEl);
        if (hwFaces && hwFaces.length > 0) {
          const scaleX = W / (videoEl.videoWidth || W);
          const scaleY = H / (videoEl.videoHeight || H);
          detectedBoxes = hwFaces.map(f => ({
            x: f.boundingBox.x * scaleX,
            y: f.boundingBox.y * scaleY,
            width: f.boundingBox.width * scaleX,
            height: f.boundingBox.height * scaleY,
            confidence: 0.94
          }));
        }
      } catch (_) {}
    }

    // 2. YCbCr Connected-Component Face Clustering (works on all platforms & catches multi-face)
    if (detectedBoxes.length === 0 && !isObstructed) {
      const visited = new Uint8Array(gridW * gridH);
      const candidateClusters = [];

      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          const startIdx = gy * gridW + gx;
          if (!skinGrid[startIdx] || visited[startIdx]) continue;

          // BFS connected component
          const queue = [startIdx];
          visited[startIdx] = 1;
          let minGx = gx, maxGx = gx, minGy = gy, maxGy = gy;
          let cellCount = 0;

          while (queue.length > 0) {
            const curr = queue.pop();
            cellCount++;
            const cy = Math.floor(curr / gridW);
            const cx = curr % gridW;
            if (cx < minGx) minGx = cx;
            if (cx > maxGx) maxGx = cx;
            if (cy < minGy) minGy = cy;
            if (cy > maxGy) maxGy = cy;

            // 8-connected neighbors
            for (let ny = Math.max(0, cy - 1); ny <= Math.min(gridH - 1, cy + 1); ny++) {
              for (let nx = Math.max(0, cx - 1); nx <= Math.min(gridW - 1, cx + 1); nx++) {
                const nIdx = ny * gridW + nx;
                if (skinGrid[nIdx] && !visited[nIdx]) {
                  visited[nIdx] = 1;
                  queue.push(nIdx);
                }
              }
            }
          }

          const bw = (maxGx - minGx + 1) * 4;
          const bh = (maxGy - minGy + 1) * 4;
          const aspect = bw / Math.max(1, bh);
          const fillRatio = cellCount / Math.max(1, (maxGx - minGx + 1) * (maxGy - minGy + 1));

          // Filter valid human face geometry (size >= 36x40, plausible aspect ratio & density)
          if (cellCount >= 32 && bw >= 36 && bh >= 40 && aspect >= 0.45 && aspect <= 1.65 && fillRatio >= 0.32) {
            // Verify internal facial contrast (eyes/brow/mouth texture so flat walls are rejected)
            const boxX = minGx * 4;
            const boxY = minGy * 4;
            const contrastConf = computeFacialContrastScore(data, W, H, boxX, boxY, bw, bh);
            if (contrastConf >= 0.45) {
              candidateClusters.push({
                x: boxX,
                y: boxY,
                width: bw,
                height: bh,
                area: cellCount,
                confidence: contrastConf
              });
            }
          }
        }
      }

      // Sort largest/highest confidence first
      candidateClusters.sort((a, b) => (b.area * b.confidence) - (a.area * a.confidence));
      detectedBoxes = candidateClusters.slice(0, 3);
    }

    const faceCount = detectedBoxes.length;
    const faceDetected = faceCount >= 1;
    let primaryBox = detectedBoxes[0] || null;

    // Temporal EMA smoothing on primary face box
    if (primaryBox) {
      if (!telemetry.face.smoothedBox) {
        telemetry.face.smoothedBox = { ...primaryBox };
      } else {
        const a = 0.45;
        telemetry.face.smoothedBox.x = telemetry.face.smoothedBox.x * (1 - a) + primaryBox.x * a;
        telemetry.face.smoothedBox.y = telemetry.face.smoothedBox.y * (1 - a) + primaryBox.y * a;
        telemetry.face.smoothedBox.width = telemetry.face.smoothedBox.width * (1 - a) + primaryBox.width * a;
        telemetry.face.smoothedBox.height = telemetry.face.smoothedBox.height * (1 - a) + primaryBox.height * a;
        telemetry.face.smoothedBox.confidence = telemetry.face.smoothedBox.confidence * (1 - a) + primaryBox.confidence * a;
      }
      primaryBox = telemetry.face.smoothedBox;
    } else {
      telemetry.face.smoothedBox = null;
    }

    const partiallyOutOfFrame = Boolean(primaryBox && (
      primaryBox.x <= 4 ||
      primaryBox.y <= 4 ||
      (primaryBox.x + primaryBox.width) >= (W - 4) ||
      (primaryBox.y + primaryBox.height) >= (H - 4)
    ));

    return {
      detected: faceDetected,
      count: faceCount,
      confidence: primaryBox ? primaryBox.confidence : 0,
      primaryBox,
      allBoxes: detectedBoxes,
      partiallyOutOfFrame,
      obstructed: isObstructed,
      lowLighting: isLowLighting,
      avgLum
    };
  }

  function computeFacialContrastScore(data, W, H, bx, by, bw, bh) {
    const x0 = Math.max(0, Math.floor(bx + bw * 0.15));
    const x1 = Math.min(W - 1, Math.floor(bx + bw * 0.85));
    const y0 = Math.max(0, Math.floor(by + bh * 0.18));
    const y1 = Math.min(H - 1, Math.floor(by + bh * 0.75));
    if (x1 <= x0 || y1 <= y0) return 0;

    let minL = 255, maxL = 0, sum = 0, cnt = 0;
    for (let y = y0; y <= y1; y += 3) {
      for (let x = x0; x <= x1; x += 3) {
        const idx = (y * W + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < minL) minL = lum;
        if (lum > maxL) maxL = lum;
        sum += lum;
        cnt++;
      }
    }
    const dynamicRange = maxL - minL;
    if (dynamicRange < 22) return 0.2; // flat textureless surface
    return Math.min(0.96, 0.50 + (dynamicRange / 180) * 0.46);
  }

  /**
   * Real-Time Eye-Gaze Detector (Section 4):
   * Tracks iris/pupil dark centroid within left & right eye apertures,
   * filters out natural blinks, applies EMA smoothing, and outputs GAZE_CENTER/LEFT/RIGHT/UP/DOWN/UNKNOWN.
   */
  let smoothedGazeX = 0.5;
  let smoothedGazeY = 0.48;

  function analyzeEyeGaze(data, W, H, faceBox, faceDetected) {
    if (!faceDetected || !faceBox || faceBox.width < 32 || faceBox.height < 32) {
      return {
        state: GAZE_STATES.UNKNOWN,
        confidence: 0,
        relX: 0.5,
        relY: 0.5,
        isBlinking: false,
        leftEyeCenter: null,
        rightEyeCenter: null
      };
    }

    const leftEyeBox = {
      x: Math.round(faceBox.x + faceBox.width * 0.16),
      y: Math.round(faceBox.y + faceBox.height * 0.21),
      w: Math.round(faceBox.width * 0.29),
      h: Math.round(faceBox.height * 0.24)
    };
    const rightEyeBox = {
      x: Math.round(faceBox.x + faceBox.width * 0.55),
      y: Math.round(faceBox.y + faceBox.height * 0.21),
      w: Math.round(faceBox.width * 0.29),
      h: Math.round(faceBox.height * 0.24)
    };

    function measureEyeAperture(box) {
      const bx0 = Math.max(0, Math.min(W - 1, box.x));
      const by0 = Math.max(0, Math.min(H - 1, box.y));
      const bx1 = Math.max(0, Math.min(W, box.x + box.w));
      const by1 = Math.max(0, Math.min(H, box.y + box.h));
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw < 6 || bh < 5) return null;

      let minLum = 255, maxLum = 0;
      for (let y = by0; y < by1; y++) {
        for (let x = bx0; x < bx1; x++) {
          const idx = (y * W + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          if (lum < minLum) minLum = lum;
          if (lum > maxLum) maxLum = lum;
        }
      }

      const eyeContrast = maxLum - minLum;
      // Low eye contrast indicates closed eyelid / natural blink
      const isBlink = eyeContrast < 20;

      const irisThreshold = Math.min(115, minLum + Math.max(14, eyeContrast * 0.35));
      let weightSum = 0, wx = 0, wy = 0;

      for (let y = by0; y < by1; y++) {
        for (let x = bx0; x < bx1; x++) {
          const idx = (y * W + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          if (lum <= irisThreshold) {
            const w = (irisThreshold - lum) + 1;
            weightSum += w;
            wx += x * w;
            wy += y * w;
          }
        }
      }

      if (weightSum === 0) return null;
      const absX = wx / weightSum;
      const absY = wy / weightSum;
      return {
        absX,
        absY,
        relX: (absX - bx0) / bw,
        relY: (absY - by0) / bh,
        contrast: eyeContrast,
        isBlink
      };
    }

    const leftEye = measureEyeAperture(leftEyeBox);
    const rightEye = measureEyeAperture(rightEyeBox);
    const validEyes = [leftEye, rightEye].filter(Boolean);

    if (validEyes.length === 0) {
      return {
        state: GAZE_STATES.UNKNOWN,
        confidence: 0.3,
        relX: smoothedGazeX,
        relY: smoothedGazeY,
        isBlinking: false,
        leftEyeCenter: null,
        rightEyeCenter: null
      };
    }

    const isBlinking = validEyes.every(e => e.isBlink);
    const rawRelX = validEyes.reduce((acc, e) => acc + e.relX, 0) / validEyes.length;
    const rawRelY = validEyes.reduce((acc, e) => acc + e.relY, 0) / validEyes.length;

    // Temporal smoothing (do not update gaze position during a blink)
    if (!isBlinking) {
      smoothedGazeX = smoothedGazeX * 0.60 + rawRelX * 0.40;
      smoothedGazeY = smoothedGazeY * 0.60 + rawRelY * 0.40;
    }

    let state = GAZE_STATES.CENTER;
    let conf = 0.86;

    if (smoothedGazeX < 0.31) {
      state = GAZE_STATES.LEFT;
      conf = Math.min(0.96, 0.70 + (0.31 - smoothedGazeX) * 2.2);
    } else if (smoothedGazeX > 0.69) {
      state = GAZE_STATES.RIGHT;
      conf = Math.min(0.96, 0.70 + (smoothedGazeX - 0.69) * 2.2);
    } else if (smoothedGazeY < 0.25) {
      state = GAZE_STATES.UP;
      conf = Math.min(0.94, 0.68 + (0.25 - smoothedGazeY) * 2.0);
    } else if (smoothedGazeY > 0.74) {
      state = GAZE_STATES.DOWN;
      conf = Math.min(0.95, 0.70 + (smoothedGazeY - 0.74) * 2.2);
    }

    return {
      state,
      confidence: conf,
      relX: smoothedGazeX,
      relY: smoothedGazeY,
      isBlinking,
      leftEyeCenter: leftEye ? { x: leftEye.absX, y: leftEye.absY } : null,
      rightEyeCenter: rightEye ? { x: rightEye.absX, y: rightEye.absY } : null
    };
  }

  /**
   * 3D Head-Pose Estimator (Section 5):
   * Computes Yaw, Pitch, and Roll in degrees from eye-line geometry, bilateral
   * cheek symmetry, and vertical facial proportions, smoothed over time.
   */
  let smoothedYaw = 0;
  let smoothedPitch = 0;
  let smoothedRoll = 0;

  function analyzeHeadPose(data, W, H, faceBox, faceDetected, gazeInfo) {
    if (!faceDetected || !faceBox) {
      return {
        state: HEAD_STATES.CENTER,
        yaw: smoothedYaw,
        pitch: smoothedPitch,
        roll: smoothedRoll,
        confidence: 0
      };
    }

    // 1. Roll angle from left/right eye centroids
    let rawRoll = 0;
    if (gazeInfo.leftEyeCenter && gazeInfo.rightEyeCenter) {
      const dx = gazeInfo.rightEyeCenter.x - gazeInfo.leftEyeCenter.x;
      const dy = gazeInfo.rightEyeCenter.y - gazeInfo.leftEyeCenter.y;
      if (dx > 8) {
        rawRoll = Math.atan2(dy, dx) * (180 / Math.PI);
      }
    }

    // 2. Yaw angle from bilateral luminance/skin balance between left and right halves of faceBox
    // plus eye-midpoint offset relative to face bounding box center
    const midX = faceBox.x + faceBox.width * 0.5;
    let eyeMidOffsetRatio = 0;
    if (gazeInfo.leftEyeCenter && gazeInfo.rightEyeCenter) {
      const eyeMidX = (gazeInfo.leftEyeCenter.x + gazeInfo.rightEyeCenter.x) * 0.5;
      eyeMidOffsetRatio = (eyeMidX - midX) / Math.max(1, faceBox.width * 0.5);
    }

    // Compare left vs right cheek brightness/skin mass in mid-face band (y: 40%..75%)
    let leftMass = 0, rightMass = 0;
    const yStart = Math.max(0, Math.floor(faceBox.y + faceBox.height * 0.40));
    const yEnd   = Math.min(H - 1, Math.floor(faceBox.y + faceBox.height * 0.75));
    const xStart = Math.max(0, Math.floor(faceBox.x));
    const xEnd   = Math.min(W - 1, Math.floor(faceBox.x + faceBox.width));

    for (let y = yStart; y <= yEnd; y += 3) {
      for (let x = xStart; x <= xEnd; x += 3) {
        const idx = (y * W + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (x < midX) leftMass += lum;
        else rightMass += lum;
      }
    }
    const totalMass = Math.max(1, leftMass + rightMass);
    const symmetryImbalance = (rightMass - leftMass) / totalMass; // -1..+1
    const rawYaw = (eyeMidOffsetRatio * 55) + (symmetryImbalance * 65);

    // 3. Pitch angle from eye vertical line relative to face box & vertical frame position
    const frameCenterOffset = ((faceBox.y + faceBox.height * 0.5) - (H * 0.5)) / (H * 0.5);
    const rawPitch = (gazeInfo.relY - 0.48) * 45 + (frameCenterOffset * 22);

    // EMA Smoothing
    const alpha = 0.35;
    smoothedYaw   = smoothedYaw * (1 - alpha) + rawYaw * alpha;
    smoothedPitch = smoothedPitch * (1 - alpha) + rawPitch * alpha;
    smoothedRoll  = smoothedRoll * (1 - alpha) + rawRoll * alpha;

    // Classify Head Pose State
    let state = HEAD_STATES.CENTER;
    if (Math.abs(smoothedYaw) >= thresholds.headExtremeDeg || Math.abs(smoothedPitch) >= thresholds.headExtremeDeg) {
      state = HEAD_STATES.EXTREME_ANGLE;
    } else if (smoothedYaw <= -thresholds.headYawWarnDeg) {
      state = HEAD_STATES.LOOKING_LEFT;
    } else if (smoothedYaw >= thresholds.headYawWarnDeg) {
      state = HEAD_STATES.LOOKING_RIGHT;
    } else if (smoothedPitch <= -thresholds.headPitchWarnDeg) {
      state = HEAD_STATES.LOOKING_UP;
    } else if (smoothedPitch >= thresholds.headPitchWarnDeg) {
      state = HEAD_STATES.LOOKING_DOWN;
    }

    return {
      state,
      yaw: smoothedYaw,
      pitch: smoothedPitch,
      roll: smoothedRoll,
      confidence: 0.88
    };
  }

  /**
   * Real-Time Mouth Movement & Lip Aperture Analyzer (Section 14):
   * Tracks lower-face oral cavity aperture & temporal variance across a rolling frame window.
   * States: MOUTH_CLOSED, MOUTH_SLIGHTLY_OPEN, MOUTH_MOVING, POSSIBLE_SPEAKING.
   */
  const mouthApertureHistory = [];

  function analyzeMouthMovement(data, W, H, faceBox, faceDetected) {
    if (!faceDetected || !faceBox || faceBox.width < 32 || faceBox.height < 32) {
      mouthApertureHistory.length = 0;
      return {
        state: MOUTH_STATES.CLOSED,
        openRatio: 0,
        variance: 0,
        confidence: 0
      };
    }

    const mx0 = Math.max(0, Math.min(W - 1, Math.round(faceBox.x + faceBox.width * 0.28)));
    const mx1 = Math.max(0, Math.min(W, Math.round(faceBox.x + faceBox.width * 0.72)));
    const my0 = Math.max(0, Math.min(H - 1, Math.round(faceBox.y + faceBox.height * 0.62)));
    const my1 = Math.max(0, Math.min(H, Math.round(faceBox.y + faceBox.height * 0.88)));
    const mw = mx1 - mx0;
    const mh = my1 - my0;

    if (mw < 6 || mh < 5) {
      return {
        state: MOUTH_STATES.CLOSED,
        openRatio: 0,
        variance: 0,
        confidence: 0.3
      };
    }

    // Measure luminance distribution & inner-lip dark cavity ratio in lower face ROI
    let sumLum = 0, minLum = 255, maxLum = 0, count = 0;
    for (let y = my0; y < my1; y++) {
      for (let x = mx0; x < mx1; x++) {
        const idx = (y * W + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        sumLum += lum;
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;
        count++;
      }
    }

    const avgMouthLum = sumLum / Math.max(1, count);
    const cavityThresh = Math.min(95, avgMouthLum * 0.66);
    let darkPixels = 0;
    for (let y = my0; y < my1; y++) {
      for (let x = mx0; x < mx1; x++) {
        const idx = (y * W + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum <= cavityThresh) darkPixels++;
      }
    }

    const openRatio = darkPixels / Math.max(1, count);
    mouthApertureHistory.push(openRatio);
    if (mouthApertureHistory.length > 8) mouthApertureHistory.shift();

    // Compute rolling temporal variance of mouth aperture (distinguishes dynamic speech from static open mouth)
    let meanRatio = 0;
    for (let i = 0; i < mouthApertureHistory.length; i++) meanRatio += mouthApertureHistory[i];
    meanRatio /= Math.max(1, mouthApertureHistory.length);

    let sqDiffSum = 0;
    for (let i = 0; i < mouthApertureHistory.length; i++) {
      const d = mouthApertureHistory[i] - meanRatio;
      sqDiffSum += d * d;
    }
    const variance = sqDiffSum / Math.max(1, mouthApertureHistory.length);

    const openThresh = thresholds.mouthOpenRatioThreshold || 0.20;
    const varThresh = thresholds.mouthMovingVarThreshold || 0.0032;

    let state = MOUTH_STATES.CLOSED;
    let conf = 0.20;

    if (mouthApertureHistory.length >= 3 && variance >= varThresh && openRatio >= openThresh * 0.65) {
      if (telemetry.audio.speechConfidence >= 0.45) {
        state = MOUTH_STATES.POSSIBLE_SPEAKING;
        conf = Math.min(0.96, 0.65 + (variance / (varThresh * 4)) * 0.25 + openRatio * 0.2);
      } else {
        state = MOUTH_STATES.MOVING;
        conf = Math.min(0.88, 0.50 + (variance / (varThresh * 4)) * 0.30);
      }
    } else if (openRatio >= openThresh) {
      state = MOUTH_STATES.SLIGHTLY_OPEN;
      conf = Math.min(0.70, 0.35 + (openRatio - openThresh) * 1.2);
    } else {
      state = MOUTH_STATES.CLOSED;
      conf = Math.max(0.05, openRatio * 0.8);
    }

    return {
      state,
      openRatio,
      variance,
      confidence: Number(conf.toFixed(2))
    };
  }

  /**
   * Three-Signal Speaking Detection Fusion (Sections 13, 15, 16, 17, 18):
   * Fuses (1) Audio VAD speech confidence, (2) Mouth movement confidence, and
   * (3) Eye/facial activity confidence into a unified decision.
   * Ensures mouth-only movement without audio NEVER triggers a voice warning.
   */
  function evaluateSpeakingFusion() {
    const audioConf = Number(telemetry.audio.speechConfidence || 0);
    const mouthConf = Number(telemetry.mouth.confidence || 0);
    const mouthState = telemetry.mouth.state;

    // Signal 3: Eye & Facial Activity Context
    let eyeFaceConf = 0.25;
    if (telemetry.face.detected) {
      eyeFaceConf = 0.55;
      if (telemetry.gaze.direction !== GAZE_STATES.CENTER || telemetry.head.state !== HEAD_STATES.CENTER) {
        eyeFaceConf = 0.78;
      }
      if (mouthState === MOUTH_STATES.MOVING || mouthState === MOUTH_STATES.POSSIBLE_SPEAKING) {
        eyeFaceConf = Math.min(0.95, eyeFaceConf + 0.20);
      }
    }

    let state = 'SILENT';
    let combinedConf = 0;
    let isSpeaking = false;

    const mouthActive = (mouthState === MOUTH_STATES.MOVING || mouthState === MOUTH_STATES.POSSIBLE_SPEAKING || mouthConf >= 0.38);

    if (audioConf >= 0.48 && mouthActive) {
      // Strongest Case: Speech audio + mouth movement + facial activity (Section 15)
      state = 'MULTI_SIGNAL_SPEAKING';
      combinedConf = Math.min(0.99, (audioConf * 0.52) + (mouthConf * 0.33) + (eyeFaceConf * 0.15) + 0.16);
      isSpeaking = true;
    } else if (audioConf >= thresholds.speechConfidenceThreshold) {
      // Moderate Case: Sustained speech audio when mouth is partially visible / low light
      state = 'AUDIO_ONLY_SPEECH';
      combinedConf = Math.min(0.92, (audioConf * 0.82) + (eyeFaceConf * 0.18));
      isSpeaking = true;
    } else if (audioConf < 0.28 && (mouthActive || mouthState === MOUTH_STATES.SLIGHTLY_OPEN)) {
      // Mouth movement alone (yawning, silent lip reading, breathing) -> NO speaking alert (Section 15 & 16)
      state = 'MOUTH_ONLY_IGNORED';
      combinedConf = Number((mouthConf * 0.22).toFixed(2));
      isSpeaking = false;
    } else if (telemetry.audio.vadState === VAD_STATES.BACKGROUND_NOISE) {
      // Brief noise spike without speech -> Ignored
      state = 'NOISE_REJECTED';
      combinedConf = 0.08;
      isSpeaking = false;
    } else {
      state = 'SILENT';
      combinedConf = Number((audioConf * 0.4).toFixed(2));
      isSpeaking = false;
    }

    telemetry.speakingFusion.audioConfidence = Number(audioConf.toFixed(2));
    telemetry.speakingFusion.mouthConfidence = Number(mouthConf.toFixed(2));
    telemetry.speakingFusion.eyeFaceConfidence = Number(eyeFaceConf.toFixed(2));
    telemetry.speakingFusion.combinedConfidence = Number(combinedConf.toFixed(2));
    telemetry.speakingFusion.isSpeaking = isSpeaking;
    telemetry.speakingFusion.state = state;
  }

  function updateEyeAndPoseOverlayBadge(face, gaze, head) {
    const pipEyeTracker = document.getElementById('pipEyeTracker');
    const pipEyeStatusText = document.getElementById('pipEyeStatusText');
    if (!pipEyeTracker) return;

    pipEyeTracker.style.display = 'inline-flex';
    if (!face.detected) {
      pipEyeTracker.className = 'pip-overlay-badge eye-track warn';
      if (pipEyeStatusText) pipEyeStatusText.textContent = face.obstructed ? '⚠️ Camera Obstructed' : '⚠️ No Face Detected';
    } else if (face.count > 1) {
      pipEyeTracker.className = 'pip-overlay-badge eye-track warn';
      if (pipEyeStatusText) pipEyeStatusText.textContent = `⚠️ ${face.count} Faces Detected`;
    } else if (head.state !== HEAD_STATES.CENTER) {
      pipEyeTracker.className = 'pip-overlay-badge eye-track warn';
      if (pipEyeStatusText) pipEyeStatusText.textContent = `⚠️ Head: ${head.state.replace('LOOKING_', '')}`;
    } else if (gaze.state !== GAZE_STATES.CENTER && gaze.state !== GAZE_STATES.UNKNOWN && !gaze.isBlinking) {
      pipEyeTracker.className = 'pip-overlay-badge eye-track warn';
      if (pipEyeStatusText) pipEyeStatusText.textContent = `⚠️ Gaze: ${gaze.state.replace('GAZE_', '')}`;
    } else {
      pipEyeTracker.className = 'pip-overlay-badge eye-track ok';
      if (pipEyeStatusText) pipEyeStatusText.textContent = 'Eyes & Head: Centered';
    }
  }

  // ─── External Process / AI Tool Scanner ───────────────────────────────────────
  async function checkProhibitedProcesses() {
    if (!enabled || activeOptions.allowApps || (typeof CONFIG !== 'undefined' && CONFIG.ANTI_AI_SCANNER === false)) return;
    try {
      const url = (typeof CONFIG !== 'undefined' && CONFIG.PROCTOR_SCAN_URL) || 'http://localhost:3000/api/proctor-scan';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (!data.safe && data.detected && data.detected.length > 0) {
          const names = data.detected.map(d => d.label || d.name).join(', ');
          trigger(`Prohibited external tool detected running on your system: ${names}. All companion AI tools and unauthorized software are strictly forbidden.`);
        }
      }
    } catch (_) {}
  }

  // ─── Tab / Window Switch & Malpractice Attempt Detection (Section 4) ──────────
  function onVisibilityChange() {
    if (!enabled || fullscreenGrace) return;
    if (document.hidden) {
      focusLostStartTime = Date.now();
      telemetry.focus.tabSwitches++;
      window.focus();
      if (activeOptions.fullscreen) enterFullscreen();
      ProctorEventEngine.recordInstantEvent(
        'TAB_SWITCH',
        telemetry.focus.tabSwitches > 1 ? 'HIGH' : 'WARNING',
        0.98,
        500,
        `Exam focus lost. Please return to the examination window. (Tab switch #${telemetry.focus.tabSwitches})`
      );
      handleMalpracticeViolation('Exam focus lost. Please return to the examination window. (Tab switch)');
    } else if (focusLostStartTime) {
      const dur = Date.now() - focusLostStartTime;
      focusLostStartTime = null;
      logDiag('Focus', `Candidate returned to exam tab after ${dur}ms`);
    }
  }

  function onWindowBlur() {
    if (!enabled || fullscreenGrace || window._isBugReportModalOpen) return;
    if (!focusLostStartTime) focusLostStartTime = Date.now();
    clearTimeout(blurDebounceTimer);
    blurDebounceTimer = setTimeout(() => {
      if (!enabled || fullscreenGrace || window._isBugReportModalOpen) return;
      if (document.hidden || (document.hasFocus && !document.hasFocus())) {
        windowBlurCount++;
        telemetry.focus.windowBlurs = windowBlurCount;
        window.focus();
        if (activeOptions.fullscreen) enterFullscreen();
        ProctorEventEngine.recordInstantEvent(
          'WINDOW_FOCUS_LOST',
          windowBlurCount > 1 ? 'HIGH' : 'WARNING',
          0.95,
          focusLostStartTime ? (Date.now() - focusLostStartTime) : 500,
          `Exam focus lost. Please return to the examination window. (Window blur #${windowBlurCount})`
        );
        handleMalpracticeViolation('Exam focus lost. Please return to the examination window. (Window focus lost)');
      }
    }, proctorConfig.tab_switch.warning_after_ms || 450);
  }

  function onWindowFocus() {
    clearTimeout(blurDebounceTimer);
    if (focusLostStartTime) {
      const dur = Date.now() - focusLostStartTime;
      focusLostStartTime = null;
      logDiag('Focus', `Window focus restored after ${dur}ms`);
    }
  }

  // ─── Screen Sharing ──────────────────────────────────────────────────────────
  async function requestScreenShare() {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'monitor' },
          audio: false
        });
        const track = screenStream.getVideoTracks()[0];
        if (track) {
          const badge = document.getElementById('hudScreenBadge');
          if (badge) badge.style.display = 'inline-flex';
          track.onended = () => {
            if (enabled) {
              showHotkeyAlert('Screen Share Disconnected');
              handleMalpracticeViolation('Screen sharing was stopped or disconnected');
              if (badge) badge.style.display = 'none';
            }
          };
        }
      }
    } catch (_) {}
  }

  function showHotkeyAlert(shortcut) {
    const toast = document.getElementById('hotkeyWarningToast');
    const title = document.getElementById('hotkeyToastTitle');
    const desc = document.getElementById('hotkeyToastDesc');
    if (toast) {
      if (title) title.textContent = `PROHIBITED SHORTCUT: ${shortcut}`;
      if (desc) desc.textContent = `Hotkeys such as ${shortcut} are locked during the examination.`;
      toast.style.display = 'flex';
      clearTimeout(hotkeyToastTimer);
      hotkeyToastTimer = setTimeout(() => { if (toast) toast.style.display = 'none'; }, 4000);
    }
  }

  function handleMalpracticeViolation(reason = 'Proctoring security violation') {
    if (!enabled) return;
    if (fullscreenGrace || window._isBugReportModalOpen) return;

    if (Date.now() < tabSwitchFrozenUntil) {
      return;
    }

    const now = Date.now();
    if (now - lastViolationTime < 1200) return;
    lastViolationTime = now;

    tabSwitchCount++;
    const max = activeOptions.maxMalpracticeAttempts || activeOptions.maxTabs || 10;

    if (tabSwitchCount >= max) {
      trigger(`Exam Terminated: Allowed malpractice attempt limit (${max}) reached. Reason: ${reason}.`);
    } else {
      onTabWarning && onTabWarning(tabSwitchCount, max, reason);
    }
  }

  // ─── Controlled Keyboard Shortcuts & Clipboard Blockers (Section 3) ───────────
  function blockEvent(e) {
    if (enabled) {
      if (window._isBugReportModalOpen || (e.target && e.target.closest && e.target.closest('#bugReportModal'))) return true;
      const evtType = (e.type || '').toLowerCase();
      if (evtType === 'copy') {
        ProctorEventEngine.recordInstantEvent('COPY_ATTEMPT', 'INFO', 0.99, 100, 'Blocked clipboard copy attempt inside protected exam area');
      } else if (evtType === 'paste') {
        ProctorEventEngine.recordInstantEvent('PASTE_ATTEMPT', 'INFO', 0.99, 100, 'Blocked clipboard paste attempt inside protected exam area');
      } else if (evtType === 'cut') {
        ProctorEventEngine.recordInstantEvent('CUT_ATTEMPT', 'INFO', 0.99, 100, 'Blocked clipboard cut attempt inside protected exam area');
      }
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showHotkeyAlert(evtType.toUpperCase() + ' (Clipboard Blocked)');
      return false;
    }
  }

  function onSecurityKeydown(e) {
    if (!enabled) return;

    // Shortcut for Developer/Admin Diagnostic Panel: Ctrl+Shift+D
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      e.stopPropagation();
      toggleDiagnosticsPanel();
      return false;
    }

    if (window._isBugReportModalOpen || (document.activeElement && document.activeElement.closest && document.activeElement.closest('#bugReportModal')) || (e.target && e.target.closest && e.target.closest('#bugReportModal'))) {
      if (e.key === 'Escape') {
        if (typeof closeBugReportModal === 'function') closeBugReportModal();
      }
      return;
    }

    const activeId = document.activeElement ? document.activeElement.id : '';
    const isEditor = (activeId === 'cwCodeInput' || activeId === 'cwCustomStdinInput');

    // Block Shift + Insert (Paste shortcut - Section 3)
    if (e.shiftKey && e.key === 'Insert') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      ProctorEventEngine.recordInstantEvent('PASTE_ATTEMPT', 'INFO', 0.99, 100, 'Blocked Shift+Insert paste shortcut');
      showHotkeyAlert('Shift+Insert (Paste Blocked)');
      return false;
    }

    if (e.altKey || e.key === 'Alt') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showHotkeyAlert('Alt / Alt+Tab (Switch Application)');
      return false;
    }

    if (e.metaKey || e.key === 'Meta' || e.key === 'OS' || e.key === 'Win') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showHotkeyAlert('Windows / Meta Key');
      return false;
    }

    if (e.key === 'Tab') {
      if (isEditor) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showHotkeyAlert('Tab Navigation');
      return false;
    }

    if (e.ctrlKey || e.key === 'Control') {
      const keyUpper = (e.key || '').toUpperCase();

      // Explicitly block & log Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A everywhere in exam (including code editor - Section 3)
      if (keyUpper === 'C' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        ProctorEventEngine.recordInstantEvent('COPY_ATTEMPT', 'INFO', 0.99, 100, 'Blocked Ctrl+C shortcut inside exam');
        showHotkeyAlert('Ctrl+C (Copy Blocked)');
        return false;
      }
      if (keyUpper === 'V' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        ProctorEventEngine.recordInstantEvent('PASTE_ATTEMPT', 'INFO', 0.99, 100, 'Blocked Ctrl+V shortcut inside exam');
        showHotkeyAlert('Ctrl+V (Paste Blocked)');
        return false;
      }
      if (keyUpper === 'X' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        ProctorEventEngine.recordInstantEvent('CUT_ATTEMPT', 'INFO', 0.99, 100, 'Blocked Ctrl+X shortcut inside exam');
        showHotkeyAlert('Ctrl+X (Cut Blocked)');
        return false;
      }
      if (keyUpper === 'A' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        ProctorEventEngine.recordInstantEvent('SELECT_ALL_ATTEMPT', 'INFO', 0.99, 100, 'Blocked Ctrl+A shortcut inside exam');
        showHotkeyAlert('Ctrl+A (Select All Blocked)');
        return false;
      }

      if (isEditor) {
        // Section 3 ALLOWED in editor: Ctrl+Z (Undo), Ctrl+Y (Redo), Ctrl+Shift+Z (Redo), Ctrl+Enter (Run)
        const isUndoRedo = (keyUpper === 'Z' && !e.altKey) || (keyUpper === 'Y' && !e.shiftKey && !e.altKey);
        const isRunCode  = (keyUpper === 'ENTER' && !e.altKey);
        const isNavWord  = ['ARROWLEFT', 'ARROWRIGHT', 'ARROWUP', 'ARROWDOWN', 'HOME', 'END', 'BACKSPACE', 'DELETE'].includes(keyUpper);
        if (isUndoRedo || isRunCode || isNavWord || keyUpper === 'CONTROL') {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        showHotkeyAlert(`Ctrl+${e.shiftKey ? 'Shift+' : ''}${keyUpper}`);
        return false;
      } else {
        if (keyUpper === 'CONTROL') return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const desc = (keyUpper && keyUpper !== 'CONTROL') ? `Ctrl+${keyUpper}` : 'Ctrl Key';
        showHotkeyAlert(desc);
        return false;
      }
    }

    if (/^F([1-9]|1[0-2])$/i.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showHotkeyAlert(e.key.toUpperCase());
      return false;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (activeOptions.fullscreen) enterFullscreen();
      showHotkeyAlert('Escape (Exit Fullscreen)');
      return false;
    }
  }

  // ─── Stop Cleanly (Section 2.10) ──────────────────────────────────────────────
  function stop() {
    clearInterval(detectionIntervalId);
    clearInterval(toolCheckIntervalId);
    clearTimeout(recoveryTimerId);
    detectionIntervalId = null;
    toolCheckIntervalId = null;

    if (simulatedStreamInterval) {
      clearInterval(simulatedStreamInterval);
      simulatedStreamInterval = null;
    }
    if (audioAnimFrame) {
      cancelAnimationFrame(audioAnimFrame);
      audioAnimFrame = null;
    }
    if (speechRecognizer) {
      try { speechRecognizer.stop(); } catch (_) {}
      speechRecognizer = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
    }
    if (videoStream) {
      videoStream.getTracks().forEach(t => {
        t.onended = null;
        t.stop();
      });
      videoStream = null;
    }
    if (audioStream) {
      audioStream.getTracks().forEach(t => {
        t.onended = null;
        t.stop();
      });
      audioStream = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }

    clearTimeout(blurDebounceTimer);
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
    }
    const screenBadge = document.getElementById('hudScreenBadge');
    if (screenBadge) screenBadge.style.display = 'none';
    const fsBadge = document.getElementById('hudFullscreenBadge');
    if (fsBadge) fsBadge.style.display = 'none';
    const hud = document.getElementById('proctorHUD');
    if (hud) hud.style.display = 'none';
    const pip = document.getElementById('proctorPip');
    if (pip) pip.style.display = 'none';
    const botEl = document.getElementById('aiProctorBot');
    if (botEl) botEl.style.display = 'none';
    const diagDrawer = document.getElementById('proctorDiagnosticsDrawer');
    if (diagDrawer) diagDrawer.style.display = 'none';

    document.removeEventListener('visibilitychange', onVisibilityChange, { capture: true });
    window.removeEventListener('blur', onWindowBlur, { capture: true });
    window.removeEventListener('focus', onWindowFocus, { capture: true });
    window.removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('fullscreenchange', onFullscreenChange, { capture: true });
    document.removeEventListener('contextmenu', blockEvent, { capture: true });
    document.removeEventListener('copy', blockEvent, { capture: true });
    document.removeEventListener('cut', blockEvent, { capture: true });
    document.removeEventListener('paste', blockEvent, { capture: true });
    window.removeEventListener('keydown', onSecurityKeydown, { capture: true });
    document.removeEventListener('keydown', onSecurityKeydown, { capture: true });

    enabled = false;
    setCameraState(CAMERA_STATES.STOPPED, 'Exam ended — camera and microphone released cleanly');
  }

  function trigger(reason) {
    lastViolationReason = reason;
    stop();
    if (onMalpractice) onMalpractice(reason);
  }

  function setPipStatus(text, level) {
    const el = document.getElementById('pipStatusText');
    if (el) {
      el.textContent = text;
      el.className = `pip-status ${level}`;
      if (level === 'warn') {
        el.title = 'Click to retry connecting camera and microphone';
        el.style.cursor = 'pointer';
        el.onclick = (e) => {
          e.stopPropagation();
          setPipStatus('Connecting...', 'warn');
          retryCamera();
        };
      } else {
        el.title = '';
        el.style.cursor = 'default';
        el.onclick = null;
      }
    }
  }

  function recordCompilerDiagnostics(lang, compileMs, runMs, status) {
    telemetry.compiler.language = lang || 'python';
    telemetry.compiler.compileTimeMs = compileMs || 0;
    telemetry.compiler.runTimeMs = runMs || 0;
    telemetry.compiler.status = status || 'IDLE';
    updateProctorStatusUI();
  }

  function setThresholds(customThresholds = {}) {
    thresholds = { ...thresholds, ...customThresholds };
  }

  function configure(customConfig = {}) {
    if (customConfig.gaze) proctorConfig.gaze = { ...proctorConfig.gaze, ...customConfig.gaze };
    if (customConfig.head_pose) proctorConfig.head_pose = { ...proctorConfig.head_pose, ...customConfig.head_pose };
    if (customConfig.speech) proctorConfig.speech = { ...proctorConfig.speech, ...customConfig.speech };
    if (customConfig.mouth) proctorConfig.mouth = { ...proctorConfig.mouth, ...customConfig.mouth };
    if (customConfig.tab_switch) proctorConfig.tab_switch = { ...proctorConfig.tab_switch, ...customConfig.tab_switch };
    if (customConfig.fullscreen) proctorConfig.fullscreen = { ...proctorConfig.fullscreen, ...customConfig.fullscreen };
    if (customConfig.bot) proctorConfig.bot = { ...proctorConfig.bot, ...customConfig.bot };
  }

  return {
    init,
    stop,
    enterFullscreen,
    togglePipMinimize,
    requestMediaDevices,
    retryCamera,
    toggleDiagnosticsPanel,
    recordCompilerDiagnostics,
    setThresholds,
    configure,
    getConfig: () => JSON.parse(JSON.stringify(proctorConfig)),
    getState: () => cameraState,
    getDiagnostics: () => JSON.parse(JSON.stringify({ ...telemetry, config: proctorConfig })),
    getEvents: () => ProctorEventEngine.getHistory(),
    getTabSwitchCount: () => tabSwitchCount,
    getSoundWarningCount: () => soundWarningCount,
    getLastViolationReason: () => lastViolationReason,
    getOptions: () => ({ ...activeOptions })
  };
})();

if (typeof window !== 'undefined') {
  window.PROCTOR = PROCTOR;
}

