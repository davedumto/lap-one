// Tracks every geometry, material, texture and render target the engine creates so dispose()
// can free all of them deterministically, instead of relying on scene.traverse (which misses
// textures/targets that are not attached to a currently-traversable mesh, e.g. scene.environment
// or a canvas texture referenced only by closure).
export interface Disposable { dispose: () => void }

export class DisposalRegistry {
  private items: Disposable[] = [];

  track<T extends Disposable>(item: T): T {
    this.items.push(item);
    return item;
  }

  disposeAll(): void {
    for (const item of this.items) {
      try { item.dispose(); } catch { /* best-effort cleanup */ }
    }
    this.items = [];
  }
}
