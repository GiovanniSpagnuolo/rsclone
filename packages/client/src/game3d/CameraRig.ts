// packages/client/src/game3d/CameraRig.ts
import * as THREE from "three";

export class CameraRig {
  // Config
  minDistance = 5;
  maxDistance = 30;
  minPolarAngle = 0.1; // Don't go straight up
  maxPolarAngle = Math.PI / 2 - 0.1; // Don't go below ground
  
  rotateSpeed = 2.0;
  zoomSpeed = 2.0;
  keyRotateSpeed = 1.5; // Multiplier for keyboard rotation

  // State
  private target = new THREE.Vector3(0, 0, 0); // Where the camera looks (The Player)
  private currentTarget = new THREE.Vector3(0, 0, 0); // Smoothed target position
  
  private spherical = new THREE.Spherical(20, Math.PI / 3, Math.PI / 4);
  private targetSpherical = new THREE.Spherical(20, Math.PI / 3, Math.PI / 4);

  // Input State
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  
  // Track held keys
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
    
    // Listen globally for keys (so you don't have to focus the canvas)
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  setTarget(pos: { x: number; y: number; z: number }) {
    this.target.set(pos.x, pos.y, pos.z);
  }

  update(dt: number) {
    // --- 1. Handle Keyboard Input ---
    if (this.keys.ArrowLeft)  this.targetSpherical.theta += this.keyRotateSpeed * dt;
    if (this.keys.ArrowRight) this.targetSpherical.theta -= this.keyRotateSpeed * dt;
    if (this.keys.ArrowUp)    this.targetSpherical.phi -= this.keyRotateSpeed * dt;
    if (this.keys.ArrowDown)  this.targetSpherical.phi += this.keyRotateSpeed * dt;

    // Clamp Phi (Up/Down) immediately to prevent flip
    this.targetSpherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.targetSpherical.phi));

    // --- 2. Smoothing Math ---
    
    // Smoothly move the "look at" point to the player's new position
    const lerpFactor = 1.0 - Math.pow(0.001, dt);
    this.currentTarget.lerp(this.target, lerpFactor);

    // Smoothly interpolate spherical coordinates (Zoom/Rotation)
    this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * (1 - Math.pow(0.001, dt * 2));
    this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * (1 - Math.pow(0.001, dt * 2));
    this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * (1 - Math.pow(0.01, dt * 2));

    // --- 3. Update Camera Transform ---
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    
    this.camera.position.copy(this.currentTarget).add(offset);
    this.camera.lookAt(this.currentTarget);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code in this.keys) {
      this.keys[e.code as keyof typeof this.keys] = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code in this.keys) {
      this.keys[e.code as keyof typeof this.keys] = false;
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
      this.domElement.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.isDragging = false;
    this.domElement.releasePointerCapture(e.pointerId);
  };

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
