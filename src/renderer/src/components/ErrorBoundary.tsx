import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppLogo } from '@renderer/brand'
import { BRAND_NAME } from '@shared/brand'
import { Button } from './ui/button'

type Props = { children: ReactNode }
type State = {
  error: Error | null
  info: string | null
  copyDone: boolean
  exportNote: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null, copyDone: false, exportNote: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer error', error, info)
    this.setState({ info: info.componentStack ?? null })
  }

  private detailsText(): string {
    const err = this.state.error
    return [
      `${BRAND_NAME} renderer error`,
      'Code: RENDERER_ERROR',
      err?.name,
      err?.message,
      err?.stack,
      this.state.info,
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md rounded-lg border bg-white p-6 shadow-sm">
            <AppLogo size="sm" className="mb-4" />
            <h1 className="text-lg font-semibold text-destructive">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message}</p>
            <p className="mt-1 font-mono text-xs text-slate-500">RENDERER_ERROR</p>
            {this.state.exportNote ? (
              <p className="mt-2 text-xs text-emerald-700">{this.state.exportNote}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(this.detailsText()).then(() => {
                    this.setState({ copyDone: true })
                  })
                }}
              >
                {this.state.copyDone ? 'Copied' : 'Copy details'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void (async () => {
                    try {
                      const { api } = await import('@renderer/lib/api')
                      const picked = await api.dialog.pickFolder({
                        title: 'Save diagnostics to…',
                      })
                      if (!picked.path) return
                      const res = await api.diagnostics.export(picked.path)
                      await api.shell.openPath(picked.path)
                      this.setState({ exportNote: `Saved ${res.zipPath}` })
                    } catch (err) {
                      this.setState({
                        exportNote:
                          err instanceof Error ? err.message : 'Export diagnostics failed',
                      })
                    }
                  })()
                }}
              >
                Export diagnostics
              </Button>
              <Button
                onClick={() =>
                  this.setState({ error: null, info: null, copyDone: false, exportNote: null })
                }
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
