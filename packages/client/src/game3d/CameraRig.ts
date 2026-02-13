// packages/client/src/game3d/CameraRig.ts
import * as THREE from "three";

export class CameraRig {
  // Config
  minDistance = 5;
  maxDistance = 50; // Increased max zoom so you can see more
  minPolarAngle = 0.1;
  maxPolarAngle = Math.PI / 2 - 0.1;
  
  rotateSpeed = 2.0;
  zoomSpeed = 2.0;
  keyRotateSpeed = 1.5;

  // State
  private target = new THREE.Vector3(0, 0, 0);
  private currentTarget = new THREE.Vector3(0, 0, 0);
  
  private spherical = new THREE.Spherical(20, Math.PI / 3, Math.PI / 4);
  private targetSpherical = new THREE.Spherical(20, Math.PI / 3, Math.PI / 4);

  // Input State
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  
  private keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
  };

  constructor(private camera: THREE.Camera, private domElement: HTMLElement) {
    this.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.domElement.addEventListener("pointermove", this.onPointerMove);
    this.domElement.addEventListener("pointerup", this.onPointerUp);
    this.domElement.addEventListener("wheel", this.onWheel, { passive: false });
    
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  setTarget(pos: { x: number; y: number; z: number }) {
    this.target.set(pos.x, pos.y, pos.z);
  }

  // --- NEW: Instant Teleport ---
  jumpTo(pos: { x: number; y: number; z: number }) {
    this.target.set(pos.x, pos.y, pos.z);
    this.currentTarget.set(pos.x, pos.y, pos.z);
    
    // Force immediate update of camera transform
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.currentTarget).add(offset);
    this.camera.lookAt(this.currentTarget);
  }

  update(dt: number) {
    // 1. Keyboard Rotation
    if (this.keys.ArrowLeft)  this.targetSpherical.theta += this.keyRotateSpeed * dt;
    if (this.keys.ArrowRight) this.targetSpherical.theta -= this.keyRotateSpeed * dt;
    if (this.keys.ArrowUp)    this.targetSpherical.phi -= this.keyRotateSpeed * dt;
    if (this.keys.ArrowDown)  this.targetSpherical.phi += this.keyRotateSpeed * dt;

    this.targetSpherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.targetSpherical.phi));

    // 2. Smoothing
    const lerpFactor = 1.0 - Math.pow(0.001, dt);
    this.currentTarget.lerp(this.target, lerpFactor);

    this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * (1 - Math.pow(0.001, dt * 2));
    this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * (1 - Math.pow(0.001, dt * 2));
    this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * (1 - Math.pow(0.01, dt * 2));

    // 3. Update Transform
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.currentTarget).add(offset);
    this.camera.lookAt(this.currentTarget);
  }

  // ... (Input handlers stay the same) ...
  private onKeyDown = (e: KeyboardEvent) => { if (e.code in this.keys) this.keys[e.code as keyof typeof this.keys] = true; };
  private onKeyUp = (e: KeyboardEvent) => { if (e.code in this.keys) this.keys[e.code as keyof typeof this.keys] = false; };
  private onPointerDown = (e: PointerEvent) => { if (e.button === 1 || (e.button === 0 && e.altKey)) { this.isDragging = true; this.previousMousePosition = { x: e.clientX, y: e.clientY }; this.domElement.setPointerCapture(e.pointerId); e.preventDefault(); } };
  private onPointerUp = (e: PointerEvent) => { this.isDragging = false; this.domElement.releasePointerCapture(e.pointerId); };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    const deltaX = e.clientX - this.previousMousePosition.x;
    const deltaY = e.clientY - this.previousMousePosition.y;
    this.previousMousePosition = { x: e.clientX, y: e.clientY };
    this.targetSpherical.theta -= deltaX * 0.005 * this.rotateSpeed;
    this.targetSpherical.phi -= deltaY * 0.005 * this.rotateSpeed;
    this.targetSpherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.targetSpherical.phi));
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomAmount = e.deltaY * 0.01 * this.zoomSpeed;
    this.targetSpherical.radius += zoomAmount;
    this.targetSpherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetSpherical.radius));
  };

  destroy() {
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.domElement.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}
