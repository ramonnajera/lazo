// En el navegador no hay eventos de Tauri: nadie emite, y escuchar no hace nada.
export type UnlistenFn = () => void;
export async function listen<T>(_evento: string, _fn: (e: { payload: T }) => void): Promise<UnlistenFn> {
  return () => {};
}
export async function emit(_evento: string, _payload?: unknown): Promise<void> {}
