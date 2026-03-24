export {};

declare global {
  interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
  }

  interface DurableObjectState {
    storage: DurableObjectStorage;
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  }

  interface DurableObjectId {}

  interface DurableObjectStub {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  }

  interface DurableObjectNamespace {
    idFromName(name: string): DurableObjectId;
    get(id: DurableObjectId): DurableObjectStub;
  }

  interface DynamicWorkerDefinition {
    compatibilityDate: string;
    mainModule: string;
    modules: Record<string, string>;
  }

  interface DynamicWorkerEntrypoint {
    fetch(request: Request): Promise<Response>;
  }

  interface DynamicWorkerHandle {
    getEntrypoint(name?: string): DynamicWorkerEntrypoint;
  }

  interface WorkerLoader {
    get(
      id: string,
      factory: () => DynamicWorkerDefinition | Promise<DynamicWorkerDefinition>,
    ): DynamicWorkerHandle;
    load(definition: DynamicWorkerDefinition): DynamicWorkerHandle;
  }
}
