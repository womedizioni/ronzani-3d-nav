import { test, expect } from "@playwright/test";

const TARGET_URL =
  process.env.R3D_TARGET_URL || "https://ronzanieditore.it/nav-3d-test/";
const REQUIRE_SCENE_READY = process.env.R3D_REQUIRE_SCENE_READY === "1";
const STRICT_QA_GATES = process.env.R3D_STRICT_QA_GATES === "1";

const CORE_QUICK_CHECKS = [
  "menu_links_rendered",
  "desk_hotspots_sync",
  "mapping_loaded",
  "mapping_health_ok",
  "scene_contract_ready",
  "webgl_capability_ready",
  "scene_binding_ready",
  "engine_bootstrap_state",
  "camera_director_ready",
  "camera_travel_ready",
  "camera_orbit_clamp_ok",
  "interaction_layer_ready",
  "interaction_raycast_pick_ready",
  "adaptive_quality_ready",
  "fps_guardrail_state",
  "keyboard_flow_ready",
  "focus_trap_ready",
  "ui_three_levels_ready",
  "deep_link_contract_ready",
  "fallback_html_ready",
];
const ADVANCED_QUICK_CHECKS = [
  "scene_health_ok",
  "scene_model_probe_ready",
  "scene_override_contract_ready",
  "scene_rollout_contract_ready",
  "scene_retry_api_ready",
  "scene_model_loader_ready",
];

const RUNTIME_WAIT_TIMEOUT_MS = 30_000;
const STATE_WAIT_TIMEOUT_MS = 30_000;
const QA_WAIT_TIMEOUT_MS = 30_000;
const QA_POLL_INTERVAL_MS = 250;

const TRANSIENT_QA_CHECK_IDS = new Set([
  "scene_health_loaded",
  "scene_health_ok",
  "scene_model_probe_ready",
  "scene_model_loader_ready",
  "scene_binding_ready",
  "engine_bootstrap_state",
  "mapping_loaded",
  "mapping_health_loaded",
  "mapping_health_ok",
]);

async function dismissBlockingOverlays(page) {
  try {
    await page.evaluate(() => {
      const body = document.body;
      if (body) {
        body.classList.remove("custombox-lock", "modal-open");
        body.style.overflow = "";
      }

      const clickByText = (tagName, pattern) => {
        const nodes = Array.from(document.querySelectorAll(tagName));
        const target = nodes.find((node) => {
          const text = (node.textContent || "").trim();
          return pattern.test(text);
        });
        if (target instanceof HTMLElement) {
          target.click();
          return true;
        }
        return false;
      };

      clickByText("button", /Solo necessari/i);
      clickByText("button", /Accetta tutti/i);
      clickByText("button", /Close this dialog/i);

      const closeSelectors = [
        '[aria-label="Close this dialog"]',
        ".custombox-close",
        ".pys-popup-close",
        ".paoc-close-popup",
        'a[href="javascript:void(0);"]',
      ];
      closeSelectors.forEach((selector) => {
        const el = document.querySelector(selector);
        if (el instanceof HTMLElement) {
          el.click();
        }
      });

      const removeSelectors = [
        ".custombox-overlay",
        ".custombox-modal",
        ".custombox-container",
        ".paoc-popup-overlay",
        ".paoc-popup-modal",
        ".pys-popup",
      ];
      removeSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        });
      });
    });
  } catch (_error) {
    // Ignore overlay cleanup errors; best effort only.
  }

  // Do not send Escape here: it can close preview/article overlays and
  // invalidate deep-link state assertions during smoke checks.
}

async function collectRuntimeDiagnostics(page) {
  return page.evaluate(() => {
    const hasRuntime = Boolean(
      window.RONZANI_3D_NAV_RUNTIME &&
        typeof window.RONZANI_3D_NAV_RUNTIME.runQaChecks === "function"
    );
    const hasRoot = Boolean(document.getElementById("ronzani-3d-nav-root"));
    const heading = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((el) => (el.textContent || "").trim())
      .find((text) => text);
    const bodyPreview = (document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
    const isLikely404 = /oops\./i.test(bodyPreview) || /not found/i.test(bodyPreview);

    return {
      href: window.location.href,
      title: document.title,
      hasRuntime,
      hasRoot,
      isLikely404,
      heading: heading || "n/a",
      bodyPreview,
    };
  });
}

async function openRuntimePage(page, url = TARGET_URL) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await dismissBlockingOverlays(page);
  try {
    await page.waitForFunction(
      () =>
        Boolean(
          window.RONZANI_3D_NAV_RUNTIME &&
            typeof window.RONZANI_3D_NAV_RUNTIME.runQaChecks === "function"
        ),
      null,
      { timeout: RUNTIME_WAIT_TIMEOUT_MS }
    );
  } catch (_error) {
    const info = await collectRuntimeDiagnostics(page);
    throw new Error(
      [
        "Runtime shell not found for smoke tests.",
        `url=${info.href}`,
        `title=${info.title}`,
        `hasRuntime=${info.hasRuntime}, hasRoot=${info.hasRoot}, likely404=${info.isLikely404}`,
        `heading=${info.heading}`,
        `bodyPreview=${info.bodyPreview}`,
        "Hint: set R3D_TARGET_URL to the published page containing shortcode [ronzani_3d_nav].",
      ].join("\n")
    );
  }
}

async function waitForRuntimeState(page, targetState) {
  const deadline = Date.now() + STATE_WAIT_TIMEOUT_MS;
  let lastState = "unknown";

  while (Date.now() < deadline) {
    await dismissBlockingOverlays(page);
    const snapshot = await page.evaluate((state) => {
      const runtime = window.RONZANI_3D_NAV_RUNTIME;
      const current =
        runtime && typeof runtime.getState === "function"
          ? runtime.getState()
          : "runtime-missing";
      return { ok: current === state, current };
    }, targetState);

    lastState = snapshot.current;
    if (snapshot.ok) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(
    `Timeout waiting for state=${targetState}. lastState=${lastState}. url=${page.url()}`
  );
}

function checkById(report, id) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  return checks.find((item) => item && item.id === id) || null;
}

function getFailedChecks(report) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  return checks.filter((item) => item && item.pass === false);
}

function isTransientQaFailure(check) {
  if (!check || check.pass !== false) {
    return false;
  }

  const id = typeof check.id === "string" ? check.id : "";
  const details =
    typeof check.details === "string" ? check.details.toLowerCase() : "";

  if (!TRANSIENT_QA_CHECK_IDS.has(id)) {
    return false;
  }

  if (details.includes("pending")) {
    return true;
  }

  if (id === "scene_model_loader_ready" && details.includes("state=idle")) {
    return true;
  }

  if (id === "scene_model_probe_ready" && details.includes("checked=0")) {
    return true;
  }

  if (
    id === "scene_binding_ready" &&
    details.includes("enabled=1") &&
    details.includes("status=ok") &&
    !details.includes("missing=0,extra=0")
  ) {
    return true;
  }

  return false;
}

async function waitForStableQaReport(page) {
  const deadline = Date.now() + QA_WAIT_TIMEOUT_MS;
  let lastReport = null;

  while (Date.now() < deadline) {
    await dismissBlockingOverlays(page);
    const report = await page.evaluate(() =>
      window.RONZANI_3D_NAV_RUNTIME.runQaChecks()
    );
    lastReport = report;

    const failedChecks = getFailedChecks(report);
    if (report?.summary?.ok === true && failedChecks.length === 0) {
      return report;
    }

    const transientOnly =
      failedChecks.length > 0 && failedChecks.every(isTransientQaFailure);
    if (!transientOnly) {
      return report;
    }

    await page.waitForTimeout(QA_POLL_INTERVAL_MS);
  }

  return lastReport;
}

async function waitForEngineBootstrapReady(page) {
  const deadline = Date.now() + STATE_WAIT_TIMEOUT_MS;
  let lastSnapshot = { enabled: "0", state: "unset", reason: "unset" };

  while (Date.now() < deadline) {
    await dismissBlockingOverlays(page);
    const snapshot = await page.evaluate(() => {
      const wrap = document.querySelector(".ronzani-3d-nav-wrap");
      if (!(wrap instanceof HTMLElement)) {
        return { enabled: "0", state: "missing-wrap", reason: "missing-wrap" };
      }

      return {
        enabled: wrap.dataset.sceneEffectiveEnabled || "0",
        state: wrap.dataset.engineBootstrap || "unset",
        reason: wrap.dataset.engineReason || "unset",
      };
    });

    lastSnapshot = snapshot;
    if (snapshot.enabled === "1" && snapshot.state === "ready") {
      return snapshot;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(
    `Timeout waiting engine bootstrap ready. enabled=${lastSnapshot.enabled}, state=${lastSnapshot.state}, reason=${lastSnapshot.reason}, url=${page.url()}`
  );
}

async function waitForRaycastTargets(page, minCount = 5) {
  const deadline = Date.now() + STATE_WAIT_TIMEOUT_MS;
  let lastCount = 0;
  let lastRuntimeState = "unknown";

  while (Date.now() < deadline) {
    await dismissBlockingOverlays(page);
    const snapshot = await page.evaluate((required) => {
      const runtime = window.RONZANI_3D_NAV_RUNTIME;
      if (!runtime || typeof runtime.getMapping !== "function") {
        return { ready: false, count: 0, state: "runtime-missing" };
      }

      const mapping = runtime.getMapping();
      const items = Array.isArray(mapping)
        ? mapping
        : Array.isArray(mapping?.items)
          ? mapping.items
          : [];
      const validTargets = items.filter(
        (item) =>
          item &&
          typeof item.object_id === "string" &&
          item.object_id.trim() !== ""
      );
      const state =
        typeof runtime.getState === "function" ? runtime.getState() : "unknown";

      return {
        ready: validTargets.length >= required,
        count: validTargets.length,
        state,
      };
    }, minCount);

    lastCount = Number.isFinite(snapshot.count) ? snapshot.count : 0;
    lastRuntimeState = typeof snapshot.state === "string" ? snapshot.state : "unknown";
    if (snapshot.ready) {
      return snapshot;
    }

    await page.waitForTimeout(QA_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timeout waiting raycast targets. count=${lastCount}, required=${minCount}, state=${lastRuntimeState}, url=${page.url()}`
  );
}

async function clearDeepLinkReliably(page) {
  return page.evaluate(async () => {
    const removeDeepLinkFromUrl = () => {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("r3d_object");
      currentUrl.searchParams.delete("r3d_view");
      const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      window.history.replaceState({}, "", nextUrl);
    };

    const hasDeepLink = () => {
      const currentUrl = new URL(window.location.href);
      return Boolean(currentUrl.searchParams.get("r3d_object"));
    };

    const runtime = window.RONZANI_3D_NAV_RUNTIME;
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (runtime && typeof runtime.clearDeepLink === "function") {
        runtime.clearDeepLink({ historyMode: "replace" });
      }

      if (!hasDeepLink()) {
        return { mode: "runtime", deepLinkPresent: false };
      }

      await wait(120);
    }

    removeDeepLinkFromUrl();
    return { mode: "manual-fallback", deepLinkPresent: hasDeepLink() };
  });
}

test.describe("Ronzani 3D Nav smoke", () => {
  test("quick checks pass and include release gates", async ({ page }) => {
    await openRuntimePage(page);

    if (REQUIRE_SCENE_READY) {
      await waitForEngineBootstrapReady(page);
    }

    const report = await waitForStableQaReport(page);
    const availableCheckIds = Array.isArray(report?.checks)
      ? report.checks
          .map((check) => (check && typeof check.id === "string" ? check.id : ""))
          .filter((id) => id !== "")
      : [];

    const failedChecks = getFailedChecks(report).map(
      (check) => `${check.id}:${check.details || "n/a"}`
    );
    expect(report?.summary?.ok, `failed QA checks -> ${failedChecks.join(" | ")}`).toBe(
      true
    );
    for (const id of CORE_QUICK_CHECKS) {
      const check = checkById(report, id);
      expect(
        check,
        `missing QA check: ${id} | available: ${availableCheckIds.join(",")}`
      ).toBeTruthy();
      expect(check.pass, `failed QA check: ${id}`).toBe(true);
    }

    for (const id of ADVANCED_QUICK_CHECKS) {
      const check = checkById(report, id);
      if (STRICT_QA_GATES) {
        expect(
          check,
          `missing strict QA check: ${id} | available: ${availableCheckIds.join(",")}`
        ).toBeTruthy();
        expect(check.pass, `failed strict QA check: ${id}`).toBe(true);
        continue;
      }

      if (check) {
        expect(check.pass, `failed optional QA check: ${id}`).toBe(true);
      }
    }

    if (REQUIRE_SCENE_READY) {
      const engineCheck = checkById(report, "engine_bootstrap_state");
      expect(engineCheck).toBeTruthy();
      expect(engineCheck.pass).toBe(true);
      expect(engineCheck.details).toContain("enabled=1,state=ready");
    }
  });

  test("qa flow opens preview, article and clears deep link", async ({ page }) => {
    await openRuntimePage(page);
    let flow = await page.evaluate(() =>
      window.RONZANI_3D_NAV_RUNTIME.runQaFlow()
    );

    const firstFailedChecks = getFailedChecks(flow);
    const shouldRetryForDeepLinkReset =
      firstFailedChecks.length === 1 &&
      firstFailedChecks[0].id === "qa_flow_reset_explore" &&
      String(firstFailedChecks[0].details || "").includes("deep-link-present");

    if (shouldRetryForDeepLinkReset) {
      await clearDeepLinkReliably(page);
      await waitForRuntimeState(page, "explore");
      flow = await page.evaluate(() =>
        window.RONZANI_3D_NAV_RUNTIME.runQaFlow()
      );
    }

    const failedFlowChecks = getFailedChecks(flow).map(
      (check) => `${check.id}:${check.details || "n/a"}`
    );
    expect(
      flow?.summary?.ok,
      `failed flow checks -> ${failedFlowChecks.join(" | ")}`
    ).toBe(true);
    expect(flow?.summary?.passed).toBe(flow?.summary?.total);
    expect(checkById(flow, "qa_flow_preview_state")?.pass).toBe(true);
    expect(checkById(flow, "qa_flow_article_state")?.pass).toBe(true);
    expect(checkById(flow, "qa_flow_reset_explore")?.pass).toBe(true);
  });

  test("deep link contract restores preview/article state on reload", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openRuntimePage(page);

    await page.evaluate(() =>
      window.RONZANI_3D_NAV_RUNTIME.setDeepLink(
        { objectId: "gutenberg_press_01", view: "preview" },
        { historyMode: "replace" }
      )
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await openRuntimePage(page, page.url());
    await waitForRuntimeState(page, "preview_open");

    await page.evaluate(() =>
      window.RONZANI_3D_NAV_RUNTIME.setDeepLink(
        { objectId: "gutenberg_press_01", view: "article" },
        { historyMode: "replace" }
      )
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await openRuntimePage(page, page.url());
    await waitForRuntimeState(page, "article_open");

    const clearResult = await clearDeepLinkReliably(page);
    expect(clearResult.deepLinkPresent).toBe(false);
    if (STRICT_QA_GATES) {
      expect(clearResult.mode).toBe("runtime");
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await openRuntimePage(page, page.url());
    await waitForRuntimeState(page, "explore");
  });

  test("raycast select opens preview for 5 seed objects", async ({ page }) => {
    test.skip(
      !REQUIRE_SCENE_READY,
      "Set R3D_REQUIRE_SCENE_READY=1 to enforce raycast gate on real scene."
    );

    await openRuntimePage(page);
    await waitForEngineBootstrapReady(page);
    await waitForRaycastTargets(page, 5);

    const result = await page.evaluate(async () => {
      const runtime = window.RONZANI_3D_NAV_RUNTIME;
      if (!runtime || typeof runtime.getMapping !== "function") {
        return { error: "runtime-missing", count: 0, checks: [] };
      }

      const mapping = runtime.getMapping();
      const items = Array.isArray(mapping)
        ? mapping
        : Array.isArray(mapping?.items)
          ? mapping.items
          : [];
      const targets = items
        .filter((item) => item && typeof item.object_id === "string" && item.object_id !== "")
        .slice(0, 5);
      const checks = [];

      const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
      for (const target of targets) {
        window.dispatchEvent(
          new CustomEvent("ronzani:raycast-select", {
            detail: {
              objectId: target.object_id,
              source: "smoke-raycast",
              historyMode: "replace",
            },
          })
        );

        await wait(220);
        const state = typeof runtime.getState === "function" ? runtime.getState() : "unknown";
        const deepLink =
          typeof runtime.getDeepLink === "function" ? runtime.getDeepLink() : null;
        checks.push({
          objectId: target.object_id,
          state,
          deepObjectId: deepLink && deepLink.objectId ? deepLink.objectId : null,
          deepView: deepLink && deepLink.view ? deepLink.view : null,
        });
      }

      if (typeof runtime.clearDeepLink === "function") {
        runtime.clearDeepLink({ historyMode: "replace" });
      }

      return { error: null, count: targets.length, checks };
    });

    expect(result.error).toBeNull();
    expect(result.count).toBe(5);
    for (const check of result.checks) {
      expect(check.state, `raycast state for ${check.objectId}`).toBe("preview_open");
      expect(check.deepObjectId, `raycast object for ${check.objectId}`).toBe(check.objectId);
      expect(check.deepView, `raycast view for ${check.objectId}`).toBe("preview");
    }
  });
});

test.describe("Reduced motion fallback", () => {
  test.use({ reducedMotion: "reduce" });

  test("uses html fallback path when reduced motion is enabled", async ({ page }) => {
    await page.addInitScript(() => {
      const originalMatchMedia = window.matchMedia
        ? window.matchMedia.bind(window)
        : null;
      window.matchMedia = (query) => {
        if (query === "(prefers-reduced-motion: reduce)") {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          };
        }

        if (originalMatchMedia) {
          return originalMatchMedia(query);
        }

        return {
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        };
      };
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openRuntimePage(page);
    await waitForRuntimeState(page, "fallback_2d");

    const result = await page.evaluate(() => {
      const runtime = window.RONZANI_3D_NAV_RUNTIME;
      const a11y = runtime.getAccessibilityState();
      const root = document.getElementById("ronzani-3d-nav-root");
      const rootDisplay = root ? window.getComputedStyle(root).display : "missing";
      const report = runtime.runQaChecks();
      return { a11y, rootDisplay, report };
    });

    expect(result.a11y?.reducedMotion).toBe(true);
    expect(result.a11y?.fallbackHtml).toBe(true);
    expect(result.rootDisplay).toBe("none");
    expect(checkById(result.report, "reduced_motion_fallback_ready")?.pass).toBe(true);
    expect(checkById(result.report, "fallback_html_ready")?.pass).toBe(true);
  });
});
