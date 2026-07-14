import { BaseEditorService } from '../context'
import type { EditorServiceContext } from '../context/service-registry'
import type { DocumentEventBus } from '../eventbus'
import type { DocumentStore } from '../context/document-store'
import type { WorkflowService } from './workflow-service'
import type { NavigationCompiler, CompileResult } from './navigation-compiler'
import type { ValidationEngine } from '../validation/validation-engine'
import type { PersistenceService } from './persistence-service'
import type { PublishStore, PublishSnapshot, PublishState, PublishResult } from './publish-store'

export class PublishService extends BaseEditorService {
  readonly id = 'publish'
  readonly dependencies: readonly string[] = [
    'workflow', 'navigationCompiler', 'persistence',
    'documentStore', 'eventBus', 'publishStore',
  ] as const

  private publishStore!: PublishStore
  private workflowService!: WorkflowService
  private validationEngine!: ValidationEngine
  private navCompiler!: NavigationCompiler
  private persistence!: PersistenceService
  private documentStore!: DocumentStore
  private eventBus!: DocumentEventBus

  private currentPublishPromise: Promise<void> | null = null

  constructor(publishStore: PublishStore) {
    super()
    this.publishStore = publishStore
  }

  async init(context: EditorServiceContext): Promise<void> {
    await super.init(context)
    this.workflowService = context.get('workflow')
    this.validationEngine = context.get('validationEngine')
    this.navCompiler = context.get('navigationCompiler')
    this.persistence = context.get('persistence')
    this.documentStore = context.get('documentStore')
    this.eventBus = context.get('eventBus')
  }

  getSnapshot(): PublishSnapshot {
    return this.publishStore.getSnapshot()
  }

  isPublishing(): boolean {
    const state = this.publishStore.getSnapshot().publishState
    return state !== 'idle' && state !== 'success' && state !== 'error'
  }

  publish(): Promise<void> {
    if (this.currentPublishPromise) {
      return this.currentPublishPromise
    }

    this.currentPublishPromise = this.runPublish().finally(() => {
      this.currentPublishPromise = null
    })
    return this.currentPublishPromise
  }

  private async runPublish(): Promise<void> {
    this.assertCanPublish()

    const document = this.documentStore.document as any
    const revision = this.documentStore.version

    this.transition('preparing')

    const startedAt = Date.now()

    this.transition('validating')

    const snapshot = this.validationEngine.validate(this.documentStore.document as any, 'publish')
    if (snapshot.statistics.errors > 0) {
      this.fail('Validation failed')
      return
    }

    this.transition('compiling')

    const compileResult: CompileResult = await this.navCompiler.compile(document)
    if (compileResult.status !== 'success' || !compileResult.artifacts) {
      this.fail(compileResult.message ?? 'Compilation failed')
      return
    }

    this.transition('uploading')

    const publishResult = await this.persistence.publish(compileResult.artifacts)
    if (!publishResult.success) {
      this.fail(publishResult.message ?? 'Publish failed')
      return
    }

    const finishedAt = Date.now()
    const navGraph = compileResult.artifacts.navigationGraph as any

    this.publishStore.updatePublishState({
      publishState: 'success',
      publishResult: {
        revision,
        compiledGraphVersion: navGraph?.version ?? '0.0.0',
        campusId: document?.metadata?.name ?? 'unknown',
        artifactCount: Object.keys(compileResult.artifacts).length,
        nodeCount: navGraph?.nodes?.length ?? 0,
        edgeCount: navGraph?.edges?.length ?? 0,
        startedAt,
        finishedAt,
      },
      publishError: null,
      lastPublishedRevision: revision,
      lastPublishedAt: finishedAt,
    })

    this.eventBus.emit('publish.completed', { revision, finishedAt })
  }

  private assertCanPublish(): void {
    if (this.isPublishing()) throw new Error('Already publishing')
    const snap = this.validationEngine.getLastSnapshot()
    if (snap && snap.statistics.errors > 0) throw new Error('Validation has errors')
    if (this.workflowService.isSaving()) throw new Error('Save in progress')
    if (this.workflowService.hasUnsavedChanges()) throw new Error('Document has unsaved changes')
  }

  private transition(state: PublishState): void {
    this.publishStore.updatePublishState({
      publishState: state,
      publishError: null,
      currentStageStartedAt: Date.now(),
    })
  }

  private fail(message: string): void {
    this.publishStore.updatePublishState({
      publishState: 'error',
      publishError: message,
    })
  }
}