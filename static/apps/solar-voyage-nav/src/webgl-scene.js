import * as THREE from "../vendor/three.module.js";

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const ARRIVAL_LOCK_START = 0.72;
const ARRIVAL_LOCK_END = 0.84;

export function createSolarScene({ canvas, bodies, visuals, getBodyPosition }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x010203, 1);
  canvas.dataset.renderer = "three-webgl";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010203);
  scene.fog = new THREE.FogExp2(0x010203, 0.00035);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 2600);
  camera.position.set(0, 230, 520);
  const navigationFill = new THREE.PointLight(0xd8eef5, 48, 180, 1.4);
  navigationFill.position.set(0, 2, 4);
  camera.add(navigationFill);
  scene.add(camera);

  const systemGroup = new THREE.Group();
  const orbitGroup = new THREE.Group();
  const routeGroup = new THREE.Group();
  scene.add(systemGroup, orbitGroup, routeGroup);

  scene.add(new THREE.HemisphereLight(0xa8bfd0, 0x130b07, 0.7));
  scene.add(new THREE.AmbientLight(0x33404b, 0.72));
  const sunlight = new THREE.PointLight(0xffca78, 1200, 0, 1);
  scene.add(sunlight);

  const glowTexture = createGlowTexture();
  const ringTexture = createRingTexture();
  const starfield = createStarfield();
  const oortCloud = createOortCloud();
  const cockpitStreaks = createCockpitStreaks();
  camera.add(cockpitStreaks.lines);
  scene.add(starfield, oortCloud.group);

  const textureLoader = new THREE.TextureLoader();
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const bodyEntries = new Map();
  const pickMeshes = [];
  const orbitEntries = [];
  const labelLayer = createLabelLayer(canvas);

  for (const body of bodies) {
    const visual = visuals[body.id] || {};
    const entry = createBody(body, visual, textureLoader, anisotropy, glowTexture, ringTexture);
    bodyEntries.set(body.id, entry);
    systemGroup.add(entry.group);
    pickMeshes.push(entry.surface);

    const label = createBodyLabel(body);
    labelLayer.appendChild(label);
    entry.label = label;

    if (body.orbitRadius) {
      const orbit = createOrbit(body);
      orbitGroup.add(orbit.line);
      orbitEntries.push(orbit);
    }
  }

  const routeState = createRouteState(glowTexture);
  routeGroup.add(routeState.tube, routeState.glowLine, routeState.flowGroup, routeState.ship, routeState.gates);
  const surfaceStage = createSurfaceStage(glowTexture, textureLoader, anisotropy);
  scene.add(surfaceStage.group);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const currentTarget = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  let width = 1;
  let height = 1;
  let routeCurve = null;
  let routeGeometryKey = "";
  let lastFrame = null;

  function resize(nextWidth, nextHeight, dpr) {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    renderer.setPixelRatio(Math.min(dpr || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(frame) {
    lastFrame = frame;
    updateBodies(frame);
    updateOrbits(frame);
    updateRoute(frame);
    updateSurfaceStage(frame);
    updateOortCloud(frame);
    updateCamera(frame);
    updateSurfaceBackdrop();
    updateCockpitStreaks(frame, cockpitStreaks, Boolean(resolveSurfacePhase(frame)));
    updateLabels(frame);
    starfield.rotation.y = frame.sceneTime * 0.003;
    starfield.rotation.x = Math.sin(frame.sceneTime * 0.025) * 0.018;
    renderer.render(scene, camera);
  }

  function resolveBodyPosition(frame, bodyId) {
    const routePoints = frame.routePoints || [];
    const missionAnchored =
      frame.state.viewMode === "cockpit" && frame.state.missionRoute && routePoints.length > 1;
    if (missionAnchored && bodyId === frame.state.origin) return routePoints[0];
    if (missionAnchored && bodyId === frame.state.destination) return routePoints[routePoints.length - 1];
    return getBodyPosition(bodyId, frame.ephemerisDay ?? frame.state.day);
  }

  function updateBodyFocus(entry, focused) {
    entry.group.traverse((object) => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.userData.defaultDepthTest === undefined) {
          material.userData.defaultDepthTest = material.depthTest;
        }
        material.depthTest = focused ? false : material.userData.defaultDepthTest;
      }
      object.renderOrder = focused ? 20 : 0;
    });
  }

  function updateSurfaceStage(frame) {
    const phase = resolveSurfacePhase(frame);
    const surfaceActive = Boolean(phase);
    const surfaceIsolation = !phase
      ? 0
      : phase.mode === "launch"
        ? 1 - THREE.MathUtils.smoothstep(phase.progress, 0.76, 1)
        : THREE.MathUtils.smoothstep(phase.progress, 0.02, 0.2);
    const isolateLandscape = surfaceIsolation > 0.02;
    surfaceStage.group.visible = surfaceActive;
    systemGroup.visible = !isolateLandscape;
    orbitGroup.visible = !isolateLandscape;
    routeGroup.visible = !isolateLandscape;
    oortCloud.group.visible = !isolateLandscape;
    if (!phase) {
      scene.fog.color.setHex(0x010203);
      scene.fog.density = 0.00035;
      return;
    }

    const bodyId = phase.mode === "launch" ? frame.state.origin : frame.state.destination;
    const entry = bodyEntries.get(bodyId);
    if (!entry) return;
    configureSurfaceStage(surfaceStage, entry.body, visuals[bodyId] || {});
    scene.fog.color.setHex(surfaceStage.preset.haze);
    scene.fog.density = surfaceStage.preset.clouds
      ? 0.003
      : surfaceStage.preset.ice
        ? 0.00105
        : 0.00072;
    const bodyPosition = resolveBodyPosition(frame, bodyId);
    surfaceStage.group.position.set(
      bodyPosition.x,
      bodyPosition.y + entry.displayRadius + (surfaceStage.preset.platform ? 1.8 : 0.12),
      bodyPosition.z,
    );

    const eased = smootherstep(phase.progress);
    if (phase.mode === "launch") {
      surfaceStage.ship.position.set(eased * 7, 2.5 + eased * 48, -eased * 9);
      surfaceStage.ship.rotation.z = -eased * 0.08;
      surfaceStage.ship.rotation.x = eased * 0.04;
      surfaceStage.landingGear.visible = phase.progress < 0.24;
      setSurfaceOpacity(surfaceStage, 1 - THREE.MathUtils.smoothstep(phase.progress, 0.76, 1));
    } else {
      const descent = 1 - eased;
      surfaceStage.ship.position.set(descent * 8, 2.45 + descent * 50, -descent * 10);
      surfaceStage.ship.rotation.z = Math.sin(phase.progress * Math.PI) * 0.055;
      surfaceStage.ship.rotation.x = -descent * 0.045;
      surfaceStage.landingGear.visible = phase.progress > 0.68;
      setSurfaceOpacity(surfaceStage, THREE.MathUtils.smoothstep(phase.progress, 0.02, 0.2));
    }

    const thrust = phase.mode === "launch" ? 1 - phase.progress * 0.28 : 0.3 + (1 - phase.progress) * 0.42;
    surfaceStage.exhaust.scale.y = 0.7 + thrust * (1.8 + Math.sin(frame.sceneTime * 18) * 0.16);
    surfaceStage.exhaust.material.opacity = (0.42 + thrust * 0.45) * surfaceStage.opacity;
    surfaceStage.ship.rotation.y = Math.sin(frame.sceneTime * 0.34) * 0.025;
    surfaceStage.padRing.rotation.z = frame.sceneTime * 0.08;
    surfaceStage.beaconRing.rotation.z = -frame.sceneTime * 0.11;
    surfaceStage.dust.rotation.y = frame.sceneTime * 0.025;
    surfaceStage.cloudLayers.forEach((layer, index) => {
      layer.position.x = Math.sin(frame.sceneTime * (0.025 + index * 0.006) + index) * 8;
      layer.rotation.z = frame.sceneTime * (index % 2 ? -0.008 : 0.006);
    });
  }

  function resolveSurfacePhase(frame) {
    if (frame.state.viewMode !== "cockpit" || !frame.state.missionRoute) return null;
    const activeBodyId = !frame.state.launchSequenceComplete ? frame.state.origin : frame.state.destination;
    if (!hasSurfaceLandscape(activeBodyId)) return null;
    if (!frame.state.launchSequenceComplete) {
      return { mode: "launch", progress: THREE.MathUtils.clamp(frame.state.launchSequenceProgress || 0, 0, 1) };
    }
    if (frame.state.landingSequenceActive || frame.state.routeProgress >= 1) {
      return {
        mode: "landing",
        progress: frame.state.routeProgress >= 1 ? 1 : THREE.MathUtils.clamp(frame.state.landingSequenceProgress || 0, 0, 1),
      };
    }
    return null;
  }

  function updateSurfaceBackdrop() {
    if (!surfaceStage.group.visible || !surfaceStage.backdrop.visible) return;
    const localCamera = camera.position.clone().sub(surfaceStage.group.position);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    surfaceStage.backdrop.position.copy(localCamera).addScaledVector(forward, 118);
    surfaceStage.backdrop.quaternion.copy(camera.quaternion);
  }

  function updateOortCloud(frame) {
    const arriving = frame.state.destination === "oort" && frame.state.viewMode === "cockpit";
    const progress = arriving ? resolveCockpitProgress(frame) : 0;
    oortCloud.group.rotation.y = frame.sceneTime * 0.0012;
    oortCloud.group.rotation.x = Math.sin(frame.sceneTime * 0.006) * 0.025;
    oortCloud.points.material.opacity = arriving ? 0.42 + progress * 0.38 : 0.34;
    oortCloud.comets.material.opacity = arriving ? 0.28 + progress * 0.34 : 0.16;
    for (const boundary of oortCloud.boundaries) {
      boundary.material.opacity = arriving ? 0.2 + progress * 0.18 : 0.13;
    }
  }

  function pick(clientX, clientY) {
    if (!lastFrame) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickMeshes, false);
    return hits.find((hit) => hit.object.userData.bodyId !== "sun")?.object.userData.bodyId || null;
  }

  function updateBodies(frame) {
    const routeIds = new Set(frame.route.waypoints);
    const followedDestination = frame.state.viewMode === "follow";
    const arrivalIsolation =
      frame.state.viewMode === "cockpit"
        ? THREE.MathUtils.smoothstep(frame.state.routeProgress, ARRIVAL_LOCK_START, 0.94)
        : 0;
    const surfacePhase = resolveSurfacePhase(frame);
    const cockpitView = frame.state.viewMode === "cockpit" && !surfacePhase;
    const departureFocusAmount = cockpitView
      ? 1 - THREE.MathUtils.smoothstep(frame.state.routeProgress, 0.1, 0.18)
      : 0;
    const arrivalFocusAmount = cockpitView
      ? THREE.MathUtils.smoothstep(frame.state.routeProgress, ARRIVAL_LOCK_START, ARRIVAL_LOCK_END)
      : 0;
    const cockpitFocus = departureFocusAmount > 0.001
      ? frame.state.origin
      : arrivalFocusAmount > 0.001
        ? frame.state.destination
        : null;
    const cockpitFocusAmount = cockpitFocus === frame.state.origin ? departureFocusAmount : arrivalFocusAmount;
    const focusEntry = cockpitFocus ? bodyEntries.get(cockpitFocus) : null;
    const focusTargetScale =
      focusEntry && (focusEntry.body.family === "卫星" || focusEntry.body.family === "矮行星") ? 1.34 : 1;
    const focusPositionData = cockpitFocus ? resolveBodyPosition(frame, cockpitFocus) : null;
    const focusPosition = focusPositionData
      ? new THREE.Vector3(focusPositionData.x, focusPositionData.y, focusPositionData.z)
      : null;
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    for (const body of bodies) {
      const entry = bodyEntries.get(body.id);
      const isDestination = body.id === frame.state.destination;
      const isFocus = body.id === cockpitFocus;
      entry.group.visible = !followedDestination || isDestination;
      const backgroundScale = Math.max(0.32, 1 - arrivalIsolation * 0.68);
      const focusScale = body.family === "卫星" || body.family === "矮行星" ? 1.34 : 1;
      const baseScale = isDestination ? 1 : backgroundScale;
      entry.group.scale.setScalar(isFocus ? THREE.MathUtils.lerp(baseScale, focusScale, cockpitFocusAmount) : baseScale);
      const position = resolveBodyPosition(frame, body.id);
      entry.group.position.set(position.x, position.y, position.z);
      if (focusEntry?.body.parent === body.id && focusPosition) {
        const focusRadius = focusEntry.displayRadius * focusTargetScale;
        const backgroundRadius = entry.displayRadius * backgroundScale;
        const separation = (focusRadius + backgroundRadius) * 2.3 + 2.5;
        const backgroundPosition = focusPosition
          .clone()
          .addScaledVector(cameraRight, -separation)
          .addScaledVector(cameraUp, separation * 0.22)
          .addScaledVector(cameraForward, separation * 0.34);
        entry.group.position.lerp(backgroundPosition, cockpitFocusAmount);
      }
      updateBodyFocus(entry, isFocus && cockpitFocusAmount > 0.04);

      const visual = visuals[body.id] || {};
      const spin = visual.texture?.liveSpin || (body.id === "sun" ? 0.012 : 0.006);
      entry.surface.rotation.y = frame.sceneTime * spin * 8 + (body.phase || 0);
      if (entry.clouds) entry.clouds.rotation.y = entry.surface.rotation.y * 1.08 + 0.2;

      const selected = body.id === frame.state.selectedBody || routeIds.has(body.id);
      entry.halo.visible =
        body.id === "sun" ||
        (selected && !["cockpit", "destination", "follow"].includes(frame.state.viewMode));
      if (selected) {
        const pulse = 1 + Math.sin(frame.sceneTime * 2.2 + body.priority) * 0.06;
        entry.halo.scale.setScalar(entry.displayRadius * 4.3 * pulse);
        entry.halo.material.opacity = routeIds.has(body.id) ? 0.72 : 0.46;
      }

      if (entry.atmosphere) {
        entry.atmosphere.material.opacity = body.id === frame.state.destination ? 0.19 : 0.1;
      }
    }
  }

  function updateOrbits(frame) {
    const ephemerisDay = frame.ephemerisDay ?? frame.state.day;
    for (const orbit of orbitEntries) {
      const parent = orbit.body.parent ? getBodyPosition(orbit.body.parent, ephemerisDay) : { x: 0, y: 0, z: 0 };
      orbit.line.position.set(parent.x, parent.y, parent.z);
      const active = orbit.body.id === frame.state.origin || orbit.body.id === frame.state.destination;
      orbit.line.material.color.set(active ? 0xf1b75c : 0xa9b7bd);
      orbit.line.material.opacity = frame.state.layers.orbits ? (active ? 0.42 : 0.13) : 0;
      orbit.line.visible = frame.state.layers.orbits && !["cockpit", "follow"].includes(frame.state.viewMode);
    }
  }

  function updateRoute(frame) {
    const vectors = frame.routePoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    if (vectors.length < 2) {
      routeGroup.visible = false;
      routeCurve = null;
      return;
    }
    routeGroup.visible = true;
    routeCurve = new THREE.CatmullRomCurve3(vectors, false, "centripetal", 0.35);
    const closeView = frame.state.viewMode === "destination" || frame.state.viewMode === "follow";
    const cockpitView = frame.state.viewMode === "cockpit";
    routeState.tube.visible = !closeView && !cockpitView;
    routeState.glowLine.visible = !closeView && !cockpitView;
    routeState.flowGroup.visible = !closeView && !cockpitView;

    const routeKey = `${frame.route.waypoints.join("-")}:${Math.floor(frame.state.day / 2)}`;
    if (routeKey !== routeGeometryKey) {
      routeGeometryKey = routeKey;
      const tubeGeometry = new THREE.TubeGeometry(routeCurve, Math.max(72, vectors.length), 0.52, 7, false);
      routeState.tube.geometry.dispose();
      routeState.tube.geometry = tubeGeometry;
    }

    const routePositions = routeState.glowLine.geometry.attributes.position;
    for (let index = 0; index < vectors.length; index += 1) {
      routePositions.setXYZ(index, vectors[index].x, vectors[index].y, vectors[index].z);
    }
    routeState.glowLine.geometry.setDrawRange(0, vectors.length);
    routePositions.needsUpdate = true;
    routeState.glowLine.geometry.computeBoundingSphere();
    const vehicleColor = new THREE.Color(frame.vehicle.accent);
    routeState.tube.material.color.copy(vehicleColor);
    routeState.tube.material.opacity = frame.state.viewMode === "route" ? 0.9 : 0.7;
    routeState.glowLine.material.color.copy(vehicleColor);

    for (let index = 0; index < routeState.flow.length; index += 1) {
      const sprite = routeState.flow[index];
      const progress = wrap(frame.sceneTime * 0.085 + index / routeState.flow.length);
      const point = routeCurve.getPointAt(progress);
      sprite.position.copy(point);
      const pulse = 1.8 + Math.sin(frame.sceneTime * 3 + index) * 0.35;
      sprite.scale.setScalar(pulse);
      sprite.material.color.set(index % 3 === 0 ? 0xf1b75c : vehicleColor);
    }

    const shipVisible = frame.state.missionActive || frame.state.routeProgress > 0;
    routeState.ship.visible = shipVisible && frame.state.viewMode !== "cockpit" && !closeView;
    if (shipVisible) {
      const progress = THREE.MathUtils.clamp(frame.state.routeProgress, 0, 0.9999);
      const point = routeCurve.getPointAt(progress);
      const tangent = routeCurve.getTangentAt(progress).normalize();
      routeState.ship.position.copy(point);
      routeState.ship.quaternion.setFromUnitVectors(UP, tangent);
      routeState.shipMaterial.color.copy(vehicleColor);
    }

    updateRouteGates(frame);
  }

  function updateRouteGates(frame) {
    const cockpit = frame.state.viewMode === "cockpit" && routeCurve && !resolveSurfacePhase(frame);
    routeState.gates.visible = Boolean(cockpit);
    if (!cockpit) return;

    const baseProgress = resolveCockpitProgress(frame);
    const captureFade = 1 - THREE.MathUtils.smoothstep(baseProgress, 0.5, 0.68);
    const start = routeCurve.getPointAt(baseProgress);
    const destinationPosition = resolveBodyPosition(frame, frame.state.destination);
    const destination = new THREE.Vector3(destinationPosition.x, destinationPosition.y, destinationPosition.z);
    const direction = destination.clone().sub(start).normalize();
    for (let index = 0; index < routeState.gateMeshes.length; index += 1) {
      const gate = routeState.gateMeshes[index];
      const progress = 0.2 + index * 0.105;
      const point = new THREE.Vector3().lerpVectors(start, destination, progress);
      gate.position.copy(point);
      gate.quaternion.setFromUnitVectors(FORWARD, direction);
      const scale = 1.7 + index * 0.18;
      gate.scale.setScalar(scale);
      gate.material.opacity = (0.18 - index * 0.014) * captureFade;
      gate.rotation.z = frame.sceneTime * 0.08 + index * 0.31;
    }
  }

  function updateCamera(frame) {
    const surfacePhase = resolveSurfacePhase(frame);
    if (surfacePhase && routeCurve) {
      updateSurfaceCamera(frame, surfacePhase);
      return;
    }
    if (frame.state.viewMode === "cockpit" && routeCurve) {
      updateCockpitCamera(frame);
      return;
    }
    if (frame.state.viewMode === "follow") {
      updateBodyFollowCamera(frame);
      return;
    }

    resolveTarget(frame, desiredTarget);
    const targetAmount = 1 - Math.exp(-frame.dt * 5.5);
    currentTarget.lerp(desiredTarget, targetAmount);

    const yaw = frame.state.camera.yaw;
    const pitch = frame.state.camera.pitch;
    const cosPitch = Math.cos(pitch);
    const direction = new THREE.Vector3(
      Math.sin(yaw) * cosPitch,
      Math.sin(pitch),
      Math.cos(yaw) * cosPitch,
    );

    let distance;
    if (frame.state.viewMode === "destination") {
      const destinationEntry = bodyEntries.get(frame.state.destination);
      const destinationBody = destinationEntry?.body;
      const closeupDistance = destinationBody?.ringed
        ? destinationEntry.displayRadius * 6.8
        : ["jupiter", "saturn", "uranus", "neptune"].includes(destinationBody?.id)
          ? destinationEntry.displayRadius * 4.7
          : 30;
      distance = closeupDistance * (3.05 / Math.max(frame.state.camera.zoom, 0.5));
    } else if (frame.state.viewMode === "route") {
      distance = 380 / Math.max(frame.state.camera.zoom, 0.5);
    } else {
      distance = 650 / Math.max(frame.state.camera.zoom, 0.5);
    }

    desiredCamera.copy(currentTarget).addScaledVector(direction, distance);
    const cameraAmount = 1 - Math.exp(-frame.dt * 7.2);
    camera.position.lerp(desiredCamera, cameraAmount);
    camera.up.set(0, 1, 0);
    camera.lookAt(currentTarget);
    camera.fov = THREE.MathUtils.lerp(camera.fov, frame.state.viewMode === "destination" ? 36 : 42, cameraAmount);
    camera.updateProjectionMatrix();
  }

  function updateSurfaceCamera(frame, phase) {
    const bodyId = phase.mode === "launch" ? frame.state.origin : frame.state.destination;
    const entry = bodyEntries.get(bodyId);
    if (!entry) return;
    const centerData = resolveBodyPosition(frame, bodyId);
    const center = new THREE.Vector3(centerData.x, centerData.y, centerData.z);
    const surfaceOrigin = center.clone().addScaledVector(
      UP,
      entry.displayRadius + (surfaceStage.preset.platform ? 1.8 : 0.12),
    );
    const shipWorld = surfaceOrigin.clone().add(surfaceStage.ship.position);
    const progress = THREE.MathUtils.clamp(phase.progress, 0, 1);
    const eased = smootherstep(progress);

    if (phase.mode === "launch") {
      const tangent = routeCurve.getTangentAt(0.008).normalize();
      const side = new THREE.Vector3().crossVectors(tangent, UP);
      if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
      else side.normalize();
      const exteriorCamera = surfaceOrigin
        .clone()
        .add(new THREE.Vector3(15 + eased * 5, 7 + eased * 20, 22 + eased * 8));
      const departureCamera = center
        .clone()
        .addScaledVector(tangent, -(entry.displayRadius * 2.7 + 8))
        .addScaledVector(UP, entry.displayRadius * 0.7 + 1.5)
        .addScaledVector(side, entry.displayRadius * 1.25);
      const cockpitBlend = THREE.MathUtils.smoothstep(progress, 0.74, 1);
      desiredCamera.copy(exteriorCamera).lerp(departureCamera, cockpitBlend);
      const exteriorLook = shipWorld.clone().addScaledVector(UP, 0.8 + eased * 2.2);
      const departureLook = center.clone().addScaledVector(UP, entry.displayRadius * 0.12);
      lookTarget.copy(exteriorLook).lerp(departureLook, cockpitBlend);
      const amount = 1 - Math.exp(-frame.dt * 4.8);
      camera.position.lerp(desiredCamera, amount);
      currentTarget.lerp(lookTarget, amount);
      camera.fov = THREE.MathUtils.lerp(camera.fov, THREE.MathUtils.lerp(47, width <= 760 ? 63 : 56, cockpitBlend), amount);
    } else {
      const finalTangent = routeCurve.getTangentAt(0.999).normalize();
      const finalSide = new THREE.Vector3().crossVectors(finalTangent, UP);
      if (finalSide.lengthSq() < 0.0001) finalSide.set(1, 0, 0);
      else finalSide.normalize();
      const arrivalDistance = entry.displayRadius * (entry.body.ringed ? 8.2 : 5.2) + 9;
      const arrivalCamera = center
        .clone()
        .addScaledVector(finalTangent, -arrivalDistance)
        .addScaledVector(UP, entry.displayRadius * 0.72 + 2)
        .addScaledVector(finalSide, entry.displayRadius * 0.9 + 1.8);
      const transitionProgress = 0.82;
      const transitionPoint = routeCurve.getPointAt(transitionProgress);
      const transitionTangent = routeCurve.getTangentAt(transitionProgress).normalize();
      const transitionSide = new THREE.Vector3().crossVectors(transitionTangent, UP);
      if (transitionSide.lengthSq() < 0.0001) transitionSide.copy(finalSide);
      else transitionSide.normalize();
      const transitionRouteCamera = transitionPoint
        .clone()
        .addScaledVector(transitionTangent, -3.4)
        .addScaledVector(UP, 1.25)
        .addScaledVector(transitionSide, 0.35);
      const arrivalStep = THREE.MathUtils.smoothstep(transitionProgress, ARRIVAL_LOCK_START, 0.995);
      const arrivalBlend = arrivalStep * arrivalStep * (3 - 2 * arrivalStep);
      const preLandingCamera = transitionRouteCamera.clone().lerp(arrivalCamera, arrivalBlend);
      const exteriorCamera = surfaceOrigin
        .clone()
        .add(new THREE.Vector3(14 - eased * 2, surfaceStage.ship.position.y + 8 - eased * 4, 25 - eased * 7));
      const exteriorBlend = THREE.MathUtils.smoothstep(progress, 0.02, 0.18);
      desiredCamera.copy(preLandingCamera).lerp(exteriorCamera, exteriorBlend);
      const orbitalLook = center.clone().addScaledVector(UP, entry.displayRadius * 0.15);
      const landingLook = shipWorld.clone().addScaledVector(UP, progress > 0.72 ? 0.8 : -2.4);
      const transitionDistance = transitionPoint.distanceTo(center);
      const transitionLookDistance = Math.min(34, Math.max(4, transitionDistance * 0.72));
      const preLandingLook = transitionPoint
        .clone()
        .addScaledVector(transitionTangent, transitionLookDistance)
        .addScaledVector(UP, 0.4)
        .lerp(orbitalLook, THREE.MathUtils.smoothstep(transitionProgress, ARRIVAL_LOCK_START, ARRIVAL_LOCK_END));
      lookTarget.copy(preLandingLook).lerp(landingLook, exteriorBlend);
      const amount = 1 - Math.exp(-frame.dt * (3.5 + progress * 1.5));
      camera.position.lerp(desiredCamera, amount);
      currentTarget.lerp(lookTarget, amount);
      const cruiseFov = width <= 760 ? 63 : 56;
      const arrivalFov = width <= 760 ? 50 : 42;
      const transitionFov = THREE.MathUtils.lerp(cruiseFov, arrivalFov, arrivalBlend);
      camera.fov = THREE.MathUtils.lerp(camera.fov, THREE.MathUtils.lerp(transitionFov, 48, exteriorBlend), amount);
    }

    camera.up.set(0, 1, 0);
    camera.lookAt(currentTarget);
    camera.updateProjectionMatrix();
  }

  function updateCockpitCamera(frame) {
    const progress = resolveCockpitProgress(frame);
    const point = routeCurve.getPointAt(progress);
    const tangent = routeCurve.getTangentAt(Math.min(progress + 0.002, 0.999)).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, UP);
    if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
    else side.normalize();
    const originRadius = bodyEntries.get(frame.state.origin)?.displayRadius || 2;
    const departureAmount = 1 - THREE.MathUtils.smoothstep(progress, 0.01, 0.11);
    const routeCamera = new THREE.Vector3()
      .copy(point)
      .addScaledVector(tangent, -3.4)
      .addScaledVector(UP, 1.25)
      .addScaledVector(side, 0.35);
    const origin = routeCurve.getPointAt(0);
    const departureCamera = origin
      .clone()
      .addScaledVector(tangent, -(originRadius * 2.7 + 8))
      .addScaledVector(UP, originRadius * 0.7 + 1.5)
      .addScaledVector(side, originRadius * 1.25);
    routeCamera.lerp(departureCamera, departureAmount);

    const destination = routeCurve.getPointAt(1);
    const destinationEntry = bodyEntries.get(frame.state.destination);
    const destinationRadius = destinationEntry?.displayRadius || 2;
    const finalTangent = routeCurve.getTangentAt(0.999).normalize();
    const finalSide = new THREE.Vector3().crossVectors(finalTangent, UP);
    if (finalSide.lengthSq() < 0.0001) finalSide.copy(side);
    else finalSide.normalize();
    const arrivalDistance = destinationRadius * (destinationEntry?.body.ringed ? 8.2 : 5.2) + 9;
    const arrivalCamera = destination
      .clone()
      .addScaledVector(finalTangent, -arrivalDistance)
      .addScaledVector(UP, destinationRadius * 0.72 + 2)
      .addScaledVector(finalSide, destinationRadius * 0.9 + 1.8);
    const arrivalStep = THREE.MathUtils.smoothstep(progress, ARRIVAL_LOCK_START, 0.995);
    const arrivalBlend = arrivalStep * arrivalStep * (3 - 2 * arrivalStep);
    desiredCamera.copy(routeCamera).lerp(arrivalCamera, arrivalBlend);

    const remainingDistance = point.distanceTo(destination);
    const cruiseLookDistance = Math.min(34, Math.max(4, remainingDistance * 0.72));
    lookTarget.copy(point).addScaledVector(tangent, cruiseLookDistance).addScaledVector(UP, 0.4);
    const arrivalTarget = destination.clone().addScaledVector(UP, destinationRadius * 0.06);
    const targetBlend = THREE.MathUtils.smoothstep(progress, ARRIVAL_LOCK_START, ARRIVAL_LOCK_END);
    lookTarget.lerp(arrivalTarget, targetBlend);
    const departureLook = origin.clone().addScaledVector(UP, originRadius * 0.12);
    lookTarget.lerp(departureLook, departureAmount);
    const response = 3.1 + (1 - departureAmount) * 2 - arrivalBlend * 0.7;
    const amount = 1 - Math.exp(-frame.dt * response);
    camera.position.lerp(desiredCamera, amount);
    currentTarget.lerp(lookTarget, amount);
    camera.up.set(0, 1, 0);
    camera.lookAt(currentTarget);
    const cruiseFov = width <= 760 ? 63 : 56;
    const arrivalFov = width <= 760 ? 50 : 42;
    camera.fov = THREE.MathUtils.lerp(camera.fov, THREE.MathUtils.lerp(cruiseFov, arrivalFov, arrivalBlend), amount);
    camera.updateProjectionMatrix();
  }

  function updateBodyFollowCamera(frame) {
    const entry = bodyEntries.get(frame.state.destination);
    if (!entry) return;
    const position = resolveBodyPosition(frame, frame.state.destination);
    const destination = new THREE.Vector3(position.x, position.y, position.z);
    const radius = entry.displayRadius || 2;
    const spinAngle = entry.surface.rotation.y + 0.68;
    const distance = radius * (entry.body.ringed ? 7.2 : 4.8) + 8;
    desiredCamera.set(
      destination.x + Math.sin(spinAngle) * distance,
      destination.y + radius * 0.42 + 1.4,
      destination.z + Math.cos(spinAngle) * distance,
    );
    const amount = 1 - Math.exp(-frame.dt * 4.2);
    camera.position.lerp(desiredCamera, amount);
    currentTarget.lerp(destination, amount);
    camera.up.set(0, 1, 0);
    camera.lookAt(currentTarget);
    camera.fov = THREE.MathUtils.lerp(camera.fov, entry.body.ringed ? 39 : 34, amount);
    camera.updateProjectionMatrix();
  }

  function resolveTarget(frame, target) {
    if (frame.state.viewMode === "destination") {
      const position = getBodyPosition(frame.state.destination, frame.state.day);
      target.set(position.x, position.y, position.z);
      return;
    }
    if (frame.state.viewMode === "route" && frame.routePoints.length) {
      target.set(0, 0, 0);
      for (const point of frame.routePoints) target.add(new THREE.Vector3(point.x, point.y, point.z));
      target.multiplyScalar(1 / frame.routePoints.length);
      return;
    }
    target.set(0, 0, 0);
  }

  function updateLabels(frame) {
    const routeIds = new Set(frame.route.waypoints);
    const candidates = [];
    for (const body of bodies) {
      const entry = bodyEntries.get(body.id);
      const active = routeIds.has(body.id);
      const required = active || body.priority >= 5 || body.id === frame.state.selectedBody;
      if (!frame.state.layers.labels || !required) {
        entry.label.hidden = true;
        continue;
      }
      if (frame.state.viewMode === "cockpit") {
        entry.label.hidden = true;
        continue;
      }
      if (["destination", "follow"].includes(frame.state.viewMode) && body.id === frame.state.destination) {
        entry.label.hidden = true;
        continue;
      }

      const projected = entry.group.position.clone().project(camera);
      const visible = projected.z > -1 && projected.z < 1;
      if (!visible) {
        entry.label.hidden = true;
        continue;
      }
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      if (x < 12 || x > width - 12 || y < 86 || y > height - 72) {
        entry.label.hidden = true;
        continue;
      }
      const routeIndex = frame.route.waypoints.indexOf(body.id);
      const role = routeIndex === 0 ? "出发" : routeIndex === frame.route.waypoints.length - 1 ? "抵达" : "中继";
      entry.label.textContent = active ? `${role} · ${body.name}` : body.name;
      entry.label.classList.toggle("is-route", active);
      entry.label.classList.toggle("is-target", body.id === frame.state.destination);
      candidates.push({ body, entry, x, y, active, priority: active ? 100 + routeIndex : body.priority });
    }

    candidates.sort((a, b) => b.priority - a.priority);
    const occupied = [];
    for (const candidate of candidates) {
      const widthGuess = candidate.entry.label.textContent.length * 12 + 24;
      const offsetY = candidate.active ? (candidate.body.id === frame.state.origin ? 18 : -20) : 0;
      const rect = { x: candidate.x + 12, y: candidate.y - 12 + offsetY, w: widthGuess, h: 25 };
      const overlaps = occupied.some((other) => intersects(rect, other));
      if (overlaps && !candidate.active) {
        candidate.entry.label.hidden = true;
        continue;
      }
      if (overlaps) rect.y += candidate.body.id === frame.state.origin ? 30 : -30;
      occupied.push(rect);
      candidate.entry.label.hidden = false;
      candidate.entry.label.style.transform = `translate3d(${Math.round(rect.x)}px, ${Math.round(rect.y)}px, 0)`;
    }
  }

  return { resize, render, pick, renderer, scene, camera };
}

function createBody(body, visual, textureLoader, anisotropy, glowTexture, ringTexture) {
  const group = new THREE.Group();
  group.name = body.id;
  const giantScale = ["jupiter", "saturn", "uranus", "neptune"].includes(body.id) ? 1.34 : 1.14;
  const displayRadius = body.id === "sun" ? 11.5 : Math.max(body.radius * giantScale, body.family === "卫星" ? 0.82 : 1.3);
  const geometry = body.region
    ? new THREE.DodecahedronGeometry(displayRadius, 2)
    : new THREE.SphereGeometry(displayRadius, body.priority >= 7 ? 96 : 48, body.priority >= 7 ? 64 : 32);
  const material = createBodyMaterial(body, visual);
  const surface = new THREE.Mesh(geometry, material);
  surface.userData.bodyId = body.id;
  surface.rotation.z = body.axialTilt ?? (body.id === "earth" ? 0.41 : body.id === "saturn" ? 0.47 : 0.12);
  if (body.region) surface.scale.set(1.45, 0.72, 1.05);
  group.add(surface);

  if (body.region) {
    const fragmentGeometry = new THREE.DodecahedronGeometry(displayRadius * 0.1, 0);
    const fragmentMaterial = new THREE.MeshStandardMaterial({
      color: 0xc9edf3,
      emissive: 0x315a66,
      emissiveIntensity: 0.7,
      roughness: 0.72,
      metalness: 0,
    });
    const fragments = new THREE.InstancedMesh(fragmentGeometry, fragmentMaterial, 74);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const seed = hashString(body.id);
    for (let index = 0; index < 74; index += 1) {
      const angle = seededUnit(seed + index * 19) * TAU;
      const radius = displayRadius * (2.2 + seededUnit(seed + index * 23) * 8.4);
      position.set(
        Math.cos(angle) * radius,
        (seededUnit(seed + index * 29) - 0.5) * displayRadius * 5,
        Math.sin(angle) * radius,
      );
      rotation.setFromEuler(new THREE.Euler(angle, index * 0.31, index * 0.17));
      const fragmentScale = 0.55 + seededUnit(seed + index * 31) * 2.1;
      scale.set(fragmentScale, fragmentScale * 0.72, fragmentScale * 1.2);
      matrix.compose(position, rotation, scale);
      fragments.setMatrixAt(index, matrix);
    }
    group.add(fragments);
  }

  if (visual.texture?.src) {
    textureLoader.load(
      visual.texture.src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.anisotropy = anisotropy;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.rotation = 0;
        texture.offset.x = visual.texture.offset || 0;
        material.map = texture;
        material.color.set(body.id === "mars" ? 0xd88968 : 0xffffff);
        material.needsUpdate = true;
      },
      undefined,
      () => {},
    );
  } else if (body.id !== "sun") {
    const texture = createProceduralPlanetTexture(body, visual);
    texture.anisotropy = anisotropy;
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  }

  const glowColor = new THREE.Color(visual.glow || visual.haze || body.accent || body.color);
  const atmosphereMaterial = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: body.id === "sun" ? 0.24 : 0.1,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const atmosphere = new THREE.Mesh(geometry.clone(), atmosphereMaterial);
  atmosphere.scale.setScalar(body.id === "sun" ? 1.34 : 1.045);
  group.add(atmosphere);

  let clouds = null;
  if (body.id === "earth") {
    clouds = new THREE.Mesh(
      geometry.clone(),
      new THREE.MeshPhongMaterial({ color: 0xd8eef2, transparent: true, opacity: 0.08, depthWrite: false }),
    );
    clouds.scale.setScalar(1.012);
    group.add(clouds);
  }

  if (body.ringed) {
    const innerScale = body.ringInner || 1.35;
    const outerScale = body.ringOuter || 2.28;
    const planetRingTexture = createPlanetRingTexture(body, visual);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(displayRadius * innerScale, displayRadius * outerScale, 256, 8),
      new THREE.MeshBasicMaterial({
        map: planetRingTexture,
        color: 0xffffff,
        transparent: true,
        opacity: body.id === "uranus" ? 0.62 : 0.92,
        side: THREE.DoubleSide,
        alphaTest: 0.025,
        depthWrite: false,
      }),
    );
    ring.rotation.x = body.id === "uranus" ? 0.5 : Math.PI / 2 - 0.28;
    ring.rotation.z = -0.22;
    ring.renderOrder = 2;
    group.add(ring);
  }

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: body.id === "sun" ? glowTexture : ringTexture,
      color: body.id === "sun" ? 0xffb34b : body.accent,
      transparent: true,
      opacity: body.id === "sun" ? 0.88 : 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: body.id !== "sun",
    }),
  );
  halo.scale.setScalar(body.id === "sun" ? displayRadius * 5.2 : displayRadius * 4.3);
  halo.visible = body.id === "sun";
  group.add(halo);

  return { body, group, surface, atmosphere, clouds, halo, displayRadius, label: null };
}

function createBodyMaterial(body, visual) {
  if (body.id === "sun") {
    return new THREE.MeshBasicMaterial({ color: visual.palette?.[1] || body.color });
  }
  if (body.region) {
    return new THREE.MeshStandardMaterial({
      color: visual.palette?.[0] || body.color,
      roughness: 0.68,
      metalness: 0,
      emissive: 0x477b88,
      emissiveIntensity: 1.15,
      flatShading: true,
    });
  }
  const color = visual.palette?.[0] || body.color;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: visual.kind === "ice" || visual.kind === "iceGiant" ? 0.58 : 0.82,
    metalness: 0,
    emissive: new THREE.Color(body.color).multiplyScalar(0.035),
    emissiveIntensity: 0.45,
  });
}

function createProceduralPlanetTexture(body, visual) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const palette = visual.palette?.length ? visual.palette : [body.color, body.accent, "#ffffff", "#20252b"];
  const base = context.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, palette[2] || palette[0]);
  base.addColorStop(0.32, palette[0]);
  base.addColorStop(0.68, palette[1] || palette[0]);
  base.addColorStop(1, palette[3] || palette[1] || palette[0]);
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const seed = hashString(body.id);
  const banded = ["gas", "iceGiant", "clouded", "haze"].includes(visual.kind);
  if (banded) {
    const bands = visual.bands || 12;
    for (let index = 0; index < bands * 3; index += 1) {
      const y = (index / (bands * 3)) * canvas.height + Math.sin(index * 1.9 + seed) * 8;
      const height = 5 + seededUnit(seed + index * 7) * 22;
      context.fillStyle = colorWithAlpha(palette[index % palette.length], 0.12 + seededUnit(seed + index * 11) * 0.26);
      context.fillRect(0, y, canvas.width, height);
      context.fillStyle = "rgba(255,255,255,0.035)";
      context.fillRect(0, y + height * 0.22, canvas.width, Math.max(1, height * 0.12));
    }
  }

  if (["cratered", "iceRock", "irregular", "twoTone", "volcanic"].includes(visual.kind)) {
    if (visual.kind === "twoTone") {
      const shade = context.createLinearGradient(340, 0, 720, 0);
      shade.addColorStop(0, "rgba(22,20,18,0.68)");
      shade.addColorStop(1, "rgba(22,20,18,0)");
      context.fillStyle = shade;
      context.fillRect(0, 0, 720, canvas.height);
    }
    const craterCount = (visual.craters || 12) * 3;
    for (let index = 0; index < craterCount; index += 1) {
      const x = seededUnit(seed + index * 13 + 1) * canvas.width;
      const y = seededUnit(seed + index * 17 + 2) * canvas.height;
      const radius = 4 + seededUnit(seed + index * 23 + 3) * 31;
      const crater = context.createRadialGradient(x - radius * 0.22, y - radius * 0.25, radius * 0.08, x, y, radius);
      crater.addColorStop(0, "rgba(255,255,255,0.2)");
      crater.addColorStop(0.28, "rgba(255,255,255,0.06)");
      crater.addColorStop(0.62, "rgba(16,15,15,0.34)");
      crater.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = crater;
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fill();
    }
  }

  if (["ice", "iceRock"].includes(visual.kind)) {
    context.lineWidth = 1.5;
    context.strokeStyle = colorWithAlpha(palette[1] || "#8fcddd", 0.42);
    for (let index = 0; index < (visual.cracks || 10); index += 1) {
      const y = seededUnit(seed + index * 19) * canvas.height;
      context.beginPath();
      context.moveTo(0, y);
      for (let step = 1; step <= 8; step += 1) {
        context.lineTo((step / 8) * canvas.width, y + Math.sin(step * 1.7 + index) * (8 + index % 4));
      }
      context.stroke();
    }
  }

  if (visual.kind === "volcanic") {
    for (let index = 0; index < 18; index += 1) {
      const x = seededUnit(seed + index * 29) * canvas.width;
      const y = seededUnit(seed + index * 31) * canvas.height;
      const radius = 4 + seededUnit(seed + index * 37) * 18;
      context.fillStyle = index % 3 ? "rgba(105,65,26,0.52)" : "rgba(255,236,139,0.72)";
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fill();
    }
  }

  for (let index = 0; index < 620; index += 1) {
    const x = seededUnit(seed + index * 41) * canvas.width;
    const y = seededUnit(seed + index * 43) * canvas.height;
    const alpha = 0.018 + seededUnit(seed + index * 47) * 0.055;
    context.fillStyle = index % 2 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    context.fillRect(x, y, 1 + (index % 3), 1 + (index % 2));
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createPlanetRingTexture(body, visual) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  const center = canvas.width / 2;
  const base = visual.ringColor || body.accent || "#d8cfb5";
  const inner = body.id === "uranus" ? 214 : 182;
  const outer = 370;
  const bands = body.id === "uranus" ? 14 : 46;
  for (let index = 0; index < bands; index += 1) {
    const t = index / Math.max(1, bands - 1);
    const radius = inner + (outer - inner) * t;
    const gap = body.id === "saturn" && (index === 19 || index === 20 || index === 33);
    const alpha = gap ? 0.025 : 0.16 + seededUnit(hashString(body.id) + index * 17) * 0.68;
    context.strokeStyle = colorWithAlpha(base, alpha);
    context.lineWidth = body.id === "uranus" ? 2 + (index % 3) : 3 + (index % 5);
    context.beginPath();
    context.arc(center, center, radius, 0, TAU);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function colorWithAlpha(color, alpha) {
  const value = new THREE.Color(color);
  return `rgba(${Math.round(value.r * 255)},${Math.round(value.g * 255)},${Math.round(value.b * 255)},${alpha})`;
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createOrbit(body) {
  const points = [];
  const samples = body.parent === "sun" ? 220 : 120;
  for (let index = 0; index <= samples; index += 1) {
    const angle = (index / samples) * TAU;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * body.orbitRadius,
        Math.sin(angle * 1.7 + (body.phase || 0)) * (body.inclination || 0),
        Math.sin(angle) * body.orbitRadius,
      ),
    );
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0xa9b7bd, transparent: true, opacity: 0.13, depthWrite: false });
  return { body, line: new THREE.LineLoop(geometry, material) };
}

function createRouteState(glowTexture) {
  const routePositions = new Float32Array(256 * 3);
  const emptyGeometry = new THREE.BufferGeometry();
  const routeAttribute = new THREE.BufferAttribute(routePositions, 3);
  routeAttribute.setUsage(THREE.DynamicDrawUsage);
  emptyGeometry.setAttribute("position", routeAttribute);
  emptyGeometry.setDrawRange(0, 2);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.01)), 2, 0.45, 6, false),
    new THREE.MeshBasicMaterial({ color: 0xf1b75c, transparent: true, opacity: 0.74, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const glowLine = new THREE.Line(
    emptyGeometry,
    new THREE.LineBasicMaterial({ color: 0xf1b75c, transparent: true, opacity: 0.44, blending: THREE.AdditiveBlending, depthWrite: false }),
  );

  const flowGroup = new THREE.Group();
  const flow = [];
  for (let index = 0; index < 10; index += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, color: 0xf1b75c, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flow.push(sprite);
    flowGroup.add(sprite);
  }

  const shipMaterial = new THREE.MeshBasicMaterial({ color: 0xf1b75c });
  const ship = createCompactRouteShip(shipMaterial);
  ship.visible = false;

  const gates = new THREE.Group();
  gates.visible = false;
  const gateMeshes = [];
  for (let index = 0; index < 6; index += 1) {
    const gate = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.025, 6, 64),
      new THREE.MeshBasicMaterial({ color: index % 2 ? 0x91c8d1 : 0xf1b75c, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    gateMeshes.push(gate);
    gates.add(gate);
  }

  return { tube, glowLine, flowGroup, flow, ship, shipMaterial, gates, gateMeshes };
}

function createCompactRouteShip(material) {
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), material);
  hull.scale.set(0.82, 1.85, 0.9);
  ship.add(hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.5, 5), material);
  nose.position.y = 1.85;
  ship.add(nose);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 1.25), material);
  wings.position.y = -0.18;
  ship.add(wings);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 2.6), material);
  tail.position.y = -0.72;
  ship.add(tail);
  ship.scale.setScalar(0.86);
  return ship;
}

const SURFACE_PRESETS = {
  mercury: { ground: 0x6e6861, rock: 0xaaa092, haze: 0x181716, accent: 0xcab79c, relief: 2.8 },
  venus: { ground: 0x77502f, rock: 0xc78342, haze: 0x8c5f22, accent: 0xffc567, relief: 3.8, clouds: true },
  earth: { ground: 0x3f6a50, rock: 0x829579, haze: 0x315f78, accent: 0x8de5f2, relief: 2.2, liquid: true, clouds: true },
  moon: { ground: 0x777570, rock: 0xb2ada3, haze: 0x090a0b, accent: 0xd8d4c9, relief: 3.1 },
  mars: { ground: 0x7c3422, rock: 0xb85d38, haze: 0x6c2c1d, accent: 0xff9b63, relief: 3.7 },
  phobos: { ground: 0x4b443d, rock: 0x81756a, haze: 0x09090a, accent: 0xc0ad98, relief: 4.4 },
  deimos: { ground: 0x514a43, rock: 0x8c8175, haze: 0x09090a, accent: 0xc8b9a7, relief: 3.4 },
  ceres: { ground: 0x4b4c4c, rock: 0x8f9190, haze: 0x0b0d0e, accent: 0xc9e3e7, relief: 3.4, ice: true },
  jupiter: { ground: 0x9b6a45, rock: 0xcda173, haze: 0x8e5c38, accent: 0xffd09a, relief: 0.5, clouds: true, platform: true },
  io: { ground: 0x8d6a22, rock: 0xd5b23f, haze: 0x3d260c, accent: 0xffe168, relief: 4.2, lava: true },
  europa: { ground: 0x87959a, rock: 0xc6d4d4, haze: 0x102026, accent: 0xbdf4ff, relief: 1.2, ice: true },
  ganymede: { ground: 0x5f5146, rock: 0x978578, haze: 0x151719, accent: 0xb9d7df, relief: 2.8, ice: true },
  callisto: { ground: 0x463d35, rock: 0x7d6d5d, haze: 0x101112, accent: 0xc4b39d, relief: 3.7 },
  saturn: { ground: 0xb69b72, rock: 0xd8c298, haze: 0x8a7659, accent: 0xffe1a3, relief: 0.4, clouds: true, platform: true },
  enceladus: { ground: 0x9eafb3, rock: 0xd8eef1, haze: 0x183039, accent: 0xc8f7ff, relief: 1.6, ice: true },
  rhea: { ground: 0x777a79, rock: 0xb9bfbd, haze: 0x101516, accent: 0xd7eeee, relief: 2.6, ice: true },
  titan: { ground: 0x695229, rock: 0xaa8140, haze: 0x8d6125, accent: 0xffc45f, relief: 1.4, liquid: true, clouds: true },
  iapetus: { ground: 0x403a34, rock: 0x968d82, haze: 0x0d0e0f, accent: 0xd2c8bb, relief: 4.6 },
  uranus: { ground: 0x548e96, rock: 0x91d7dd, haze: 0x386b75, accent: 0xb7f4f6, relief: 0.35, clouds: true, platform: true },
  miranda: { ground: 0x686e70, rock: 0xaeb9bb, haze: 0x101617, accent: 0xd0f0f2, relief: 4.8, ice: true },
  ariel: { ground: 0x727c7d, rock: 0xb7c8c8, haze: 0x10191b, accent: 0xd2f4f5, relief: 2.9, ice: true },
  titania: { ground: 0x626969, rock: 0xaab4b1, haze: 0x111819, accent: 0xcce9e5, relief: 3.2, ice: true },
  oberon: { ground: 0x514c49, rock: 0x8c8581, haze: 0x101314, accent: 0xc9d8d8, relief: 3.6, ice: true },
  neptune: { ground: 0x31578d, rock: 0x6ea4d8, haze: 0x183b67, accent: 0x88c8ff, relief: 0.45, clouds: true, platform: true },
  triton: { ground: 0x807c79, rock: 0xc0bbba, haze: 0x151d22, accent: 0xcdf2ff, relief: 2.4, ice: true },
  oort: { ground: 0x536a70, rock: 0xa9ced4, haze: 0x102329, accent: 0xc9f6ff, relief: 4.2, ice: true },
};

const SURFACE_BACKDROPS = {
  moon: { src: "./assets/surfaces/nasa/moon-surface.jpg", credit: "NASA/JSC · Apollo 15" },
  mars: { src: "./assets/surfaces/nasa/mars-panorama.jpg", credit: "NASA/JPL-Caltech · Perseverance" },
};

export function hasSurfaceLandscape(bodyId) {
  return Object.prototype.hasOwnProperty.call(SURFACE_PRESETS, bodyId);
}

function createSurfaceStage(glowTexture, textureLoader, anisotropy) {
  const group = new THREE.Group();
  group.visible = false;
  const fadeMaterials = [];
  const register = (material, opacity = material.opacity ?? 1) => {
    material.transparent = true;
    material.userData.surfaceBaseOpacity = opacity;
    material.opacity = opacity;
    fadeMaterials.push(material);
    return material;
  };

  const groundGeometry = new THREE.PlaneGeometry(190, 190, 96, 96);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0x29433a, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide }),
  );
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.receiveShadow = true;
  group.add(ground);

  const liquidMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0x18455b, roughness: 0.28, metalness: 0.08, side: THREE.DoubleSide }),
    0.78,
  );
  const liquid = new THREE.Mesh(new THREE.CircleGeometry(92, 96), liquidMaterial);
  liquid.rotation.x = -Math.PI / 2;
  liquid.position.y = 0.08;
  group.add(liquid);

  const rockMaterial = register(new THREE.MeshStandardMaterial({ color: 0x72846c, roughness: 0.92, metalness: 0.01 }));
  const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 76);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);
  const ridgeMaterial = register(new THREE.MeshStandardMaterial({ color: 0x657465, roughness: 0.96, metalness: 0.01 }));
  const ridgeGeometry = new THREE.DodecahedronGeometry(1, 2);
  const ridges = new THREE.InstancedMesh(ridgeGeometry, ridgeMaterial, 28);
  ridges.castShadow = true;
  ridges.receiveShadow = true;
  group.add(ridges);

  const padMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0x202a2e, emissive: 0x132f38, emissiveIntensity: 0.65, roughness: 0.56, metalness: 0.5 }),
  );
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 8, 0.58, 48), padMaterial);
  pad.position.y = 0.22;
  group.add(pad);
  const padRingMaterial = register(
    new THREE.MeshBasicMaterial({ color: 0x91d9e5, blending: THREE.AdditiveBlending, depthWrite: false }),
    0.78,
  );
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(5.35, 0.08, 8, 96), padRingMaterial);
  padRing.rotation.x = Math.PI / 2;
  padRing.position.y = 0.56;
  group.add(padRing);
  const beaconRingMaterial = register(
    new THREE.MeshBasicMaterial({ color: 0xf1b75c, blending: THREE.AdditiveBlending, depthWrite: false }),
    0.48,
  );
  const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(8.8, 0.035, 6, 96), beaconRingMaterial);
  beaconRing.rotation.x = Math.PI / 2;
  beaconRing.position.y = 0.7;
  group.add(beaconRing);

  const platform = new THREE.Group();
  const platformMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0x26383e, emissive: 0x173943, emissiveIntensity: 0.74, roughness: 0.42, metalness: 0.72 }),
  );
  const platformBase = new THREE.Mesh(new THREE.CylinderGeometry(16, 12, 2.2, 12), platformMaterial);
  platformBase.position.y = -0.8;
  platform.add(platformBase);
  for (let index = 0; index < 4; index += 1) {
    const spar = new THREE.Mesh(new THREE.BoxGeometry(30, 0.35, 1.2), platformMaterial);
    spar.rotation.y = (index / 4) * Math.PI;
    spar.position.y = -0.1;
    platform.add(spar);
  }
  group.add(platform);

  const cloudTexture = createSurfaceCloudTexture();
  const cloudLayers = [];
  for (let index = 0; index < 3; index += 1) {
    const cloudMaterial = register(
      new THREE.MeshBasicMaterial({
        map: cloudTexture,
        color: 0xd8e7e8,
        side: THREE.DoubleSide,
        depthWrite: false,
        alphaTest: 0.012,
      }),
      0.16 - index * 0.035,
    );
    const layer = new THREE.Mesh(new THREE.CircleGeometry(108 - index * 12, 64), cloudMaterial);
    layer.rotation.x = -Math.PI / 2;
    layer.position.y = 10 + index * 9;
    group.add(layer);
    cloudLayers.push(layer);
  }

  const hazeMaterial = register(
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, depthWrite: false, fog: false }),
    0.88,
  );
  const haze = new THREE.Mesh(new THREE.SphereGeometry(138, 48, 28), hazeMaterial);
  haze.scale.y = 0.58;
  haze.position.y = 18;
  group.add(haze);

  const backdropMaterial = register(
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    0.96,
  );
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(220, 108), backdropMaterial);
  backdrop.visible = false;
  backdrop.renderOrder = -5;
  group.add(backdrop);

  const dustPositions = new Float32Array(420 * 3);
  for (let index = 0; index < 420; index += 1) {
    const angle = seededUnit(index * 17 + 3) * TAU;
    const radius = 12 + seededUnit(index * 23 + 9) * 76;
    dustPositions[index * 3] = Math.cos(angle) * radius;
    dustPositions[index * 3 + 1] = 0.7 + seededUnit(index * 31 + 5) * 22;
    dustPositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = register(
    new THREE.PointsMaterial({ color: 0xc5d8d8, size: 0.22, sizeAttenuation: true, depthWrite: false }),
    0.42,
  );
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  group.add(dust);

  const craft = createCinematicShip(glowTexture);
  craft.ship.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  group.add(craft.ship);
  fadeMaterials.push(...craft.fadeMaterials);

  const surfaceLight = new THREE.DirectionalLight(0xffe7c4, 3.8);
  surfaceLight.position.set(36, 52, 28);
  surfaceLight.castShadow = true;
  surfaceLight.shadow.mapSize.set(1024, 1024);
  surfaceLight.shadow.camera.left = -72;
  surfaceLight.shadow.camera.right = 72;
  surfaceLight.shadow.camera.top = 72;
  surfaceLight.shadow.camera.bottom = -72;
  surfaceLight.shadow.camera.near = 1;
  surfaceLight.shadow.camera.far = 180;
  surfaceLight.target.position.set(0, 0, 0);
  group.add(surfaceLight, surfaceLight.target, new THREE.HemisphereLight(0xaac5d2, 0x1a1010, 1.25));

  return {
    group,
    ground,
    groundGeometry,
    groundMaterial,
    liquid,
    liquidMaterial,
    rocks,
    rockMaterial,
    ridges,
    ridgeMaterial,
    platform,
    platformMaterial,
    pad,
    padMaterial,
    padRing,
    padRingMaterial,
    beaconRing,
    beaconRingMaterial,
    cloudLayers,
    haze,
    hazeMaterial,
    backdrop,
    backdropMaterial,
    backdropCache: new Map(),
    surfaceMapCache: new Map(),
    textureLoader,
    anisotropy,
    surfaceLight,
    dust,
    dustMaterial,
    ship: craft.ship,
    exhaust: craft.exhaust,
    landingGear: craft.landingGear,
    shipAccentMaterials: craft.accentMaterials,
    fadeMaterials,
    preset: SURFACE_PRESETS.earth,
    bodyId: null,
    opacity: 1,
  };
}

function createCinematicShip(glowTexture) {
  const ship = new THREE.Group();
  const fadeMaterials = [];
  const register = (material, opacity = material.opacity ?? 1) => {
    material.transparent = true;
    material.opacity = opacity;
    material.userData.surfaceBaseOpacity = opacity;
    fadeMaterials.push(material);
    return material;
  };
  const hullMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0x4f8290, emissive: 0x14323b, emissiveIntensity: 0.58, roughness: 0.42, metalness: 0.68 }),
  );
  const panelMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0xd36e43, emissive: 0x46170b, emissiveIntensity: 0.48, roughness: 0.46, metalness: 0.55 }),
  );
  const trimMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0xe6ad54, emissive: 0x5a300d, emissiveIntensity: 0.58, roughness: 0.34, metalness: 0.7 }),
  );
  const navigationMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0x7be7e2, emissive: 0x5ed8ff, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.46 }),
  );
  const glassMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0x143a4b, emissive: 0x5ed8ff, emissiveIntensity: 1.28, roughness: 0.12, metalness: 0.42 }),
    0.92,
  );
  const darkMaterial = register(
    new THREE.MeshStandardMaterial({ color: 0x172126, roughness: 0.6, metalness: 0.74 }),
  );

  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), hullMaterial);
  hull.scale.set(1.18, 2.05, 0.96);
  hull.position.y = 0.38;
  ship.add(hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.98, 2.25, 6), panelMaterial);
  nose.position.y = 2.72;
  nose.rotation.y = Math.PI / 6;
  ship.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.74, 24, 14), glassMaterial);
  canopy.scale.set(0.82, 1.08, 0.5);
  canopy.position.set(0, 1.25, 0.78);
  ship.add(canopy);
  const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.055, 8, 32), trimMaterial);
  canopyFrame.scale.set(1, 1.28, 1);
  canopyFrame.position.set(0, 1.2, 1.03);
  ship.add(canopyFrame);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(createSweptWingGeometry(side), hullMaterial);
    ship.add(wing);
    const wingPanel = new THREE.Mesh(createSweptWingGeometry(side), panelMaterial);
    wingPanel.scale.set(0.72, 0.72, 0.48);
    wingPanel.position.z = 0.26;
    ship.add(wingPanel);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 0.16), panelMaterial);
    stripe.position.set(side * 2.05, -0.62, 0.28);
    stripe.rotation.z = side * -0.29;
    ship.add(stripe);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.56, 2.05, 14), darkMaterial);
    engine.position.set(side * 2.62, -0.82, -0.15);
    ship.add(engine);
    const engineBand = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.34, 14), trimMaterial);
    engineBand.position.set(side * 2.62, -1.28, -0.15);
    ship.add(engineBand);
    const engineLight = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.08, 8, 28), navigationMaterial);
    engineLight.rotation.x = Math.PI / 2;
    engineLight.position.set(side * 2.62, -1.91, -0.15);
    ship.add(engineLight);
  }
  const belly = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.45, 1.35), darkMaterial);
  belly.position.set(0, -1.12, -0.06);
  ship.add(belly);
  const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 3), panelMaterial);
  dorsalFin.position.set(0, -0.55, -1.05);
  dorsalFin.rotation.x = Math.PI / 2;
  dorsalFin.rotation.z = Math.PI;
  ship.add(dorsalFin);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 1.08), trimMaterial);
  trim.position.set(0, 0.2, 0.18);
  ship.add(trim);

  const exhaustMaterial = register(
    new THREE.MeshBasicMaterial({ map: glowTexture, color: 0x72dcff, blending: THREE.AdditiveBlending, depthWrite: false }),
    0.82,
  );
  const exhaust = new THREE.Group();
  exhaust.material = exhaustMaterial;
  for (const [x, z, radius, length] of [[-2.62, -0.15, 0.48, 3.5], [2.62, -0.15, 0.48, 3.5], [0, -0.2, 0.38, 2.7]]) {
    const plume = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 14, 1, true), exhaustMaterial);
    plume.rotation.z = Math.PI;
    plume.position.set(x, -2.15 - length * 0.48, z);
    exhaust.add(plume);
  }
  ship.add(exhaust);

  const landingGear = new THREE.Group();
  for (const [x, z] of [[-1.55, -0.45], [1.55, -0.45], [0, 0.72]]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.2, 8), darkMaterial);
    strut.position.set(x, -1.95, z);
    strut.rotation.z = x === 0 ? 0 : x > 0 ? -0.3 : 0.3;
    landingGear.add(strut);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.12, 12), trimMaterial);
    foot.position.set(x * 1.08, -2.54, z);
    landingGear.add(foot);
  }
  ship.add(landingGear);
  ship.scale.setScalar(1.08);
  return { ship, exhaust, landingGear, fadeMaterials, accentMaterials: [navigationMaterial, glassMaterial] };
}

function createSweptWingGeometry(side) {
  const thickness = 0.18;
  const outline = [[0.58, 0.72], [3.85, -0.2], [3.18, -1.9], [0.72, -1.18]];
  const vertices = [];
  for (const z of [-thickness, thickness]) {
    for (const [x, y] of outline) vertices.push(x * side, y, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function createSurfaceCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 92; index += 1) {
    const x = seededUnit(index * 37 + 11) * canvas.width;
    const y = seededUnit(index * 53 + 17) * canvas.height;
    const radiusX = 20 + seededUnit(index * 67 + 23) * 66;
    const radiusY = radiusX * (0.28 + seededUnit(index * 71 + 29) * 0.34);
    const alpha = 0.055 + seededUnit(index * 83 + 31) * 0.15;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radiusX);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.48, `rgba(255,255,255,${alpha * 0.72})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.save();
    context.translate(x, y);
    context.rotate((seededUnit(index * 89 + 7) - 0.5) * 0.8);
    context.scale(1, radiusY / radiusX);
    context.translate(-x, -y);
    context.fillStyle = gradient;
    context.fillRect(x - radiusX, y - radiusX, radiusX * 2, radiusX * 2);
    context.restore();
  }

  context.globalCompositeOperation = "destination-in";
  const edge = context.createRadialGradient(256, 256, 138, 256, 256, 256);
  edge.addColorStop(0, "rgba(255,255,255,1)");
  edge.addColorStop(0.72, "rgba(255,255,255,0.92)");
  edge.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = edge;
  context.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createSurfaceSkyTexture(body, preset) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const airless = !preset.clouds && !preset.liquid && !preset.platform && body.id !== "mars";
  const top = airless
    ? 0x010204
    : new THREE.Color(preset.haze).multiplyScalar(preset.clouds ? 0.32 : 0.18).getHex();
  const middle = airless
    ? new THREE.Color(preset.haze).multiplyScalar(0.42).getHex()
    : preset.haze;
  const horizon = airless
    ? new THREE.Color(preset.ground).multiplyScalar(0.3).getHex()
    : new THREE.Color(preset.rock).lerp(new THREE.Color(preset.haze), 0.45).getHex();
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, hexCss(top));
  gradient.addColorStop(0.48, hexCss(middle));
  gradient.addColorStop(0.82, hexCss(horizon));
  gradient.addColorStop(1, hexCss(new THREE.Color(horizon).multiplyScalar(0.64).getHex()));
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createRealisticSurfaceMaps(body, preset, anisotropy) {
  const size = 512;
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const colorContext = colorCanvas.getContext("2d");
  const bumpContext = bumpCanvas.getContext("2d");
  const colorImage = colorContext.createImageData(size, size);
  const bumpImage = bumpContext.createImageData(size, size);
  const seed = hashString(body.id);
  const ground = hexChannels(preset.ground);
  const rock = hexChannels(preset.rock);
  const shadow = ground.map((channel) => channel * (preset.ice ? 0.58 : 0.42));
  const airless = !preset.clouds && !preset.liquid && !preset.platform && body.id !== "mars";
  const craterCount = airless ? 20 : preset.ice ? 8 : body.id === "mars" ? 5 : 0;
  const craters = [];
  for (let index = 0; index < craterCount; index += 1) {
    craters.push({
      x: seededUnit(seed + index * 41 + 3),
      y: seededUnit(seed + index * 47 + 7),
      radius: 0.018 + seededUnit(seed + index * 61 + 11) * (airless ? 0.095 : 0.055),
    });
  }

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const broad = fractalNoise2D(u * 7.5, v * 7.5, seed, 5);
      const fine = fractalNoise2D(u * 31, v * 31, seed + 991, 3);
      let height = broad * 0.68 + fine * 0.22;

      if (body.id === "mars") {
        height += Math.sin((v * 31 + broad * 1.7) * Math.PI) * 0.08;
      } else if (preset.platform) {
        height = height * 0.28 + Math.sin((v * 18 + broad) * Math.PI) * 0.17;
      }

      for (const crater of craters) {
        const dxRaw = Math.abs(u - crater.x);
        const dyRaw = Math.abs(v - crater.y);
        const dx = Math.min(dxRaw, 1 - dxRaw);
        const dy = Math.min(dyRaw, 1 - dyRaw);
        const distance = Math.hypot(dx, dy) / crater.radius;
        if (distance > 1.35) continue;
        const bowl = distance < 1 ? -Math.pow(1 - distance, 1.75) * 0.58 : 0;
        const rim = Math.exp(-Math.pow((distance - 1) / 0.13, 2)) * 0.34;
        height += bowl + rim;
      }

      let hot = 0;
      if (preset.lava) {
        const fissure = Math.abs(Math.sin((u * 9.5 + broad * 1.8) * Math.PI) + Math.cos((v * 12 - fine) * Math.PI) * 0.34);
        hot = THREE.MathUtils.clamp((0.13 - fissure) * 7.5, 0, 1);
        height -= hot * 0.22;
      }

      const normalized = THREE.MathUtils.clamp(height * 0.7 + 0.5, 0, 1);
      const lowMix = THREE.MathUtils.clamp(normalized * 2, 0, 1);
      const highMix = THREE.MathUtils.clamp((normalized - 0.48) * 1.9, 0, 1);
      const lowColor = mixChannels(shadow, ground, lowMix);
      let pixelColor = mixChannels(lowColor, rock, highMix);
      if (preset.ice) {
        const frost = THREE.MathUtils.clamp((fine + 0.45) * 0.36, 0, 0.42);
        pixelColor = mixChannels(pixelColor, [220, 237, 240], frost);
      }
      if (hot > 0) pixelColor = mixChannels(pixelColor, [255, 126, 28], hot * 0.92);

      const offset = (y * size + x) * 4;
      colorImage.data[offset] = pixelColor[0];
      colorImage.data[offset + 1] = pixelColor[1];
      colorImage.data[offset + 2] = pixelColor[2];
      colorImage.data[offset + 3] = 255;
      const bump = Math.round(THREE.MathUtils.clamp(0.5 + height * 0.42, 0, 1) * 255);
      bumpImage.data[offset] = bump;
      bumpImage.data[offset + 1] = bump;
      bumpImage.data[offset + 2] = bump;
      bumpImage.data[offset + 3] = 255;
    }
  }
  colorContext.putImageData(colorImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);

  if (preset.ice) drawSurfaceCracks(colorContext, bumpContext, body, preset, size);

  const colorTexture = new THREE.CanvasTexture(colorCanvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.wrapS = THREE.RepeatWrapping;
  colorTexture.wrapT = THREE.RepeatWrapping;
  colorTexture.repeat.set(4.5, 4.5);
  colorTexture.anisotropy = anisotropy;
  colorTexture.minFilter = THREE.LinearMipmapLinearFilter;
  colorTexture.magFilter = THREE.LinearFilter;

  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.RepeatWrapping;
  bumpTexture.wrapT = THREE.RepeatWrapping;
  bumpTexture.repeat.set(4.5, 4.5);
  bumpTexture.anisotropy = anisotropy;
  bumpTexture.minFilter = THREE.LinearMipmapLinearFilter;
  bumpTexture.magFilter = THREE.LinearFilter;
  return { color: colorTexture, bump: bumpTexture };
}

function drawSurfaceCracks(colorContext, bumpContext, body, preset, size) {
  const seed = hashString(`${body.id}-cracks`);
  const crackCount = 14 + Math.round(preset.relief * 2);
  colorContext.lineCap = "round";
  bumpContext.lineCap = "round";
  for (let index = 0; index < crackCount; index += 1) {
    const horizontal = index % 3 !== 0;
    const startX = horizontal ? -24 : seededUnit(seed + index * 31) * size;
    const startY = horizontal ? seededUnit(seed + index * 37) * size : -24;
    colorContext.beginPath();
    bumpContext.beginPath();
    colorContext.moveTo(startX, startY);
    bumpContext.moveTo(startX, startY);
    for (let step = 1; step <= 12; step += 1) {
      const distance = (step / 12) * (size + 48) - 24;
      const bend = (seededUnit(seed + index * 97 + step * 17) - 0.5) * 22;
      const x = horizontal ? distance : startX + bend;
      const y = horizontal ? startY + bend : distance;
      colorContext.lineTo(x, y);
      bumpContext.lineTo(x, y);
    }
    colorContext.strokeStyle = colorWithAlpha(preset.accent, 0.42);
    colorContext.lineWidth = 1.2 + (index % 3) * 0.55;
    colorContext.stroke();
    bumpContext.strokeStyle = "rgb(40,40,40)";
    bumpContext.lineWidth = 2.2 + (index % 2);
    bumpContext.stroke();
  }
}

function sampleSurfaceHeight(body, preset, x, z, seed) {
  const distance = Math.hypot(x, z);
  const flatten = THREE.MathUtils.smoothstep(distance, 8, 18);
  const broad = fractalNoise2D(x * 0.035, z * 0.035, seed, 5);
  const detail = fractalNoise2D(x * 0.12, z * 0.12, seed + 947, 3);
  let height = (broad * 0.82 + detail * 0.19) * preset.relief;
  if (body.id === "mars") height += Math.sin(x * 0.08 + z * 0.025) * 0.34;
  if (preset.platform) height *= 0.18;
  if (preset.liquid) height *= 0.72;

  const cratered = !preset.clouds && !preset.liquid && !preset.platform;
  const craterCount = cratered ? 9 : preset.ice ? 4 : 0;
  for (let index = 0; index < craterCount; index += 1) {
    const craterX = (seededUnit(seed + index * 43 + 5) - 0.5) * 154;
    const craterZ = (seededUnit(seed + index * 47 + 9) - 0.5) * 154;
    const radius = 5 + seededUnit(seed + index * 59 + 13) * 14;
    const craterDistance = Math.hypot(x - craterX, z - craterZ) / radius;
    if (craterDistance > 1.36) continue;
    const bowl = craterDistance < 1 ? -Math.pow(1 - craterDistance, 1.7) * preset.relief * 0.72 : 0;
    const rim = Math.exp(-Math.pow((craterDistance - 1) / 0.14, 2)) * preset.relief * 0.28;
    height += bowl + rim;
  }
  return height * flatten;
}

function valueNoise2D(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const sample = (ix, iy) => seededUnit(seed + ix * 15731 + iy * 789221);
  const top = THREE.MathUtils.lerp(sample(x0, y0), sample(x0 + 1, y0), sx);
  const bottom = THREE.MathUtils.lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), sx);
  return THREE.MathUtils.lerp(top, bottom, sy) * 2 - 1;
}

function fractalNoise2D(x, y, seed, octaves) {
  let frequency = 1;
  let amplitude = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2D(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    weight += amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return total / weight;
}

function hexChannels(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function mixChannels(from, to, amount) {
  return from.map((channel, index) => Math.round(THREE.MathUtils.lerp(channel, to[index], amount)));
}

function hexCss(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function configureSurfaceStage(stage, body, visual) {
  if (stage.bodyId === body.id) return;
  stage.bodyId = body.id;
  const fallback = {
    ground: new THREE.Color(visual.palette?.[0] || body.color).getHex(),
    rock: new THREE.Color(visual.palette?.[1] || body.accent).getHex(),
    haze: new THREE.Color(visual.glow || visual.haze || body.color).multiplyScalar(0.55).getHex(),
    accent: new THREE.Color(body.accent || 0x91d9e5).getHex(),
    relief: body.family === "卫星" ? 3 : 2,
    ice: visual.kind === "ice" || visual.kind === "iceRock",
    clouds: ["gas", "iceGiant", "clouded", "haze"].includes(visual.kind),
    platform: ["gas", "iceGiant"].includes(visual.kind),
  };
  const preset = { ...fallback, ...(SURFACE_PRESETS[body.id] || {}) };
  stage.preset = preset;
  let surfaceMaps = stage.surfaceMapCache.get(`surface:${body.id}`);
  if (!surfaceMaps) {
    surfaceMaps = createRealisticSurfaceMaps(body, preset, stage.anisotropy);
    stage.surfaceMapCache.set(`surface:${body.id}`, surfaceMaps);
  }
  let skyTexture = stage.surfaceMapCache.get(`sky:${body.id}`);
  if (!skyTexture) {
    skyTexture = createSurfaceSkyTexture(body, preset);
    stage.surfaceMapCache.set(`sky:${body.id}`, skyTexture);
  }
  stage.groundMaterial.color.setHex(0xffffff);
  stage.groundMaterial.map = surfaceMaps.color;
  stage.groundMaterial.bumpMap = surfaceMaps.bump;
  stage.groundMaterial.bumpScale = 0.8 + preset.relief * 0.34;
  stage.groundMaterial.roughness = preset.ice ? 0.68 : preset.platform ? 0.58 : 0.92;
  stage.groundMaterial.metalness = preset.ice ? 0.035 : 0.01;
  stage.groundMaterial.emissive.setHex(preset.lava ? 0x351006 : preset.ice ? 0x10262b : 0x090c0d);
  stage.groundMaterial.emissiveIntensity = preset.lava ? 0.75 : preset.ice ? 0.35 : 0.18;
  stage.groundMaterial.needsUpdate = true;
  stage.rockMaterial.color.setHex(0xffffff);
  stage.rockMaterial.map = surfaceMaps.color;
  stage.rockMaterial.bumpMap = surfaceMaps.bump;
  stage.rockMaterial.bumpScale = 0.24 + preset.relief * 0.08;
  stage.rockMaterial.needsUpdate = true;
  stage.ridgeMaterial.color.setHex(0xc7c7c7);
  stage.ridgeMaterial.map = surfaceMaps.color;
  stage.ridgeMaterial.bumpMap = surfaceMaps.bump;
  stage.ridgeMaterial.bumpScale = 0.34 + preset.relief * 0.1;
  stage.ridgeMaterial.needsUpdate = true;
  stage.hazeMaterial.color.setHex(0xffffff);
  stage.hazeMaterial.map = skyTexture;
  stage.hazeMaterial.userData.surfaceBaseOpacity = preset.clouds ? 0.96 : preset.ice ? 0.72 : 0.82;
  stage.hazeMaterial.opacity = stage.hazeMaterial.userData.surfaceBaseOpacity * stage.opacity;
  stage.hazeMaterial.needsUpdate = true;
  stage.dustMaterial.color.setHex(preset.accent);
  stage.dustMaterial.userData.surfaceBaseOpacity = preset.clouds ? 0.2 : body.id === "mars" ? 0.48 : 0.28;
  stage.dustMaterial.opacity = stage.dustMaterial.userData.surfaceBaseOpacity * stage.opacity;
  stage.padRingMaterial.color.setHex(preset.accent);
  stage.beaconRingMaterial.color.setHex(preset.lava ? 0xff7b32 : 0xf1b75c);
  stage.liquidMaterial.color.setHex(body.id === "titan" ? 0x3b2b17 : 0x164a63);
  stage.liquidMaterial.roughness = body.id === "titan" ? 0.46 : 0.18;
  stage.liquidMaterial.bumpMap = surfaceMaps.bump;
  stage.liquidMaterial.bumpScale = body.id === "titan" ? 0.1 : 0.045;
  stage.liquidMaterial.needsUpdate = true;
  stage.liquid.visible = Boolean(preset.liquid);
  stage.platform.visible = Boolean(preset.platform);
  stage.rocks.count = preset.liquid ? 26 : preset.clouds ? 48 : 76;
  stage.ridges.count = preset.liquid ? 10 : preset.clouds ? 18 : 28;
  stage.rocks.visible = !preset.platform;
  stage.ridges.visible = !preset.platform;
  stage.cloudLayers.forEach((layer, index) => {
    layer.visible = Boolean(preset.clouds);
    layer.material.color.setHex(index === 0 ? preset.rock : preset.accent);
    layer.material.userData.surfaceBaseOpacity = preset.clouds ? 0.18 - index * 0.038 : 0;
    layer.material.opacity = layer.material.userData.surfaceBaseOpacity * stage.opacity;
  });
  stage.surfaceLight.color.setHex(preset.ice ? 0xd7f2ff : ["mars", "venus", "titan"].includes(body.id) ? 0xffd0a3 : 0xffedd5);
  stage.surfaceLight.intensity = preset.clouds ? 3.15 : 4.25;
  stage.shipAccentMaterials[0].color.setHex(preset.accent);
  stage.shipAccentMaterials[0].emissive.setHex(preset.accent);
  stage.shipAccentMaterials[1].emissive.setHex(preset.accent);

  const backdropSpec = SURFACE_BACKDROPS[body.id];
  stage.backdrop.visible = Boolean(backdropSpec);
  stage.backdrop.userData.credit = backdropSpec?.credit || "";
  stage.backdrop.scale.set(body.id === "moon" ? 0.72 : 1, body.id === "mars" ? 0.74 : 1, 1);
  stage.backdropMaterial.userData.surfaceBaseOpacity = body.id === "moon" ? 0.74 : 0.9;
  stage.backdropMaterial.opacity = stage.backdropMaterial.userData.surfaceBaseOpacity * stage.opacity;
  if (backdropSpec) {
    const cachedBackdrop = stage.backdropCache.get(body.id);
    if (cachedBackdrop) {
      stage.backdropMaterial.map = cachedBackdrop;
      stage.backdropMaterial.needsUpdate = true;
    } else {
      stage.backdropMaterial.map = null;
      stage.textureLoader.load(
        backdropSpec.src,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = stage.anisotropy;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          stage.backdropCache.set(body.id, texture);
          if (stage.bodyId !== body.id) return;
          stage.backdropMaterial.map = texture;
          stage.backdropMaterial.needsUpdate = true;
        },
        undefined,
        () => {
          if (stage.bodyId === body.id) stage.backdrop.visible = false;
        },
      );
    }
  } else {
    stage.backdropMaterial.map = null;
    stage.backdropMaterial.needsUpdate = true;
  }

  const seed = hashString(body.id);
  const positions = stage.groundGeometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, sampleSurfaceHeight(body, preset, x, z, seed));
  }
  positions.needsUpdate = true;
  stage.groundGeometry.computeVertexNormals();

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  for (let index = 0; index < stage.rocks.count; index += 1) {
    const angle = seededUnit(seed + index * 17) * TAU;
    const radius = 16 + seededUnit(seed + index * 23) * 72;
    const size = 0.24 + seededUnit(seed + index * 29) * (preset.relief * 0.28 + 1.05);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    position.set(x, sampleSurfaceHeight(body, preset, x, z, seed) + size * 0.3, z);
    quaternion.setFromEuler(new THREE.Euler(index * 0.19, angle, index * 0.11));
    scale.set(size * 1.12, size * (0.52 + seededUnit(seed + index * 31) * 0.56), size);
    matrix.compose(position, quaternion, scale);
    stage.rocks.setMatrixAt(index, matrix);
  }
  stage.rocks.instanceMatrix.needsUpdate = true;
  for (let index = 0; index < stage.ridges.count; index += 1) {
    const angle = seededUnit(seed + index * 37) * TAU;
    const radius = 46 + seededUnit(seed + index * 41) * 38;
    const size = 1.45 + seededUnit(seed + index * 43) * (1.9 + preset.relief * 0.34);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    position.set(x, sampleSurfaceHeight(body, preset, x, z, seed) + size * 0.22, z);
    quaternion.setFromEuler(new THREE.Euler(0, angle, (seededUnit(seed + index * 47) - 0.5) * 0.24));
    scale.set(size * 1.55, size * 0.5, size * 0.92);
    matrix.compose(position, quaternion, scale);
    stage.ridges.setMatrixAt(index, matrix);
  }
  stage.ridges.instanceMatrix.needsUpdate = true;
}

function setSurfaceOpacity(stage, opacity) {
  stage.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
  for (const material of stage.fadeMaterials) {
    material.opacity = (material.userData.surfaceBaseOpacity ?? 1) * stage.opacity;
  }
}

function createOortCloud() {
  const group = new THREE.Group();
  const count = 7800;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const ice = new THREE.Color(0xaed8e3);
  const dust = new THREE.Color(0x86979d);
  for (let index = 0; index < count; index += 1) {
    const theta = Math.random() * TAU;
    const radius = 338 + Math.pow(Math.random(), 0.78) * 102;
    const layer = (Math.random() + Math.random() + Math.random() - 1.5) * 34;
    positions[index * 3] = Math.cos(theta) * radius;
    positions[index * 3 + 1] = layer + Math.sin(theta * 3) * 7;
    positions[index * 3 + 2] = Math.sin(theta) * radius;
    const color = Math.random() > 0.42 ? ice : dust;
    const brightness = 0.35 + Math.random() * 0.65;
    colors[index * 3] = color.r * brightness;
    colors[index * 3 + 1] = color.g * brightness;
    colors[index * 3 + 2] = color.b * brightness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 1.8,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(points);

  const boundaries = [338, 368, 406, 440].map((radius, boundaryIndex) => {
    const vertices = [];
    for (let index = 0; index < 320; index += 1) {
      const angle = (index / 320) * TAU;
      vertices.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle * 3) * 4, Math.sin(angle) * radius));
    }
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(vertices),
      new THREE.LineBasicMaterial({
        color: boundaryIndex % 2 === 0 ? 0x91c8d1 : 0x6e8f98,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    group.add(line);
    return line;
  });

  const cometCount = 120;
  const cometPositions = new Float32Array(cometCount * 6);
  for (let index = 0; index < cometCount; index += 1) {
    const radius = 345 + Math.random() * 88;
    const theta = Math.random() * TAU;
    const y = (Math.random() - 0.5) * 72;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const offset = index * 6;
    cometPositions[offset] = x;
    cometPositions[offset + 1] = y;
    cometPositions[offset + 2] = z;
    cometPositions[offset + 3] = x * 1.018;
    cometPositions[offset + 4] = y * 1.018;
    cometPositions[offset + 5] = z * 1.018;
  }
  const cometGeometry = new THREE.BufferGeometry();
  cometGeometry.setAttribute("position", new THREE.BufferAttribute(cometPositions, 3));
  const comets = new THREE.LineSegments(
    cometGeometry,
    new THREE.LineBasicMaterial({
      color: 0xbfefff,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(comets);
  return { group, points, comets, boundaries };
}

function createStarfield() {
  const count = 2800;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const warm = new THREE.Color(0xe8dfce);
  const cool = new THREE.Color(0x8faebc);
  for (let index = 0; index < count; index += 1) {
    const radius = 520 + Math.random() * 1050;
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    const tone = Math.random() > 0.72 ? warm : cool;
    const brightness = 0.45 + Math.random() * 0.55;
    colors[index * 3] = tone.r * brightness;
    colors[index * 3 + 1] = tone.g * brightness;
    colors[index * 3 + 2] = tone.b * brightness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 1.35, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  return new THREE.Points(geometry, material);
}

function createCockpitStreaks() {
  const count = 150;
  const positions = new Float32Array(count * 6);
  const speeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    resetStreak(positions, speeds, index, true);
  }
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attribute);
  const material = new THREE.LineBasicMaterial({
    color: 0xb9d7e0,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.visible = false;
  return { lines, positions, speeds, count };
}

function updateCockpitStreaks(frame, streaks, surfaceSequence) {
  const active = frame.state.viewMode === "cockpit" && !surfaceSequence;
  streaks.lines.visible = active;
  if (!active) return;
  const routeProgress = frame.state.missionActive || frame.state.routeProgress > 0 ? frame.state.routeProgress : 0.015;
  const warpActive = frame.state.experienceMode === "fantasy" && frame.state.travelMode === "warp";
  const arrivalSlowdown = 1 - THREE.MathUtils.smoothstep(routeProgress, 0.65, 0.985);
  streaks.lines.material.color.set(warpActive ? 0xd5a8ff : 0xb9d7e0);
  streaks.lines.material.opacity =
    0.05 + THREE.MathUtils.smoothstep(routeProgress, 0.05, 0.28) * (warpActive ? 0.62 : 0.3) * arrivalSlowdown;
  const boost = (frame.state.missionActive ? 1.7 : 0.35) * (warpActive ? 4.2 : 1) * (0.16 + arrivalSlowdown * 0.84);
  for (let index = 0; index < streaks.count; index += 1) {
    const offset = index * 6;
    const step = frame.dt * streaks.speeds[index] * boost;
    streaks.positions[offset + 2] += step;
    streaks.positions[offset + 5] += step;
    if (streaks.positions[offset + 2] > -2) resetStreak(streaks.positions, streaks.speeds, index, false);
  }
  streaks.lines.geometry.attributes.position.needsUpdate = true;
}

function resetStreak(positions, speeds, index, initial) {
  const offset = index * 6;
  const z = initial ? -12 - Math.random() * 180 : -150 - Math.random() * 80;
  const spread = 7 + Math.abs(z) * 0.2;
  const x = (Math.random() - 0.5) * spread;
  const y = (Math.random() - 0.5) * spread * 0.62;
  const length = 1.6 + Math.random() * 4.2;
  positions[offset] = x;
  positions[offset + 1] = y;
  positions[offset + 2] = z;
  positions[offset + 3] = x * 1.018;
  positions[offset + 4] = y * 1.018;
  positions[offset + 5] = z + length;
  speeds[index] = 28 + Math.random() * 56;
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.12, "rgba(255,238,188,0.95)");
  gradient.addColorStop(0.38, "rgba(241,183,92,0.38)");
  gradient.addColorStop(1, "rgba(241,183,92,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRingTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.strokeStyle = "rgba(255,255,255,0.92)";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(64, 64, 45, 0, TAU);
  context.stroke();
  context.strokeStyle = "rgba(255,255,255,0.28)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(64, 64, 56, 0, TAU);
  context.stroke();
  return new THREE.CanvasTexture(canvas);
}

function createLabelLayer(canvas) {
  const layer = document.createElement("div");
  layer.className = "webgl-label-layer";
  layer.setAttribute("aria-hidden", "true");
  canvas.insertAdjacentElement("afterend", layer);
  return layer;
}

function createBodyLabel(body) {
  const label = document.createElement("span");
  label.className = "space-label";
  label.dataset.body = body.id;
  label.textContent = body.name;
  label.hidden = true;
  return label;
}

function resolveCockpitProgress(frame) {
  if (frame.state.missionActive || frame.state.routeProgress > 0) {
    return THREE.MathUtils.clamp(frame.state.routeProgress, 0.008, 0.9995);
  }
  return 0.015;
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function wrap(value) {
  return ((value % 1) + 1) % 1;
}

function smootherstep(value) {
  const amount = THREE.MathUtils.clamp(value, 0, 1);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}
