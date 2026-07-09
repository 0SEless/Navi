export interface ServiceLifecycle {
  init?(): void | Promise<void>
  destroy?(): void | Promise<void>
}

export class ServiceRegistry {
  private services = new Map<string, unknown>()
  private lifecycle = new Map<string, ServiceLifecycle>()

  register<T>(name: string, service: T): void {
    this.services.set(name, service)
    if (typeof (service as any)?.init === 'function' || typeof (service as any)?.destroy === 'function') {
      this.lifecycle.set(name, service as ServiceLifecycle)
    }
  }

  get<T>(name: string): T | undefined {
    return this.services.get(name) as T | undefined
  }

  has(name: string): boolean {
    return this.services.has(name)
  }

  remove(name: string): void {
    this.services.delete(name)
    this.lifecycle.delete(name)
  }

  async init(): Promise<void> {
    for (const [name, svc] of this.lifecycle) {
      await svc.init?.()
    }
  }

  async destroy(): Promise<void> {
    const entries = Array.from(this.lifecycle.entries()).reverse()
    for (const [name, svc] of entries) {
      await svc.destroy?.()
    }
    this.services.clear()
    this.lifecycle.clear()
  }

  get size(): number {
    return this.services.size
  }
}
