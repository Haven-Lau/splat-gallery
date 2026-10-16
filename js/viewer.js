// Orbit viewer for one splat file in splats/. Based on trainctl's viewer
// (trainctl/static/viewer.js): same Spark build, same 2DGS + beta setup,
// same scene turn and black background.
//
//   index.html               shows splats/mundo.bgsz
//   index.html?s=other.bgsz  shows splats/other.bgsz (.bgsz or .ply)
//
// Coordinates: the file is in the training convention, three.js is +Y up.
// WORLD is the one rotation between them: trainctl's -90 degree flip about X,
// then (if the scene's up direction is known) a turn that puts it on +Y.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  SparkRenderer, SplatMesh, prepareSplatFile, makeBetaTexture, isBgsz, decompressBgsz,
} from "@sparkjsdev/spark";

const DEFAULT_FILE = "mundo.bgsz";

// Optional per-file start views, in the file's own coordinates.
//   up:     the scene's up direction (trainctl gets it from the mean up
//           vector of the training cameras in cameras.json)
//   camera: where to start looking from (here: the training camera that
//           looks most directly at the subject)
//   fov:    vertical field of view in degrees
// A file not listed here starts with the plain flip and a default view.
const VIEWS = {
  "mundo.bgsz": {
    up: [0.255927, -0.929187, -0.266669],
    camera: [-1.81578, 2.21664, -0.21325],
    fov: 40.84,
  },
};

// trainctl's footprint slider default (spark.maxBetaStdDev).
const FOOTPRINT = 12;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- three setup

const canvas = $("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 1);
const scene = new THREE.Scene();
const spark = new SparkRenderer({ renderer, enable2DGS: true });
scene.add(spark);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
// OrbitControls handles touch too: one finger orbits, two fingers pinch-zoom and pan.
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.9;

const THREE_UP = new THREE.Vector3(0, 1, 0);
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
  .map((a) => new THREE.Vector3(...a));
const NEAR_AXIS = Math.cos(3 * Math.PI / 180);

// up: a direction in file coordinates, or undefined for the plain flip.
function worldRotation(up) {
  const align = new THREE.Quaternion();
  if (up) {
    const v = new THREE.Vector3(...up).normalize().applyQuaternion(FLIP);
    for (const axis of AXES) {
      if (v.dot(axis) > NEAR_AXIS) { v.copy(axis); break; }
    }
    align.setFromUnitVectors(v, THREE_UP);
  }
  return align.multiply(FLIP);
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// ---------------------------------------------------------------- status

function status(text, fraction = null, isError = false) {
  $("status").classList.remove("hidden");
  $("status").classList.toggle("error", isError);
  $("status-text").textContent = text;
  $("bar").parentElement.style.display = fraction === null ? "none" : "";
  if (fraction !== null) $("bar").style.width = `${Math.round(fraction * 100)}%`;
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not download ${url} (HTTP ${response.status})`);
  const total = Number(response.headers.get("Content-Length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const mb = (received / 1e6).toFixed(1);
    if (total) status(`Downloading… ${mb} / ${(total / 1e6).toFixed(1)} MB`, Math.min(1, received / total));
    else status(`Downloading… ${mb} MB`);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

// ---------------------------------------------------------------- loading

// Same steps as trainctl's loadPly(): a .bgsz is decoded here (it comes out
// already flattened for 2DGS, with its betas); a PLY goes through
// prepareSplatFile(), which adds the flat third scale for 2DGS files and pulls
// out the beta column.
async function loadSplat(raw, world) {
  const compressed = isBgsz(raw);
  const prepared = compressed ? decompressBgsz(raw) : prepareSplatFile(raw);
  const mesh = new SplatMesh({ fileBytes: prepared.fileBytes, fileName: "point_cloud.ply" });
  await mesh.initialized;
  mesh.quaternion.copy(world);
  scene.add(mesh);

  // The beta texture is indexed by splat order, so it is only used if the
  // decoder kept every splat (trainctl does the same check).
  const numSplats = mesh.packedSplats?.numSplats ?? prepared.numSplats;
  const betas = prepared.betas && numSplats === prepared.numSplats ? prepared.betas : null;
  if (betas) spark.betaTexture = makeBetaTexture(betas);
  spark.enable2DGS = true;
  spark.enableBeta = !!betas;
  spark.betaDebug = false;
  spark.maxBetaStdDev = FOOTPRINT;
  return mesh;
}

// Middle of the opaque splats and the radius that holds 90% of them.
function splatBounds(mesh) {
  const xs = [], ys = [], zs = [];
  mesh.forEachSplat((i, center, scales, quat, opacity) => {
    if (opacity > 0.2) { xs.push(center.x); ys.push(center.y); zs.push(center.z); }
  });
  if (!xs.length) return { target: new THREE.Vector3(), radius: 2 };
  const median = (a) => Float32Array.from(a).sort()[a.length >> 1];
  const target = new THREE.Vector3(median(xs), median(ys), median(zs));
  const d = Float32Array.from(xs, (x, i) => Math.hypot(x - target.x, ys[i] - target.y, zs[i] - target.z)).sort();
  return { target, radius: d[Math.floor(d.length * 0.9)] || 2 };
}

function frame(target, radius, view, world) {
  camera.fov = view?.fov || 50;
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const fit = radius / Math.tan(Math.min(vHalf, hHalf));   // far enough to see it all
  if (view?.camera) {
    const dir = new THREE.Vector3(...view.camera).applyQuaternion(world).sub(target);
    const dist = Math.max(dir.length(), fit);
    camera.position.copy(target).addScaledVector(dir.normalize(), dist);
  } else {
    camera.position.copy(target).add(new THREE.Vector3(0, 0.25, 1).normalize().multiplyScalar(fit));
  }
  camera.up.copy(THREE_UP);
  camera.lookAt(target);
  controls.target.copy(target);
  camera.near = Math.max(0.001, radius * 0.01);
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
}

async function main() {
  const name = new URLSearchParams(location.search).get("s") || DEFAULT_FILE;
  if (!/^[\w.-]+$/.test(name)) throw new Error(`bad file name "${name}"`);
  document.title = `${name} · Splat Viewer`;
  const view = VIEWS[name];
  const world = worldRotation(view?.up);

  const raw = await download(`splats/${name}`);
  status("Decoding…");
  await new Promise((r) => setTimeout(r, 0));   // let the status paint
  const mesh = await loadSplat(raw, world);

  const { target, radius } = splatBounds(mesh);
  frame(target.applyQuaternion(world), radius, view, world);
  $("status").classList.add("hidden");
}

main().catch((err) => {
  console.error(err);
  status(err.message, null, true);
});
