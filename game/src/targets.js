// Optional clay calibration marks along the north wall. They use real head/body
// hit meshes too, providing a quiet aim reference without becoming a round objective.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createTargets(scene) {
  const items = [];
  const hitMeshes = [];
  const clay = new THREE.MeshStandardMaterial({ color: '#a65b40', roughness: 0.88 });
  const ink = new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.8 });
  const stand = new THREE.MeshStandardMaterial({ color: '#24282e', metalness: 0.35, roughness: 0.7 });

  [-9, -3, 3, 9].forEach((x, index) => {
    const group = new THREE.Group();
    group.position.set(x, 0, -15.35);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.09), stand);
    post.position.y = 0.58;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.12), clay);
    torso.position.y = 1.03;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), clay);
    head.position.y = 1.54;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.125, 20), ink);
    ring.position.set(0, 1.05, 0.066);
    group.add(post, torso, head, ring);
    group.traverse((node) => {
      if (node.isMesh) node.castShadow = true;
    });
    scene.add(group);
    const item = { group, torso, head, health: 60, alive: true, phase: index * 1.2 };
    torso.userData = { kind: 'target', part: 'body', owner: item };
    head.userData = { kind: 'target', part: 'head', owner: item };
    items.push(item);
    hitMeshes.push(torso, head);
  });

  return {
    items,
    hitMeshes,
    damage(mesh, amount) {
      const item = mesh.userData.owner;
      if (!item.alive) return { killed: false, damage: 0, item };
      const dealt = Math.min(item.health, amount);
      item.health -= dealt;
      if (item.health <= 0) {
        item.alive = false;
        item.group.rotation.x = -1.35;
        return { killed: true, damage: dealt, item };
      }
      return { killed: false, damage: dealt, item };
    },
    step(time) {
      for (const item of items) {
        if (item.alive) item.group.rotation.y = Math.sin(time * 0.7 + item.phase) * 0.08;
      }
    },
    reset() {
      for (const item of items) {
        item.health = 60;
        item.alive = true;
        item.group.rotation.set(0, 0, 0);
      }
    },
    aimPoint(index) {
      const item = items[index % items.length];
      return new THREE.Vector3(item.group.position.x, 1.05, item.group.position.z);
    },
  };
}
