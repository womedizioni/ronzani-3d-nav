(() => {
  const data = window.RONZANI_3D_NAV_DATA || {};
  const wrapper = document.querySelector('.ronzani-3d-nav-wrap');
  const root = document.getElementById('ronzani-3d-nav-root');

  if (!wrapper || !root) {
    return;
  }

  const menuItems = Array.isArray(data.menuItems) ? data.menuItems : [];
  const hotspotsData = Array.isArray(data.hotspots) ? data.hotspots : [];
  const wrapperMode = wrapper.dataset.mode;
  const mode = (wrapperMode || data.mode || 'desk').toLowerCase();
  const APP_STATES = Object.freeze({
    EXPLORE: 'explore',
    PREVIEW_OPEN: 'preview_open',
    ARTICLE_OPEN: 'article_open',
    FALLBACK_2D: 'fallback_2d',
  });
  const VALID_STATES = new Set(Object.values(APP_STATES));
  const MOTION = Object.freeze({
    uiEase: 'cubic-bezier(0.22, 1, 0.36, 1)',
    uiDurationMs: 320,
    uiFastMs: 220,
    previewSwapOutMs: 120,
    previewSwapInMs: 170,
    cameraLerpExplore: 0.08,
    cameraLerpPreview: 0.14,
    cameraLerpArticle: 0.05,
    cameraOffsetMaxDesk: 42,
    cameraOffsetMaxMobile: 24,
  });
  const CAMERA_DIRECTOR = Object.freeze({
    travelDurationDeskMs: 920,
    travelDurationMobileMs: 760,
    travelMinDurationMs: 420,
    travelMaxDurationMs: 1500,
    orbitClampDeg: 45,
    orbitDragSensitivityDegPerPx: 0.26,
    orbitLerp: 0.16,
    orbitReturnLerp: 0.09,
    orbitInfluenceXRatio: 0.42,
    orbitInfluenceYRatio: 0.34,
  });
  const PERFORMANCE = Object.freeze({
    fpsSampleWindow: 28,
    lowFramesToStepDown: 10,
    highFramesToStepUp: 34,
    degradeCooldownMs: 1800,
    upgradeCooldownMs: 4200,
    minFpsDesk: 42,
    minFpsDeskArticle: 24,
    minFpsMobile: 28,
    minFpsMobileArticle: 18,
    highBufferFps: 11,
  });
  const MOTION_PROFILES = Object.freeze({
    desk: Object.freeze({
      uiDurationMs: 320,
      uiFastMs: 220,
      previewSwapOutMs: 120,
      previewSwapInMs: 170,
      cameraLerpExplore: 0.08,
      cameraLerpPreview: 0.14,
      cameraLerpArticle: 0.05,
      cameraOffsetMaxDesk: 42,
      cameraOffsetMaxMobile: 24,
    }),
    mobile: Object.freeze({
      uiDurationMs: 250,
      uiFastMs: 170,
      previewSwapOutMs: 90,
      previewSwapInMs: 130,
      cameraLerpExplore: 0.11,
      cameraLerpPreview: 0.17,
      cameraLerpArticle: 0.06,
      cameraOffsetMaxDesk: 30,
      cameraOffsetMaxMobile: 18,
    }),
  });
  const mappingEndpoint = typeof data.mappingEndpoint === 'string' ? data.mappingEndpoint : '';
  const mappingHealthEndpoint =
    typeof data.mappingHealthEndpoint === 'string' ? data.mappingHealthEndpoint : '';
  const sceneConfigEndpoint =
    typeof data.sceneConfigEndpoint === 'string' ? data.sceneConfigEndpoint : '';
  const sceneHealthEndpoint =
    typeof data.sceneHealthEndpoint === 'string' ? data.sceneHealthEndpoint : '';
  const viewerRolloutKeySeed =
    typeof data.viewerRolloutKey === 'string' ? data.viewerRolloutKey : '';
  const SCENE_MODEL_FETCH_TIMEOUT_MS = 12000;
  let running = true;
  let currentState = APP_STATES.EXPLORE;
  let lastPreviewPayload = null;
  let runtimeShell = null;

  const ui = wrapper.querySelector('.ronzani-3d-nav-ui');
  const skipButton = ui ? ui.querySelector('.ronzani-3d-nav-skip') : null;
  const DEBUG_STORAGE_KEY = 'ronzani_3d_nav_debug_ids';
  const DEBUG_QUERY_KEY = 'r3d_debug';
  const QA_STORAGE_KEY = 'ronzani_3d_nav_qa_panel';
  const QA_QUERY_KEY = 'r3d_qa';
  const SCENE_OVERRIDE_STORAGE_KEY = 'ronzani_3d_nav_scene_override';
  const SCENE_OVERRIDE_QUERY_KEY = 'r3d_scene';
  const SCENE_ROLLOUT_KEY_STORAGE_KEY = 'ronzani_3d_nav_scene_rollout_key';
  const SCENE_ROLLOUT_KEY_QUERY_KEY = 'r3d_rollout_key';

  let listWrap = null;
  let debugToggleButton = null;
  let debugLegendPanel = null;
  let debugLegendList = null;
  let debugLegendMeta = null;
  let qaToggleButton = null;
  let qaPanel = null;
  let qaChecksSummary = null;
  let qaChecksList = null;
  let qaFlowSummary = null;
  let qaFlowList = null;
  let qaSmokeSummary = null;
  let qaSmokeList = null;
  let qaMeta = null;
  let qaRunChecksButton = null;
  let qaRunFlowButton = null;
  let qaRunSmokeButton = null;
  let qaCopyButton = null;
  let qaFlowBusy = false;
  let qaSmokeBusy = false;
  let qaStatusNote = '';
  const qaReports = {
    checks: null,
    flow: null,
    smoke: null,
  };
  const mappingStore = {
    endpoint: mappingEndpoint,
    items: [],
    byObjectId: new Map(),
    loaded: false,
    error: null,
  };
  const mappingHealthStore = {
    endpoint: mappingHealthEndpoint,
    payload: null,
    loaded: false,
    error: null,
  };
  const sceneStore = {
    endpoint: sceneConfigEndpoint,
    payload: null,
    objectIds: [],
    loaded: false,
    error: null,
    webgl: {
      supported: false,
      context: 'none',
      reason: 'not-checked',
    },
    binding: null,
    engine: {
      status: 'pending',
      reason: 'not-checked',
    },
    model: {
      status: 'idle',
      reason: 'not-checked',
      bytes: 0,
      httpStatus: 0,
      contentType: '',
      format: '',
      attempts: 0,
      lastDurationMs: 0,
      checkedAt: '',
    },
  };
  const sceneRuntime = {
    override: 'auto',
    enabledRaw: false,
    enabledEffective: false,
    rollout: {
      mode: 'all',
      percentage: 100,
      allowlist: [],
      allowlistCount: 0,
      viewerKey: '',
      bucket: -1,
      pass: true,
      reason: 'all',
    },
  };
  const sceneHealthStore = {
    endpoint: sceneHealthEndpoint,
    payload: null,
    loaded: false,
    error: null,
  };
  let mappingHotspotLayout = null;
  let activeSelectionIndex = -1;
  let hoverSelectionIndex = -1;
  let syncCameraTargetToSelection = () => {};
  let refreshCameraOffsetLimit = () => {};
  let refreshBackdropProfile = () => {};
  let startCameraDirectorTravel = () => {};
  let setCameraDirectorOrbitEnabled = () => {};
  let getCameraDirectorSnapshot = () => ({
    status: 'idle',
    progress: 1,
    yawDeg: 0,
    pitchDeg: 0,
    clampDeg: CAMERA_DIRECTOR.orbitClampDeg,
  });
  let getInteractionLayerSnapshot = () => ({
    ready: false,
    enabled: false,
    source: 'none',
    hoverObjectId: '',
    selectedObjectId: '',
    anchors: 0,
  });
  let getPerformanceSnapshot = () => ({
    mode: 'auto',
    tier: 'high',
    fps: 0,
    guardrailMinFps: 0,
    state: 'pending',
  });
  let setPerformanceMode = () => 'auto';
  let setPerformanceTier = () => 'high';
  let setAdaptiveQuality = () => true;
  let refreshInteractionLayer = () => {};
  let pickInteractionAtPointer = () => null;
  let selectInteractionAtIndex = () => false;
  let setListOpen = () => {};
  const motionRuntime = {
    uiEase: MOTION.uiEase,
    uiDurationMs: MOTION.uiDurationMs,
    uiFastMs: MOTION.uiFastMs,
    previewSwapOutMs: MOTION.previewSwapOutMs,
    previewSwapInMs: MOTION.previewSwapInMs,
    cameraLerpExplore: MOTION.cameraLerpExplore,
    cameraLerpPreview: MOTION.cameraLerpPreview,
    cameraLerpArticle: MOTION.cameraLerpArticle,
    cameraOffsetMaxDesk: MOTION.cameraOffsetMaxDesk,
    cameraOffsetMaxMobile: MOTION.cameraOffsetMaxMobile,
  };
  const motionViewportQuery =
    window.matchMedia && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 782px)')
      : null;
  const coarsePointerQuery =
    window.matchMedia && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)')
      : null;
  const reducedMotionQuery =
    window.matchMedia && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  const backdropRuntime = {
    frameBudgetMs: 34,
    lineStep: 1,
    linkDistancePx: 120,
    lineOpacity: 0.18,
    pointAlpha: 0.52,
    pointRadius: 2,
    speedFactor: 1,
    drawLines: true,
    drawOverlay: true,
  };
  const cameraDirector = {
    clampDeg: CAMERA_DIRECTOR.orbitClampDeg,
    focusIndex: -1,
    travel: {
      active: false,
      startedAt: 0,
      durationMs: CAMERA_DIRECTOR.travelDurationDeskMs,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
      progress: 1,
      reason: 'idle',
    },
    orbit: {
      enabled: false,
      dragging: false,
      yawDeg: 0,
      pitchDeg: 0,
      targetYawDeg: 0,
      targetPitchDeg: 0,
      lastPointerX: 0,
      lastPointerY: 0,
      pointerId: null,
      resumeStatusAfterDrag: '',
    },
    baseTargetX: 0,
    baseTargetY: 0,
    finalTargetX: 0,
    finalTargetY: 0,
  };

  const textOr = (value, fallback = '') => {
    if (typeof value !== 'string') {
      return fallback;
    }

    const trimmed = value.trim();
    return trimmed !== '' ? trimmed : fallback;
  };

  const parseBooleanFlag = (value) => {
    const normalized = textOr(value, '').toLowerCase();
    if (normalized === '') {
      return null;
    }

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }

    return null;
  };

  const normalizeSceneOverride = (value) => {
    const normalized = textOr(value, '').toLowerCase();
    if (normalized === '') {
      return 'auto';
    }

    if (['on', '1', 'true', 'yes', 'force-on', 'enabled'].includes(normalized)) {
      return 'on';
    }

    if (['off', '0', 'false', 'no', 'force-off', 'disabled'].includes(normalized)) {
      return 'off';
    }

    if (['auto', 'default'].includes(normalized)) {
      return 'auto';
    }

    return 'auto';
  };

  const sanitizeSceneRolloutKey = (value) => {
    const normalized = textOr(value, '').toLowerCase();
    if (normalized === '') {
      return '';
    }

    return normalized.replace(/[^a-z0-9_-]/g, '').slice(0, 64);
  };

  const buildAnonymousSceneRolloutKey = () => {
    try {
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        const bytes = new Uint32Array(2);
        window.crypto.getRandomValues(bytes);
        return `anon_${bytes[0].toString(16)}${bytes[1].toString(16)}`.slice(0, 64);
      }
    } catch (error) {
      // fallback below
    }

    return `anon_${Math.random().toString(36).slice(2, 12)}`.slice(0, 64);
  };

  const computeSceneRolloutBucket = (key) => {
    const normalized = sanitizeSceneRolloutKey(key);
    if (normalized === '') {
      return -1;
    }

    let hash = 2166136261;
    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0) % 100;
  };

  const normalizeSceneRolloutPolicy = (input = null) => {
    let percentage = 100;
    const allowlistMap = new Map();

    if (input && typeof input === 'object') {
      const rawPercentage = Number(input.percentage);
      if (Number.isFinite(rawPercentage)) {
        percentage = Math.round(rawPercentage);
      }

      const sourceAllowlist = Array.isArray(input.allowlist) ? input.allowlist : [];
      sourceAllowlist.forEach((token) => {
        const normalizedToken = sanitizeSceneRolloutKey(token);
        if (normalizedToken !== '' && !allowlistMap.has(normalizedToken)) {
          allowlistMap.set(normalizedToken, normalizedToken);
        }
      });
    }

    percentage = Math.max(0, Math.min(100, percentage));
    const allowlist = Array.from(allowlistMap.values());

    let mode = 'all';
    if (percentage >= 100) {
      mode = 'all';
    } else if (percentage <= 0 && allowlist.length === 0) {
      mode = 'off';
    } else if (percentage <= 0 && allowlist.length > 0) {
      mode = 'allowlist';
    } else if (percentage > 0 && allowlist.length === 0) {
      mode = 'percentage';
    } else {
      mode = 'hybrid';
    }

    return {
      mode,
      percentage,
      allowlist,
      allowlistCount: allowlist.length,
      allowlistSet: new Set(allowlist),
    };
  };

  const evaluateSceneRolloutPolicy = (policyInput, viewerKeyInput) => {
    const policy = normalizeSceneRolloutPolicy(policyInput);
    const viewerKey = sanitizeSceneRolloutKey(viewerKeyInput);
    const bucket = computeSceneRolloutBucket(viewerKey);
    const allowlistPass = viewerKey !== '' && policy.allowlistSet.has(viewerKey);
    const percentagePass =
      policy.percentage >= 100
        ? true
        : policy.percentage <= 0
          ? false
          : bucket >= 0 && bucket < policy.percentage;
    const pass = allowlistPass || percentagePass;

    let reason = 'blocked';
    if (allowlistPass) {
      reason = 'allowlist';
    } else if (percentagePass) {
      reason = policy.percentage >= 100 ? 'all' : 'percentage';
    }

    return {
      mode: policy.mode,
      percentage: policy.percentage,
      allowlist: policy.allowlist,
      allowlistCount: policy.allowlistCount,
      viewerKey,
      bucket,
      allowlistPass,
      percentagePass,
      pass,
      reason,
    };
  };

  const readDebugPreference = () => {
    try {
      const currentUrl = new URL(window.location.href);
      const queryFlag = parseBooleanFlag(currentUrl.searchParams.get(DEBUG_QUERY_KEY));
      if (queryFlag !== null) {
        return queryFlag;
      }
    } catch (error) {
      // no-op: fallback to local storage/default
    }

    try {
      return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
    } catch (error) {
      return false;
    }
  };

  const storeDebugPreference = (enabled) => {
    try {
      window.localStorage.setItem(DEBUG_STORAGE_KEY, enabled ? '1' : '0');
    } catch (error) {
      // no-op in restricted contexts
    }
  };

  const readQaPreference = () => {
    try {
      const currentUrl = new URL(window.location.href);
      const queryFlag = parseBooleanFlag(currentUrl.searchParams.get(QA_QUERY_KEY));
      if (queryFlag !== null) {
        return queryFlag;
      }
    } catch (error) {
      // no-op: fallback to local storage/default
    }

    try {
      return window.localStorage.getItem(QA_STORAGE_KEY) === '1';
    } catch (error) {
      return false;
    }
  };

  const storeQaPreference = (enabled) => {
    try {
      window.localStorage.setItem(QA_STORAGE_KEY, enabled ? '1' : '0');
    } catch (error) {
      // no-op in restricted contexts
    }
  };

  const readSceneOverridePreference = () => {
    try {
      const currentUrl = new URL(window.location.href);
      const queryMode = normalizeSceneOverride(currentUrl.searchParams.get(SCENE_OVERRIDE_QUERY_KEY));
      if (queryMode !== 'auto' || currentUrl.searchParams.has(SCENE_OVERRIDE_QUERY_KEY)) {
        return queryMode;
      }
    } catch (error) {
      // no-op: fallback to local storage/default
    }

    try {
      return normalizeSceneOverride(window.localStorage.getItem(SCENE_OVERRIDE_STORAGE_KEY));
    } catch (error) {
      return 'auto';
    }
  };

  const readSceneRolloutKeyPreference = () => {
    try {
      const currentUrl = new URL(window.location.href);
      const queryValue = sanitizeSceneRolloutKey(
        currentUrl.searchParams.get(SCENE_ROLLOUT_KEY_QUERY_KEY)
      );
      if (queryValue !== '') {
        return queryValue;
      }
    } catch (error) {
      // no-op: fallback to local storage/default
    }

    try {
      const fromStorage = sanitizeSceneRolloutKey(
        window.localStorage.getItem(SCENE_ROLLOUT_KEY_STORAGE_KEY)
      );
      if (fromStorage !== '') {
        return fromStorage;
      }
    } catch (error) {
      // no-op
    }

    const fromSeed = sanitizeSceneRolloutKey(viewerRolloutKeySeed);
    if (fromSeed !== '') {
      return fromSeed;
    }

    return sanitizeSceneRolloutKey(buildAnonymousSceneRolloutKey());
  };

  const storeSceneOverridePreference = (mode) => {
    try {
      window.localStorage.setItem(SCENE_OVERRIDE_STORAGE_KEY, normalizeSceneOverride(mode));
    } catch (error) {
      // no-op in restricted contexts
    }
  };

  const storeSceneRolloutKeyPreference = (key) => {
    try {
      window.localStorage.setItem(
        SCENE_ROLLOUT_KEY_STORAGE_KEY,
        sanitizeSceneRolloutKey(key)
      );
    } catch (error) {
      // no-op in restricted contexts
    }
  };

  const clearSceneRolloutKeyPreference = () => {
    try {
      window.localStorage.removeItem(SCENE_ROLLOUT_KEY_STORAGE_KEY);
    } catch (error) {
      // no-op in restricted contexts
    }
  };

  let debugIdsEnabled = readDebugPreference();
  let qaPanelEnabled = readQaPreference();
  let sceneOverrideMode = readSceneOverridePreference();
  let sceneRolloutKey = readSceneRolloutKeyPreference();
  if (sceneRolloutKey !== '') {
    storeSceneRolloutKeyPreference(sceneRolloutKey);
  }
  wrapper.classList.toggle('ronzani-debug-ids', debugIdsEnabled);
  wrapper.classList.toggle('ronzani-qa-open', qaPanelEnabled);
  wrapper.dataset.cameraFocus = 'none';
  wrapper.dataset.articleScroll = '0';
  wrapper.dataset.motionProfile = 'desk';
  wrapper.dataset.backdropProfile = '';
  wrapper.dataset.backdropFrameBudget = '0';
  wrapper.dataset.backdropLines = '0';
  wrapper.dataset.backdropOverlay = '0';
  wrapper.dataset.articlePrefetchReady = '0';
  wrapper.dataset.articlePrefetchCount = '0';
  wrapper.dataset.articlePrefetchInFlight = '0';
  wrapper.dataset.articlePrefetchHits = '0';
  wrapper.dataset.articleLoadState = 'idle';
  wrapper.dataset.articleParser = 'v2';
  wrapper.dataset.sceneContractReady = '0';
  wrapper.dataset.sceneConfigSource = '';
  wrapper.dataset.sceneObjectCount = '0';
  wrapper.dataset.sceneOverride = sceneOverrideMode;
  wrapper.dataset.sceneEnabledRaw = '0';
  wrapper.dataset.sceneEffectiveEnabled = '0';
  wrapper.dataset.sceneEnabled = '0';
  wrapper.dataset.sceneRolloutMode = 'all';
  wrapper.dataset.sceneRolloutPercentage = '100';
  wrapper.dataset.sceneRolloutAllowlist = '0';
  wrapper.dataset.sceneRolloutKey = sceneRolloutKey;
  wrapper.dataset.sceneRolloutBucket = '-1';
  wrapper.dataset.sceneRolloutPass = '1';
  wrapper.dataset.sceneRolloutReason = 'all';
  wrapper.dataset.sceneModelUrlSet = '0';
  wrapper.dataset.sceneModelFormat = '';
  wrapper.dataset.sceneHealthOk = '0';
  wrapper.dataset.sceneHealthWarnings = '0';
  wrapper.dataset.sceneHealthError = '0';
  wrapper.dataset.sceneModelProbeChecked = '0';
  wrapper.dataset.sceneModelReachable = '0';
  wrapper.dataset.sceneModelProbeStatus = '0';
  wrapper.dataset.sceneModelLoadState = 'idle';
  wrapper.dataset.sceneModelLoadReason = 'not-checked';
  wrapper.dataset.sceneModelBytes = '0';
  wrapper.dataset.sceneModelHttpStatus = '0';
  wrapper.dataset.sceneModelContentType = '';
  wrapper.dataset.sceneModelResolvedFormat = '';
  wrapper.dataset.sceneModelLoadAttempts = '0';
  wrapper.dataset.sceneModelLoadDurationMs = '0';
  wrapper.dataset.sceneBindingMissing = '0';
  wrapper.dataset.sceneBindingExtra = '0';
  wrapper.dataset.sceneBindingStatus = 'pending';
  wrapper.dataset.webglSupport = '0';
  wrapper.dataset.webglContext = 'none';
  wrapper.dataset.webglReason = 'not-checked';
  wrapper.dataset.engineBootstrap = 'pending';
  wrapper.dataset.engineReason = 'not-checked';
  wrapper.dataset.cameraDirector = 'v2';
  wrapper.dataset.cameraTravelState = 'idle';
  wrapper.dataset.cameraTravelProgress = '1';
  wrapper.dataset.cameraOrbitEnabled = '0';
  wrapper.dataset.cameraOrbitDragging = '0';
  wrapper.dataset.cameraOrbit = 'yaw=0,pitch=0,clamp=45';
  wrapper.dataset.interactionLayer = 'v1';
  wrapper.dataset.raycastReady = '0';
  wrapper.dataset.raycastSource = 'none';
  wrapper.dataset.raycastHover = 'none';
  wrapper.dataset.raycastSelected = 'none';
  wrapper.dataset.uiLayer = 'explore';
  wrapper.dataset.deepLinkState = 'none';
  wrapper.dataset.deepLinkValue = '';
  wrapper.dataset.performanceMode = 'auto';
  wrapper.dataset.qualityTier = 'high';
  wrapper.dataset.qualityState = 'pending';
  wrapper.dataset.fpsAvg = '0';
  wrapper.dataset.guardrailMinFps = '0';
  wrapper.dataset.keyboardFlow = '0';
  wrapper.dataset.focusTrap = 'none';
  wrapper.dataset.reducedMotion = reducedMotionQuery && reducedMotionQuery.matches ? '1' : '0';
  wrapper.dataset.fallbackHtml = '0';
  wrapper.dataset.accessibilityLayer = 'v2';

  const applyMotionProfile = () => {
    const isMobileViewport = motionViewportQuery ? motionViewportQuery.matches : window.innerWidth <= 782;
    const isCoarsePointer = coarsePointerQuery ? coarsePointerQuery.matches : false;
    const reducedMotionEnabled = reducedMotionQuery ? reducedMotionQuery.matches : false;
    const profileName = isMobileViewport || isCoarsePointer ? 'mobile' : 'desk';
    const profile = MOTION_PROFILES[profileName] || MOTION_PROFILES.desk;

    motionRuntime.uiDurationMs = profile.uiDurationMs;
    motionRuntime.uiFastMs = profile.uiFastMs;
    motionRuntime.previewSwapOutMs = profile.previewSwapOutMs;
    motionRuntime.previewSwapInMs = profile.previewSwapInMs;
    motionRuntime.cameraLerpExplore = profile.cameraLerpExplore;
    motionRuntime.cameraLerpPreview = profile.cameraLerpPreview;
    motionRuntime.cameraLerpArticle = profile.cameraLerpArticle;
    motionRuntime.cameraOffsetMaxDesk = profile.cameraOffsetMaxDesk;
    motionRuntime.cameraOffsetMaxMobile = profile.cameraOffsetMaxMobile;

    if (reducedMotionEnabled) {
      motionRuntime.uiDurationMs = Math.min(motionRuntime.uiDurationMs, 140);
      motionRuntime.uiFastMs = Math.min(motionRuntime.uiFastMs, 90);
      motionRuntime.previewSwapOutMs = 0;
      motionRuntime.previewSwapInMs = 0;
    }

    wrapper.dataset.motionProfile = profileName;
    wrapper.dataset.reducedMotion = reducedMotionEnabled ? '1' : '0';
    wrapper.style.setProperty('--ronzani-motion-ease', motionRuntime.uiEase);
    wrapper.style.setProperty('--ronzani-motion-duration', `${motionRuntime.uiDurationMs}ms`);
    wrapper.style.setProperty('--ronzani-motion-fast', `${motionRuntime.uiFastMs}ms`);

    refreshCameraOffsetLimit();
    refreshBackdropProfile();
    refreshInteractionLayer();
  };

  const registerMotionProfileListeners = () => {
    const onProfileChange = () => {
      applyMotionProfile();
    };

    if (motionViewportQuery) {
      if (typeof motionViewportQuery.addEventListener === 'function') {
        motionViewportQuery.addEventListener('change', onProfileChange);
      } else if (typeof motionViewportQuery.addListener === 'function') {
        motionViewportQuery.addListener(onProfileChange);
      }
    }

    if (coarsePointerQuery) {
      if (typeof coarsePointerQuery.addEventListener === 'function') {
        coarsePointerQuery.addEventListener('change', onProfileChange);
      } else if (typeof coarsePointerQuery.addListener === 'function') {
        coarsePointerQuery.addListener(onProfileChange);
      }
    }

    if (reducedMotionQuery) {
      if (typeof reducedMotionQuery.addEventListener === 'function') {
        reducedMotionQuery.addEventListener('change', onProfileChange);
      } else if (typeof reducedMotionQuery.addListener === 'function') {
        reducedMotionQuery.addListener(onProfileChange);
      }
    }
  };

  applyMotionProfile();
  registerMotionProfileListeners();

  const fallbackObjectIdForIndex = (index) => `menu_item_${index}`;

  const getMappingItemByIndex = (index) => {
    if (!Array.isArray(mappingStore.items) || mappingStore.items.length === 0) {
      return null;
    }

    const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
    return mappingStore.items[safeIndex % mappingStore.items.length] || null;
  };

  const getObjectIdForIndex = (index) => {
    const mappingItem = getMappingItemByIndex(index);
    if (mappingItem && typeof mappingItem.object_id === 'string' && mappingItem.object_id.trim() !== '') {
      return mappingItem.object_id.trim();
    }

    return fallbackObjectIdForIndex(index);
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const toFiniteNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const lerp = (start, end, alpha) => start + (end - start) * alpha;

  const easeInOutCubic = (value) => {
    const t = clamp(value, 0, 1);
    if (t < 0.5) {
      return 4 * t * t * t;
    }

    return 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  const getSeedHotspotForIndex = (index) => {
    if (Array.isArray(hotspotsData) && hotspotsData.length > 0) {
      const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
      const candidate = hotspotsData[safeIndex % hotspotsData.length];
      if (
        candidate &&
        Number.isFinite(candidate.x) &&
        Number.isFinite(candidate.y)
      ) {
        return {
          x: Number(candidate.x),
          y: Number(candidate.y),
          source: 'seed',
        };
      }
    }

    return {
      x: 50,
      y: 50,
      source: 'seed',
    };
  };

  const computeHotspotLayoutFromMapping = () => {
    if (!Array.isArray(mappingStore.items) || mappingStore.items.length === 0) {
      return [];
    }

    const points = mappingStore.items.map((item, index) => {
      const waypoint = item && item.waypoint && typeof item.waypoint === 'object' ? item.waypoint : null;
      const target =
        waypoint && waypoint.target && typeof waypoint.target === 'object'
          ? waypoint.target
          : waypoint && waypoint.position && typeof waypoint.position === 'object'
            ? waypoint.position
            : null;

      return {
        index,
        x: toFiniteNumber(target && target.x),
        y: toFiniteNumber(target && target.y),
        z: toFiniteNumber(target && target.z),
      };
    });

    const valid = points.filter((point) => point.x !== null && point.z !== null);
    if (valid.length === 0) {
      return [];
    }

    const xValues = valid.map((point) => point.x);
    const zValues = valid.map((point) => point.z);
    const yValues = points
      .map((point) => point.y)
      .filter((value) => value !== null);

    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minZ = Math.min(...zValues);
    const maxZ = Math.max(...zValues);
    const spanX = Math.max(0.0001, maxX - minX);
    const spanZ = Math.max(0.0001, maxZ - minZ);
    const avgY = yValues.length > 0
      ? yValues.reduce((sum, value) => sum + value, 0) / yValues.length
      : 1;

    return points.map((point, index) => {
      if (point.x === null || point.z === null) {
        return getSeedHotspotForIndex(index);
      }

      const normalizedX = clamp((point.x - minX) / spanX, 0, 1);
      const normalizedZ = clamp((point.z - minZ) / spanZ, 0, 1);
      const baseLeft = 12 + normalizedX * 76;
      const baseTop = 22 + (1 - normalizedZ) * 54;
      const yShift = point.y === null ? 0 : clamp((point.y - avgY) * 10, -8, 8);

      return {
        x: clamp(baseLeft, 8, 92),
        y: clamp(baseTop - yShift, 12, 88),
        source: 'mapping',
      };
    });
  };

  const applyHotspotLayout = (layout, source = 'seed') => {
    if (mode !== 'desk') {
      return false;
    }

    const nodes = Array.from(wrapper.querySelectorAll('.ronzani-hotspot[data-index]'));
    if (nodes.length === 0) {
      return false;
    }

    nodes.forEach((node) => {
      const rawIndex = Number(node.dataset.index);
      const index = Number.isFinite(rawIndex) ? Math.max(0, Math.floor(rawIndex)) : 0;
      const point =
        Array.isArray(layout) &&
        layout[index] &&
        Number.isFinite(layout[index].x) &&
        Number.isFinite(layout[index].y)
          ? layout[index]
          : getSeedHotspotForIndex(index);

      node.style.left = `${point.x}%`;
      node.style.top = `${point.y}%`;
      node.dataset.layoutSource = textOr(point.source, source);
    });

    wrapper.dataset.hotspotLayout = source;
    return true;
  };

  const getSelectableIndices = () =>
    Array.from(wrapper.querySelectorAll('.ronzani-3d-nav-links a[data-index]'))
      .map((node) => Number(node.dataset.index))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, Math.floor(value)));

  const clearPeekSelection = (options = {}) => {
    hoverSelectionIndex = -1;
    wrapper.querySelectorAll('.ronzani-hotspot.is-peeked, .ronzani-3d-nav-links a.is-peeked').forEach((node) => {
      node.classList.remove('is-peeked');
    });
    refreshInteractionLayer();
    if (!options.skipSync) {
      syncCameraTargetToSelection();
    }
  };

  const setPeekSelectionByIndex = (index, options = {}) => {
    const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : -1;
    if (currentState !== APP_STATES.EXPLORE || safeIndex < 0) {
      clearPeekSelection(options);
      return;
    }

    if (hoverSelectionIndex === safeIndex) {
      return;
    }

    wrapper.querySelectorAll('.ronzani-hotspot.is-peeked, .ronzani-3d-nav-links a.is-peeked').forEach((node) => {
      node.classList.remove('is-peeked');
    });

    hoverSelectionIndex = safeIndex;
    const selector = `[data-index="${safeIndex}"]`;
    wrapper.querySelectorAll(`.ronzani-hotspot${selector}, .ronzani-3d-nav-links a${selector}`).forEach((node) => {
      node.classList.add('is-peeked');
    });
    refreshInteractionLayer();
    if (!options.skipSync) {
      syncCameraTargetToSelection();
    }
  };

  const clearActiveSelection = (options = {}) => {
    activeSelectionIndex = -1;
    wrapper.querySelectorAll('.ronzani-hotspot.is-active, .ronzani-3d-nav-links a.is-active').forEach((node) => {
      node.classList.remove('is-active');
    });
    refreshInteractionLayer();
    if (!options.skipSync) {
      syncCameraTargetToSelection();
    }
  };

  const setActiveSelectionByIndex = (index) => {
    const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : -1;
    clearPeekSelection({ skipSync: true });
    clearActiveSelection({ skipSync: true });
    if (safeIndex < 0) {
      syncCameraTargetToSelection();
      return;
    }

    activeSelectionIndex = safeIndex;
    const selector = `[data-index="${safeIndex}"]`;
    wrapper.querySelectorAll(`.ronzani-hotspot${selector}, .ronzani-3d-nav-links a${selector}`).forEach((node) => {
      node.classList.add('is-active');
    });
    refreshInteractionLayer();
    syncCameraTargetToSelection();
  };

  const isModifiedActivation = (event) =>
    Boolean(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);

  const isTypingTarget = (target) => {
    if (!(target instanceof Element)) {
      return false;
    }

    if (target.closest('input, textarea, select, [contenteditable="true"]')) {
      return true;
    }

    return false;
  };

  const assignObjectIdsToDom = () => {
    const links = wrapper.querySelectorAll('.ronzani-3d-nav-links a[data-index], .ronzani-hotspot[data-index]');
    links.forEach((node) => {
      const rawIndex = Number(node.dataset.index);
      if (!Number.isFinite(rawIndex)) {
        return;
      }

      const objectId = getObjectIdForIndex(rawIndex);
      node.dataset.objectId = objectId;

      if (node.classList.contains('ronzani-hotspot')) {
        let debugNode = node.querySelector('.ronzani-hotspot-debug-id');
        if (!debugNode) {
          debugNode = document.createElement('span');
          debugNode.className = 'ronzani-hotspot-debug-id';
          node.appendChild(debugNode);
        }

        debugNode.textContent = objectId;
        debugNode.hidden = !debugIdsEnabled;
      }

      if (node.tagName.toLowerCase() === 'a' && node.closest('.ronzani-3d-nav-links')) {
        if (debugIdsEnabled) {
          node.dataset.debugId = objectId;
        } else {
          delete node.dataset.debugId;
        }
      }
    });

    refreshDebugLegend();
  };

  const updateDebugToggleUi = () => {
    if (!debugToggleButton) {
      return;
    }

    debugToggleButton.setAttribute('aria-pressed', debugIdsEnabled ? 'true' : 'false');
    debugToggleButton.textContent = debugIdsEnabled ? 'Debug ID: ON' : 'Debug ID: OFF';
  };

  const collectDebugLegendRows = () => {
    const fromDom = Array.from(wrapper.querySelectorAll('.ronzani-3d-nav-links a[data-index]'))
      .map((node) => {
        const rawIndex = Number(node.dataset.index);
        if (!Number.isFinite(rawIndex)) {
          return null;
        }

        return {
          index: Math.max(0, Math.floor(rawIndex)),
          objectId: textOr(node.dataset.objectId, getObjectIdForIndex(rawIndex)),
          title: textOr(node.textContent, ''),
        };
      })
      .filter(Boolean);

    if (fromDom.length > 0) {
      return fromDom;
    }

    return menuItems
      .map((item, index) => {
        if (!item || !item.url) {
          return null;
        }

        return {
          index,
          objectId: getObjectIdForIndex(index),
          title: textOr(item.title, item.url),
        };
      })
      .filter(Boolean);
  };

  const refreshDebugLegend = () => {
    if (!debugLegendPanel || !debugLegendList) {
      return;
    }

    if (!debugIdsEnabled) {
      debugLegendPanel.hidden = true;
      return;
    }

    const rows = collectDebugLegendRows();
    debugLegendList.innerHTML = '';

    if (rows.length === 0) {
      debugLegendPanel.hidden = true;
      return;
    }

    rows.forEach((row) => {
      const li = document.createElement('li');
      const title = row.title !== '' ? ` - ${row.title}` : '';
      li.textContent = `#${row.index + 1} -> ${row.objectId}${title}`;
      debugLegendList.appendChild(li);
    });

    const source = textOr(wrapper.dataset.mappingSource, mappingStore.loaded ? 'mapping' : 'seed');
    const count = textOr(wrapper.dataset.mappingCount, String(rows.length));
    if (debugLegendMeta) {
      debugLegendMeta.textContent = `source: ${source} | voci: ${count}`;
    }

    debugLegendPanel.hidden = false;
  };

  const setDebugMode = (enabled, options = {}) => {
    debugIdsEnabled = Boolean(enabled);
    wrapper.classList.toggle('ronzani-debug-ids', debugIdsEnabled);

    if (options.persist !== false) {
      storeDebugPreference(debugIdsEnabled);
    }

    updateDebugToggleUi();
    assignObjectIdsToDom();
    refreshDebugLegend();

    return debugIdsEnabled;
  };

  const buildPreviewPayload = (index, objectId = '') => {
    const menuItem = menuItems[index] || {};
    const resolvedObjectId =
      textOr(objectId, '') !== '' ? textOr(objectId, '') : getObjectIdForIndex(index);
    const mappingItem =
      mappingStore.byObjectId.get(resolvedObjectId) || getMappingItemByIndex(index) || null;
    const preview =
      mappingItem && mappingItem.preview && typeof mappingItem.preview === 'object'
        ? mappingItem.preview
        : {};

    const title = textOr(
      preview.title,
      textOr(menuItem.title, `Oggetto ${resolvedObjectId}`)
    );
    const abstract = textOr(
      preview.abstract,
      'Anteprima non disponibile per questo elemento.'
    );
    const articleUrl = textOr(
      mappingItem && mappingItem.article_url,
      textOr(menuItem.url, '')
    );
    const waypoint =
      mappingItem && mappingItem.waypoint && typeof mappingItem.waypoint === 'object'
        ? mappingItem.waypoint
        : null;

    return {
      index,
      objectId: resolvedObjectId,
      title,
      abstract,
      articleUrl,
      url: articleUrl,
      coverImage: textOr(preview.cover_image, ''),
      previewDate: textOr(preview.date, ''),
      categorySlug: textOr(mappingItem && mappingItem.category_slug, ''),
      waypoint,
      cameraDirector: {
        orbitClampDeg: CAMERA_DIRECTOR.orbitClampDeg,
      },
    };
  };

  const openPreviewBySelection = (index, objectId = '', options = {}) => {
    if (!runtimeShell) {
      return;
    }

    const payload = buildPreviewPayload(index, objectId);
    runtimeShell.openPreview(payload, options);
  };

  const articleCache = new Map();
  const articlePrefetchInFlight = new Map();
  let articleFetchToken = 0;
  let articlePrefetchHitCount = 0;
  let articlePrefetchQueueToken = 0;
  const ARTICLE_FETCH_TIMEOUT_MS = 9000;
  const ARTICLE_PREFETCH_TIMEOUT_MS = 4500;
  const ARTICLE_PREFETCH_WARM_WAIT_MS = 320;
  const ARTICLE_PREFETCH_DELAY_MS = 110;
  const ARTICLE_CACHE_MAX_ITEMS = 18;
  const ARTICLE_TOP_SCROLL_THRESHOLD_PX = 220;
  let activeArticleAbortController = null;
  const ARTICLE_CONTENT_SELECTORS = [
    'article .entry-content',
    'article .post-content',
    'article .wp-block-post-content',
    '.wp-block-post-content',
    '.elementor-location-single .elementor-widget-theme-post-content',
    '.elementor-widget-theme-post-content',
    '.elementor .elementor-widget-theme-post-content',
    '.fl-builder-content .fl-post-content',
    '.et-l--post .et_builder_inner_content',
    '.single-post .td-post-content',
    '.entry-content',
    '.post-content',
    'main article',
    'main .site-main',
    'main',
  ];
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const toAbsoluteUrl = (value) => {
    const normalized = textOr(value, '');
    if (normalized === '') {
      return '';
    }

    try {
      return new URL(normalized, window.location.href).toString();
    } catch (error) {
      return '';
    }
  };

  const toAbsoluteUrlFromBase = (value, baseUrl = '') => {
    const normalized = textOr(value, '');
    if (normalized === '') {
      return '';
    }
    if (normalized.startsWith('#')) {
      return normalized;
    }

    const base = textOr(baseUrl, '') || window.location.href;
    try {
      return new URL(normalized, base).toString();
    } catch (error) {
      return '';
    }
  };

  const isSameOriginUrl = (value) => {
    const normalized = toAbsoluteUrl(value);
    if (normalized === '') {
      return false;
    }

    try {
      return new URL(normalized).origin === window.location.origin;
    } catch (error) {
      return false;
    }
  };

  const isSafeContentUrl = (value, allowDataImage = false) => {
    const normalized = textOr(value, '');
    if (normalized === '') {
      return false;
    }

    if (normalized.startsWith('#')) {
      return true;
    }

    try {
      const parsed = new URL(normalized, window.location.href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return true;
      }

      if (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') {
        return true;
      }

      if (
        allowDataImage &&
        parsed.protocol === 'data:' &&
        /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(normalized)
      ) {
        return true;
      }
    } catch (error) {
      return false;
    }

    return false;
  };

  const sanitizeSrcsetAttribute = (rawValue, articleUrl = '') => {
    const srcset = textOr(rawValue, '');
    if (srcset === '') {
      return '';
    }

    const safeParts = srcset
      .split(',')
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk !== '')
      .map((chunk) => {
        const [urlPart] = chunk.split(/\s+/);
        const safeUrl = toAbsoluteUrlFromBase(urlPart, articleUrl);
        if (!isSafeContentUrl(safeUrl, true)) {
          return '';
        }

        const descriptor = chunk.slice(urlPart.length).trim();
        return descriptor === '' ? safeUrl : `${safeUrl} ${descriptor}`;
      })
      .filter((chunk) => chunk !== '');

    return safeParts.join(', ');
  };

  const toHumanLabel = (value) => textOr(value, '').replace(/[-_]+/g, ' ').trim();

  const formatDateLabel = (value) => {
    const raw = textOr(value, '');
    if (raw === '') {
      return '';
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return raw;
    }

    try {
      return new Intl.DateTimeFormat('it-IT', {
        year: 'numeric',
        month: 'long',
        day: '2-digit',
      }).format(parsed);
    } catch (error) {
      return raw;
    }
  };

  const removeUnsafeNodes = (node, articleUrl = '') => {
    if (!node) {
      return;
    }

    node.querySelectorAll('script, style, noscript, form').forEach((unsafeNode) => {
      unsafeNode.remove();
    });
    node
      .querySelectorAll(
        '.sharedaddy, .jp-relatedposts, .yarpp-related, .post-navigation, .navigation.post-navigation, .comments-area, .comment-respond, .wp-block-post-comments'
      )
      .forEach((decorativeNode) => {
        decorativeNode.remove();
      });

    node.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attribute) => {
        if (attribute.name.toLowerCase().startsWith('on')) {
          el.removeAttribute(attribute.name);
        }
      });
    });

    node.querySelectorAll('a[href]').forEach((link) => {
      const rawHref = textOr(link.getAttribute('href'), '');
      const safeHref = rawHref.startsWith('#') ? rawHref : toAbsoluteUrlFromBase(rawHref, articleUrl);
      if (!isSafeContentUrl(safeHref, false)) {
        link.removeAttribute('href');
        return;
      }

      link.setAttribute('href', safeHref);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });

    node.querySelectorAll('[src]').forEach((media) => {
      const allowDataImage = media.tagName.toLowerCase() === 'img';
      const rawSrc = textOr(media.getAttribute('src'), '');
      const safeSrc = toAbsoluteUrlFromBase(rawSrc, articleUrl);
      if (!isSafeContentUrl(safeSrc, allowDataImage)) {
        media.removeAttribute('src');
        media.removeAttribute('srcset');
        return;
      }

      media.setAttribute('src', safeSrc);
    });

    node.querySelectorAll('img[srcset], source[srcset]').forEach((asset) => {
      const sanitizedSrcset = sanitizeSrcsetAttribute(asset.getAttribute('srcset'), articleUrl);
      if (sanitizedSrcset === '') {
        asset.removeAttribute('srcset');
        return;
      }

      asset.setAttribute('srcset', sanitizedSrcset);
    });

    node.querySelectorAll('img').forEach((image) => {
      image.loading = 'lazy';
      image.decoding = 'async';
    });
  };

  const extractArticlePayloadFromHtml = (html, articleUrl, fallbackTitle) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const title =
      textOr(
        doc.querySelector('meta[property="og:title"]') &&
          doc.querySelector('meta[property="og:title"]').getAttribute('content'),
        ''
      ) ||
      textOr(doc.querySelector('main h1, article h1, h1') && doc.querySelector('main h1, article h1, h1').textContent, '') ||
      textOr(doc.title, fallbackTitle);

    let contentNode = null;
    for (const selector of ARTICLE_CONTENT_SELECTORS) {
      const found = doc.querySelector(selector);
      if (found) {
        contentNode = found;
        break;
      }
    }

    const clone = contentNode ? contentNode.cloneNode(true) : null;
    removeUnsafeNodes(clone, articleUrl);
    const htmlContent = clone ? textOr(clone.innerHTML, '') : '';

    const dateNode = doc.querySelector('article time[datetime], time[datetime], article time, time');
    const rawDate =
      textOr(dateNode && dateNode.getAttribute('datetime'), '') ||
      textOr(dateNode && dateNode.textContent, '');
    const dateLabel = formatDateLabel(rawDate);
    const hostLabel = (() => {
      try {
        const hostname = new URL(articleUrl, window.location.href).hostname;
        return hostname.replace(/^www\./i, '');
      } catch (error) {
        return '';
      }
    })();

    const metaParts = [];
    if (dateLabel !== '') {
      metaParts.push(dateLabel);
    }
    if (hostLabel !== '') {
      metaParts.push(hostLabel);
    }

    return {
      title,
      meta: metaParts.join(' | '),
      html: htmlContent,
    };
  };

  const refreshArticlePrefetchMetrics = () => {
    wrapper.dataset.articlePrefetchCount = String(articleCache.size);
    wrapper.dataset.articlePrefetchInFlight = String(articlePrefetchInFlight.size);
    wrapper.dataset.articlePrefetchHits = String(articlePrefetchHitCount);
  };

  const rememberArticleCacheEntry = (articleUrl, payload = {}) => {
    const normalizedUrl = toAbsoluteUrl(articleUrl);
    if (normalizedUrl === '' || !payload || typeof payload !== 'object') {
      return;
    }

    const cachedPayload = {
      title: textOr(payload.title, 'Lettura articolo'),
      meta: textOr(payload.meta, normalizedUrl),
      html: textOr(payload.html, ''),
    };

    if (articleCache.has(normalizedUrl)) {
      articleCache.delete(normalizedUrl);
    }
    articleCache.set(normalizedUrl, cachedPayload);

    while (articleCache.size > ARTICLE_CACHE_MAX_ITEMS) {
      const oldestKey = articleCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      articleCache.delete(oldestKey);
    }

    refreshArticlePrefetchMetrics();
  };

  const readArticleCacheEntry = (articleUrl, options = {}) => {
    const normalizedUrl = toAbsoluteUrl(articleUrl);
    if (normalizedUrl === '') {
      return null;
    }

    const cached = articleCache.get(normalizedUrl) || null;
    if (cached && options && options.trackHit) {
      articlePrefetchHitCount += 1;
      refreshArticlePrefetchMetrics();
    }

    return cached;
  };

  const prefetchArticlePayload = async (articleUrl, fallbackTitle = 'Lettura articolo') => {
    const normalizedUrl = toAbsoluteUrl(articleUrl);
    if (
      normalizedUrl === '' ||
      !isSafeContentUrl(normalizedUrl, false) ||
      !isSameOriginUrl(normalizedUrl)
    ) {
      return null;
    }

    const cached = readArticleCacheEntry(normalizedUrl);
    if (cached) {
      return cached;
    }

    if (articlePrefetchInFlight.has(normalizedUrl)) {
      return articlePrefetchInFlight.get(normalizedUrl) || null;
    }

    const hasAbortController = typeof AbortController !== 'undefined';
    const controller = hasAbortController ? new AbortController() : null;
    let timeoutToken = null;
    if (controller) {
      timeoutToken = window.setTimeout(() => {
        controller.abort();
      }, ARTICLE_PREFETCH_TIMEOUT_MS);
    }

    const task = (async () => {
      try {
        const response = await fetch(normalizedUrl, {
          credentials: 'same-origin',
          signal: controller ? controller.signal : undefined,
        });
        if (!response.ok) {
          return null;
        }

        const html = await response.text();
        const parsed = extractArticlePayloadFromHtml(html, normalizedUrl, fallbackTitle);
        const normalizedPayload = {
          title: textOr(parsed.title, fallbackTitle),
          meta: textOr(parsed.meta, normalizedUrl),
          html: textOr(parsed.html, ''),
        };

        if (normalizedPayload.html !== '') {
          rememberArticleCacheEntry(normalizedUrl, normalizedPayload);
        }
        return normalizedPayload;
      } catch (error) {
        return null;
      } finally {
        if (timeoutToken !== null) {
          window.clearTimeout(timeoutToken);
        }
      }
    })();

    articlePrefetchInFlight.set(normalizedUrl, task);
    refreshArticlePrefetchMetrics();
    try {
      return await task;
    } finally {
      articlePrefetchInFlight.delete(normalizedUrl);
      refreshArticlePrefetchMetrics();
    }
  };

  const waitForPrefetchWarmup = async (articleUrl) => {
    const normalizedUrl = toAbsoluteUrl(articleUrl);
    if (normalizedUrl === '') {
      return;
    }

    const pending = articlePrefetchInFlight.get(normalizedUrl);
    if (!pending) {
      return;
    }

    let timeoutToken = null;
    await Promise.race([
      pending,
      new Promise((resolve) => {
        timeoutToken = window.setTimeout(resolve, ARTICLE_PREFETCH_WARM_WAIT_MS);
      }),
    ]);
    if (timeoutToken !== null) {
      window.clearTimeout(timeoutToken);
    }
  };

  const getFocusableNodes = (container) => {
    if (!container) {
      return [];
    }

    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      if (node.hasAttribute('disabled') || node.getAttribute('aria-hidden') === 'true') {
        return false;
      }

      return node.offsetParent !== null;
    });
  };

  const DEEP_LINK_OBJECT_KEY = 'r3d_object';
  const DEEP_LINK_VIEW_KEY = 'r3d_view';
  const DEEP_LINK_VIEW_PREVIEW = 'preview';
  const DEEP_LINK_VIEW_ARTICLE = 'article';
  let isApplyingDeepLink = false;

  const sanitizeObjectIdToken = (value) => {
    const raw = textOr(value, '').toLowerCase();
    if (raw === '') {
      return '';
    }

    return raw.replace(/[^a-z0-9_-]/g, '').slice(0, 120);
  };

  const normalizeDeepLinkView = (value) =>
    value === DEEP_LINK_VIEW_ARTICLE ? DEEP_LINK_VIEW_ARTICLE : DEEP_LINK_VIEW_PREVIEW;

  const readDeepLinkFromLocation = () => {
    try {
      const currentUrl = new URL(window.location.href);
      const objectId = sanitizeObjectIdToken(currentUrl.searchParams.get(DEEP_LINK_OBJECT_KEY) || '');
      if (objectId === '') {
        return null;
      }

      return {
        objectId,
        view: normalizeDeepLinkView(textOr(currentUrl.searchParams.get(DEEP_LINK_VIEW_KEY), '')),
      };
    } catch (error) {
      return null;
    }
  };

  const refreshDeepLinkDataset = () => {
    const deepLink = readDeepLinkFromLocation();
    if (!deepLink) {
      wrapper.dataset.deepLinkState = 'none';
      wrapper.dataset.deepLinkValue = '';
      return;
    }

    wrapper.dataset.deepLinkState = deepLink.view;
    wrapper.dataset.deepLinkValue = `${deepLink.objectId}:${deepLink.view}`;
  };

  const writeDeepLink = (payload = null, historyMode = 'replace') => {
    if (isApplyingDeepLink) {
      return;
    }

    try {
      const currentUrl = new URL(window.location.href);
      if (payload && typeof payload === 'object') {
        const objectId = sanitizeObjectIdToken(payload.objectId);
        if (objectId !== '') {
          currentUrl.searchParams.set(DEEP_LINK_OBJECT_KEY, objectId);
          currentUrl.searchParams.set(
            DEEP_LINK_VIEW_KEY,
            normalizeDeepLinkView(textOr(payload.view, DEEP_LINK_VIEW_PREVIEW))
          );
        } else {
          currentUrl.searchParams.delete(DEEP_LINK_OBJECT_KEY);
          currentUrl.searchParams.delete(DEEP_LINK_VIEW_KEY);
        }
      } else {
        currentUrl.searchParams.delete(DEEP_LINK_OBJECT_KEY);
        currentUrl.searchParams.delete(DEEP_LINK_VIEW_KEY);
      }

      const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      const activeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextUrl === activeUrl) {
        refreshDeepLinkDataset();
        return;
      }

      const method = historyMode === 'push' ? 'pushState' : 'replaceState';
      window.history[method]({}, '', nextUrl);
      refreshDeepLinkDataset();
    } catch (error) {
      // no-op: URL sync is progressive enhancement
    }
  };

  const findIndexByObjectId = (objectId) => {
    const normalizedObjectId = sanitizeObjectIdToken(objectId);
    if (normalizedObjectId === '') {
      return -1;
    }

    const byMapping = mappingStore.items.findIndex(
      (item) => item && sanitizeObjectIdToken(item.object_id) === normalizedObjectId
    );
    if (byMapping >= 0) {
      return byMapping;
    }

    const fromDom = wrapper.querySelector(
      `.ronzani-hotspot[data-object-id="${normalizedObjectId}"], .ronzani-3d-nav-links a[data-object-id="${normalizedObjectId}"]`
    );
    if (!fromDom) {
      return -1;
    }

    const rawIndex = Number(fromDom.dataset.index);
    return Number.isFinite(rawIndex) ? Math.max(0, Math.floor(rawIndex)) : -1;
  };

  const resolveSceneEnabledFromOverride = (enabledRaw) => {
    if (sceneOverrideMode === 'on') {
      return true;
    }
    if (sceneOverrideMode === 'off') {
      return false;
    }
    return Boolean(enabledRaw) && Boolean(sceneRuntime.rollout && sceneRuntime.rollout.pass);
  };

  const syncSceneRolloutDataset = () => {
    const rolloutInput =
      sceneStore.payload &&
      typeof sceneStore.payload === 'object' &&
      sceneStore.payload.rollout &&
      typeof sceneStore.payload.rollout === 'object'
        ? sceneStore.payload.rollout
        : null;
    const evaluated = evaluateSceneRolloutPolicy(rolloutInput, sceneRolloutKey);

    sceneRuntime.rollout = {
      mode: textOr(evaluated.mode, 'all'),
      percentage: Number.isFinite(Number(evaluated.percentage))
        ? Math.max(0, Math.min(100, Math.round(Number(evaluated.percentage))))
        : 100,
      allowlist: Array.isArray(evaluated.allowlist) ? evaluated.allowlist.slice() : [],
      allowlistCount: Number(evaluated.allowlistCount) || 0,
      viewerKey: textOr(evaluated.viewerKey, ''),
      bucket: Number.isFinite(Number(evaluated.bucket)) ? Math.floor(Number(evaluated.bucket)) : -1,
      pass: Boolean(evaluated.pass),
      reason: textOr(evaluated.reason, 'blocked'),
    };

    wrapper.dataset.sceneRolloutMode = sceneRuntime.rollout.mode;
    wrapper.dataset.sceneRolloutPercentage = String(sceneRuntime.rollout.percentage);
    wrapper.dataset.sceneRolloutAllowlist = String(sceneRuntime.rollout.allowlistCount);
    wrapper.dataset.sceneRolloutKey = sceneRuntime.rollout.viewerKey;
    wrapper.dataset.sceneRolloutBucket =
      sceneRuntime.rollout.bucket >= 0 ? String(sceneRuntime.rollout.bucket) : '-1';
    wrapper.dataset.sceneRolloutPass = sceneRuntime.rollout.pass ? '1' : '0';
    wrapper.dataset.sceneRolloutReason = sceneRuntime.rollout.reason;

    if (sceneStore.payload && typeof sceneStore.payload === 'object') {
      sceneStore.payload.rollout = {
        percentage: sceneRuntime.rollout.percentage,
        allowlist: sceneRuntime.rollout.allowlist.slice(),
        allowlist_count: sceneRuntime.rollout.allowlistCount,
        mode: sceneRuntime.rollout.mode,
      };
      sceneStore.payload.rollout_runtime = {
        viewer_key: sceneRuntime.rollout.viewerKey,
        bucket: sceneRuntime.rollout.bucket,
        pass: sceneRuntime.rollout.pass,
        reason: sceneRuntime.rollout.reason,
      };
    }
  };

  const syncSceneEnablementDataset = () => {
    syncSceneRolloutDataset();
    const rawEnabled = Boolean(sceneStore.payload && sceneStore.payload.enabled);
    const effectiveEnabled = resolveSceneEnabledFromOverride(rawEnabled);
    const rolloutPass = Boolean(sceneRuntime.rollout && sceneRuntime.rollout.pass);

    sceneRuntime.override = sceneOverrideMode;
    sceneRuntime.enabledRaw = rawEnabled;
    sceneRuntime.enabledEffective = effectiveEnabled;

    wrapper.dataset.sceneOverride = sceneOverrideMode;
    wrapper.dataset.sceneEnabledRaw = rawEnabled ? '1' : '0';
    wrapper.dataset.sceneEffectiveEnabled = effectiveEnabled ? '1' : '0';
    wrapper.dataset.sceneEnabled = effectiveEnabled ? '1' : '0';

    if (sceneStore.payload && typeof sceneStore.payload === 'object') {
      sceneStore.payload.enabled_raw = rawEnabled;
      sceneStore.payload.enabled_effective = effectiveEnabled;
      sceneStore.payload.override = sceneOverrideMode;
      sceneStore.payload.rollout_pass = rolloutPass;
    }
  };

  const isSceneEnabledEffective = () => sceneRuntime.enabledEffective;

  syncSceneEnablementDataset();

  const syncSceneModelDataset = () => {
    const model = sceneStore.model && typeof sceneStore.model === 'object' ? sceneStore.model : {};
    wrapper.dataset.sceneModelLoadState = textOr(model.status, 'idle');
    wrapper.dataset.sceneModelLoadReason = textOr(model.reason, 'not-checked');
    wrapper.dataset.sceneModelBytes = String(Number(model.bytes) || 0);
    wrapper.dataset.sceneModelHttpStatus = String(Number(model.httpStatus) || 0);
    wrapper.dataset.sceneModelContentType = textOr(model.contentType, '');
    wrapper.dataset.sceneModelResolvedFormat = textOr(model.format, '');
    wrapper.dataset.sceneModelLoadAttempts = String(Number(model.attempts) || 0);
    wrapper.dataset.sceneModelLoadDurationMs = String(Number(model.lastDurationMs) || 0);
  };

  const setSceneModelBootstrapState = (nextState = {}) => {
    const base = sceneStore.model && typeof sceneStore.model === 'object' ? sceneStore.model : {};
    sceneStore.model = {
      status: textOr(base.status, 'idle'),
      reason: textOr(base.reason, 'not-checked'),
      bytes: Number(base.bytes) || 0,
      httpStatus: Number(base.httpStatus) || 0,
      contentType: textOr(base.contentType, ''),
      format: textOr(base.format, ''),
      attempts: Number(base.attempts) || 0,
      lastDurationMs: Number(base.lastDurationMs) || 0,
      checkedAt: textOr(base.checkedAt, ''),
      ...nextState,
      checkedAt: new Date().toISOString(),
    };
    syncSceneModelDataset();
    refreshEngineBootstrapStatus();
  };

  const resetSceneModelBootstrap = (reason = 'scene-config-updated') => {
    setSceneModelBootstrapState({
      status: 'idle',
      reason: textOr(reason, 'scene-config-updated'),
      bytes: 0,
      httpStatus: 0,
      contentType: '',
      format: '',
    });
  };

  const inferSceneModelFormat = () => {
    const fromPayload = textOr(sceneStore.payload && sceneStore.payload.model_format, '').toLowerCase();
    if (fromPayload === 'glb' || fromPayload === 'gltf') {
      return fromPayload;
    }

    const modelUrl = textOr(sceneStore.payload && sceneStore.payload.model_url, '');
    if (modelUrl === '') {
      return '';
    }

    let cleanPath = modelUrl;
    const hashPos = cleanPath.indexOf('#');
    if (hashPos >= 0) {
      cleanPath = cleanPath.slice(0, hashPos);
    }
    const queryPos = cleanPath.indexOf('?');
    if (queryPos >= 0) {
      cleanPath = cleanPath.slice(0, queryPos);
    }

    const dotPos = cleanPath.lastIndexOf('.');
    if (dotPos < 0) {
      return '';
    }

    const extension = cleanPath.slice(dotPos + 1).toLowerCase();
    if (extension === 'glb' || extension === 'gltf') {
      return extension;
    }

    return '';
  };

  const validateGlbBinary = (buffer) => {
    if (!(buffer instanceof ArrayBuffer)) {
      return { ok: false, reason: 'scene-model-glb-buffer-invalid' };
    }
    if (buffer.byteLength < 20) {
      return { ok: false, reason: 'scene-model-glb-too-small' };
    }

    const header = new DataView(buffer, 0, 20);
    const magic = header.getUint32(0, true);
    const version = header.getUint32(4, true);
    const declaredLength = header.getUint32(8, true);
    const chunkLength = header.getUint32(12, true);
    const chunkType = header.getUint32(16, true);

    if (magic !== 0x46546c67) {
      return { ok: false, reason: 'scene-model-glb-magic-invalid' };
    }
    if (version < 2) {
      return { ok: false, reason: 'scene-model-glb-version-invalid' };
    }
    if (declaredLength <= 0 || declaredLength > buffer.byteLength) {
      return { ok: false, reason: 'scene-model-glb-length-invalid' };
    }
    if (chunkLength <= 0) {
      return { ok: false, reason: 'scene-model-glb-chunk-empty' };
    }
    if (chunkType !== 0x4e4f534a && chunkType !== 0x004e4942) {
      return { ok: false, reason: 'scene-model-glb-chunk-type-invalid' };
    }

    return { ok: true, reason: 'ok' };
  };

  const validateGltfJson = (buffer) => {
    if (!(buffer instanceof ArrayBuffer)) {
      return { ok: false, reason: 'scene-model-gltf-buffer-invalid' };
    }
    if (typeof TextDecoder !== 'function') {
      return { ok: false, reason: 'scene-model-gltf-decoder-missing' };
    }

    let raw = '';
    try {
      raw = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    } catch (error) {
      return { ok: false, reason: 'scene-model-gltf-decode-failed' };
    }

    const source = textOr(raw, '');
    if (source === '') {
      return { ok: false, reason: 'scene-model-gltf-empty' };
    }

    try {
      const parsed = JSON.parse(source);
      const version =
        parsed &&
        parsed.asset &&
        typeof parsed.asset === 'object' &&
        typeof parsed.asset.version === 'string'
          ? parsed.asset.version
          : '';
      if (version === '') {
        return { ok: false, reason: 'scene-model-gltf-asset-version-missing' };
      }
      return { ok: true, reason: 'ok' };
    } catch (error) {
      return { ok: false, reason: 'scene-model-gltf-json-invalid' };
    }
  };

  const validateSceneModelAsset = (buffer, format) => {
    if (format === 'glb') {
      return validateGlbBinary(buffer);
    }
    if (format === 'gltf') {
      return validateGltfJson(buffer);
    }
    return { ok: false, reason: 'scene-model-format-unknown' };
  };

  const normalizeSceneModelFetchError = (error) => {
    if (error && typeof error === 'object') {
      const typed = error;
      const name = textOr(typed.name, '');
      if (name === 'AbortError') {
        return 'scene-model-fetch-timeout';
      }
      const message = textOr(typed.message, '');
      if (message.startsWith('scene-model-')) {
        return message;
      }
    }

    return 'scene-model-fetch-failed';
  };

  const bootstrapSceneModel = async () => {
    const sceneEnabled = isSceneEnabledEffective();
    const sceneModelUrl = toAbsoluteUrl(textOr(sceneStore.payload && sceneStore.payload.model_url, ''));
    const sceneModelFormat = inferSceneModelFormat();
    const webglSupported = Boolean(sceneStore.webgl && sceneStore.webgl.supported);
    const sceneReady =
      sceneStore.loaded && Array.isArray(sceneStore.objectIds) && sceneStore.objectIds.length > 0;
    const binding =
      sceneStore.binding && typeof sceneStore.binding === 'object' ? sceneStore.binding : null;
    const bindingHasMissing = Boolean(
      binding && Array.isArray(binding.missing_in_scene) && binding.missing_in_scene.length > 0
    );

    if (!sceneEnabled) {
      setSceneModelBootstrapState({
        status: 'skipped',
        reason: 'scene-disabled',
        bytes: 0,
        httpStatus: 0,
        contentType: '',
        format: sceneModelFormat,
      });
      return;
    }

    if (sceneModelUrl === '') {
      setSceneModelBootstrapState({
        status: 'skipped',
        reason: 'scene-model-url-missing',
        bytes: 0,
        httpStatus: 0,
        contentType: '',
        format: sceneModelFormat,
      });
      return;
    }

    if (!sceneReady) {
      setSceneModelBootstrapState({
        status: 'skipped',
        reason: 'scene-object-ids-missing',
        bytes: 0,
        httpStatus: 0,
        contentType: '',
        format: sceneModelFormat,
      });
      return;
    }

    if (bindingHasMissing) {
      setSceneModelBootstrapState({
        status: 'skipped',
        reason: 'scene-binding-missing',
        bytes: 0,
        httpStatus: 0,
        contentType: '',
        format: sceneModelFormat,
      });
      return;
    }

    if (!webglSupported) {
      setSceneModelBootstrapState({
        status: 'skipped',
        reason: textOr(sceneStore.webgl.reason, 'webgl-unsupported'),
        bytes: 0,
        httpStatus: 0,
        contentType: '',
        format: sceneModelFormat,
      });
      return;
    }

    if (sceneModelFormat === '') {
      setSceneModelBootstrapState({
        status: 'error',
        reason: 'scene-model-format-unknown',
        bytes: 0,
        httpStatus: 0,
        contentType: '',
        format: '',
      });
      return;
    }

    const nextAttempt = (Number(sceneStore.model && sceneStore.model.attempts) || 0) + 1;
    const bootstrapStartedAt = performance.now();
    setSceneModelBootstrapState({
      status: 'loading',
      reason: 'scene-model-loading',
      bytes: 0,
      httpStatus: 0,
      contentType: '',
      format: sceneModelFormat,
      attempts: nextAttempt,
      lastDurationMs: 0,
    });

    const abortController =
      typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = null;
    try {
      if (abortController) {
        timeoutId = window.setTimeout(() => {
          abortController.abort();
        }, SCENE_MODEL_FETCH_TIMEOUT_MS);
      }

      const response = await fetch(sceneModelUrl, {
        method: 'GET',
        credentials: 'omit',
        signal: abortController ? abortController.signal : undefined,
      });
      if (!response.ok) {
        throw new Error(`scene-model-http-${response.status}`);
      }

      const contentType = textOr(response.headers.get('content-type'), '');
      const bytes = await response.arrayBuffer();
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) {
        throw new Error('scene-model-empty');
      }

      const validation = validateSceneModelAsset(bytes, sceneModelFormat);
      if (!validation.ok) {
        throw new Error(textOr(validation.reason, 'scene-model-parse-failed'));
      }

      setSceneModelBootstrapState({
        status: 'ready',
        reason: 'scene-model-ready',
        bytes: bytes.byteLength,
        httpStatus: Number(response.status) || 0,
        contentType,
        format: sceneModelFormat,
        attempts: nextAttempt,
        lastDurationMs: Math.max(0, Math.round(performance.now() - bootstrapStartedAt)),
      });
    } catch (error) {
      const normalizedReason = normalizeSceneModelFetchError(error);
      const statusFromError = Number(
        textOr(error && typeof error === 'object' ? error.message : '', '')
          .replace('scene-model-http-', '')
      );
      setSceneModelBootstrapState({
        status: 'error',
        reason: normalizedReason,
        bytes: 0,
        httpStatus: Number.isFinite(statusFromError) ? statusFromError : 0,
        contentType: '',
        format: sceneModelFormat,
        attempts: nextAttempt,
        lastDurationMs: Math.max(0, Math.round(performance.now() - bootstrapStartedAt)),
      });
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  };

  const refreshEngineBootstrapStatus = () => {
    const webglSupported = Boolean(sceneStore.webgl && sceneStore.webgl.supported);
    const binding =
      sceneStore.binding && typeof sceneStore.binding === 'object' ? sceneStore.binding : null;
    const bindingHasMissing = Boolean(binding && Array.isArray(binding.missing_in_scene) && binding.missing_in_scene.length > 0);
    const sceneLoaded = sceneStore.loaded;
    const sceneReady = sceneLoaded && Array.isArray(sceneStore.objectIds) && sceneStore.objectIds.length > 0;
    const sceneEnabled = isSceneEnabledEffective();
    const modelUrl = textOr(sceneStore.payload && sceneStore.payload.model_url, '');
    const sceneModelReady = modelUrl !== '';
    const modelLoadState = textOr(sceneStore.model && sceneStore.model.status, 'idle');
    const modelLoadReason = textOr(sceneStore.model && sceneStore.model.reason, 'not-checked');

    if (!sceneLoaded) {
      sceneStore.engine.status = sceneStore.error ? 'fallback' : 'pending';
      sceneStore.engine.reason = sceneStore.error ? textOr(sceneStore.error, 'scene-load-failed') : 'scene-pending';
    } else if (!sceneEnabled) {
      sceneStore.engine.status = 'fallback';
      sceneStore.engine.reason = 'scene-disabled';
    } else if (!sceneModelReady) {
      sceneStore.engine.status = 'fallback';
      sceneStore.engine.reason = 'scene-model-url-missing';
    } else if (!webglSupported) {
      sceneStore.engine.status = 'fallback';
      sceneStore.engine.reason = textOr(sceneStore.webgl.reason, 'webgl-unsupported');
    } else if (!sceneReady) {
      sceneStore.engine.status = 'fallback';
      sceneStore.engine.reason = 'scene-object-ids-missing';
    } else if (bindingHasMissing) {
      sceneStore.engine.status = 'fallback';
      sceneStore.engine.reason = 'scene-binding-missing';
    } else if (modelLoadState === 'ready') {
      sceneStore.engine.status = 'ready';
      sceneStore.engine.reason = 'scene-model-ready';
    } else if (modelLoadState === 'error') {
      sceneStore.engine.status = 'fallback';
      sceneStore.engine.reason = modelLoadReason !== '' ? modelLoadReason : 'scene-model-load-failed';
    } else if (modelLoadState === 'loading') {
      sceneStore.engine.status = 'pending';
      sceneStore.engine.reason = 'scene-model-loading';
    } else {
      sceneStore.engine.status = 'pending';
      sceneStore.engine.reason = modelLoadReason !== '' ? modelLoadReason : 'scene-model-pending';
    }

    wrapper.dataset.engineBootstrap = sceneStore.engine.status;
    wrapper.dataset.engineReason = sceneStore.engine.reason;
  };

  const refreshSceneBindingReport = () => {
    const mappingObjectIds = Array.from(
      new Set(
        mappingStore.items
          .map((item) => (item ? sanitizeObjectIdToken(item.object_id) : ''))
          .filter((value) => value !== '')
      )
    );
    const sceneObjectIds = Array.from(
      new Set(
        (Array.isArray(sceneStore.objectIds) ? sceneStore.objectIds : [])
          .map((value) => sanitizeObjectIdToken(value))
          .filter((value) => value !== '')
      )
    );
    const sceneLookup = new Set(sceneObjectIds);
    const mappingLookup = new Set(mappingObjectIds);

    const missingInScene = mappingObjectIds.filter((id) => !sceneLookup.has(id));
    const extraInScene = sceneObjectIds.filter((id) => !mappingLookup.has(id));
    const ok = sceneObjectIds.length > 0 && missingInScene.length === 0;

    sceneStore.binding = {
      generatedAt: new Date().toISOString(),
      ok,
      mapping_count: mappingObjectIds.length,
      scene_count: sceneObjectIds.length,
      missing_in_scene: missingInScene,
      extra_in_scene: extraInScene,
    };

    wrapper.dataset.sceneBindingStatus = ok ? 'ok' : sceneObjectIds.length === 0 ? 'pending' : 'warn';
    wrapper.dataset.sceneBindingMissing = String(missingInScene.length);
    wrapper.dataset.sceneBindingExtra = String(extraInScene.length);
    refreshEngineBootstrapStatus();
  };

  const detectWebglCapability = () => {
    const fallback = {
      supported: false,
      context: 'none',
      reason: 'webgl-api-unavailable',
    };

    if (typeof window.WebGLRenderingContext === 'undefined') {
      sceneStore.webgl = fallback;
      wrapper.dataset.webglSupport = '0';
      wrapper.dataset.webglContext = 'none';
      wrapper.dataset.webglReason = fallback.reason;
      refreshEngineBootstrapStatus();
      return sceneStore.webgl;
    }

    let probe = null;
    try {
      probe = document.createElement('canvas');
      const webgl2 = probe.getContext('webgl2');
      if (webgl2) {
        sceneStore.webgl = {
          supported: true,
          context: 'webgl2',
          reason: 'ok',
        };
      } else {
        const webgl1 = probe.getContext('webgl') || probe.getContext('experimental-webgl');
        if (webgl1) {
          sceneStore.webgl = {
            supported: true,
            context: 'webgl',
            reason: 'ok',
          };
        } else {
          sceneStore.webgl = {
            supported: false,
            context: 'none',
            reason: 'context-init-failed',
          };
        }
      }
    } catch (error) {
      sceneStore.webgl = {
        supported: false,
        context: 'none',
        reason: 'context-init-exception',
      };
    }

    wrapper.dataset.webglSupport = sceneStore.webgl.supported ? '1' : '0';
    wrapper.dataset.webglContext = sceneStore.webgl.context;
    wrapper.dataset.webglReason = sceneStore.webgl.reason;
    refreshEngineBootstrapStatus();
    return sceneStore.webgl;
  };

  const buildQaReport = () => {
    const links = Array.from(wrapper.querySelectorAll('.ronzani-3d-nav-links a[data-index]'));
    const hotspots = Array.from(wrapper.querySelectorAll('.ronzani-hotspot[data-index]'));
    const selectableCount = getSelectableIndices().length;
    const validMenuItems = menuItems.filter((item) => item && typeof item.url === 'string' && item.url !== '');
    const mappingCount = mappingStore.items.length;
    const mappingHealthSummary =
      mappingHealthStore.payload &&
      mappingHealthStore.payload.summary &&
      typeof mappingHealthStore.payload.summary === 'object'
        ? mappingHealthStore.payload.summary
        : null;
    const sceneHealthSummary =
      sceneHealthStore.payload &&
      sceneHealthStore.payload.summary &&
      typeof sceneHealthStore.payload.summary === 'object'
        ? sceneHealthStore.payload.summary
        : null;
    const deepLink = readDeepLinkFromLocation();
    const cameraDirectorSnapshot = getCameraDirectorSnapshot();
    const interactionSnapshot = getInteractionLayerSnapshot();
    const previewCardNode = wrapper.querySelector('.ronzani-preview-card');
    const articlePanelNode = wrapper.querySelector('.ronzani-article-panel');
    const reducedMotionEnabled = textOr(wrapper.dataset.reducedMotion, '0') === '1';
    const rootDisplay = root ? window.getComputedStyle(root).display : '';
    const sceneEnabledRaw = textOr(wrapper.dataset.sceneEnabledRaw, '0') === '1';
    const sceneEnabled = textOr(wrapper.dataset.sceneEffectiveEnabled, '0') === '1';
    const sceneOverride = textOr(wrapper.dataset.sceneOverride, 'auto');
    const sceneRolloutMode = textOr(wrapper.dataset.sceneRolloutMode, 'all');
    const sceneRolloutPercentage =
      Number(wrapper.dataset.sceneRolloutPercentage || '100');
    const sceneRolloutAllowlist =
      Number(wrapper.dataset.sceneRolloutAllowlist || '0');
    const sceneRolloutKey = textOr(wrapper.dataset.sceneRolloutKey, '');
    const sceneRolloutBucket = Number(wrapper.dataset.sceneRolloutBucket || '-1');
    const sceneRolloutPass = textOr(wrapper.dataset.sceneRolloutPass, '1') === '1';
    const sceneRolloutReason = textOr(wrapper.dataset.sceneRolloutReason, 'all');
    const sceneModelUrlSet = textOr(wrapper.dataset.sceneModelUrlSet, '0') === '1';
    const sceneModelFormat = textOr(wrapper.dataset.sceneModelFormat, 'n/a');
    const sceneModelProbeChecked = textOr(wrapper.dataset.sceneModelProbeChecked, '0') === '1';
    const sceneModelReachable = textOr(wrapper.dataset.sceneModelReachable, '0') === '1';
    const sceneModelProbeStatus = textOr(wrapper.dataset.sceneModelProbeStatus, '0');
    const sceneModelLoadState = textOr(wrapper.dataset.sceneModelLoadState, 'idle');
    const sceneModelLoadReason = textOr(wrapper.dataset.sceneModelLoadReason, 'not-checked');
    const sceneModelBytes = Number(wrapper.dataset.sceneModelBytes || '0') || 0;
    const sceneModelLoadAttempts = Number(wrapper.dataset.sceneModelLoadAttempts || '0') || 0;
    const sceneModelLoadDurationMs = Number(wrapper.dataset.sceneModelLoadDurationMs || '0') || 0;
    const webglSupported = textOr(wrapper.dataset.webglSupport, '0') === '1';
    const fallbackListReady = Boolean(
      listWrap &&
        listWrap.querySelector('a[data-index], .ronzani-3d-nav-fallback')
    );
    const checks = [
      {
        id: 'menu_links_rendered',
        pass: validMenuItems.length === 0 ? links.length === 0 : links.length === validMenuItems.length,
        details: `menu=${validMenuItems.length}, links=${links.length}`,
      },
      {
        id: 'desk_hotspots_sync',
        pass: mode !== 'desk' ? true : hotspots.length === links.length,
        details: `mode=${mode}, hotspots=${hotspots.length}, links=${links.length}`,
      },
      {
        id: 'hotspot_layout_source',
        pass:
          mode !== 'desk'
            ? true
            : links.length === 0
              ? true
            : mappingStore.loaded
              ? textOr(wrapper.dataset.hotspotLayout, '') === 'mapping' ||
                mappingStore.items.length === 0
              : textOr(wrapper.dataset.hotspotLayout, '') !== '',
        details: textOr(wrapper.dataset.hotspotLayout, 'unset'),
      },
      {
        id: 'preview_navigation_ready',
        pass:
          mode !== 'desk'
            ? true
            : selectableCount <= 1
              ? true
              : Boolean(runtimeShell && typeof runtimeShell.navigatePreview === 'function'),
        details: `selectable=${selectableCount}, active=${activeSelectionIndex}`,
      },
      {
        id: 'article_controls_ready',
        pass:
          mode !== 'desk'
            ? true
            : Boolean(
                runtimeShell &&
                typeof runtimeShell.openArticle === 'function' &&
                typeof runtimeShell.closeArticle === 'function' &&
                typeof runtimeShell.scrollArticleTop === 'function' &&
                textOr(wrapper.dataset.articleUx, '') !== ''
              ),
        details:
          runtimeShell &&
          typeof runtimeShell.closeArticle === 'function' &&
          typeof runtimeShell.scrollArticleTop === 'function'
            ? `ux=${textOr(wrapper.dataset.articleUx, 'n/a')},scroll=${textOr(wrapper.dataset.articleScroll, '0')}`
            : 'missing-controls',
      },
      {
        id: 'article_prefetch_ready',
        pass:
          mode !== 'desk'
            ? true
            : textOr(wrapper.dataset.articlePrefetchReady, '0') === '1',
        details:
          mode !== 'desk'
            ? 'n/a'
            : `ready=${textOr(wrapper.dataset.articlePrefetchReady, '0')},cache=${textOr(wrapper.dataset.articlePrefetchCount, '0')},inflight=${textOr(wrapper.dataset.articlePrefetchInFlight, '0')},hits=${textOr(wrapper.dataset.articlePrefetchHits, '0')}`,
      },
      {
        id: 'article_loader_ready',
        pass:
          mode !== 'desk'
            ? true
            : ['idle', 'loading', 'ready'].includes(textOr(wrapper.dataset.articleLoadState, '')),
        details: `state=${textOr(wrapper.dataset.articleLoadState, 'unset')}`,
      },
      {
        id: 'article_parser_ready',
        pass: mode !== 'desk' ? true : textOr(wrapper.dataset.articleParser, '') !== '',
        details: textOr(wrapper.dataset.articleParser, 'unset'),
      },
      {
        id: 'scene_config_endpoint_present',
        pass: sceneConfigEndpoint !== '',
        details: sceneConfigEndpoint !== '' ? sceneConfigEndpoint : 'missing-endpoint',
      },
      {
        id: 'scene_contract_ready',
        pass: sceneStore.loaded || sceneStore.error !== null || sceneConfigEndpoint === '',
        details: sceneStore.loaded
          ? `source=${textOr(wrapper.dataset.sceneConfigSource, 'unknown')},objects=${textOr(wrapper.dataset.sceneObjectCount, '0')}`
          : sceneStore.error || 'pending',
      },
      {
        id: 'scene_health_endpoint_present',
        pass: sceneHealthEndpoint !== '',
        details: sceneHealthEndpoint !== '' ? sceneHealthEndpoint : 'missing-endpoint',
      },
      {
        id: 'scene_health_loaded',
        pass:
          sceneHealthStore.loaded ||
          sceneHealthStore.error !== null ||
          sceneHealthEndpoint === '',
        details: sceneHealthStore.loaded
          ? textOr(sceneHealthStore.payload && sceneHealthStore.payload.source, 'ok')
          : sceneHealthStore.error || 'pending',
      },
      {
        id: 'scene_health_ok',
        pass: sceneHealthStore.loaded
          ? Boolean(sceneHealthSummary && sceneHealthSummary.ok === true)
          : sceneHealthEndpoint === '',
        details: sceneHealthStore.loaded
          ? `enabled=${Boolean(sceneHealthSummary && sceneHealthSummary.enabled) ? '1' : '0'},model=${Boolean(sceneHealthSummary && sceneHealthSummary.model_url_set) ? '1' : '0'},invalid=${Number(sceneHealthSummary && sceneHealthSummary.invalid) || 0},warnings=${Number(sceneHealthSummary && sceneHealthSummary.warnings) || 0}`
          : sceneHealthStore.error || 'pending',
      },
      {
        id: 'scene_model_probe_ready',
        pass: !sceneEnabled || !sceneModelUrlSet || (sceneModelProbeChecked && sceneModelReachable),
        details: `enabled=${sceneEnabled ? '1' : '0'},model=${sceneModelUrlSet ? '1' : '0'},checked=${sceneModelProbeChecked ? '1' : '0'},reachable=${sceneModelReachable ? '1' : '0'},http=${sceneModelProbeStatus}`,
      },
      {
        id: 'scene_model_contract_ready',
        pass: !sceneEnabled || sceneModelUrlSet,
        details: `enabled=${sceneEnabled ? '1' : '0'},model=${sceneModelUrlSet ? '1' : '0'},format=${sceneModelFormat}`,
      },
      {
        id: 'scene_override_contract_ready',
        pass:
          ['auto', 'on', 'off'].includes(sceneOverride) &&
          (sceneOverride === 'auto'
            ? sceneEnabled === (sceneEnabledRaw && sceneRolloutPass)
            : sceneOverride === 'on'
              ? sceneEnabled
              : !sceneEnabled),
        details: `mode=${sceneOverride},raw=${sceneEnabledRaw ? '1' : '0'},rollout=${sceneRolloutPass ? '1' : '0'},effective=${sceneEnabled ? '1' : '0'}`,
      },
      {
        id: 'scene_rollout_contract_ready',
        pass:
          ['all', 'off', 'allowlist', 'percentage', 'hybrid'].includes(sceneRolloutMode) &&
          Number.isFinite(sceneRolloutPercentage) &&
          sceneRolloutPercentage >= 0 &&
          sceneRolloutPercentage <= 100 &&
          Number.isFinite(sceneRolloutAllowlist) &&
          sceneRolloutAllowlist >= 0 &&
          sceneRolloutKey !== '' &&
          Number.isFinite(sceneRolloutBucket) &&
          sceneRolloutBucket >= 0 &&
          sceneRolloutBucket <= 99,
        details: `mode=${sceneRolloutMode},pct=${sceneRolloutPercentage},allowlist=${sceneRolloutAllowlist},key=${sceneRolloutKey},bucket=${sceneRolloutBucket},pass=${sceneRolloutPass ? '1' : '0'},reason=${sceneRolloutReason}`,
      },
      {
        id: 'scene_retry_api_ready',
        pass: Boolean(
          runtimeShell &&
            typeof window.RONZANI_3D_NAV_RUNTIME === 'object' &&
            typeof window.RONZANI_3D_NAV_RUNTIME.setSceneOverride === 'function' &&
            typeof window.RONZANI_3D_NAV_RUNTIME.retrySceneBootstrap === 'function' &&
            typeof window.RONZANI_3D_NAV_RUNTIME.getSceneRollout === 'function' &&
            typeof window.RONZANI_3D_NAV_RUNTIME.setSceneRolloutKey === 'function' &&
            typeof window.RONZANI_3D_NAV_RUNTIME.clearSceneRolloutKey === 'function'
        ),
        details:
          runtimeShell &&
          typeof window.RONZANI_3D_NAV_RUNTIME === 'object' &&
          typeof window.RONZANI_3D_NAV_RUNTIME.setSceneOverride === 'function' &&
          typeof window.RONZANI_3D_NAV_RUNTIME.retrySceneBootstrap === 'function' &&
          typeof window.RONZANI_3D_NAV_RUNTIME.getSceneRollout === 'function' &&
          typeof window.RONZANI_3D_NAV_RUNTIME.setSceneRolloutKey === 'function' &&
          typeof window.RONZANI_3D_NAV_RUNTIME.clearSceneRolloutKey === 'function'
            ? 'ok'
            : 'missing-runtime-api',
      },
      {
        id: 'scene_model_loader_ready',
        pass: !sceneEnabled
          ? true
          : !sceneModelUrlSet
            ? true
            : !webglSupported
              ? sceneModelLoadState === 'skipped'
              : sceneModelLoadState !== 'idle',
        details: `state=${sceneModelLoadState},reason=${sceneModelLoadReason},bytes=${sceneModelBytes},attempts=${sceneModelLoadAttempts},dur=${sceneModelLoadDurationMs}ms,webgl=${webglSupported ? '1' : '0'}`,
      },
      {
        id: 'webgl_capability_ready',
        pass: textOr(wrapper.dataset.webglReason, '') !== '',
        details: `support=${textOr(wrapper.dataset.webglSupport, '0')},context=${textOr(wrapper.dataset.webglContext, 'none')},reason=${textOr(wrapper.dataset.webglReason, 'unset')}`,
      },
      {
        id: 'scene_binding_ready',
        pass: sceneStore.loaded
          ? sceneEnabled
            ? textOr(wrapper.dataset.sceneBindingStatus, '') === 'ok' &&
              Number(wrapper.dataset.sceneBindingMissing || '0') === 0 &&
              Number(wrapper.dataset.sceneBindingExtra || '0') === 0
            : textOr(wrapper.dataset.sceneBindingStatus, '') !== 'pending'
          : sceneConfigEndpoint === '',
        details: `enabled=${sceneEnabled ? '1' : '0'},status=${textOr(wrapper.dataset.sceneBindingStatus, 'unset')},missing=${textOr(wrapper.dataset.sceneBindingMissing, '0')},extra=${textOr(wrapper.dataset.sceneBindingExtra, '0')}`,
      },
      {
        id: 'engine_bootstrap_state',
        pass: sceneEnabled
          ? textOr(wrapper.dataset.engineBootstrap, '') === 'ready'
          : ['pending', 'ready', 'fallback'].includes(
              textOr(wrapper.dataset.engineBootstrap, '')
            ),
        details: `enabled=${sceneEnabled ? '1' : '0'},state=${textOr(wrapper.dataset.engineBootstrap, 'unset')},reason=${textOr(wrapper.dataset.engineReason, 'unset')}`,
      },
      {
        id: 'motion_profile_ready',
        pass:
          mode !== 'desk'
            ? true
            : ['desk', 'mobile'].includes(textOr(wrapper.dataset.motionProfile, '')),
        details: `profile=${textOr(wrapper.dataset.motionProfile, 'unset')},dur=${motionRuntime.uiDurationMs},fast=${motionRuntime.uiFastMs}`,
      },
      {
        id: 'backdrop_profile_ready',
        pass:
          mode !== 'desk'
            ? true
            : textOr(wrapper.dataset.backdropProfile, '') !== '' &&
              Number.isFinite(Number(wrapper.dataset.backdropFrameBudget || '')),
        details:
          mode !== 'desk'
            ? 'n/a'
            : `profile=${textOr(wrapper.dataset.backdropProfile, 'unset')},budget=${textOr(wrapper.dataset.backdropFrameBudget, 'unset')}ms,lines=${textOr(wrapper.dataset.backdropLines, 'unset')}`,
      },
      {
        id: 'adaptive_quality_ready',
        pass:
          mode !== 'desk'
            ? true
            : ['auto', 'manual'].includes(textOr(wrapper.dataset.performanceMode, '')) &&
              ['low', 'balanced', 'high'].includes(textOr(wrapper.dataset.qualityTier, '')),
        details:
          mode !== 'desk'
            ? 'n/a'
            : `mode=${textOr(wrapper.dataset.performanceMode, 'unset')},tier=${textOr(wrapper.dataset.qualityTier, 'unset')}`,
      },
      {
        id: 'fps_guardrail_state',
        pass:
          mode !== 'desk'
            ? true
            : ['pending', 'ok', 'guardrail-low'].includes(
                textOr(wrapper.dataset.qualityState, '')
              ) && Number.isFinite(Number(wrapper.dataset.fpsAvg || '')),
        details:
          mode !== 'desk'
            ? 'n/a'
            : `state=${textOr(wrapper.dataset.qualityState, 'unset')},fps=${textOr(wrapper.dataset.fpsAvg, '0')},min=${textOr(wrapper.dataset.guardrailMinFps, '0')}`,
      },
      {
        id: 'camera_motion_ready',
        pass: mode !== 'desk' ? true : textOr(wrapper.dataset.cameraFocus, '') !== '',
        details: textOr(wrapper.dataset.cameraFocus, 'unset'),
      },
      {
        id: 'camera_director_ready',
        pass:
          mode !== 'desk'
            ? true
            : textOr(wrapper.dataset.cameraDirector, '') !== '' &&
              cameraDirectorSnapshot &&
              typeof cameraDirectorSnapshot === 'object',
        details:
          mode !== 'desk'
            ? 'n/a'
            : `director=${textOr(wrapper.dataset.cameraDirector, 'unset')},status=${textOr(cameraDirectorSnapshot.status, 'unknown')}`,
      },
      {
        id: 'camera_travel_ready',
        pass:
          mode !== 'desk'
            ? true
            : ['idle', 'peek', 'running', 'settled'].includes(
                textOr(wrapper.dataset.cameraTravelState, '')
              ) &&
              Number.isFinite(Number(wrapper.dataset.cameraTravelProgress || '')),
        details:
          mode !== 'desk'
            ? 'n/a'
            : `state=${textOr(wrapper.dataset.cameraTravelState, 'unset')},progress=${textOr(wrapper.dataset.cameraTravelProgress, 'unset')}`,
      },
      {
        id: 'camera_orbit_clamp_ok',
        pass:
          mode !== 'desk'
            ? true
            : Math.abs(Number(cameraDirectorSnapshot.yawDeg) || 0) <=
                CAMERA_DIRECTOR.orbitClampDeg + 0.01 &&
              Math.abs(Number(cameraDirectorSnapshot.pitchDeg) || 0) <=
                CAMERA_DIRECTOR.orbitClampDeg + 0.01 &&
              Number(cameraDirectorSnapshot.clampDeg) === CAMERA_DIRECTOR.orbitClampDeg,
        details:
          mode !== 'desk'
            ? 'n/a'
            : `yaw=${(Number(cameraDirectorSnapshot.yawDeg) || 0).toFixed(1)},pitch=${(Number(cameraDirectorSnapshot.pitchDeg) || 0).toFixed(1)},clamp=${Number(cameraDirectorSnapshot.clampDeg) || 0}`,
      },
      {
        id: 'interaction_layer_ready',
        pass:
          mode !== 'desk'
            ? true
            : currentState === APP_STATES.FALLBACK_2D
              ? true
            : textOr(wrapper.dataset.interactionLayer, '') !== '' &&
              (interactionSnapshot.ready || selectableCount === 0),
        details:
          mode !== 'desk'
            ? 'n/a'
            : `ready=${interactionSnapshot.ready ? '1' : '0'},anchors=${Number(interactionSnapshot.anchors) || 0},source=${textOr(interactionSnapshot.source, 'none')}`,
      },
      {
        id: 'interaction_raycast_pick_ready',
        pass:
          mode !== 'desk'
            ? true
            : currentState === APP_STATES.FALLBACK_2D
              ? true
            : typeof pickInteractionAtPointer === 'function' &&
              textOr(wrapper.dataset.raycastReady, '') !== '',
        details:
          mode !== 'desk'
            ? 'n/a'
            : `raycast=${textOr(wrapper.dataset.raycastReady, 'unset')},hover=${textOr(wrapper.dataset.raycastHover, 'none')},selected=${textOr(wrapper.dataset.raycastSelected, 'none')}`,
      },
      {
        id: 'ui_three_levels_ready',
        pass:
          mode !== 'desk'
            ? true
            : Boolean(
                previewCardNode &&
                  articlePanelNode &&
                  runtimeShell &&
                  typeof runtimeShell.openPreview === 'function' &&
                  typeof runtimeShell.openArticle === 'function' &&
                  textOr(wrapper.dataset.uiLayer, '') !== ''
              ),
        details:
          mode !== 'desk'
            ? 'n/a'
            : `uiLayer=${textOr(wrapper.dataset.uiLayer, 'unset')},preview=${previewCardNode ? '1' : '0'},article=${articlePanelNode ? '1' : '0'}`,
      },
      {
        id: 'keyboard_flow_ready',
        pass: mode !== 'desk' ? true : textOr(wrapper.dataset.keyboardFlow, '0') === '1',
        details: textOr(wrapper.dataset.keyboardFlow, '0') === '1' ? 'ok' : 'missing',
      },
      {
        id: 'focus_trap_ready',
        pass:
          mode !== 'desk'
            ? true
            : ['none', 'preview', 'article'].includes(textOr(wrapper.dataset.focusTrap, '')),
        details: textOr(wrapper.dataset.focusTrap, 'unset'),
      },
      {
        id: 'reduced_motion_fallback_ready',
        pass:
          !reducedMotionEnabled ||
          currentState === APP_STATES.FALLBACK_2D ||
          rootDisplay === 'none',
        details: `reduced=${reducedMotionEnabled ? '1' : '0'},state=${currentState},root=${rootDisplay || 'unknown'}`,
      },
      {
        id: 'fallback_html_ready',
        pass: mode !== 'desk' ? true : fallbackListReady,
        details: mode !== 'desk' ? 'n/a' : fallbackListReady ? 'ok' : 'missing-list',
      },
      {
        id: 'deep_link_contract_ready',
        pass: ['none', 'preview', 'article'].includes(textOr(wrapper.dataset.deepLinkState, '')),
        details: textOr(wrapper.dataset.deepLinkValue, 'none'),
      },
      {
        id: 'mapping_endpoint_present',
        pass: mappingEndpoint !== '',
        details: mappingEndpoint !== '' ? mappingEndpoint : 'missing-endpoint',
      },
      {
        id: 'mapping_loaded',
        pass: mappingStore.loaded || mappingStore.error !== null || mappingEndpoint === '',
        details: mappingStore.loaded
          ? `count=${mappingCount}`
          : mappingStore.error || 'pending',
      },
      {
        id: 'mapping_health_endpoint_present',
        pass: mappingHealthEndpoint !== '',
        details: mappingHealthEndpoint !== '' ? mappingHealthEndpoint : 'missing-endpoint',
      },
      {
        id: 'mapping_health_loaded',
        pass:
          mappingHealthStore.loaded ||
          mappingHealthStore.error !== null ||
          mappingHealthEndpoint === '',
        details: mappingHealthStore.loaded
          ? textOr(mappingHealthStore.payload && mappingHealthStore.payload.source, 'ok')
          : mappingHealthStore.error || 'pending',
      },
      {
        id: 'mapping_health_ok',
        pass: mappingHealthStore.loaded
          ? Boolean(mappingHealthSummary && mappingHealthSummary.ok === true)
          : mappingHealthEndpoint === '',
        details: mappingHealthStore.loaded
          ? `missing=${Number(mappingHealthSummary && mappingHealthSummary.missing) || 0},warnings=${Number(mappingHealthSummary && mappingHealthSummary.rows_with_warnings) || 0},strict=${Boolean(mappingHealthSummary && mappingHealthSummary.strict_ok === true)}`
          : mappingHealthStore.error || 'pending',
      },
      {
        id: 'runtime_shell_ready',
        pass: Boolean(runtimeShell),
        details: runtimeShell ? 'ok' : 'not-ready',
      },
      {
        id: 'state_valid',
        pass: VALID_STATES.has(currentState),
        details: currentState,
      },
      {
        id: 'deep_link_object_known',
        pass: !deepLink || findIndexByObjectId(deepLink.objectId) >= 0,
        details: deepLink ? `${deepLink.objectId}:${deepLink.view}` : 'none',
      },
    ];

    const passed = checks.filter((check) => check.pass).length;

    return {
      timestamp: new Date().toISOString(),
      mode,
      state: currentState,
      menuSource: data.menuSource || null,
      checks,
      summary: {
        ok: passed === checks.length,
        passed,
        failed: checks.length - passed,
        total: checks.length,
      },
    };
  };

  const waitForState = (targetState, timeoutMs = 1600) =>
    new Promise((resolve) => {
      if (currentState === targetState) {
        resolve(true);
        return;
      }

      let settled = false;
      const done = (result) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutToken);
        window.removeEventListener('ronzani:state-change', onStateChange);
        resolve(result);
      };

      const onStateChange = (event) => {
        const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
        if (detail.nextState === targetState) {
          done(true);
        }
      };

      const timeoutToken = window.setTimeout(() => {
        done(false);
      }, timeoutMs);

      window.addEventListener('ronzani:state-change', onStateChange);
    });

  const buildQaFlowReport = async () => {
    const checks = [];
    const firstNode =
      wrapper.querySelector('.ronzani-3d-nav-links a[data-index]') ||
      wrapper.querySelector('.ronzani-hotspot[data-index]');

    if (!firstNode) {
      checks.push({
        id: 'qa_flow_seed_selection',
        pass: false,
        details: 'no-selectable-node',
      });

      return {
        timestamp: new Date().toISOString(),
        checks,
        summary: {
          ok: false,
          passed: 0,
          failed: 1,
          total: 1,
        },
      };
    }

    const rawIndex = Number(firstNode.dataset.index);
    const safeIndex = Number.isFinite(rawIndex) ? Math.max(0, Math.floor(rawIndex)) : 0;
    const objectId = textOr(firstNode.dataset.objectId, getObjectIdForIndex(safeIndex));
    const previewPayload = buildPreviewPayload(safeIndex, objectId);

    openPreviewBySelection(safeIndex, objectId, { historyMode: 'replace' });
    const previewStateOk = await waitForState(APP_STATES.PREVIEW_OPEN);
    checks.push({
      id: 'qa_flow_preview_state',
      pass: previewStateOk,
      details: currentState,
    });

    const previewDeepLink = readDeepLinkFromLocation();
    checks.push({
      id: 'qa_flow_preview_deep_link',
      pass: Boolean(
        previewDeepLink &&
          previewDeepLink.objectId === sanitizeObjectIdToken(objectId) &&
          previewDeepLink.view === DEEP_LINK_VIEW_PREVIEW
      ),
      details: previewDeepLink ? `${previewDeepLink.objectId}:${previewDeepLink.view}` : 'none',
    });

    if (runtimeShell) {
      await runtimeShell.openArticle(
        {
          objectId: previewPayload.objectId,
          title: previewPayload.title,
          url: previewPayload.url,
        },
        { historyMode: 'replace' }
      );
    }

    const articleStateOk = await waitForState(APP_STATES.ARTICLE_OPEN);
    checks.push({
      id: 'qa_flow_article_state',
      pass: articleStateOk,
      details: currentState,
    });

    const articleDeepLink = readDeepLinkFromLocation();
    checks.push({
      id: 'qa_flow_article_deep_link',
      pass: Boolean(
        articleDeepLink &&
          articleDeepLink.objectId === sanitizeObjectIdToken(objectId) &&
          articleDeepLink.view === DEEP_LINK_VIEW_ARTICLE
      ),
      details: articleDeepLink ? `${articleDeepLink.objectId}:${articleDeepLink.view}` : 'none',
    });

    transitionToState(APP_STATES.EXPLORE, 'qa-flow-reset');
    writeDeepLink(null, 'replace');

    checks.push({
      id: 'qa_flow_reset_explore',
      pass: currentState === APP_STATES.EXPLORE && readDeepLinkFromLocation() === null,
      details: `${currentState}:${readDeepLinkFromLocation() ? 'deep-link-present' : 'deep-link-cleared'}`,
    });

    const passed = checks.filter((check) => check.pass).length;

    return {
      timestamp: new Date().toISOString(),
      seed: {
        index: safeIndex,
        objectId,
      },
      checks,
      summary: {
        ok: passed === checks.length,
        passed,
        failed: checks.length - passed,
        total: checks.length,
      },
    };
  };

  const buildQaSmokeReport = async () => {
    const checks = [];
    const quickReport = buildQaReport();
    const quickSummary =
      quickReport && quickReport.summary && typeof quickReport.summary === 'object'
        ? quickReport.summary
        : null;
    checks.push({
      id: 'smoke_quick_checks_ok',
      pass: Boolean(quickSummary && quickSummary.ok),
      details: quickSummary
        ? `${quickSummary.passed}/${quickSummary.total}`
        : 'summary-unavailable',
    });

    const flowReport = await buildQaFlowReport();
    const flowSummary =
      flowReport && flowReport.summary && typeof flowReport.summary === 'object'
        ? flowReport.summary
        : null;
    checks.push({
      id: 'smoke_flow_ok',
      pass: Boolean(flowSummary && flowSummary.ok),
      details: flowSummary ? `${flowSummary.passed}/${flowSummary.total}` : 'summary-unavailable',
    });

    const firstNode =
      wrapper.querySelector('.ronzani-3d-nav-links a[data-index]') ||
      wrapper.querySelector('.ronzani-hotspot[data-index]');
    const rawIndex = firstNode ? Number(firstNode.dataset.index) : NaN;
    const seedIndex = Number.isFinite(rawIndex) ? Math.max(0, Math.floor(rawIndex)) : 0;
    const seedPayload = buildPreviewPayload(seedIndex, getObjectIdForIndex(seedIndex));
    const seedUrl = toAbsoluteUrl(seedPayload.url || seedPayload.articleUrl);
    const canPrefetchSeed =
      seedUrl !== '' && isSafeContentUrl(seedUrl, false) && isSameOriginUrl(seedUrl);

    if (runtimeShell && typeof runtimeShell.prefetchAroundSelection === 'function') {
      runtimeShell.prefetchAroundSelection(seedIndex, { immediate: true });
      await new Promise((resolve) => {
        window.setTimeout(resolve, ARTICLE_PREFETCH_WARM_WAIT_MS + ARTICLE_PREFETCH_DELAY_MS * 2 + 60);
      });
    }

    const prefetchReady = textOr(wrapper.dataset.articlePrefetchReady, '0') === '1';
    const prefetchCount = Number(wrapper.dataset.articlePrefetchCount || '0') || 0;
    const prefetchInFlight = Number(wrapper.dataset.articlePrefetchInFlight || '0') || 0;

    checks.push({
      id: 'smoke_prefetch_ready',
      pass: prefetchReady,
      details: `ready=${prefetchReady ? '1' : '0'}`,
    });
    checks.push({
      id: 'smoke_prefetch_warm',
      pass: canPrefetchSeed ? prefetchCount > 0 || prefetchInFlight > 0 : true,
      details: canPrefetchSeed
        ? `cache=${prefetchCount},inflight=${prefetchInFlight}`
        : 'skipped-external-or-empty-url',
    });

    const passed = checks.filter((check) => check.pass).length;
    return {
      timestamp: new Date().toISOString(),
      seed: {
        index: seedIndex,
        objectId: textOr(seedPayload.objectId, ''),
      },
      quick: quickReport,
      flow: flowReport,
      checks,
      summary: {
        ok: passed === checks.length,
        passed,
        failed: checks.length - passed,
        total: checks.length,
      },
    };
  };

  const formatQaTimestamp = (value) => {
    const raw = textOr(value, '');
    if (raw === '') {
      return 'n/d';
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return raw;
    }

    try {
      return new Intl.DateTimeFormat('it-IT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(parsed);
    } catch (error) {
      return raw;
    }
  };

  const renderQaCheckList = (target, checks = []) => {
    if (!target) {
      return;
    }

    target.innerHTML = '';
    if (!Array.isArray(checks) || checks.length === 0) {
      const li = document.createElement('li');
      li.className = 'ronzani-qa-item is-empty';
      li.textContent = 'Nessun controllo eseguito.';
      target.appendChild(li);
      return;
    }

    checks.forEach((check) => {
      const li = document.createElement('li');
      li.className = `ronzani-qa-item ${check && check.pass ? 'is-pass' : 'is-fail'}`;

      const status = document.createElement('span');
      status.className = 'ronzani-qa-item-status';
      status.textContent = check && check.pass ? 'PASS' : 'FAIL';

      const checkId = document.createElement('code');
      checkId.className = 'ronzani-qa-item-id';
      checkId.textContent = textOr(check && check.id, 'unknown_check');

      const details = document.createElement('span');
      details.className = 'ronzani-qa-item-details';
      details.textContent = textOr(check && check.details, '');

      li.append(status, checkId);
      if (details.textContent !== '') {
        li.appendChild(details);
      }
      target.appendChild(li);
    });
  };

  const setQaButtonsBusy = (busy, mode = '') => {
    const isBusy = Boolean(busy);
    if (qaRunChecksButton) {
      qaRunChecksButton.disabled = isBusy;
    }
    if (qaRunFlowButton) {
      qaRunFlowButton.disabled = isBusy;
      qaRunFlowButton.textContent = isBusy && mode === 'flow' ? 'QA Flow in corso...' : 'Esegui QA Flow';
    }
    if (qaRunSmokeButton) {
      qaRunSmokeButton.disabled = isBusy;
      qaRunSmokeButton.textContent = isBusy && mode === 'smoke' ? 'Smoke in corso...' : 'Esegui Smoke';
    }
    if (qaCopyButton) {
      qaCopyButton.disabled = isBusy;
    }
  };

  const refreshQaMeta = () => {
    if (!qaMeta) {
      return;
    }

    if (qaStatusNote !== '') {
      qaMeta.textContent = qaStatusNote;
      return;
    }

    const checksAt = qaReports.checks ? formatQaTimestamp(qaReports.checks.timestamp) : 'n/d';
    const flowAt = qaReports.flow ? formatQaTimestamp(qaReports.flow.timestamp) : 'n/d';
    const smokeAt = qaReports.smoke ? formatQaTimestamp(qaReports.smoke.timestamp) : 'n/d';
    qaMeta.textContent = `Quick: ${checksAt} | Flow: ${flowAt} | Smoke: ${smokeAt}`;
  };

  const setQaStatusNote = (message = '') => {
    qaStatusNote = textOr(message, '');
    refreshQaMeta();
  };

  const renderQaChecksReport = (report) => {
    if (!report || typeof report !== 'object') {
      return;
    }

    qaReports.checks = report;
    const summary = report.summary && typeof report.summary === 'object' ? report.summary : null;
    if (qaChecksSummary && summary) {
      qaChecksSummary.textContent = `Quick Checks: ${summary.ok ? 'OK' : 'KO'} (${summary.passed}/${summary.total})`;
      qaChecksSummary.dataset.state = summary.ok ? 'ok' : 'warn';
    }

    renderQaCheckList(qaChecksList, report.checks);
    setQaStatusNote('');
  };

  const renderQaFlowReport = (report) => {
    if (!report || typeof report !== 'object') {
      return;
    }

    qaReports.flow = report;
    const summary = report.summary && typeof report.summary === 'object' ? report.summary : null;
    if (qaFlowSummary && summary) {
      qaFlowSummary.textContent = `QA Flow: ${summary.ok ? 'OK' : 'KO'} (${summary.passed}/${summary.total})`;
      qaFlowSummary.dataset.state = summary.ok ? 'ok' : 'warn';
    }

    renderQaCheckList(qaFlowList, report.checks);
    setQaStatusNote('');
  };

  const renderQaSmokeReport = (report) => {
    if (!report || typeof report !== 'object') {
      return;
    }

    qaReports.smoke = report;
    const summary = report.summary && typeof report.summary === 'object' ? report.summary : null;
    if (qaSmokeSummary && summary) {
      qaSmokeSummary.textContent = `Smoke: ${summary.ok ? 'OK' : 'KO'} (${summary.passed}/${summary.total})`;
      qaSmokeSummary.dataset.state = summary.ok ? 'ok' : 'warn';
    }

    renderQaCheckList(qaSmokeList, report.checks);
    setQaStatusNote('');
  };

  const updateQaToggleUi = () => {
    if (!qaToggleButton) {
      return;
    }

    qaToggleButton.setAttribute('aria-pressed', qaPanelEnabled ? 'true' : 'false');
    qaToggleButton.textContent = qaPanelEnabled ? 'QA: ON' : 'QA: OFF';
  };

  const setQaPanelOpen = (enabled, options = {}) => {
    qaPanelEnabled = Boolean(enabled);
    wrapper.classList.toggle('ronzani-qa-open', qaPanelEnabled);

    if (qaPanel) {
      qaPanel.hidden = !qaPanelEnabled;
    }

    if (options.persist !== false) {
      storeQaPreference(qaPanelEnabled);
    }

    updateQaToggleUi();
    refreshQaMeta();

    if (qaPanelEnabled && options.autorun !== false && !qaReports.checks) {
      runQaChecksAndRender();
    }

    return qaPanelEnabled;
  };

  const runQaChecksAndRender = () => {
    const report = buildQaReport();
    renderQaChecksReport(report);
    return report;
  };

  const runQaFlowAndRender = async () => {
    if (qaFlowBusy || qaSmokeBusy) {
      return qaReports.flow;
    }

    qaFlowBusy = true;
    setQaButtonsBusy(true, 'flow');
    setQaStatusNote('Esecuzione QA Flow in corso...');

    try {
      const report = await buildQaFlowReport();
      renderQaFlowReport(report);
      return report;
    } finally {
      qaFlowBusy = false;
      setQaButtonsBusy(false);
    }
  };

  const runQaSmokeAndRender = async () => {
    if (qaFlowBusy || qaSmokeBusy) {
      return qaReports.smoke;
    }

    qaSmokeBusy = true;
    setQaButtonsBusy(true, 'smoke');
    setQaStatusNote('Esecuzione Smoke in corso...');

    try {
      const report = await buildQaSmokeReport();
      renderQaChecksReport(report.quick);
      renderQaFlowReport(report.flow);
      renderQaSmokeReport(report);
      return report;
    } finally {
      qaSmokeBusy = false;
      setQaButtonsBusy(false);
    }
  };

  const copyTextToClipboard = async (text) => {
    if (textOr(text, '') === '') {
      return false;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // fallback below
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    } finally {
      textarea.remove();
    }

    return copied;
  };

  const copyQaReportsToClipboard = async () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      checks: qaReports.checks,
      flow: qaReports.flow,
      smoke: qaReports.smoke,
    };
    const serialized = JSON.stringify(payload, null, 2);
    const copied = await copyTextToClipboard(serialized);
    setQaStatusNote(copied ? 'Report QA copiato negli appunti.' : 'Copia non riuscita.');
    return copied;
  };

  const applyDeepLinkFromLocation = async () => {
    const deepLink = readDeepLinkFromLocation();
    refreshDeepLinkDataset();

    if (!deepLink || !runtimeShell) {
      return false;
    }

    isApplyingDeepLink = true;
    try {
      const index = findIndexByObjectId(deepLink.objectId);
      const safeIndex = index >= 0 ? index : 0;
      const payload = buildPreviewPayload(safeIndex, deepLink.objectId);
      runtimeShell.openPreview(payload, { syncUrl: false });

      if (deepLink.view === DEEP_LINK_VIEW_ARTICLE) {
        await runtimeShell.openArticle(payload, { syncUrl: false });
      }
    } finally {
      isApplyingDeepLink = false;
      refreshDeepLinkDataset();
    }

    return true;
  };

  const transitionToState = (nextState, reason = '') => {
    if (!VALID_STATES.has(nextState)) {
      return;
    }

    if (nextState === currentState) {
      return;
    }

    const prevState = currentState;
    currentState = nextState;
    wrapper.dataset.ronzaniState = nextState;
    wrapper.dataset.uiLayer =
      nextState === APP_STATES.PREVIEW_OPEN
        ? 'preview'
        : nextState === APP_STATES.ARTICLE_OPEN
          ? 'article'
          : nextState === APP_STATES.FALLBACK_2D
            ? 'fallback_2d'
            : 'explore';
    wrapper.classList.toggle('ronzani-state-preview', nextState === APP_STATES.PREVIEW_OPEN);
    wrapper.classList.toggle('ronzani-state-article', nextState === APP_STATES.ARTICLE_OPEN);
    wrapper.classList.toggle('ronzani-state-fallback', nextState === APP_STATES.FALLBACK_2D);
    document.body.classList.toggle('ronzani-reading-open', nextState === APP_STATES.ARTICLE_OPEN);
    if (nextState !== APP_STATES.EXPLORE) {
      clearPeekSelection();
    }
    if (nextState === APP_STATES.EXPLORE || nextState === APP_STATES.FALLBACK_2D) {
      clearActiveSelection();
    }
    const shouldEnableOrbit =
      mode === 'desk' &&
      activeSelectionIndex >= 0 &&
      (nextState === APP_STATES.PREVIEW_OPEN || nextState === APP_STATES.ARTICLE_OPEN);
    setCameraDirectorOrbitEnabled(shouldEnableOrbit, {
      reset: !shouldEnableOrbit,
      reason: `state:${nextState}`,
    });
    if (nextState === APP_STATES.FALLBACK_2D) {
      wrapper.dataset.fallbackHtml = '1';
      setListOpen(true);
    } else if (mode === 'desk') {
      wrapper.dataset.fallbackHtml = '0';
    }
    refreshBackdropProfile();
    refreshInteractionLayer();

    if (runtimeShell) {
      runtimeShell.setState(nextState);
    }

    window.dispatchEvent(
      new CustomEvent('ronzani:state-change', {
        detail: {
          prevState,
          nextState,
          reason,
        },
      })
    );
  };

  const createRuntimeShell = () => {
    if (!ui) {
      return null;
    }

    wrapper.dataset.articleUx = 'v3';
    wrapper.dataset.articlePrefetchReady = '1';
    refreshArticlePrefetchMetrics();
    const shell = document.createElement('div');
    shell.className = 'ronzani-runtime-shell';
    shell.setAttribute('data-runtime-shell', 'true');

    const previewCard = document.createElement('section');
    previewCard.className = 'ronzani-preview-card';
    previewCard.setAttribute('aria-live', 'polite');
    previewCard.setAttribute('aria-label', 'Anteprima contenuto');
    previewCard.setAttribute('aria-hidden', 'true');
    previewCard.dataset.open = 'false';

    const previewTitle = document.createElement('h3');
    previewTitle.className = 'ronzani-preview-title';
    previewTitle.textContent = 'Anteprima contenuto';

    const previewMeta = document.createElement('p');
    previewMeta.className = 'ronzani-preview-meta';
    previewMeta.hidden = true;

    const previewMedia = document.createElement('figure');
    previewMedia.className = 'ronzani-preview-media';
    previewMedia.hidden = true;

    const previewImage = document.createElement('img');
    previewImage.className = 'ronzani-preview-image';
    previewImage.alt = '';
    previewImage.loading = 'lazy';
    previewImage.decoding = 'async';
    previewMedia.appendChild(previewImage);

    const previewAbstract = document.createElement('p');
    previewAbstract.className = 'ronzani-preview-abstract';
    previewAbstract.textContent = 'Seleziona un elemento per aprire l anteprima.';

    const previewSequence = document.createElement('p');
    previewSequence.className = 'ronzani-preview-sequence';
    previewSequence.hidden = true;
    previewSequence.textContent = '';

    const previewActions = document.createElement('div');
    previewActions.className = 'ronzani-preview-actions';

    const previewPrev = document.createElement('button');
    previewPrev.type = 'button';
    previewPrev.className = 'ronzani-preview-nav ronzani-preview-prev';
    previewPrev.textContent = 'Precedente';
    previewPrev.disabled = true;

    const previewRead = document.createElement('button');
    previewRead.type = 'button';
    previewRead.className = 'ronzani-preview-read';
    previewRead.textContent = 'Leggi tutto';
    previewRead.disabled = true;

    const previewNext = document.createElement('button');
    previewNext.type = 'button';
    previewNext.className = 'ronzani-preview-nav ronzani-preview-next';
    previewNext.textContent = 'Successivo';
    previewNext.disabled = true;

    const previewClose = document.createElement('button');
    previewClose.type = 'button';
    previewClose.className = 'ronzani-preview-close';
    previewClose.textContent = 'Chiudi';

    previewActions.append(previewPrev, previewRead, previewNext, previewClose);
    previewCard.append(previewTitle, previewMeta, previewMedia, previewAbstract, previewSequence, previewActions);

    const articlePanel = document.createElement('section');
    articlePanel.className = 'ronzani-article-panel';
    articlePanel.setAttribute('aria-live', 'polite');
    articlePanel.setAttribute('aria-label', 'Pannello articolo');
    articlePanel.setAttribute('aria-hidden', 'true');
    articlePanel.dataset.open = 'false';
    articlePanel.dataset.loading = 'false';
    articlePanel.setAttribute('tabindex', '-1');

    const articleHeader = document.createElement('header');
    articleHeader.className = 'ronzani-article-header';

    const articleTitle = document.createElement('h3');
    articleTitle.className = 'ronzani-article-title';
    articleTitle.textContent = 'Lettura articolo';

    const articleControls = document.createElement('div');
    articleControls.className = 'ronzani-article-controls';

    const articleBack = document.createElement('button');
    articleBack.type = 'button';
    articleBack.className = 'ronzani-article-back';
    articleBack.textContent = 'Anteprima';

    const articleClose = document.createElement('button');
    articleClose.type = 'button';
    articleClose.className = 'ronzani-article-close';
    articleClose.textContent = 'Chiudi';

    const articleSource = document.createElement('a');
    articleSource.className = 'ronzani-article-source';
    articleSource.textContent = 'Apri originale';
    articleSource.target = '_blank';
    articleSource.rel = 'noopener noreferrer';
    articleSource.hidden = true;

    articleControls.append(articleBack, articleClose);
    articleHeader.append(articleTitle, articleSource, articleControls);

    const articleMeta = document.createElement('p');
    articleMeta.className = 'ronzani-article-meta';
    articleMeta.textContent = 'Contenuto non ancora collegato.';

    const articleStats = document.createElement('p');
    articleStats.className = 'ronzani-article-stats';
    articleStats.hidden = true;

    const articleProgressLabel = document.createElement('p');
    articleProgressLabel.className = 'ronzani-article-progress-label';
    articleProgressLabel.textContent = '';
    articleProgressLabel.hidden = true;

    const articleProgressTrack = document.createElement('div');
    articleProgressTrack.className = 'ronzani-article-progress-track';
    articleProgressTrack.dataset.active = 'false';

    const articleProgressBar = document.createElement('span');
    articleProgressBar.className = 'ronzani-article-progress-bar';
    articleProgressBar.style.transform = 'scaleX(0)';
    articleProgressTrack.appendChild(articleProgressBar);

    const articleBody = document.createElement('div');
    articleBody.className = 'ronzani-article-body';
    articleBody.textContent = 'Seleziona un elemento e premi Leggi tutto per caricare il contenuto.';

    const articleTop = document.createElement('button');
    articleTop.type = 'button';
    articleTop.className = 'ronzani-article-top';
    articleTop.textContent = 'Torna su';
    articleTop.dataset.visible = 'false';
    articleTop.setAttribute('aria-hidden', 'true');
    articleTop.disabled = true;
    articleTop.tabIndex = -1;

    articlePanel.append(
      articleHeader,
      articleMeta,
      articleStats,
      articleProgressLabel,
      articleProgressTrack,
      articleBody,
      articleTop
    );
    shell.append(previewCard, articlePanel);
    ui.appendChild(shell);

    let focusReturnTarget = null;
    let removeFocusTrap = null;
    let previewSwapTimerOut = null;
    let previewSwapTimerIn = null;

    const clearPreviewSwapAnimation = () => {
      if (previewSwapTimerOut !== null) {
        window.clearTimeout(previewSwapTimerOut);
        previewSwapTimerOut = null;
      }
      if (previewSwapTimerIn !== null) {
        window.clearTimeout(previewSwapTimerIn);
        previewSwapTimerIn = null;
      }
      previewCard.classList.remove('is-updating-out', 'is-updating-in');
    };

    const runPreviewSwapAnimation = (enabled) => {
      clearPreviewSwapAnimation();
      if (!enabled) {
        return;
      }

      previewCard.classList.add('is-updating-out');
      previewSwapTimerOut = window.setTimeout(() => {
        previewCard.classList.remove('is-updating-out');
        previewCard.classList.add('is-updating-in');
        previewSwapTimerOut = null;
        previewSwapTimerIn = window.setTimeout(() => {
          previewCard.classList.remove('is-updating-in');
          previewSwapTimerIn = null;
        }, motionRuntime.previewSwapInMs);
      }, motionRuntime.previewSwapOutMs);
    };

    const stopPendingArticleLoad = () => {
      articleFetchToken += 1;
      if (activeArticleAbortController) {
        activeArticleAbortController.abort();
        activeArticleAbortController = null;
      }
    };

    const setArticleSourceLink = (url) => {
      const normalizedUrl = toAbsoluteUrl(url);

      if (normalizedUrl === '' || !isSafeContentUrl(normalizedUrl, false)) {
        articleSource.hidden = true;
        articleSource.removeAttribute('href');
        return '';
      }

      articleSource.hidden = false;
      articleSource.href = normalizedUrl;
      return normalizedUrl;
    };

    const setArticleLoadingState = (isLoading) => {
      const loading = Boolean(isLoading);
      articlePanel.dataset.loading = loading ? 'true' : 'false';
      articleBody.classList.toggle('is-loading', loading);
      wrapper.dataset.articleLoadState = loading ? 'loading' : 'ready';
    };

    const updateArticleTopButton = (canScroll) => {
      const shouldShow = canScroll && articleBody.scrollTop >= ARTICLE_TOP_SCROLL_THRESHOLD_PX;
      articleTop.dataset.visible = shouldShow ? 'true' : 'false';
      articleTop.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
      articleTop.disabled = !shouldShow || currentState !== APP_STATES.ARTICLE_OPEN;
      articleTop.tabIndex = shouldShow && currentState === APP_STATES.ARTICLE_OPEN ? 0 : -1;
    };

    const updateArticleProgress = () => {
      const scrollable = Math.max(0, articleBody.scrollHeight - articleBody.clientHeight);
      const canScroll = scrollable > 24;
      const ratio = canScroll ? Math.min(1, articleBody.scrollTop / scrollable) : 0;
      const percentage = Math.round(ratio * 100);
      articleProgressTrack.dataset.active = canScroll ? 'true' : 'false';
      articleProgressBar.style.transform = `scaleX(${ratio})`;
      articleProgressLabel.hidden = !canScroll;
      articleProgressLabel.textContent = canScroll ? `${percentage}% letto` : '';
      wrapper.dataset.articleScroll = String(percentage);
      updateArticleTopButton(canScroll);
    };

    const updateArticleStats = () => {
      const normalizedText = textOr(articleBody.textContent || '', '')
        .replace(/\s+/g, ' ')
        .trim();
      if (normalizedText === '') {
        articleStats.hidden = true;
        articleStats.textContent = '';
        return;
      }

      const words = normalizedText.split(' ').filter(Boolean).length;
      if (words < 80) {
        articleStats.hidden = true;
        articleStats.textContent = '';
        return;
      }

      const minutes = Math.max(1, Math.round(words / 210));
      articleStats.hidden = false;
      articleStats.textContent = `${words} parole | ${minutes} min lettura`;
    };

    const refreshArticleMetaUi = () => {
      updateArticleStats();
      window.requestAnimationFrame(() => {
        updateArticleProgress();
      });
    };

    articleBody.addEventListener('scroll', updateArticleProgress, { passive: true });

    const renderArticleMessage = (title, meta, message, linkUrl = '') => {
      setArticleLoadingState(false);
      articleTitle.textContent = textOr(title, 'Lettura articolo');
      articleMeta.textContent = textOr(meta, '');
      articleBody.textContent = '';

      const messageLine = document.createElement('p');
      messageLine.textContent = message;
      articleBody.appendChild(messageLine);

      const normalizedLink = toAbsoluteUrl(linkUrl);
      if (normalizedLink !== '') {
        const linkLine = document.createElement('p');
        const link = document.createElement('a');
        link.href = normalizedLink;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Apri articolo in una nuova scheda';
        linkLine.appendChild(link);
        articleBody.appendChild(linkLine);
      }

      articleBody.scrollTop = 0;
      refreshArticleMetaUi();
    };

    const renderArticleLoading = (title, meta, articleUrl) => {
      setArticleLoadingState(true);
      articleTitle.textContent = textOr(title, 'Lettura articolo');
      articleMeta.textContent = textOr(meta, '');
      articleBody.textContent = '';

      const skeleton = document.createElement('div');
      skeleton.className = 'ronzani-article-skeleton';
      [98, 84, 92, 76, 90, 64].forEach((width) => {
        const line = document.createElement('span');
        line.className = 'ronzani-article-skeleton-line';
        line.style.width = `${width}%`;
        skeleton.appendChild(line);
      });
      articleBody.appendChild(skeleton);

      const loadingLine = document.createElement('p');
      loadingLine.className = 'ronzani-article-loading';
      loadingLine.textContent =
        articleUrl === '' ? 'Mappa articolo non disponibile per questo elemento.' : 'Caricamento articolo in corso...';
      articleBody.appendChild(loadingLine);
      articleBody.scrollTop = 0;
      articleStats.hidden = true;
      articleStats.textContent = '';
      articleProgressLabel.hidden = true;
      articleProgressLabel.textContent = '';
      articleProgressTrack.dataset.active = 'false';
      articleProgressBar.style.transform = 'scaleX(0)';
      wrapper.dataset.articleScroll = '0';
      articleTop.dataset.visible = 'false';
      articleTop.setAttribute('aria-hidden', 'true');
      articleTop.disabled = true;
      articleTop.tabIndex = -1;
    };

    const collectOrderedPreviewIndices = () =>
      Array.from(new Set(getSelectableIndices())).sort((left, right) => left - right);

    const getCurrentPreviewIndex = () => {
      const raw = Number(previewCard.dataset.index);
      return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : -1;
    };

    const updatePreviewNavigation = (currentIndex) => {
      const indices = collectOrderedPreviewIndices();
      if (indices.length === 0) {
        previewSequence.hidden = true;
        previewSequence.textContent = '';
        previewPrev.dataset.targetIndex = '';
        previewNext.dataset.targetIndex = '';
        previewPrev.disabled = true;
        previewNext.disabled = true;
        previewCard.dataset.index = '-1';
        return {
          index: -1,
          total: 0,
        };
      }

      let safeIndex = Number.isFinite(currentIndex) ? Math.max(0, Math.floor(currentIndex)) : indices[0];
      if (!indices.includes(safeIndex)) {
        safeIndex = indices[0];
      }

      const position = indices.indexOf(safeIndex);
      const total = indices.length;
      const prevIndex = indices[(position - 1 + total) % total];
      const nextIndex = indices[(position + 1) % total];

      previewCard.dataset.index = String(safeIndex);
      previewPrev.dataset.targetIndex = total > 1 ? String(prevIndex) : '';
      previewNext.dataset.targetIndex = total > 1 ? String(nextIndex) : '';
      previewPrev.disabled = total <= 1;
      previewNext.disabled = total <= 1;
      previewSequence.hidden = false;
      previewSequence.textContent = `Capitolo ${position + 1}/${total}`;

      return {
        index: safeIndex,
        total,
      };
    };

    const buildPrefetchCandidateIndices = (currentIndex) => {
      const indices = collectOrderedPreviewIndices();
      if (indices.length === 0) {
        return [];
      }

      const safeCurrentIndex =
        Number.isFinite(currentIndex) && indices.includes(currentIndex)
          ? currentIndex
          : indices[0];
      const currentPosition = indices.indexOf(safeCurrentIndex);
      if (currentPosition < 0) {
        return [indices[0]];
      }

      const nextIndex = indices[(currentPosition + 1) % indices.length];
      const prevIndex = indices[(currentPosition - 1 + indices.length) % indices.length];
      return Array.from(new Set([safeCurrentIndex, nextIndex, prevIndex]));
    };

    const schedulePreviewPrefetch = (currentIndex, options = {}) => {
      const candidateIndices = buildPrefetchCandidateIndices(currentIndex);
      if (candidateIndices.length === 0) {
        return;
      }

      const immediate = Boolean(options.immediate);
      const queueToken = ++articlePrefetchQueueToken;

      candidateIndices.forEach((candidateIndex, position) => {
        const delay = immediate ? 0 : position * ARTICLE_PREFETCH_DELAY_MS;
        window.setTimeout(() => {
          if (queueToken !== articlePrefetchQueueToken) {
            return;
          }

          const candidatePayload = buildPreviewPayload(candidateIndex, getObjectIdForIndex(candidateIndex));
          const candidateUrl = toAbsoluteUrl(candidatePayload.url || candidatePayload.articleUrl);
          if (
            candidateUrl === '' ||
            !isSafeContentUrl(candidateUrl, false) ||
            !isSameOriginUrl(candidateUrl)
          ) {
            return;
          }

          void prefetchArticlePayload(candidateUrl, textOr(candidatePayload.title, 'Lettura articolo'));
        }, delay);
      });
    };

    const navigatePreview = (offset = 1, options = {}) => {
      const indices = collectOrderedPreviewIndices();
      if (indices.length <= 1) {
        return false;
      }

      const current = getCurrentPreviewIndex();
      const currentPos = indices.indexOf(current);
      const basePos = currentPos >= 0 ? currentPos : 0;
      const step = offset >= 0 ? 1 : -1;
      const nextPos = (basePos + step + indices.length) % indices.length;
      const targetIndex = indices[nextPos];

      openPreviewBySelection(
        targetIndex,
        getObjectIdForIndex(targetIndex),
        { historyMode: options.historyMode || 'push' }
      );
      return true;
    };

    const getPreviewFocusTarget = () => {
      if (!previewRead.disabled) {
        return previewRead;
      }
      if (!previewNext.disabled) {
        return previewNext;
      }
      if (!previewPrev.disabled) {
        return previewPrev;
      }
      return previewClose;
    };

    const getPreviewFocusableNodes = () => {
      const candidates = [previewPrev, previewRead, previewNext, previewClose].filter((node) => {
        if (!(node instanceof HTMLElement)) {
          return false;
        }
        return !node.disabled && node.offsetParent !== null;
      });

      return candidates;
    };

    let focusTrapMode = 'none';
    const loopOverlayFocus = (event) => {
      if (event.key !== 'Tab') {
        return;
      }

      let container = null;
      let fallback = null;
      let focusable = [];

      if (currentState === APP_STATES.ARTICLE_OPEN && focusTrapMode === 'article') {
        container = articlePanel;
        fallback = articleClose;
        focusable = getFocusableNodes(articlePanel);
      } else if (currentState === APP_STATES.PREVIEW_OPEN && focusTrapMode === 'preview') {
        container = previewCard;
        fallback = getPreviewFocusTarget();
        focusable = getPreviewFocusableNodes();
      } else {
        return;
      }

      if (focusable.length === 0) {
        event.preventDefault();
        if (fallback instanceof HTMLElement) {
          fallback.focus();
        }
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!container || !container.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const enableFocusTrap = (mode = 'article') => {
      const normalizedMode = mode === 'preview' ? 'preview' : 'article';
      const previousMode = focusTrapMode;
      focusTrapMode = normalizedMode;
      wrapper.dataset.focusTrap = normalizedMode;

      if (removeFocusTrap && normalizedMode === previousMode) {
        return;
      }

      if (removeFocusTrap) {
        removeFocusTrap();
      }

      document.addEventListener('keydown', loopOverlayFocus, true);
      removeFocusTrap = () => {
        document.removeEventListener('keydown', loopOverlayFocus, true);
        removeFocusTrap = null;
      };
    };

    const disableFocusTrap = (target = null) => {
      focusTrapMode = 'none';
      wrapper.dataset.focusTrap = 'none';
      if (removeFocusTrap) {
        removeFocusTrap();
      }

      if (target instanceof HTMLElement && target.offsetParent !== null) {
        target.focus();
        return;
      }

      if (focusReturnTarget instanceof HTMLElement && focusReturnTarget.offsetParent !== null) {
        focusReturnTarget.focus();
      }
    };

    const setState = (state) => {
      const previewOpen = state === APP_STATES.PREVIEW_OPEN;
      const articleOpen = state === APP_STATES.ARTICLE_OPEN;
      const articleLoading = articlePanel.dataset.loading === 'true';

      if (!previewOpen) {
        clearPreviewSwapAnimation();
      }

      previewCard.dataset.open = previewOpen ? 'true' : 'false';
      previewCard.setAttribute('aria-hidden', previewOpen ? 'false' : 'true');
      articlePanel.dataset.open = articleOpen ? 'true' : 'false';
      articlePanel.setAttribute('aria-hidden', articleOpen ? 'false' : 'true');

      previewClose.disabled = !previewOpen;
      previewRead.disabled = !previewOpen || textOr(previewRead.dataset.url, '') === '';
      previewPrev.disabled = !previewOpen || textOr(previewPrev.dataset.targetIndex, '') === '';
      previewNext.disabled = !previewOpen || textOr(previewNext.dataset.targetIndex, '') === '';
      previewSequence.hidden = !previewOpen || textOr(previewSequence.textContent, '') === '';
      articleBack.disabled = !articleOpen || articleLoading;
      articleClose.disabled = !articleOpen || articleLoading;
      articleSource.tabIndex = articleOpen && !articleSource.hidden ? 0 : -1;
      if (!articleOpen) {
        articleTop.dataset.visible = 'false';
        articleTop.setAttribute('aria-hidden', 'true');
        articleTop.disabled = true;
        articleTop.tabIndex = -1;
      } else {
        updateArticleProgress();
      }

      if (articleOpen) {
        enableFocusTrap('article');
        window.requestAnimationFrame(() => {
          if (!articleLoading) {
            articleBack.focus();
          }
        });
      } else if (previewOpen) {
        enableFocusTrap('preview');
        window.requestAnimationFrame(() => {
          const previewTarget = getPreviewFocusTarget();
          if (previewTarget instanceof HTMLElement) {
            previewTarget.focus();
          }
        });
      } else {
        disableFocusTrap(previewOpen ? getPreviewFocusTarget() : null);
      }
    };

    const openPreview = (payload = {}, options = {}) => {
      stopPendingArticleLoad();
      const payloadIndex = Number(payload.index);
      let resolvedIndex = Number.isFinite(payloadIndex)
        ? Math.max(0, Math.floor(payloadIndex))
        : findIndexByObjectId(textOr(payload.objectId, ''));
      if (resolvedIndex < 0) {
        const indices = collectOrderedPreviewIndices();
        resolvedIndex = indices.length > 0 ? indices[0] : 0;
      }
      const previousObjectId = textOr(lastPreviewPayload && lastPreviewPayload.objectId, '');

      const title = textOr(payload.title, 'Anteprima contenuto');
      const abstract = textOr(payload.abstract, 'Nessuna anteprima disponibile.');
      const coverImage = toAbsoluteUrl(payload.coverImage);
      const dateLabel = formatDateLabel(payload.previewDate);
      const categoryLabel = toHumanLabel(payload.categorySlug);
      const metaParts = [];

      if (dateLabel !== '') {
        metaParts.push(dateLabel);
      }
      if (categoryLabel !== '') {
        metaParts.push(categoryLabel);
      }

      previewTitle.textContent = title;
      previewAbstract.textContent = abstract;
      previewMeta.hidden = metaParts.length === 0;
      previewMeta.textContent = metaParts.join(' | ');

      if (coverImage !== '') {
        previewMedia.hidden = false;
        previewImage.src = coverImage;
        previewImage.alt = `Copertina ${title}`;
      } else {
        previewMedia.hidden = true;
        previewImage.removeAttribute('src');
        previewImage.alt = '';
      }

      const articleUrl = toAbsoluteUrl(payload.url || payload.articleUrl);
      previewRead.dataset.url = articleUrl;
      previewRead.dataset.title = title;
      previewRead.disabled = articleUrl === '';

      const navigationState = updatePreviewNavigation(resolvedIndex);
      setActiveSelectionByIndex(navigationState.index);
      lastPreviewPayload = {
        ...payload,
        index: navigationState.index,
        objectId: textOr(payload.objectId, getObjectIdForIndex(navigationState.index)),
      };
      const incomingObjectId = textOr(lastPreviewPayload.objectId, '');
      const reducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const shouldAnimateSwap =
        !reducedMotion &&
        currentState === APP_STATES.PREVIEW_OPEN &&
        previousObjectId !== '' &&
        incomingObjectId !== '' &&
        previousObjectId !== incomingObjectId &&
        options.animate !== false;
      runPreviewSwapAnimation(shouldAnimateSwap);

      transitionToState(APP_STATES.PREVIEW_OPEN, 'open-preview');
      schedulePreviewPrefetch(navigationState.index, {
        immediate: Boolean(options.prefetchImmediate),
      });

      if (options.syncUrl !== false) {
        const objectId = sanitizeObjectIdToken(lastPreviewPayload.objectId);
        writeDeepLink(
          objectId !== ''
            ? { objectId, view: DEEP_LINK_VIEW_PREVIEW }
            : null,
          options.historyMode || 'push'
        );
      }
    };

    const openArticle = async (payload = {}, options = {}) => {
      focusReturnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      const articleUrl = toAbsoluteUrl(payload.url || payload.articleUrl || previewRead.dataset.url || '');
      const articleHeading = textOr(
        payload.title || (lastPreviewPayload && lastPreviewPayload.title) || '',
        'Lettura articolo'
      );
      const sourceUrl = setArticleSourceLink(articleUrl);
      const initialMeta = sourceUrl !== '' ? sourceUrl : 'Contenuto non ancora collegato.';

      renderArticleLoading(articleHeading, initialMeta, sourceUrl);
      transitionToState(APP_STATES.ARTICLE_OPEN, 'open-article');

      if (options.syncUrl !== false) {
        const objectId = sanitizeObjectIdToken(
          payload.objectId || (lastPreviewPayload && lastPreviewPayload.objectId) || ''
        );
        writeDeepLink(
          objectId !== ''
            ? { objectId, view: DEEP_LINK_VIEW_ARTICLE }
            : null,
          options.historyMode || 'push'
        );
      }

      if (sourceUrl === '') {
        renderArticleMessage(
          articleHeading,
          'Contenuto non collegato.',
          'Mappa articolo non disponibile per questo elemento.'
        );
        return;
      }

      const requestToken = articleFetchToken + 1;
      articleFetchToken = requestToken;

      let cachedPayload = readArticleCacheEntry(sourceUrl, { trackHit: true });
      if (cachedPayload) {
        if (requestToken !== articleFetchToken) {
          return;
        }

        setArticleLoadingState(false);
        articleTitle.textContent = textOr(cachedPayload.title, articleHeading);
        articleMeta.textContent = textOr(cachedPayload.meta, sourceUrl);
        articleBody.innerHTML = textOr(cachedPayload.html, '');
        articleBody.scrollTop = 0;
        refreshArticleMetaUi();
        return;
      }

      await waitForPrefetchWarmup(sourceUrl);
      cachedPayload = readArticleCacheEntry(sourceUrl, { trackHit: true });
      if (cachedPayload) {
        if (requestToken !== articleFetchToken) {
          return;
        }

        setArticleLoadingState(false);
        articleTitle.textContent = textOr(cachedPayload.title, articleHeading);
        articleMeta.textContent = textOr(cachedPayload.meta, sourceUrl);
        articleBody.innerHTML = textOr(cachedPayload.html, '');
        articleBody.scrollTop = 0;
        refreshArticleMetaUi();
        return;
      }

      let timeoutToken = null;
      const hasAbortController = typeof AbortController !== 'undefined';
      const controller = hasAbortController ? new AbortController() : null;
      activeArticleAbortController = controller;
      if (controller) {
        timeoutToken = window.setTimeout(() => {
          controller.abort();
        }, ARTICLE_FETCH_TIMEOUT_MS);
      }

      try {
        const response = await fetch(sourceUrl, {
          credentials: 'same-origin',
          signal: controller ? controller.signal : undefined,
        });

        if (!response.ok) {
          throw new Error(`article-http-${response.status}`);
        }

        const html = await response.text();
        const parsed = extractArticlePayloadFromHtml(html, sourceUrl, articleHeading);
        const normalizedPayload = {
          title: textOr(parsed.title, articleHeading),
          meta: textOr(parsed.meta, sourceUrl),
          html: textOr(parsed.html, ''),
        };

        if (normalizedPayload.html === '') {
          renderArticleMessage(
            normalizedPayload.title,
            normalizedPayload.meta,
            'Contenuto non disponibile nel pannello integrato.',
            sourceUrl
          );
          rememberArticleCacheEntry(sourceUrl, {
            title: normalizedPayload.title,
            meta: normalizedPayload.meta,
            html: articleBody.innerHTML,
          });
          return;
        }

        rememberArticleCacheEntry(sourceUrl, normalizedPayload);

        if (requestToken !== articleFetchToken) {
          return;
        }

        setArticleLoadingState(false);
        articleTitle.textContent = normalizedPayload.title;
        articleMeta.textContent = normalizedPayload.meta;
        articleBody.innerHTML = normalizedPayload.html;
        articleBody.scrollTop = 0;
        refreshArticleMetaUi();
      } catch (error) {
        if (requestToken !== articleFetchToken) {
          return;
        }

        const isAbortError = Boolean(
          error && typeof error === 'object' && 'name' in error && error.name === 'AbortError'
        );

        renderArticleMessage(
          articleHeading,
          sourceUrl,
          isAbortError
            ? 'Caricamento interrotto. Riprova con "Leggi tutto".'
            : 'Impossibile caricare il contenuto nel pannello.',
          sourceUrl
        );
      } finally {
        if (timeoutToken !== null) {
          window.clearTimeout(timeoutToken);
        }

        if (activeArticleAbortController === controller) {
          activeArticleAbortController = null;
        }
      }
    };

    previewClose.addEventListener('click', () => {
      transitionToState(APP_STATES.EXPLORE, 'preview-close');
      writeDeepLink(null, 'push');
    });

    previewPrev.addEventListener('click', () => {
      navigatePreview(-1, { historyMode: 'push' });
    });

    previewNext.addEventListener('click', () => {
      navigatePreview(1, { historyMode: 'push' });
    });

    previewRead.addEventListener('click', () => {
      void openArticle({
        title: previewTitle.textContent,
        objectId: lastPreviewPayload && lastPreviewPayload.objectId,
        url: previewRead.dataset.url,
      });
    });

    const closeArticlePanel = (historyMode = 'push') => {
      wrapper.dataset.articleScroll = '0';
      setArticleLoadingState(false);
      if (lastPreviewPayload) {
        openPreview(lastPreviewPayload, { historyMode });
        return;
      }

      transitionToState(APP_STATES.EXPLORE, 'article-close');
      writeDeepLink(null, historyMode);
    };

    const scrollArticleToTop = (behavior = 'smooth') => {
      const normalizedBehavior = behavior === 'auto' ? 'auto' : 'smooth';
      const reducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      articleBody.scrollTo({
        top: 0,
        behavior: reducedMotion ? 'auto' : normalizedBehavior,
      });
    };

    articleBack.addEventListener('click', () => {
      closeArticlePanel('push');
    });

    articleClose.addEventListener('click', () => {
      closeArticlePanel('push');
    });

    articleTop.addEventListener('click', () => {
      scrollArticleToTop('smooth');
    });

    return {
      setState,
      openPreview,
      openArticle,
      closeArticle: (options = {}) => closeArticlePanel(options.historyMode || 'push'),
      scrollArticleTop: (options = {}) => scrollArticleToTop(options.behavior),
      prefetchAroundSelection: (selectionIndex, options = {}) => {
        const rawIndex = Number(selectionIndex);
        const fallbackIndex = getCurrentPreviewIndex();
        const safeIndex = Number.isFinite(rawIndex)
          ? Math.max(0, Math.floor(rawIndex))
          : Number.isFinite(fallbackIndex) && fallbackIndex >= 0
            ? fallbackIndex
            : 0;
        schedulePreviewPrefetch(safeIndex, options);
      },
      navigatePreview,
      clearPreviewSelection: () => clearActiveSelection(),
    };
  };

  const loadMapping = async () => {
    if (mappingStore.endpoint === '') {
      return;
    }

    try {
      const response = await fetch(mappingStore.endpoint, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`mapping-http-${response.status}`);
      }

      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];
      const byObjectId = new Map();

      items.forEach((item) => {
        if (!item || typeof item.object_id !== 'string') {
          return;
        }

        const key = item.object_id.trim();
        if (key !== '') {
          byObjectId.set(key, item);
        }
      });

      mappingStore.items = items;
      mappingStore.byObjectId = byObjectId;
      mappingStore.loaded = true;
      wrapper.dataset.mappingCount = String(items.length);
      wrapper.dataset.mappingSource = textOr(payload.source, '');
      mappingHotspotLayout = computeHotspotLayoutFromMapping();
      applyHotspotLayout(
        mappingHotspotLayout,
        Array.isArray(mappingHotspotLayout) && mappingHotspotLayout.length > 0 ? 'mapping' : 'seed'
      );
      refreshSceneBindingReport();
      syncCameraTargetToSelection();
      assignObjectIdsToDom();
      refreshInteractionLayer();
    } catch (error) {
      mappingStore.error = error instanceof Error ? error.message : 'mapping-load-failed';
      wrapper.dataset.mappingError = '1';
      refreshSceneBindingReport();
      refreshInteractionLayer();
    }
  };

  const loadSceneConfig = async () => {
    if (sceneStore.endpoint === '') {
      sceneStore.error = 'scene-config-endpoint-missing';
      sceneStore.payload = null;
      sceneStore.objectIds = [];
      sceneStore.loaded = false;
      syncSceneEnablementDataset();
      resetSceneModelBootstrap('scene-config-endpoint-missing');
      refreshEngineBootstrapStatus();
      return;
    }

    try {
      const response = await fetch(sceneStore.endpoint, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`scene-config-http-${response.status}`);
      }

      const payload = await response.json();
      const safePayload = payload && typeof payload === 'object' ? payload : {};
      const sceneIds = Array.isArray(safePayload.object_ids)
        ? safePayload.object_ids
            .map((value) => sanitizeObjectIdToken(value))
            .filter((value) => value !== '')
        : [];

      sceneStore.payload = safePayload;
      sceneStore.objectIds = Array.from(new Set(sceneIds));
      sceneStore.loaded = true;
      sceneStore.error = null;
      wrapper.dataset.sceneContractReady = '1';
      wrapper.dataset.sceneConfigSource = textOr(safePayload.source, '');
      wrapper.dataset.sceneObjectCount = String(sceneStore.objectIds.length);
      wrapper.dataset.sceneModelUrlSet = textOr(safePayload.model_url, '') !== '' ? '1' : '0';
      wrapper.dataset.sceneModelFormat = textOr(safePayload.model_format, '');
      syncSceneEnablementDataset();
      resetSceneModelBootstrap('scene-config-loaded');
      refreshSceneBindingReport();
    } catch (error) {
      sceneStore.payload = null;
      sceneStore.objectIds = [];
      sceneStore.loaded = false;
      sceneStore.error = error instanceof Error ? error.message : 'scene-config-load-failed';
      wrapper.dataset.sceneContractReady = '0';
      wrapper.dataset.sceneConfigSource = 'error';
      wrapper.dataset.sceneObjectCount = '0';
      wrapper.dataset.sceneModelUrlSet = '0';
      wrapper.dataset.sceneModelFormat = '';
      syncSceneEnablementDataset();
      resetSceneModelBootstrap('scene-config-load-failed');
      refreshEngineBootstrapStatus();
    }
  };

  const loadSceneHealth = async () => {
    if (sceneHealthStore.endpoint === '') {
      return;
    }

    try {
      const response = await fetch(sceneHealthStore.endpoint, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`scene-health-http-${response.status}`);
      }

      const payload = await response.json();
      sceneHealthStore.payload = payload && typeof payload === 'object' ? payload : null;
      sceneHealthStore.loaded = true;
      sceneHealthStore.error = null;
      wrapper.dataset.sceneHealthError = '0';

      const summary =
        sceneHealthStore.payload &&
        sceneHealthStore.payload.summary &&
        typeof sceneHealthStore.payload.summary === 'object'
          ? sceneHealthStore.payload.summary
          : null;
      const modelProbe =
        sceneHealthStore.payload &&
        sceneHealthStore.payload.model_probe &&
        typeof sceneHealthStore.payload.model_probe === 'object'
          ? sceneHealthStore.payload.model_probe
          : null;

      wrapper.dataset.sceneHealthOk = summary && summary.ok ? '1' : '0';
      wrapper.dataset.sceneHealthWarnings = String(
        Number(summary && summary.warnings) || 0
      );
      wrapper.dataset.sceneModelProbeChecked =
        modelProbe && modelProbe.checked ? '1' : '0';
      wrapper.dataset.sceneModelReachable =
        modelProbe && modelProbe.reachable ? '1' : '0';
      wrapper.dataset.sceneModelProbeStatus = String(
        Number(modelProbe && modelProbe.http_status) || 0
      );
    } catch (error) {
      sceneHealthStore.error =
        error instanceof Error ? error.message : 'scene-health-load-failed';
      wrapper.dataset.sceneHealthError = '1';
      wrapper.dataset.sceneModelProbeChecked = '0';
      wrapper.dataset.sceneModelReachable = '0';
      wrapper.dataset.sceneModelProbeStatus = '0';
    }
  };

  const loadMappingHealth = async () => {
    if (mappingHealthStore.endpoint === '') {
      return;
    }

    try {
      const response = await fetch(mappingHealthStore.endpoint, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`mapping-health-http-${response.status}`);
      }

      const payload = await response.json();
      mappingHealthStore.payload = payload && typeof payload === 'object' ? payload : null;
      mappingHealthStore.loaded = true;

      const summary =
        mappingHealthStore.payload &&
        mappingHealthStore.payload.summary &&
        typeof mappingHealthStore.payload.summary === 'object'
          ? mappingHealthStore.payload.summary
          : null;
      if (summary) {
        wrapper.dataset.mappingHealthOk = summary.ok ? '1' : '0';
        wrapper.dataset.mappingHealthWarnings = String(
          Number(summary.rows_with_warnings) || 0
        );
      }
    } catch (error) {
      mappingHealthStore.error =
        error instanceof Error ? error.message : 'mapping-health-load-failed';
      wrapper.dataset.mappingHealthError = '1';
    }
  };

  const setSceneOverrideMode = async (mode = 'auto', options = {}) => {
    const normalized = normalizeSceneOverride(mode);
    const changed = normalized !== sceneOverrideMode;
    sceneOverrideMode = normalized;

    if (options.persist !== false) {
      storeSceneOverridePreference(sceneOverrideMode);
    }

    if (options.reloadConfig === true) {
      await loadSceneConfig();
    } else {
      syncSceneEnablementDataset();
      refreshEngineBootstrapStatus();
    }

    if (options.reloadHealth === true) {
      await loadSceneHealth();
    }

    if (options.reboot !== false) {
      await bootstrapSceneModel();
      refreshSceneBindingReport();
    }

    return {
      changed,
      mode: sceneOverrideMode,
      enabledRaw: sceneRuntime.enabledRaw,
      enabledEffective: sceneRuntime.enabledEffective,
      rollout: getSceneRolloutSnapshot(),
      engine: {
        status: textOr(sceneStore.engine && sceneStore.engine.status, 'pending'),
        reason: textOr(sceneStore.engine && sceneStore.engine.reason, 'unknown'),
      },
      model: {
        status: textOr(sceneStore.model && sceneStore.model.status, 'idle'),
        reason: textOr(sceneStore.model && sceneStore.model.reason, 'not-checked'),
      },
    };
  };

  const retrySceneBootstrap = async (options = {}) => {
    if (options.redetectWebgl !== false) {
      detectWebglCapability();
    }
    if (options.reloadConfig === true) {
      await loadSceneConfig();
    } else {
      syncSceneEnablementDataset();
    }
    if (options.reloadHealth === true) {
      await loadSceneHealth();
    }

    await bootstrapSceneModel();
    refreshSceneBindingReport();

    return {
      mode: sceneOverrideMode,
      enabledRaw: sceneRuntime.enabledRaw,
      enabledEffective: sceneRuntime.enabledEffective,
      rollout: getSceneRolloutSnapshot(),
      webgl: {
        supported: Boolean(sceneStore.webgl && sceneStore.webgl.supported),
        context: textOr(sceneStore.webgl && sceneStore.webgl.context, 'none'),
        reason: textOr(sceneStore.webgl && sceneStore.webgl.reason, 'unknown'),
      },
      engine: {
        status: textOr(sceneStore.engine && sceneStore.engine.status, 'pending'),
        reason: textOr(sceneStore.engine && sceneStore.engine.reason, 'unknown'),
      },
      model: {
        status: textOr(sceneStore.model && sceneStore.model.status, 'idle'),
        reason: textOr(sceneStore.model && sceneStore.model.reason, 'not-checked'),
        attempts: Number(sceneStore.model && sceneStore.model.attempts) || 0,
        lastDurationMs: Number(sceneStore.model && sceneStore.model.lastDurationMs) || 0,
      },
    };
  };

  const getSceneRolloutSnapshot = () => ({
    mode: textOr(sceneRuntime.rollout && sceneRuntime.rollout.mode, 'all'),
    percentage: Number(sceneRuntime.rollout && sceneRuntime.rollout.percentage) || 100,
    allowlistCount: Number(sceneRuntime.rollout && sceneRuntime.rollout.allowlistCount) || 0,
    allowlist: Array.isArray(sceneRuntime.rollout && sceneRuntime.rollout.allowlist)
      ? sceneRuntime.rollout.allowlist.slice()
      : [],
    viewerKey: textOr(sceneRuntime.rollout && sceneRuntime.rollout.viewerKey, ''),
    bucket: Number.isFinite(Number(sceneRuntime.rollout && sceneRuntime.rollout.bucket))
      ? Math.floor(Number(sceneRuntime.rollout && sceneRuntime.rollout.bucket))
      : -1,
    pass: Boolean(sceneRuntime.rollout && sceneRuntime.rollout.pass),
    reason: textOr(sceneRuntime.rollout && sceneRuntime.rollout.reason, 'blocked'),
    override: sceneOverrideMode,
    enabledRaw: sceneRuntime.enabledRaw,
    enabledEffective: sceneRuntime.enabledEffective,
  });

  const setSceneRolloutKey = async (key, options = {}) => {
    const normalized = sanitizeSceneRolloutKey(key);
    if (normalized === '') {
      return {
        changed: false,
        ok: false,
        error: 'rollout-key-invalid',
        ...getSceneRolloutSnapshot(),
      };
    }

    const changed = normalized !== sceneRolloutKey;
    sceneRolloutKey = normalized;

    if (options.persist !== false) {
      storeSceneRolloutKeyPreference(sceneRolloutKey);
    }

    syncSceneEnablementDataset();
    refreshEngineBootstrapStatus();

    if (options.reloadHealth === true) {
      await loadSceneHealth();
    }

    if (options.reboot !== false) {
      await bootstrapSceneModel();
      refreshSceneBindingReport();
    }

    return {
      changed,
      ok: true,
      ...getSceneRolloutSnapshot(),
    };
  };

  const clearSceneRolloutKey = async (options = {}) => {
    const previous = sceneRolloutKey;
    clearSceneRolloutKeyPreference();
    sceneRolloutKey =
      sanitizeSceneRolloutKey(viewerRolloutKeySeed) ||
      sanitizeSceneRolloutKey(buildAnonymousSceneRolloutKey());
    if (sceneRolloutKey !== '' && options.persist !== false) {
      storeSceneRolloutKeyPreference(sceneRolloutKey);
    }

    syncSceneEnablementDataset();
    refreshEngineBootstrapStatus();

    if (options.reloadHealth === true) {
      await loadSceneHealth();
    }

    if (options.reboot !== false) {
      await bootstrapSceneModel();
      refreshSceneBindingReport();
    }

    return {
      changed: previous !== sceneRolloutKey,
      ok: true,
      ...getSceneRolloutSnapshot(),
    };
  };

  // Build a secondary list of links in the UI for fallback navigation.
  if (ui) {
    listWrap = document.createElement('div');
    listWrap.className = 'ronzani-3d-nav-list';

    const list = document.createElement('ul');
    list.className = 'ronzani-3d-nav-links';

    if (menuItems.length === 0) {
      const fallback = document.createElement('li');
      fallback.className = 'ronzani-3d-nav-fallback';
      fallback.textContent = 'Nessuna voce menu disponibile';
      list.appendChild(fallback);
    } else {
      menuItems.forEach((item, index) => {
        if (!item || !item.url) {
          return;
        }

        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = item.url;
        link.textContent = item.title || item.url;
        link.dataset.index = index;
        li.appendChild(link);
        list.appendChild(li);

        // Sync hover/focus: List Item -> Hotspot
        const syncHighlight = (highlight) => {
          const hotspot = wrapper.querySelector(`.ronzani-hotspot[data-index="${index}"]`);
          if (hotspot) {
            hotspot.classList.toggle('is-highlighted', highlight);
          }
        };

        link.addEventListener('mouseenter', () => {
          syncHighlight(true);
          setPeekSelectionByIndex(index);
        });
        link.addEventListener('mouseleave', () => {
          syncHighlight(false);
          setPeekSelectionByIndex(-1);
        });
        link.addEventListener('focus', () => {
          syncHighlight(true);
          setPeekSelectionByIndex(index);
        });
        link.addEventListener('blur', () => {
          syncHighlight(false);
          setPeekSelectionByIndex(-1);
        });
        link.addEventListener('click', (event) => {
          if (mode !== 'desk') {
            return;
          }

          if (isModifiedActivation(event)) {
            return;
          }

          event.preventDefault();
          openPreviewBySelection(index, link.dataset.objectId || '');
        });
      });
    }

    listWrap.appendChild(list);
    ui.appendChild(listWrap);
  }

  if (ui && mode === 'desk') {
    debugLegendPanel = document.createElement('aside');
    debugLegendPanel.className = 'ronzani-debug-legend';
    debugLegendPanel.hidden = true;

    const debugLegendTitle = document.createElement('p');
    debugLegendTitle.className = 'ronzani-debug-legend-title';
    debugLegendTitle.textContent = 'Debug Legend';

    debugLegendMeta = document.createElement('p');
    debugLegendMeta.className = 'ronzani-debug-legend-meta';
    debugLegendMeta.textContent = '';

    debugLegendList = document.createElement('ol');
    debugLegendList.className = 'ronzani-debug-legend-list';

    debugLegendPanel.append(debugLegendTitle, debugLegendMeta, debugLegendList);
    ui.appendChild(debugLegendPanel);

    qaPanel = document.createElement('aside');
    qaPanel.className = 'ronzani-qa-panel';
    qaPanel.hidden = !qaPanelEnabled;

    const qaTitle = document.createElement('p');
    qaTitle.className = 'ronzani-qa-title';
    qaTitle.textContent = 'QA Panel';

    qaChecksSummary = document.createElement('p');
    qaChecksSummary.className = 'ronzani-qa-summary';
    qaChecksSummary.dataset.state = '';
    qaChecksSummary.textContent = 'Quick Checks: n/d';

    qaChecksList = document.createElement('ol');
    qaChecksList.className = 'ronzani-qa-list';

    qaFlowSummary = document.createElement('p');
    qaFlowSummary.className = 'ronzani-qa-summary';
    qaFlowSummary.dataset.state = '';
    qaFlowSummary.textContent = 'QA Flow: n/d';

    qaFlowList = document.createElement('ol');
    qaFlowList.className = 'ronzani-qa-list';

    qaSmokeSummary = document.createElement('p');
    qaSmokeSummary.className = 'ronzani-qa-summary';
    qaSmokeSummary.dataset.state = '';
    qaSmokeSummary.textContent = 'Smoke: n/d';

    qaSmokeList = document.createElement('ol');
    qaSmokeList.className = 'ronzani-qa-list';

    qaMeta = document.createElement('p');
    qaMeta.className = 'ronzani-qa-meta';
    qaMeta.textContent = '';

    const qaActions = document.createElement('div');
    qaActions.className = 'ronzani-qa-actions';

    qaRunChecksButton = document.createElement('button');
    qaRunChecksButton.type = 'button';
    qaRunChecksButton.className = 'ronzani-qa-run';
    qaRunChecksButton.textContent = 'Esegui Quick Checks';
    qaRunChecksButton.addEventListener('click', () => {
      runQaChecksAndRender();
    });

    qaRunFlowButton = document.createElement('button');
    qaRunFlowButton.type = 'button';
    qaRunFlowButton.className = 'ronzani-qa-run';
    qaRunFlowButton.textContent = 'Esegui QA Flow';
    qaRunFlowButton.addEventListener('click', () => {
      void runQaFlowAndRender();
    });

    qaRunSmokeButton = document.createElement('button');
    qaRunSmokeButton.type = 'button';
    qaRunSmokeButton.className = 'ronzani-qa-run';
    qaRunSmokeButton.textContent = 'Esegui Smoke';
    qaRunSmokeButton.addEventListener('click', () => {
      void runQaSmokeAndRender();
    });

    qaCopyButton = document.createElement('button');
    qaCopyButton.type = 'button';
    qaCopyButton.className = 'ronzani-qa-copy';
    qaCopyButton.textContent = 'Copia JSON QA';
    qaCopyButton.addEventListener('click', () => {
      void copyQaReportsToClipboard();
    });

    qaActions.append(qaRunChecksButton, qaRunFlowButton, qaRunSmokeButton, qaCopyButton);
    qaPanel.append(
      qaTitle,
      qaChecksSummary,
      qaChecksList,
      qaFlowSummary,
      qaFlowList,
      qaSmokeSummary,
      qaSmokeList,
      qaActions,
      qaMeta
    );
    ui.appendChild(qaPanel);

    debugToggleButton = document.createElement('button');
    debugToggleButton.type = 'button';
    debugToggleButton.className = 'ronzani-3d-nav-debug';
    debugToggleButton.setAttribute('aria-label', 'Mostra o nascondi object id hotspot');
    debugToggleButton.addEventListener('click', () => {
      setDebugMode(!debugIdsEnabled);
    });
    ui.appendChild(debugToggleButton);

    qaToggleButton = document.createElement('button');
    qaToggleButton.type = 'button';
    qaToggleButton.className = 'ronzani-3d-nav-qa';
    qaToggleButton.setAttribute('aria-label', 'Mostra o nascondi pannello QA');
    qaToggleButton.addEventListener('click', () => {
      setQaPanelOpen(!qaPanelEnabled);
    });
    ui.appendChild(qaToggleButton);

    updateDebugToggleUi();
    refreshDebugLegend();
    updateQaToggleUi();
    renderQaCheckList(qaChecksList);
    renderQaCheckList(qaFlowList);
    renderQaCheckList(qaSmokeList);
    setQaButtonsBusy(false);
    refreshQaMeta();
  }

  runtimeShell = createRuntimeShell();
  wrapper.dataset.ronzaniState = currentState;
  if (runtimeShell) {
    runtimeShell.setState(currentState);
  }
  refreshDeepLinkDataset();

  window.RONZANI_3D_NAV_RUNTIME = {
    getState: () => currentState,
    setState: (nextState) => transitionToState(nextState, 'runtime-api'),
    getActiveSelectionIndex: () => activeSelectionIndex,
    getDebugMode: () => debugIdsEnabled,
    setDebugMode: (enabled, options = {}) => setDebugMode(Boolean(enabled), options),
    getQaPanelOpen: () => qaPanelEnabled,
    setQaPanelOpen: (enabled, options = {}) => setQaPanelOpen(Boolean(enabled), options),
    openPreview: (payload = {}, options = {}) => {
      if (runtimeShell) {
        runtimeShell.openPreview(payload, options);
      }
    },
    openArticle: (payload = {}, options = {}) => {
      if (runtimeShell) {
        void runtimeShell.openArticle(payload, options);
      }
    },
    closeArticle: (options = {}) => {
      if (!runtimeShell || typeof runtimeShell.closeArticle !== 'function') {
        return;
      }
      runtimeShell.closeArticle(options);
    },
    scrollArticleTop: (options = {}) => {
      if (!runtimeShell || typeof runtimeShell.scrollArticleTop !== 'function') {
        return;
      }
      runtimeShell.scrollArticleTop(options);
    },
    prefetchAroundSelection: (selectionIndex, options = {}) => {
      if (!runtimeShell || typeof runtimeShell.prefetchAroundSelection !== 'function') {
        return;
      }
      runtimeShell.prefetchAroundSelection(selectionIndex, options);
    },
    getMapping: () => mappingStore.items.slice(),
    getMappingItem: (objectId) => {
      if (typeof objectId !== 'string') {
        return null;
      }
      return mappingStore.byObjectId.get(objectId) || null;
    },
    getSceneConfig: () => sceneStore.payload,
    getSceneHealth: () => sceneHealthStore.payload,
    getSceneBindingReport: () => sceneStore.binding,
    getWebglCapability: () => ({
      supported: Boolean(sceneStore.webgl && sceneStore.webgl.supported),
      context: textOr(sceneStore.webgl && sceneStore.webgl.context, 'none'),
      reason: textOr(sceneStore.webgl && sceneStore.webgl.reason, 'unknown'),
    }),
    getEngineBootstrap: () => ({
      status: textOr(sceneStore.engine && sceneStore.engine.status, 'pending'),
      reason: textOr(sceneStore.engine && sceneStore.engine.reason, 'unknown'),
    }),
    getSceneModelBootstrap: () => ({
      status: textOr(sceneStore.model && sceneStore.model.status, 'idle'),
      reason: textOr(sceneStore.model && sceneStore.model.reason, 'not-checked'),
      bytes: Number(sceneStore.model && sceneStore.model.bytes) || 0,
      httpStatus: Number(sceneStore.model && sceneStore.model.httpStatus) || 0,
      contentType: textOr(sceneStore.model && sceneStore.model.contentType, ''),
      format: textOr(sceneStore.model && sceneStore.model.format, ''),
      attempts: Number(sceneStore.model && sceneStore.model.attempts) || 0,
      lastDurationMs: Number(sceneStore.model && sceneStore.model.lastDurationMs) || 0,
      checkedAt: textOr(sceneStore.model && sceneStore.model.checkedAt, ''),
    }),
    getSceneOverride: () => ({
      mode: sceneOverrideMode,
      enabledRaw: sceneRuntime.enabledRaw,
      enabledEffective: sceneRuntime.enabledEffective,
      rolloutPass: Boolean(sceneRuntime.rollout && sceneRuntime.rollout.pass),
    }),
    setSceneOverride: async (mode = 'auto', options = {}) =>
      setSceneOverrideMode(mode, options),
    retrySceneBootstrap: async (options = {}) => retrySceneBootstrap(options),
    getSceneRollout: () => getSceneRolloutSnapshot(),
    setSceneRolloutKey: async (key, options = {}) => setSceneRolloutKey(key, options),
    clearSceneRolloutKey: async (options = {}) => clearSceneRolloutKey(options),
    getMotionProfile: () => textOr(wrapper.dataset.motionProfile, 'desk'),
    getPerformanceProfile: () => getPerformanceSnapshot(),
    setPerformanceMode: (mode = 'auto', options = {}) => setPerformanceMode(mode, options),
    setQualityTier: (tier = 'balanced', options = {}) => setPerformanceTier(tier, options),
    setAdaptiveQuality: (enabled = true, options = {}) => setAdaptiveQuality(enabled, options),
    getBackdropProfile: () => ({
      profile: textOr(wrapper.dataset.backdropProfile, ''),
      frameBudgetMs: Number(wrapper.dataset.backdropFrameBudget || '0') || 0,
      lines: textOr(wrapper.dataset.backdropLines, ''),
      overlay: textOr(wrapper.dataset.backdropOverlay, ''),
    }),
    getArticlePrefetchStats: () => ({
      ready: textOr(wrapper.dataset.articlePrefetchReady, '0') === '1',
      cacheEntries: Number(wrapper.dataset.articlePrefetchCount || '0') || 0,
      inFlight: Number(wrapper.dataset.articlePrefetchInFlight || '0') || 0,
      cacheHits: Number(wrapper.dataset.articlePrefetchHits || '0') || 0,
    }),
    getUiLayer: () => textOr(wrapper.dataset.uiLayer, 'explore'),
    getAccessibilityState: () => ({
      keyboardFlow: textOr(wrapper.dataset.keyboardFlow, '0') === '1',
      focusTrap: textOr(wrapper.dataset.focusTrap, 'none'),
      reducedMotion: textOr(wrapper.dataset.reducedMotion, '0') === '1',
      fallbackHtml: textOr(wrapper.dataset.fallbackHtml, '0') === '1',
    }),
    getCameraFocus: () => textOr(wrapper.dataset.cameraFocus, 'none'),
    getCameraDirector: () => getCameraDirectorSnapshot(),
    getInteractionLayer: () => getInteractionLayerSnapshot(),
    setCameraOrbitEnabled: (enabled, options = {}) =>
      setCameraDirectorOrbitEnabled(Boolean(enabled), options),
    travelToSelection: (selectionIndex, options = {}) => {
      const rawIndex = Number(selectionIndex);
      if (!Number.isFinite(rawIndex)) {
        return getCameraDirectorSnapshot();
      }

      const safeIndex = Math.max(0, Math.floor(rawIndex));
      setActiveSelectionByIndex(safeIndex);
      syncCameraTargetToSelection({
        forceTravel: options.force !== false,
        instant: options.instant === true,
        fromCurrent: options.fromCurrent === true,
        reason: 'runtime:travel-selection-sync',
      });
      return getCameraDirectorSnapshot();
    },
    raycastPick: (clientX, clientY, options = {}) =>
      pickInteractionAtPointer(clientX, clientY, options),
    setDeepLink: (payload = null, options = {}) => {
      writeDeepLink(payload, options.historyMode || 'replace');
      refreshDeepLinkDataset();
      return readDeepLinkFromLocation();
    },
    clearDeepLink: (options = {}) => {
      writeDeepLink(null, options.historyMode || 'replace');
      refreshDeepLinkDataset();
      return null;
    },
    getDeepLink: () => readDeepLinkFromLocation(),
    getMappingHealth: () => mappingHealthStore.payload,
    getDebugLegendData: () => collectDebugLegendRows(),
    getQaReports: () => ({
      checks: qaReports.checks,
      flow: qaReports.flow,
      smoke: qaReports.smoke,
    }),
    runQaChecks: () => buildQaReport(),
    runQaFlow: async () => buildQaFlowReport(),
    runQaSmoke: async () => buildQaSmokeReport(),
    runQaChecksAndRender: () => runQaChecksAndRender(),
    runQaFlowAndRender: async () => runQaFlowAndRender(),
    runQaSmokeAndRender: async () => runQaSmokeAndRender(),
    bootSceneContract: async () => {
      detectWebglCapability();
      await loadSceneConfig();
      await loadSceneHealth();
      await bootstrapSceneModel();
      refreshSceneBindingReport();
      return {
        scene: sceneStore.payload,
        sceneHealth: sceneHealthStore.payload,
        webgl: sceneStore.webgl,
        binding: sceneStore.binding,
        engine: sceneStore.engine,
        model: sceneStore.model,
      };
    },
    copyQaReports: async () => copyQaReportsToClipboard(),
    navigatePreview: (offset = 1, options = {}) => {
      if (!runtimeShell || typeof runtimeShell.navigatePreview !== 'function') {
        return false;
      }

      const numericOffset = Number(offset);
      if (!Number.isFinite(numericOffset) || numericOffset === 0) {
        return false;
      }

      return runtimeShell.navigatePreview(numericOffset > 0 ? 1 : -1, options);
    },
    selectObject: (selection = {}) => {
      if (selection && typeof selection === 'object') {
        if (typeof selection.index === 'number' && Number.isFinite(selection.index)) {
          const safeIndex = Math.max(0, Math.floor(selection.index));
          if (!selectInteractionAtIndex(safeIndex, 'runtime-select', { historyMode: 'push' })) {
            openPreviewBySelection(safeIndex, textOr(selection.objectId, ''));
          }
          return;
        }

        if (typeof selection.objectId === 'string' && selection.objectId.trim() !== '') {
          const objectId = selection.objectId.trim();
          const byIndex = mappingStore.items.findIndex(
            (item) => item && item.object_id === objectId
          );
          const index = byIndex >= 0 ? byIndex : 0;
          if (!selectInteractionAtIndex(index, 'runtime-select', { historyMode: 'push' })) {
            openPreviewBySelection(index, objectId);
          }
        }
      }
    },
  };

  window.addEventListener('ronzani:open-preview', (event) => {
    if (!runtimeShell) {
      return;
    }

    const payload = event.detail && typeof event.detail === 'object' ? event.detail : {};
    const options =
      payload && payload.options && typeof payload.options === 'object' ? payload.options : {};
    runtimeShell.openPreview(payload, options);
  });

  window.addEventListener('ronzani:open-article', (event) => {
    if (!runtimeShell) {
      return;
    }

    const payload = event.detail && typeof event.detail === 'object' ? event.detail : {};
    const options =
      payload && payload.options && typeof payload.options === 'object' ? payload.options : {};
    void runtimeShell.openArticle(payload, options);
  });

  window.addEventListener('ronzani:select-object', (event) => {
    const detail = event.detail && typeof event.detail === 'object' ? event.detail : {};
    window.RONZANI_3D_NAV_RUNTIME.selectObject(detail);
  });

  window.addEventListener('ronzani:raycast-pick', (event) => {
    const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    const x = toFiniteNumber(detail.x);
    const y = toFiniteNumber(detail.y);
    if (x === null || y === null) {
      return;
    }

    pickInteractionAtPointer(x, y, {
      updateHover: detail.updateHover !== false,
      source: textOr(detail.source, 'runtime-raycast-pick'),
    });
  });

  window.addEventListener('ronzani:raycast-select', (event) => {
    const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    const rawIndex = Number(detail.index);
    if (Number.isFinite(rawIndex)) {
      selectInteractionAtIndex(Math.max(0, Math.floor(rawIndex)), textOr(detail.source, 'runtime-raycast-select'), {
        historyMode: textOr(detail.historyMode, 'push'),
      });
      return;
    }

    const objectId = textOr(detail.objectId, '');
    if (objectId === '') {
      return;
    }

    const index = findIndexByObjectId(objectId);
    if (index < 0) {
      return;
    }

    selectInteractionAtIndex(index, textOr(detail.source, 'runtime-raycast-select'), {
      historyMode: textOr(detail.historyMode, 'push'),
    });
  });

  window.addEventListener('ronzani:set-scene-override', (event) => {
    const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    void setSceneOverrideMode(textOr(detail.mode, 'auto'), {
      persist: detail.persist !== false,
      reboot: detail.reboot !== false,
      reloadConfig: detail.reloadConfig === true,
      reloadHealth: detail.reloadHealth === true,
    });
  });

  window.addEventListener('ronzani:retry-scene-bootstrap', (event) => {
    const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    void retrySceneBootstrap({
      redetectWebgl: detail.redetectWebgl !== false,
      reloadConfig: detail.reloadConfig === true,
      reloadHealth: detail.reloadHealth === true,
    });
  });

  window.addEventListener('ronzani:set-scene-rollout-key', (event) => {
    const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    void setSceneRolloutKey(textOr(detail.key, ''), {
      persist: detail.persist !== false,
      reboot: detail.reboot !== false,
      reloadHealth: detail.reloadHealth === true,
    });
  });

  window.addEventListener('ronzani:clear-scene-rollout-key', (event) => {
    const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    void clearSceneRolloutKey({
      persist: detail.persist !== false,
      reboot: detail.reboot !== false,
      reloadHealth: detail.reloadHealth === true,
    });
  });

  window.addEventListener('keydown', (event) => {
    if (
      mode === 'desk' &&
      event.shiftKey &&
      (event.ctrlKey || event.metaKey) &&
      textOr(event.key, '').toLowerCase() === 'd'
    ) {
      event.preventDefault();
      setDebugMode(!debugIdsEnabled);
      return;
    }

    if (
      mode === 'desk' &&
      event.shiftKey &&
      (event.ctrlKey || event.metaKey) &&
      textOr(event.key, '').toLowerCase() === 'q'
    ) {
      event.preventDefault();
      setQaPanelOpen(!qaPanelEnabled);
      return;
    }

    if (
      mode === 'desk' &&
      currentState === APP_STATES.EXPLORE &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !isTypingTarget(event.target)
    ) {
      const isForwardArrow = event.key === 'ArrowRight' || event.key === 'ArrowDown';
      const isBackwardArrow = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
      if (isForwardArrow || isBackwardArrow) {
        const indices = getSelectableIndices().sort((left, right) => left - right);
        if (indices.length > 0) {
          const currentIndex =
            activeSelectionIndex >= 0
              ? activeSelectionIndex
              : hoverSelectionIndex >= 0
                ? hoverSelectionIndex
                : indices[0];
          const currentPosition = Math.max(0, indices.indexOf(currentIndex));
          const step = isForwardArrow ? 1 : -1;
          const nextPosition = (currentPosition + step + indices.length) % indices.length;
          const nextIndex = indices[nextPosition];
          setActiveSelectionByIndex(nextIndex);
          const focusNode =
            wrapper.querySelector(`.ronzani-hotspot[data-index="${nextIndex}"]`) ||
            wrapper.querySelector(`.ronzani-3d-nav-links a[data-index="${nextIndex}"]`);
          if (focusNode instanceof HTMLElement) {
            focusNode.focus();
          }
          event.preventDefault();
          return;
        }
      }

      if ((event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') && activeSelectionIndex >= 0) {
        event.preventDefault();
        selectInteractionAtIndex(activeSelectionIndex, 'keyboard-select', {
          historyMode: 'push',
        });
        return;
      }
    }

    if (
      currentState === APP_STATES.PREVIEW_OPEN &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      (event.key === 'ArrowRight' || event.key === 'ArrowLeft')
    ) {
      if (runtimeShell && typeof runtimeShell.navigatePreview === 'function') {
        const moved = runtimeShell.navigatePreview(event.key === 'ArrowRight' ? 1 : -1, {
          historyMode: 'push',
        });
        if (moved) {
          event.preventDefault();
          return;
        }
      }
    }

    if (
      currentState === APP_STATES.ARTICLE_OPEN &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      event.key === 'Home'
    ) {
      if (runtimeShell && typeof runtimeShell.scrollArticleTop === 'function') {
        runtimeShell.scrollArticleTop({ behavior: 'smooth' });
        event.preventDefault();
        return;
      }
    }

    if (event.key !== 'Escape') {
      return;
    }

    if (currentState === APP_STATES.ARTICLE_OPEN) {
      if (lastPreviewPayload && runtimeShell) {
        runtimeShell.openPreview(lastPreviewPayload, { historyMode: 'push' });
      } else {
        transitionToState(APP_STATES.EXPLORE, 'escape-from-article');
        writeDeepLink(null, 'push');
      }
      return;
    }

    if (currentState === APP_STATES.PREVIEW_OPEN) {
      transitionToState(APP_STATES.EXPLORE, 'escape-from-preview');
      writeDeepLink(null, 'push');
    }
  });
  window.addEventListener('popstate', () => {
    refreshDeepLinkDataset();
    const deepLink = readDeepLinkFromLocation();
    if (!deepLink) {
      if (currentState === APP_STATES.ARTICLE_OPEN && lastPreviewPayload && runtimeShell) {
        runtimeShell.openPreview(lastPreviewPayload, { syncUrl: false });
        return;
      }

      if (currentState !== APP_STATES.EXPLORE) {
        transitionToState(APP_STATES.EXPLORE, 'history-pop-explore');
      }
      return;
    }

    void applyDeepLinkFromLocation();
  });

  void (async () => {
    detectWebglCapability();
    await loadSceneConfig();
    await loadSceneHealth();
    await bootstrapSceneModel();
    await loadMapping();
    await loadMappingHealth();
    await applyDeepLinkFromLocation();
    if (mode === 'desk' && qaPanelEnabled) {
      runQaChecksAndRender();
    }
  })();

  setListOpen = (isOpen) => {
    if (!listWrap) {
      return;
    }

    listWrap.classList.toggle('is-open', isOpen);

    if (skipButton) {
      skipButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      skipButton.textContent = isOpen ? 'Nascondi elenco' : 'Mostra elenco';
    }
  };

  // Step 2 Task 3: Desktop closed by default, Mobile open by default (782px)
  if (mode === 'desk' && skipButton) {
    const viewportQuery =
      window.matchMedia && typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 782px)')
        : null;
    const getIsMobileViewport = () =>
      viewportQuery ? viewportQuery.matches : window.innerWidth <= 782;

    let userToggledList = false;
    setListOpen(getIsMobileViewport());

    const onViewportChange = () => {
      if (userToggledList) {
        return;
      }

      setListOpen(getIsMobileViewport());
    };

    if (viewportQuery) {
      if (typeof viewportQuery.addEventListener === 'function') {
        viewportQuery.addEventListener('change', onViewportChange);
      } else if (typeof viewportQuery.addListener === 'function') {
        viewportQuery.addListener(onViewportChange);
      }
    }

    skipButton.addEventListener('click', () => {
      userToggledList = true;
      const isOpen = listWrap ? listWrap.classList.contains('is-open') : false;
      setListOpen(!isOpen);
    });
  }

  if (mode !== 'desk' && skipButton) {
    skipButton.addEventListener('click', () => {
      root.style.display = 'none';
      running = false;
      transitionToState(APP_STATES.FALLBACK_2D, 'skip-animation');
    });
  }

  // Desk mode: render DOM hotspots independent from the canvas.
  if (mode === 'desk' && menuItems.length > 0) {
    menuItems.forEach((item, index) => {
      if (!item || !item.url) {
        return;
      }

      const position = hotspotsData.length ? hotspotsData[index % hotspotsData.length] : { x: 50, y: 50 };
      const link = document.createElement('a');
      link.className = 'ronzani-hotspot';
      link.href = item.url;
      link.style.left = `${position.x}%`;
      link.style.top = `${position.y}%`;
      link.setAttribute('aria-label', item.title || item.url);
      link.dataset.index = index;

      const label = document.createElement('span');
      label.className = 'ronzani-hotspot-label';
      label.textContent = item.title || item.url;
      link.appendChild(label);

      wrapper.appendChild(link);

      // Sync hover/focus: Hotspot -> List Item
      const syncHighlight = (highlight) => {
        if (!listWrap) return;
        const listItem = listWrap.querySelector(`a[data-index="${index}"]`);
        if (listItem) {
          listItem.classList.toggle('is-highlighted', highlight);
        }
      };

      link.addEventListener('mouseenter', () => {
        syncHighlight(true);
        setPeekSelectionByIndex(index);
      });
      link.addEventListener('mouseleave', () => {
        syncHighlight(false);
        setPeekSelectionByIndex(-1);
      });
      link.addEventListener('focus', () => {
        syncHighlight(true);
        setPeekSelectionByIndex(index);
      });
      link.addEventListener('blur', () => {
        syncHighlight(false);
        setPeekSelectionByIndex(-1);
      });
      link.addEventListener('click', (event) => {
        if (isModifiedActivation(event)) {
          return;
        }

        event.preventDefault();
        openPreviewBySelection(index, link.dataset.objectId || '');
      });
    });
  }

  applyHotspotLayout(
    mappingHotspotLayout,
    Array.isArray(mappingHotspotLayout) && mappingHotspotLayout.length > 0 ? 'mapping' : 'seed'
  );
  assignObjectIdsToDom();
  refreshInteractionLayer();
  wrapper.dataset.keyboardFlow = mode === 'desk' ? '1' : '0';

  const prefersReduced = reducedMotionQuery ? reducedMotionQuery.matches : false;

  if (prefersReduced) {
    wrapper.dataset.reducedMotion = '1';
    wrapper.dataset.fallbackHtml = '1';
    root.style.display = 'none';
    transitionToState(APP_STATES.FALLBACK_2D, 'reduced-motion');
    return;
  }

  // Lightweight canvas backdrop (kept optional for desk mode).
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.willChange = 'transform, opacity, filter';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    wrapper.dataset.fallbackHtml = '1';
    transitionToState(APP_STATES.FALLBACK_2D, 'canvas-unavailable');
    return;
  }

  let width = 0;
  let height = 0;
  let lastTime = performance.now();
  let lastFrameTick = performance.now();
  let isDocumentVisible = document.visibilityState !== 'hidden';

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  let resizeToken = null;
  const onResize = () => {
    if (resizeToken !== null) {
      return;
    }

    resizeToken = window.requestAnimationFrame(() => {
      resizeToken = null;
      applyMotionProfile();
      resize();
      refreshInteractionLayer();
    });
  };

  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener(
    'visibilitychange',
    () => {
      isDocumentVisible = document.visibilityState !== 'hidden';
    },
    { passive: true }
  );
  resize();

  const isMobileViewport =
    window.matchMedia && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 782px)').matches
      : window.innerWidth <= 782;
  const isLowCpuDevice =
    typeof navigator.hardwareConcurrency === 'number' &&
    navigator.hardwareConcurrency > 0 &&
    navigator.hardwareConcurrency <= 4;
  const lowPowerDevice = isMobileViewport || isLowCpuDevice;
  const normalizeQualityTier = (value) => {
    if (value === 'low' || value === 'balanced' || value === 'high') {
      return value;
    }
    return 'high';
  };
  const qualityTierOrder = ['low', 'balanced', 'high'];
  const performanceRuntime = {
    mode: 'auto',
    adaptive: true,
    tier: lowPowerDevice ? 'balanced' : 'high',
    state: 'pending',
    reason: 'init',
    frameMsEma: 16.7,
    fpsAvg: 0,
    sampleCount: 0,
    lowFpsStreak: 0,
    highFpsStreak: 0,
    lastTierChangeAt: performance.now(),
    guardrailMinFps: 0,
  };

  const getCurrentPerformanceStage = () =>
    currentState === APP_STATES.ARTICLE_OPEN
      ? 'article'
      : currentState === APP_STATES.PREVIEW_OPEN
        ? 'preview'
        : 'explore';

  const getGuardrailMinFps = (stage = 'explore') => {
    const profileName = wrapper.dataset.motionProfile === 'mobile' ? 'mobile' : 'desk';
    if (profileName === 'mobile') {
      return stage === 'article' ? PERFORMANCE.minFpsMobileArticle : PERFORMANCE.minFpsMobile;
    }
    return stage === 'article' ? PERFORMANCE.minFpsDeskArticle : PERFORMANCE.minFpsDesk;
  };

  const updatePerformanceDataset = () => {
    const stage = getCurrentPerformanceStage();
    const guardrailMinFps = getGuardrailMinFps(stage);
    performanceRuntime.guardrailMinFps = guardrailMinFps;
    wrapper.dataset.performanceMode = performanceRuntime.mode;
    wrapper.dataset.qualityTier = performanceRuntime.tier;
    wrapper.dataset.qualityState = performanceRuntime.state;
    wrapper.dataset.fpsAvg = String(Number(performanceRuntime.fpsAvg || 0).toFixed(1));
    wrapper.dataset.guardrailMinFps = String(Number(guardrailMinFps).toFixed(1));
  };

  const applyPerformanceTier = (tier, reason = 'manual') => {
    const normalized = normalizeQualityTier(tier);
    if (performanceRuntime.tier === normalized) {
      performanceRuntime.reason = reason;
      updatePerformanceDataset();
      return normalized;
    }

    performanceRuntime.tier = normalized;
    performanceRuntime.reason = reason;
    performanceRuntime.lastTierChangeAt = performance.now();
    updatePerformanceDataset();
    refreshBackdropProfile();
    return normalized;
  };

  setPerformanceMode = (mode = 'auto', options = {}) => {
    const normalizedMode = mode === 'manual' ? 'manual' : 'auto';
    performanceRuntime.mode = normalizedMode;
    performanceRuntime.adaptive = normalizedMode === 'auto';
    if (normalizedMode === 'manual' && options && typeof options === 'object' && options.tier) {
      applyPerformanceTier(options.tier, 'manual:set-mode');
    } else {
      updatePerformanceDataset();
    }
    return performanceRuntime.mode;
  };

  setPerformanceTier = (tier = 'balanced', options = {}) => {
    const normalized = applyPerformanceTier(tier, textOr(options.reason, 'manual:set-tier'));
    if (options && options.keepAuto === true) {
      performanceRuntime.mode = 'auto';
      performanceRuntime.adaptive = true;
    } else {
      performanceRuntime.mode = 'manual';
      performanceRuntime.adaptive = false;
    }
    updatePerformanceDataset();
    return normalized;
  };

  setAdaptiveQuality = (enabled = true, options = {}) => {
    const isEnabled = Boolean(enabled);
    performanceRuntime.adaptive = isEnabled;
    performanceRuntime.mode = isEnabled ? 'auto' : 'manual';
    if (!isEnabled && options && options.tier) {
      applyPerformanceTier(options.tier, 'manual:adaptive-off');
    } else {
      updatePerformanceDataset();
    }
    return performanceRuntime.adaptive;
  };

  getPerformanceSnapshot = () => ({
    mode: performanceRuntime.mode,
    adaptive: performanceRuntime.adaptive,
    tier: performanceRuntime.tier,
    state: performanceRuntime.state,
    reason: performanceRuntime.reason,
    fps: Number(performanceRuntime.fpsAvg || 0),
    frameMsEma: Number(performanceRuntime.frameMsEma || 0),
    guardrailMinFps: Number(performanceRuntime.guardrailMinFps || 0),
    sampleCount: performanceRuntime.sampleCount,
    lowFpsStreak: performanceRuntime.lowFpsStreak,
    highFpsStreak: performanceRuntime.highFpsStreak,
  });

  const maybeAdjustQualityForFps = (timestamp, frameDeltaMs) => {
    if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) {
      return;
    }

    const clampedFrameMs = clamp(frameDeltaMs, 8, 160);
    performanceRuntime.frameMsEma =
      performanceRuntime.frameMsEma * 0.88 + clampedFrameMs * 0.12;
    performanceRuntime.fpsAvg = 1000 / performanceRuntime.frameMsEma;
    performanceRuntime.sampleCount += 1;

    const guardrailMinFps = getGuardrailMinFps(getCurrentPerformanceStage());
    performanceRuntime.guardrailMinFps = guardrailMinFps;

    const isLow = performanceRuntime.fpsAvg < guardrailMinFps - 1;
    const isHigh = performanceRuntime.fpsAvg > guardrailMinFps + PERFORMANCE.highBufferFps;
    if (isLow) {
      performanceRuntime.lowFpsStreak += 1;
      performanceRuntime.highFpsStreak = Math.max(0, performanceRuntime.highFpsStreak - 1);
    } else if (isHigh) {
      performanceRuntime.highFpsStreak += 1;
      performanceRuntime.lowFpsStreak = Math.max(0, performanceRuntime.lowFpsStreak - 1);
    } else {
      performanceRuntime.lowFpsStreak = Math.max(0, performanceRuntime.lowFpsStreak - 1);
      performanceRuntime.highFpsStreak = Math.max(0, performanceRuntime.highFpsStreak - 1);
    }

    performanceRuntime.state = isLow ? 'guardrail-low' : 'ok';
    updatePerformanceDataset();

    if (
      !performanceRuntime.adaptive ||
      performanceRuntime.mode !== 'auto' ||
      performanceRuntime.sampleCount < PERFORMANCE.fpsSampleWindow
    ) {
      return;
    }

    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const tierIndex = qualityTierOrder.indexOf(performanceRuntime.tier);
    if (
      performanceRuntime.lowFpsStreak >= PERFORMANCE.lowFramesToStepDown &&
      tierIndex > 0 &&
      now - performanceRuntime.lastTierChangeAt >= PERFORMANCE.degradeCooldownMs
    ) {
      applyPerformanceTier(qualityTierOrder[tierIndex - 1], 'auto:fps-low');
      performanceRuntime.lowFpsStreak = 0;
      performanceRuntime.highFpsStreak = 0;
      return;
    }

    if (
      performanceRuntime.highFpsStreak >= PERFORMANCE.highFramesToStepUp &&
      tierIndex >= 0 &&
      tierIndex < qualityTierOrder.length - 1 &&
      now - performanceRuntime.lastTierChangeAt >= PERFORMANCE.upgradeCooldownMs
    ) {
      applyPerformanceTier(qualityTierOrder[tierIndex + 1], 'auto:fps-high');
      performanceRuntime.lowFpsStreak = 0;
      performanceRuntime.highFpsStreak = 0;
    }
  };

  updatePerformanceDataset();
  const pointCount = mode === 'desk' ? (lowPowerDevice ? 16 : 24) : lowPowerDevice ? 30 : 48;
  const baseLinkDistance = lowPowerDevice ? 96 : 140;
  const baseLineStep = lowPowerDevice ? 2 : 1;
  const points = Array.from({ length: pointCount }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.03,
    vy: (Math.random() - 0.5) * 0.03,
  }));
  let cameraOffsetLimit = lowPowerDevice
    ? motionRuntime.cameraOffsetMaxMobile
    : motionRuntime.cameraOffsetMaxDesk;
  let cameraOffsetX = 0;
  let cameraOffsetY = 0;
  let cameraTargetX = 0;
  let cameraTargetY = 0;
  const getCameraTravelDurationMs = (distancePx) => {
    const profileName = wrapper.dataset.motionProfile === 'mobile' ? 'mobile' : 'desk';
    const profileDuration =
      profileName === 'mobile'
        ? CAMERA_DIRECTOR.travelDurationMobileMs
        : CAMERA_DIRECTOR.travelDurationDeskMs;
    const normalizedDistance =
      cameraOffsetLimit > 0 ? clamp(distancePx / cameraOffsetLimit, 0, 2.2) : 0;
    const scaledDuration = profileDuration * (0.62 + normalizedDistance * 0.38);
    return clamp(
      Math.round(scaledDuration),
      CAMERA_DIRECTOR.travelMinDurationMs,
      CAMERA_DIRECTOR.travelMaxDurationMs
    );
  };

  const updateCameraDirectorDataset = () => {
    const travelState = cameraDirector.travel.active
      ? 'running'
      : textOr(cameraDirector.travel.reason, 'idle');
    wrapper.dataset.cameraTravelState = travelState;
    wrapper.dataset.cameraTravelProgress = String(
      clamp(cameraDirector.travel.progress, 0, 1).toFixed(3)
    );
    wrapper.dataset.cameraOrbitEnabled = cameraDirector.orbit.enabled ? '1' : '0';
    wrapper.dataset.cameraOrbitDragging = cameraDirector.orbit.dragging ? '1' : '0';
    wrapper.dataset.cameraOrbit = `yaw=${cameraDirector.orbit.yawDeg.toFixed(1)},pitch=${cameraDirector.orbit.pitchDeg.toFixed(1)},clamp=${cameraDirector.clampDeg}`;
  };

  const getCameraFocusPointByIndex = (index) => {
    if (mode !== 'desk' || !Number.isFinite(index) || index < 0) {
      return null;
    }

    if (
      Array.isArray(mappingHotspotLayout) &&
      mappingHotspotLayout[index] &&
      Number.isFinite(mappingHotspotLayout[index].x) &&
      Number.isFinite(mappingHotspotLayout[index].y)
    ) {
      return {
        x: Number(mappingHotspotLayout[index].x),
        y: Number(mappingHotspotLayout[index].y),
        source: 'waypoint',
      };
    }

    const seed = getSeedHotspotForIndex(index);
    return {
      x: seed.x,
      y: seed.y,
      source: textOr(seed.source, 'seed'),
    };
  };

  const resolveCameraDirectorBaseTarget = (index) => {
    const focusPoint = getCameraFocusPointByIndex(index);
    if (!focusPoint) {
      return {
        focusPoint: null,
        targetX: 0,
        targetY: 0,
      };
    }

    const x = toFiniteNumber(focusPoint.x);
    const y = toFiniteNumber(focusPoint.y);
    if (x === null || y === null) {
      return {
        focusPoint,
        targetX: 0,
        targetY: 0,
      };
    }

    const normalizedX = clamp((x - 50) / 50, -1, 1);
    const normalizedY = clamp((y - 50) / 50, -1, 1);
    const verticalLimit = cameraOffsetLimit * 0.66;

    return {
      focusPoint,
      targetX: clamp(-normalizedX * cameraOffsetLimit, -cameraOffsetLimit, cameraOffsetLimit),
      targetY: clamp(-normalizedY * verticalLimit, -verticalLimit, verticalLimit),
    };
  };

  const applyCameraDirectorFinalTarget = () => {
    const verticalLimit = cameraOffsetLimit * 0.66;
    const yawRatio =
      cameraDirector.clampDeg > 0
        ? clamp(cameraDirector.orbit.yawDeg / cameraDirector.clampDeg, -1, 1)
        : 0;
    const pitchRatio =
      cameraDirector.clampDeg > 0
        ? clamp(cameraDirector.orbit.pitchDeg / cameraDirector.clampDeg, -1, 1)
        : 0;
    const orbitX = yawRatio * cameraOffsetLimit * CAMERA_DIRECTOR.orbitInfluenceXRatio;
    const orbitY = -pitchRatio * verticalLimit * CAMERA_DIRECTOR.orbitInfluenceYRatio;

    cameraDirector.finalTargetX = clamp(
      cameraDirector.baseTargetX + orbitX,
      -cameraOffsetLimit,
      cameraOffsetLimit
    );
    cameraDirector.finalTargetY = clamp(
      cameraDirector.baseTargetY + orbitY,
      -verticalLimit,
      verticalLimit
    );

    cameraTargetX = cameraDirector.finalTargetX;
    cameraTargetY = cameraDirector.finalTargetY;
  };

  const stopCameraDirectorTravel = (reason = 'idle') => {
    cameraDirector.travel.active = false;
    cameraDirector.travel.progress = 1;
    cameraDirector.travel.reason = textOr(reason, 'idle');
    cameraDirector.travel.fromX = cameraDirector.baseTargetX;
    cameraDirector.travel.fromY = cameraDirector.baseTargetY;
    cameraDirector.travel.toX = cameraDirector.baseTargetX;
    cameraDirector.travel.toY = cameraDirector.baseTargetY;
  };

  const finishCameraDirectorDrag = (event = null) => {
    if (!cameraDirector.orbit.dragging) {
      return;
    }

    const eventPointerId =
      event && Number.isFinite(event.pointerId) ? Number(event.pointerId) : null;
    if (eventPointerId !== null && cameraDirector.orbit.pointerId !== null) {
      if (eventPointerId !== cameraDirector.orbit.pointerId) {
        return;
      }
    }

    cameraDirector.orbit.dragging = false;
    cameraDirector.orbit.pointerId = null;
    wrapper.classList.remove('ronzani-orbit-dragging');
    wrapper.dataset.cameraOrbitDragging = '0';
    updateCameraDirectorDataset();
  };

  startCameraDirectorTravel = (focusIndex, options = {}) => {
    if (mode !== 'desk') {
      cameraDirector.focusIndex = -1;
      cameraDirector.baseTargetX = 0;
      cameraDirector.baseTargetY = 0;
      stopCameraDirectorTravel('idle');
      applyCameraDirectorFinalTarget();
      updateCameraDirectorDataset();
      return getCameraDirectorSnapshot();
    }

    const resolvedIndex = Number.isFinite(focusIndex) ? Math.max(0, Math.floor(focusIndex)) : -1;
    const resolvedTarget =
      resolvedIndex >= 0
        ? resolveCameraDirectorBaseTarget(resolvedIndex)
        : { focusPoint: null, targetX: 0, targetY: 0 };
    const toX = toFiniteNumber(resolvedTarget.targetX);
    const toY = toFiniteNumber(resolvedTarget.targetY);
    const safeTargetX = toX === null ? 0 : toX;
    const safeTargetY = toY === null ? 0 : toY;

    cameraDirector.focusIndex = resolvedIndex;

    const fromX = options.fromCurrent === true ? cameraOffsetX : cameraDirector.baseTargetX;
    const fromY = options.fromCurrent === true ? cameraOffsetY : cameraDirector.baseTargetY;
    const distance = Math.hypot(safeTargetX - fromX, safeTargetY - fromY);
    const reducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const instant = Boolean(options.instant) || reducedMotion || distance < 0.35;

    if (instant) {
      cameraDirector.baseTargetX = safeTargetX;
      cameraDirector.baseTargetY = safeTargetY;
      stopCameraDirectorTravel(resolvedIndex >= 0 ? 'settled' : 'idle');
      applyCameraDirectorFinalTarget();
      updateCameraDirectorDataset();
      return getCameraDirectorSnapshot();
    }

    const duration = getCameraTravelDurationMs(distance);
    cameraDirector.travel.active = true;
    cameraDirector.travel.startedAt = performance.now();
    cameraDirector.travel.durationMs = duration;
    cameraDirector.travel.fromX = fromX;
    cameraDirector.travel.fromY = fromY;
    cameraDirector.travel.toX = safeTargetX;
    cameraDirector.travel.toY = safeTargetY;
    cameraDirector.travel.progress = 0;
    cameraDirector.travel.reason = textOr(options.reason, 'travel');
    cameraDirector.baseTargetX = fromX;
    cameraDirector.baseTargetY = fromY;
    applyCameraDirectorFinalTarget();
    updateCameraDirectorDataset();
    return getCameraDirectorSnapshot();
  };

  setCameraDirectorOrbitEnabled = (enabled, options = {}) => {
    const shouldEnable = mode === 'desk' && Boolean(enabled);
    cameraDirector.orbit.enabled = shouldEnable;

    if (!shouldEnable) {
      finishCameraDirectorDrag();
      if (options.reset !== false) {
        cameraDirector.orbit.targetYawDeg = 0;
        cameraDirector.orbit.targetPitchDeg = 0;
        if (options.immediate === true) {
          cameraDirector.orbit.yawDeg = 0;
          cameraDirector.orbit.pitchDeg = 0;
        }
      }
    } else if (options.reset === true) {
      cameraDirector.orbit.targetYawDeg = 0;
      cameraDirector.orbit.targetPitchDeg = 0;
      if (options.immediate === true) {
        cameraDirector.orbit.yawDeg = 0;
        cameraDirector.orbit.pitchDeg = 0;
      }
    }

    wrapper.classList.toggle('ronzani-orbit-enabled', shouldEnable);
    updateCameraDirectorDataset();
    return shouldEnable;
  };

  getCameraDirectorSnapshot = () => {
    let status = 'idle';
    if (cameraDirector.travel.active) {
      status = 'traveling';
    } else if (cameraDirector.orbit.dragging) {
      status = 'orbit_dragging';
    } else if (cameraDirector.orbit.enabled) {
      status = 'orbit_ready';
    } else if (cameraDirector.focusIndex >= 0) {
      status = 'settled';
    }

    return {
      status,
      travelState: cameraDirector.travel.active
        ? 'running'
        : textOr(cameraDirector.travel.reason, 'idle'),
      progress: clamp(cameraDirector.travel.progress, 0, 1),
      focusIndex: cameraDirector.focusIndex,
      yawDeg: cameraDirector.orbit.yawDeg,
      pitchDeg: cameraDirector.orbit.pitchDeg,
      targetYawDeg: cameraDirector.orbit.targetYawDeg,
      targetPitchDeg: cameraDirector.orbit.targetPitchDeg,
      clampDeg: cameraDirector.clampDeg,
      orbitEnabled: cameraDirector.orbit.enabled,
      orbitDragging: cameraDirector.orbit.dragging,
      targetX: cameraDirector.finalTargetX,
      targetY: cameraDirector.finalTargetY,
      baseTargetX: cameraDirector.baseTargetX,
      baseTargetY: cameraDirector.baseTargetY,
      travelDurationMs: cameraDirector.travel.durationMs,
    };
  };

  const advanceCameraDirectorTravel = (timestamp) => {
    if (!cameraDirector.travel.active) {
      return;
    }

    const startedAt = Number(cameraDirector.travel.startedAt) || timestamp;
    const duration = Math.max(1, Number(cameraDirector.travel.durationMs) || 1);
    const progress = clamp((timestamp - startedAt) / duration, 0, 1);
    const eased = easeInOutCubic(progress);

    cameraDirector.travel.progress = progress;
    cameraDirector.baseTargetX = lerp(cameraDirector.travel.fromX, cameraDirector.travel.toX, eased);
    cameraDirector.baseTargetY = lerp(cameraDirector.travel.fromY, cameraDirector.travel.toY, eased);

    if (progress >= 1) {
      cameraDirector.baseTargetX = cameraDirector.travel.toX;
      cameraDirector.baseTargetY = cameraDirector.travel.toY;
      stopCameraDirectorTravel('settled');
    }
  };

  const advanceCameraDirectorOrbit = () => {
    const clampDeg = cameraDirector.clampDeg;
    const orbit = cameraDirector.orbit;

    if (!orbit.enabled) {
      orbit.targetYawDeg = 0;
      orbit.targetPitchDeg = 0;
    }

    const followLerp = orbit.enabled ? CAMERA_DIRECTOR.orbitLerp : CAMERA_DIRECTOR.orbitReturnLerp;
    orbit.targetYawDeg = clamp(orbit.targetYawDeg, -clampDeg, clampDeg);
    orbit.targetPitchDeg = clamp(orbit.targetPitchDeg, -clampDeg, clampDeg);
    orbit.yawDeg = lerp(orbit.yawDeg, orbit.targetYawDeg, followLerp);
    orbit.pitchDeg = lerp(orbit.pitchDeg, orbit.targetPitchDeg, followLerp);
    orbit.yawDeg = clamp(orbit.yawDeg, -clampDeg, clampDeg);
    orbit.pitchDeg = clamp(orbit.pitchDeg, -clampDeg, clampDeg);
  };

  const advanceCameraDirector = (timestamp) => {
    advanceCameraDirectorTravel(timestamp);
    advanceCameraDirectorOrbit();
    applyCameraDirectorFinalTarget();
    updateCameraDirectorDataset();
  };

  const shouldIgnoreOrbitPointerTarget = (target) => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(
      target.closest(
        '.ronzani-hotspot, .ronzani-3d-nav-list, .ronzani-3d-nav-skip, .ronzani-3d-nav-debug, .ronzani-3d-nav-qa, .ronzani-preview-card, .ronzani-article-panel, .ronzani-qa-panel, .ronzani-debug-legend'
      )
    );
  };

  const beginCameraDirectorDrag = (event) => {
    if (mode !== 'desk' || !cameraDirector.orbit.enabled) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (typeof event.isPrimary === 'boolean' && !event.isPrimary) {
      return;
    }
    if (shouldIgnoreOrbitPointerTarget(event.target)) {
      return;
    }

    cameraDirector.orbit.dragging = true;
    cameraDirector.orbit.pointerId = Number.isFinite(event.pointerId) ? Number(event.pointerId) : null;
    cameraDirector.orbit.lastPointerX = Number(event.clientX) || 0;
    cameraDirector.orbit.lastPointerY = Number(event.clientY) || 0;
    wrapper.classList.add('ronzani-orbit-dragging');
    wrapper.dataset.cameraOrbitDragging = '1';

    const eventTarget = event.target;
    if (
      eventTarget &&
      typeof eventTarget.setPointerCapture === 'function' &&
      cameraDirector.orbit.pointerId !== null
    ) {
      try {
        eventTarget.setPointerCapture(cameraDirector.orbit.pointerId);
      } catch (error) {
        // Pointer capture is optional.
      }
    }

    event.preventDefault();
    updateCameraDirectorDataset();
  };

  const updateCameraDirectorDrag = (event) => {
    if (!cameraDirector.orbit.dragging) {
      return;
    }

    const pointerId = Number.isFinite(event.pointerId) ? Number(event.pointerId) : null;
    if (cameraDirector.orbit.pointerId !== null && pointerId !== cameraDirector.orbit.pointerId) {
      return;
    }

    const nextX = Number(event.clientX) || 0;
    const nextY = Number(event.clientY) || 0;
    const deltaX = nextX - cameraDirector.orbit.lastPointerX;
    const deltaY = nextY - cameraDirector.orbit.lastPointerY;
    cameraDirector.orbit.lastPointerX = nextX;
    cameraDirector.orbit.lastPointerY = nextY;

    cameraDirector.orbit.targetYawDeg = clamp(
      cameraDirector.orbit.targetYawDeg + deltaX * CAMERA_DIRECTOR.orbitDragSensitivityDegPerPx,
      -cameraDirector.clampDeg,
      cameraDirector.clampDeg
    );
    cameraDirector.orbit.targetPitchDeg = clamp(
      cameraDirector.orbit.targetPitchDeg - deltaY * CAMERA_DIRECTOR.orbitDragSensitivityDegPerPx,
      -cameraDirector.clampDeg,
      cameraDirector.clampDeg
    );

    event.preventDefault();
    updateCameraDirectorDataset();
  };

  if (mode === 'desk') {
    wrapper.addEventListener('pointerdown', beginCameraDirectorDrag, { passive: false });
    wrapper.addEventListener('pointermove', updateCameraDirectorDrag, { passive: false });
    wrapper.addEventListener('pointerup', (event) => {
      finishCameraDirectorDrag(event);
    });
    wrapper.addEventListener('pointercancel', (event) => {
      finishCameraDirectorDrag(event);
    });
    wrapper.addEventListener('lostpointercapture', (event) => {
      finishCameraDirectorDrag(event);
    });
    window.addEventListener(
      'blur',
      () => {
        finishCameraDirectorDrag();
      },
      { passive: true }
    );
  }

  refreshCameraOffsetLimit = () => {
    const isMobileProfile = wrapper.dataset.motionProfile === 'mobile';
    const profileLimit = isMobileProfile
      ? motionRuntime.cameraOffsetMaxMobile
      : motionRuntime.cameraOffsetMaxDesk;
    cameraOffsetLimit = lowPowerDevice
      ? Math.min(profileLimit, motionRuntime.cameraOffsetMaxMobile)
      : profileLimit;
    syncCameraTargetToSelection();
  };

  const applyBackdropProfile = () => {
    const profileName = wrapper.dataset.motionProfile === 'mobile' ? 'mobile' : 'desk';
    const stage =
      currentState === APP_STATES.ARTICLE_OPEN
        ? 'article'
        : currentState === APP_STATES.PREVIEW_OPEN
          ? 'preview'
          : 'explore';
    const highQuality = profileName === 'desk' && !lowPowerDevice;

    let frameBudgetMs = highQuality ? 16 : 28;
    let lineStepValue = baseLineStep;
    let linkDistancePx = baseLinkDistance;
    let lineOpacity = 0.2;
    let pointAlpha = 0.55;
    let pointRadius = 2;
    let speedFactor = 1;
    let drawLines = true;
    let drawOverlay = mode !== 'desk';

    if (stage === 'preview') {
      frameBudgetMs = highQuality ? 18 : 34;
      lineStepValue += highQuality ? 0 : 1;
      linkDistancePx *= 0.94;
      lineOpacity *= 0.86;
      pointAlpha = 0.5;
      pointRadius = 1.8;
      speedFactor = 0.72;
    } else if (stage === 'article') {
      frameBudgetMs = highQuality ? 42 : 95;
      lineStepValue += highQuality ? 1 : 2;
      linkDistancePx *= 0.78;
      lineOpacity *= 0.52;
      pointAlpha = 0.42;
      pointRadius = 1.4;
      speedFactor = 0.45;
      drawOverlay = false;
      drawLines = profileName === 'desk' && !lowPowerDevice;
    }

    if (profileName === 'mobile') {
      frameBudgetMs = Math.max(frameBudgetMs, stage === 'article' ? 110 : 40);
      lineStepValue += 1;
      linkDistancePx *= 0.88;
      lineOpacity *= 0.84;
      pointRadius = Math.max(1.2, pointRadius - 0.1);
      if (stage !== 'explore') {
        drawLines = false;
      }
    }

    if (lowPowerDevice) {
      frameBudgetMs = Math.max(frameBudgetMs, stage === 'article' ? 110 : 42);
      lineStepValue += 1;
      linkDistancePx *= 0.9;
      pointAlpha *= 0.9;
    }

    const qualityTier = normalizeQualityTier(performanceRuntime.tier);
    if (qualityTier === 'balanced') {
      frameBudgetMs = Math.max(frameBudgetMs, stage === 'article' ? 86 : 26);
      lineStepValue += 1;
      linkDistancePx *= 0.9;
      lineOpacity *= 0.84;
      pointRadius = Math.max(1.2, pointRadius - 0.14);
      if (stage === 'article') {
        drawLines = false;
      }
    } else if (qualityTier === 'low') {
      frameBudgetMs = Math.max(frameBudgetMs, stage === 'article' ? 130 : 46);
      lineStepValue += 2;
      linkDistancePx *= 0.76;
      lineOpacity *= 0.58;
      pointAlpha *= 0.82;
      pointRadius = 1.2;
      drawLines = stage === 'explore' && profileName === 'desk' && !lowPowerDevice;
      drawOverlay = false;
    }

    backdropRuntime.frameBudgetMs = Math.max(16, Math.round(frameBudgetMs));
    backdropRuntime.lineStep = Math.max(1, Math.round(lineStepValue));
    backdropRuntime.linkDistancePx = Math.max(50, linkDistancePx);
    backdropRuntime.lineOpacity = clamp(lineOpacity, 0, 0.3);
    backdropRuntime.pointAlpha = clamp(pointAlpha, 0.2, 0.7);
    backdropRuntime.pointRadius = clamp(pointRadius, 1.2, 2.2);
    backdropRuntime.speedFactor = clamp(speedFactor, 0.35, 1);
    backdropRuntime.drawLines = drawLines;
    backdropRuntime.drawOverlay = drawOverlay;

    wrapper.dataset.backdropProfile = `${stage}_${profileName}${lowPowerDevice ? '_lp' : ''}`;
    wrapper.dataset.backdropFrameBudget = String(backdropRuntime.frameBudgetMs);
    wrapper.dataset.backdropLines = backdropRuntime.drawLines ? '1' : '0';
    wrapper.dataset.backdropOverlay = backdropRuntime.drawOverlay ? '1' : '0';
    updatePerformanceDataset();
  };
  refreshBackdropProfile = () => {
    applyBackdropProfile();
  };

  syncCameraTargetToSelection = (options = {}) => {
    const focusIndex = activeSelectionIndex >= 0 ? activeSelectionIndex : hoverSelectionIndex;
    const focusSource =
      activeSelectionIndex >= 0 ? 'active' : hoverSelectionIndex >= 0 ? 'peek' : 'none';
    const shouldEnableOrbit =
      mode === 'desk' &&
      activeSelectionIndex >= 0 &&
      (currentState === APP_STATES.PREVIEW_OPEN || currentState === APP_STATES.ARTICLE_OPEN);

    if (mode !== 'desk' || focusIndex < 0) {
      cameraDirector.focusIndex = -1;
      stopCameraDirectorTravel('idle');
      cameraDirector.baseTargetX = 0;
      cameraDirector.baseTargetY = 0;
      setCameraDirectorOrbitEnabled(false, {
        reset: true,
        immediate: options.instant === true,
        reason: 'focus:none',
      });
      applyCameraDirectorFinalTarget();
      wrapper.dataset.cameraFocus = 'none';
      updateCameraDirectorDataset();
      return;
    }

    const focusChanged = cameraDirector.focusIndex !== focusIndex;
    const resolvedTarget = resolveCameraDirectorBaseTarget(focusIndex);
    cameraDirector.focusIndex = focusIndex;

    if (focusSource === 'active') {
      if (focusChanged || options.forceTravel === true) {
        startCameraDirectorTravel(focusIndex, {
          reason: textOr(options.reason, `focus:${focusSource}`),
          instant: options.instant === true,
          fromCurrent: options.fromCurrent === true,
        });
      } else if (!cameraDirector.travel.active) {
        cameraDirector.baseTargetX = resolvedTarget.targetX;
        cameraDirector.baseTargetY = resolvedTarget.targetY;
        stopCameraDirectorTravel('settled');
      }
    } else {
      stopCameraDirectorTravel('peek');
      cameraDirector.baseTargetX = resolvedTarget.targetX;
      cameraDirector.baseTargetY = resolvedTarget.targetY;
    }

    setCameraDirectorOrbitEnabled(shouldEnableOrbit, {
      reset: !shouldEnableOrbit,
      immediate: options.instant === true,
      reason: `focus:${focusSource}`,
    });

    applyCameraDirectorFinalTarget();
    wrapper.dataset.cameraFocus = `index=${focusIndex}|source=${focusSource}|target=${cameraDirector.finalTargetX.toFixed(1)},${cameraDirector.finalTargetY.toFixed(1)}|travel=${cameraDirector.travel.active ? 'running' : textOr(cameraDirector.travel.reason, 'idle')}|point=${textOr(resolvedTarget.focusPoint && resolvedTarget.focusPoint.source, 'seed')}`;
    updateCameraDirectorDataset();
  };
  refreshCameraOffsetLimit();
  refreshBackdropProfile();
  syncCameraTargetToSelection();
  const sceneInteraction = {
    ready: false,
    enabled: mode === 'desk',
    source: 'none',
    hoverIndex: -1,
    selectedIndex: -1,
    anchors: [],
    pointer: {
      inside: false,
      down: false,
      moved: false,
      pointerId: null,
      downX: 0,
      downY: 0,
      x: 0,
      y: 0,
    },
  };

  const getInteractionThresholdPx = () => {
    const profile = textOr(wrapper.dataset.motionProfile, 'desk');
    if (profile === 'mobile') {
      return 92;
    }
    return lowPowerDevice ? 78 : 64;
  };

  const buildInteractionAnchors = () => {
    if (mode !== 'desk') {
      return [];
    }

    const rect = root.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return [];
    }

    return getSelectableIndices()
      .map((index) => {
        const point = getCameraFocusPointByIndex(index);
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          return null;
        }

        const objectId = getObjectIdForIndex(index);
        return {
          index,
          objectId,
          source: textOr(point.source, 'seed'),
          x: rect.left + (point.x / 100) * rect.width,
          y: rect.top + (point.y / 100) * rect.height,
        };
      })
      .filter(Boolean);
  };

  const updateInteractionDataset = () => {
    const hoverObjectId =
      sceneInteraction.hoverIndex >= 0 ? getObjectIdForIndex(sceneInteraction.hoverIndex) : 'none';
    const selectedObjectId =
      sceneInteraction.selectedIndex >= 0
        ? getObjectIdForIndex(sceneInteraction.selectedIndex)
        : 'none';

    wrapper.dataset.raycastReady = sceneInteraction.ready ? '1' : '0';
    wrapper.dataset.raycastSource = textOr(sceneInteraction.source, 'none');
    wrapper.dataset.raycastHover = hoverObjectId;
    wrapper.dataset.raycastSelected = selectedObjectId;
  };

  const emitInteractionEvent = (name, detail = {}) => {
    window.dispatchEvent(
      new CustomEvent(`ronzani:interaction-${name}`, {
        detail,
      })
    );
  };

  const pickInteractionAnchor = (clientX, clientY, options = {}) => {
    if (!sceneInteraction.ready || sceneInteraction.anchors.length === 0) {
      return null;
    }

    const x = toFiniteNumber(clientX);
    const y = toFiniteNumber(clientY);
    if (x === null || y === null) {
      return null;
    }

    const thresholdPx =
      toFiniteNumber(options.thresholdPx) === null
        ? getInteractionThresholdPx()
        : Math.max(8, Number(options.thresholdPx));

    let best = null;
    sceneInteraction.anchors.forEach((anchor) => {
      const distance = Math.hypot(anchor.x - x, anchor.y - y);
      if (distance > thresholdPx) {
        return;
      }

      if (!best || distance < best.distancePx) {
        best = {
          index: anchor.index,
          objectId: anchor.objectId,
          source: anchor.source,
          distancePx: distance,
          thresholdPx,
        };
      }
    });

    return best;
  };

  const applyInteractionHoverIndex = (index, source = 'raycast-pointer') => {
    if (currentState !== APP_STATES.EXPLORE) {
      return false;
    }

    const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : -1;
    if (sceneInteraction.hoverIndex === safeIndex) {
      return safeIndex >= 0;
    }

    sceneInteraction.hoverIndex = safeIndex;
    sceneInteraction.source = source;

    if (safeIndex >= 0) {
      setPeekSelectionByIndex(safeIndex);
      const objectId = getObjectIdForIndex(safeIndex);
      emitInteractionEvent('hover', {
        index: safeIndex,
        objectId,
        source,
      });
    } else {
      clearPeekSelection();
      emitInteractionEvent('hover', {
        index: -1,
        objectId: '',
        source,
      });
    }

    updateInteractionDataset();
    return safeIndex >= 0;
  };

  pickInteractionAtPointer = (clientX, clientY, options = {}) => {
    const pick = pickInteractionAnchor(clientX, clientY, options);
    if (options.updateHover !== false) {
      applyInteractionHoverIndex(
        pick ? pick.index : -1,
        textOr(options.source, 'raycast-pointer')
      );
    }

    return pick;
  };

  selectInteractionAtIndex = (index, source = 'raycast-select', options = {}) => {
    if (mode !== 'desk') {
      return false;
    }

    const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : -1;
    if (safeIndex < 0) {
      return false;
    }

    const objectId = getObjectIdForIndex(safeIndex);
    sceneInteraction.selectedIndex = safeIndex;
    sceneInteraction.source = source;
    updateInteractionDataset();
    emitInteractionEvent('select', {
      index: safeIndex,
      objectId,
      source,
    });
    openPreviewBySelection(safeIndex, objectId, {
      historyMode: options.historyMode || 'push',
    });
    return true;
  };

  refreshInteractionLayer = () => {
    sceneInteraction.enabled = mode === 'desk' && running;
    sceneInteraction.anchors = sceneInteraction.enabled ? buildInteractionAnchors() : [];
    sceneInteraction.ready = sceneInteraction.enabled && sceneInteraction.anchors.length > 0;
    sceneInteraction.source =
      mappingStore.loaded && mappingStore.items.length > 0 ? 'mapping' : 'seed';

    if (!sceneInteraction.ready) {
      sceneInteraction.hoverIndex = -1;
      sceneInteraction.selectedIndex = activeSelectionIndex >= 0 ? activeSelectionIndex : -1;
      updateInteractionDataset();
      return;
    }

    if (activeSelectionIndex >= 0) {
      sceneInteraction.selectedIndex = activeSelectionIndex;
    } else if (currentState === APP_STATES.EXPLORE || currentState === APP_STATES.FALLBACK_2D) {
      sceneInteraction.selectedIndex = -1;
    }

    if (hoverSelectionIndex >= 0) {
      sceneInteraction.hoverIndex = hoverSelectionIndex;
    } else if (currentState !== APP_STATES.EXPLORE) {
      sceneInteraction.hoverIndex = -1;
    }

    updateInteractionDataset();
  };

  getInteractionLayerSnapshot = () => ({
    ready: sceneInteraction.ready,
    enabled: sceneInteraction.enabled,
    source: sceneInteraction.source,
    hoverIndex: sceneInteraction.hoverIndex,
    selectedIndex: sceneInteraction.selectedIndex,
    hoverObjectId:
      sceneInteraction.hoverIndex >= 0 ? getObjectIdForIndex(sceneInteraction.hoverIndex) : '',
    selectedObjectId:
      sceneInteraction.selectedIndex >= 0
        ? getObjectIdForIndex(sceneInteraction.selectedIndex)
        : '',
    anchors: sceneInteraction.anchors.length,
    thresholdPx: getInteractionThresholdPx(),
  });

  if (mode === 'desk') {
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0) {
          return;
        }
        sceneInteraction.pointer.down = true;
        sceneInteraction.pointer.moved = false;
        sceneInteraction.pointer.pointerId = Number.isFinite(event.pointerId)
          ? Number(event.pointerId)
          : null;
        sceneInteraction.pointer.downX = Number(event.clientX) || 0;
        sceneInteraction.pointer.downY = Number(event.clientY) || 0;
        sceneInteraction.pointer.x = sceneInteraction.pointer.downX;
        sceneInteraction.pointer.y = sceneInteraction.pointer.downY;
      },
      { passive: true }
    );

    canvas.addEventListener(
      'pointermove',
      (event) => {
        sceneInteraction.pointer.inside = true;
        const pointerId = Number.isFinite(event.pointerId) ? Number(event.pointerId) : null;
        if (
          sceneInteraction.pointer.down &&
          sceneInteraction.pointer.pointerId !== null &&
          pointerId !== null &&
          sceneInteraction.pointer.pointerId === pointerId
        ) {
          const travel = Math.hypot(
            (Number(event.clientX) || 0) - sceneInteraction.pointer.downX,
            (Number(event.clientY) || 0) - sceneInteraction.pointer.downY
          );
          if (travel > 6) {
            sceneInteraction.pointer.moved = true;
          }
        }

        sceneInteraction.pointer.x = Number(event.clientX) || 0;
        sceneInteraction.pointer.y = Number(event.clientY) || 0;
        pickInteractionAtPointer(sceneInteraction.pointer.x, sceneInteraction.pointer.y, {
          source: 'raycast-pointer',
        });
      },
      { passive: true }
    );

    canvas.addEventListener(
      'pointerleave',
      () => {
        sceneInteraction.pointer.inside = false;
        if (currentState === APP_STATES.EXPLORE) {
          applyInteractionHoverIndex(-1, 'raycast-leave');
        }
      },
      { passive: true }
    );

    canvas.addEventListener(
      'pointerup',
      (event) => {
        const pointerId = Number.isFinite(event.pointerId) ? Number(event.pointerId) : null;
        const samePointer =
          sceneInteraction.pointer.pointerId === null ||
          pointerId === null ||
          sceneInteraction.pointer.pointerId === pointerId;
        if (!samePointer) {
          return;
        }

        const canSelect =
          currentState === APP_STATES.EXPLORE &&
          !sceneInteraction.pointer.moved &&
          !cameraDirector.orbit.dragging;
        sceneInteraction.pointer.down = false;
        sceneInteraction.pointer.pointerId = null;

        if (!canSelect) {
          return;
        }

        const pick = pickInteractionAtPointer(event.clientX, event.clientY, {
          source: 'raycast-pointer-up',
        });
        if (!pick) {
          return;
        }

        selectInteractionAtIndex(pick.index, 'raycast-select', {
          historyMode: 'push',
        });
      },
      { passive: true }
    );

    canvas.addEventListener(
      'pointercancel',
      () => {
        sceneInteraction.pointer.down = false;
        sceneInteraction.pointer.moved = false;
        sceneInteraction.pointer.pointerId = null;
      },
      { passive: true }
    );
  }
  refreshInteractionLayer();

  const drawMenuOverlay = () => {
    if (!menuItems.length) {
      return;
    }

    ctx.save();
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';

    const startX = 32;
    let y = 40;
    menuItems.slice(0, 8).forEach((item) => {
      ctx.fillText(item.title || item.url, startX, y);
      y += 20;
    });

    ctx.restore();
  };

  const updatePoints = (dt, timestamp) => {
    advanceCameraDirector(timestamp);
    const scaledDt = dt * backdropRuntime.speedFactor;
    const cameraLerp =
      currentState === APP_STATES.ARTICLE_OPEN
        ? motionRuntime.cameraLerpArticle
        : currentState === APP_STATES.PREVIEW_OPEN
          ? motionRuntime.cameraLerpPreview
          : motionRuntime.cameraLerpExplore;
    cameraOffsetX += (cameraTargetX - cameraOffsetX) * cameraLerp;
    cameraOffsetY += (cameraTargetY - cameraOffsetY) * cameraLerp;

    points.forEach((point) => {
      point.x += point.vx * scaledDt;
      point.y += point.vy * scaledDt;

      if (point.x < 0 || point.x > 1) {
        point.vx *= -1;
        point.x = Math.max(0, Math.min(1, point.x));
      }

      if (point.y < 0 || point.y > 1) {
        point.vy *= -1;
        point.y = Math.max(0, Math.min(1, point.y));
      }
    });
  };

  const render = () => {
    const pointRadius = backdropRuntime.pointRadius;
    const lineOpacity = backdropRuntime.lineOpacity;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(cameraOffsetX, cameraOffsetY);

    ctx.fillStyle = `rgba(15, 23, 42, ${backdropRuntime.pointAlpha})`;
    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, pointRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    if (backdropRuntime.drawLines) {
      for (let i = 0; i < points.length; i += backdropRuntime.lineStep) {
        for (let j = i + backdropRuntime.lineStep; j < points.length; j += backdropRuntime.lineStep) {
          const dx = (points[i].x - points[j].x) * width;
          const dy = (points[i].y - points[j].y) * height;
          const distance = Math.hypot(dx, dy);
          if (distance < backdropRuntime.linkDistancePx) {
            const alpha = 1 - distance / backdropRuntime.linkDistancePx;
            ctx.strokeStyle = `rgba(15, 23, 42, ${alpha * lineOpacity})`;
            ctx.beginPath();
            ctx.moveTo(points[i].x * width, points[i].y * height);
            ctx.lineTo(points[j].x * width, points[j].y * height);
            ctx.stroke();
          }
        }
      }
    }

    ctx.restore();

    if (backdropRuntime.drawOverlay) {
      drawMenuOverlay();
    }
  };

  const loop = (timestamp) => {
    if (!running) {
      return;
    }

    if (!isDocumentVisible) {
      lastTime = timestamp;
      lastFrameTick = timestamp;
      window.requestAnimationFrame(loop);
      return;
    }

    const frameDeltaMs = timestamp - lastFrameTick;
    if (frameDeltaMs < backdropRuntime.frameBudgetMs) {
      window.requestAnimationFrame(loop);
      return;
    }

    lastFrameTick = timestamp;
    maybeAdjustQualityForFps(timestamp, frameDeltaMs);
    const dt = Math.min(32, timestamp - lastTime) / 1000;
    lastTime = timestamp;

    updatePoints(dt, timestamp);
    render();
    window.requestAnimationFrame(loop);
  };

  window.requestAnimationFrame(loop);
})();
