import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button, Card } from '@/components/ui';
// A class component, so the hook is out; this reads the language directly.
import { translate, currentLanguage } from '@/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      const t = (key: Parameters<typeof translate>[1]) => translate(currentLanguage(), key);
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card padding="lg" className="w-full max-w-md text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <h1 className="mb-2 text-2xl font-bold">
              {t('common.somethingWrong')}
            </h1>

            <p className="mb-6 text-ink-500">
              {t('common.unexpectedError')}
            </p>

            <div className="space-y-3">
              <Button 
                onClick={this.handleReload}
                className="w-full"
                icon={<RefreshCw className="w-4 h-4" />}
              >
                {t('common.tryAgain')}
              </Button>
              
              <Button 
                onClick={this.handleGoHome}
                variant="secondary"
                className="w-full"
                icon={<Home className="w-4 h-4" />}
              >
                {t('common.goHome')}
              </Button>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm font-medium text-ink-700">
                  {t('common.errorDetails')}
                </summary>
                <pre className="mt-2 overflow-auto rounded-xl bg-black/[0.04] p-3 text-xs text-rose-600">
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;