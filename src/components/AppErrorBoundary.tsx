import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw, ShieldAlert } from 'lucide-react'
import { BrandMark } from './BrandMark'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  failed: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Le Dressing UI error', error.name, info.componentStack)
  }

  private reload = () => window.location.reload()

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="app-error" role="alert">
        <BrandMark />
        <span className="app-error-icon"><ShieldAlert size={28} /></span>
        <p className="eyebrow">Récupération de l’application</p>
        <h1>Un petit imprévu est survenu.</h1>
        <p>Votre dressing n’est pas supprimé. Rechargez simplement l’application pour reprendre là où vous en étiez.</p>
        <button type="button" className="primary-button" onClick={this.reload}>
          <RefreshCw size={17} /> Recharger Le Dressing
        </button>
      </main>
    )
  }
}
