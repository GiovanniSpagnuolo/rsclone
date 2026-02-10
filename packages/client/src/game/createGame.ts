import Phaser from "phaser";
import { MainScene } from "./scene";

export function createGame(container: HTMLDivElement, token: string) {
  (window as any).__wsToken = token;

  let statusSetter: ((s: string) => void) | null = null;
  (window as any).__setStatus = (s: string) => statusSetter?.(s);

  // scene will set this when WS is ready
  (window as any).__chatSend = null;

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: container,
    width: container.clientWidth,
    height: container.clientHeight,
    backgroundColor: "#0b0b0b",
    scene: [MainScene],
    fps: { target: 60, forceSetTimeOut: true }
  };

  const game = new Phaser.Game(config);

  const resize = () => game.scale.resize(container.clientWidth, container.clientHeight);
  window.addEventListener("resize", resize);

  return {
    setStatusText(fn: (s: string) => void) {
      statusSetter = fn;
    },
    destroy() {
      window.removeEventListener("resize", resize);
      try { game.destroy(true); } catch {}

      statusSetter = null;
      (window as any).__setStatus = null;
      (window as any).__wsToken = null;
      (window as any).__chatSend = null;
    }
  };
}
