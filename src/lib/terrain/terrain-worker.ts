// Module worker (smooth sculpting): elevation tiles and contour lines from a copy of the height field.
import { createWorkerCore, type WorkerMessage } from './terrain-worker-core'

const core = createWorkerCore()
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null
  postMessage(message: unknown, transfer: ArrayBuffer[]): void
}
scope.onmessage = (event) => {
  const out = core.handle(event.data)
  if (out) scope.postMessage(out.reply, out.transfer)
}
