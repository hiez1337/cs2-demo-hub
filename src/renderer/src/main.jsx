import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled React Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-[#121212] text-slate-100 flex items-center justify-center p-6 select-none font-sans">
          <div className="w-full max-w-lg bg-[#1c1c1c] border border-rose-500/30 rounded-none p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#C42B1C]" />

            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-12 h-12 rounded-none bg-[#222222] border border-rose-500/30 flex items-center justify-center text-rose-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-black text-white">Произошла ошибка интерфейса</h1>
                <p className="text-xs text-slate-400">Приложение столкнулось с непредвиденной ошибкой</p>
              </div>
            </div>

            <div className="bg-[#161616] border border-white/10 rounded-none p-4 mb-6">
              <p className="text-xs font-mono text-rose-300 break-words">
                {this.state.error?.message || String(this.state.error || 'Неизвестная ошибка')}
              </p>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={this.handleReload}
                className="px-5 py-2.5 rounded-none text-xs font-bold text-white bg-[#0078D4] hover:bg-[#1084D9] active:bg-[#006CBE] transition-colors cursor-pointer"
              >
                Перезагрузить
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
