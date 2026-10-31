import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 p-6 text-center">
          <h1 className="text-3xl font-bold text-red-600 mb-4">Ops! Algo deu errado.</h1>
          <p className="text-gray-700 mb-6">Ocorreu um erro ao renderizar a página.</p>
          <div className="bg-white p-4 rounded-lg shadow-md max-w-2xl w-full overflow-auto text-left">
            <p className="text-red-500 font-mono text-sm mb-2">{this.state.error?.toString()}</p>
            <details className="whitespace-pre-wrap text-xs text-gray-500">
              {this.state.errorInfo?.componentStack}
            </details>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-8 px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Recarregar Página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;