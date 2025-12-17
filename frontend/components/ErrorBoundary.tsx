'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './ui/Button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100 p-4">
          <div className="max-w-2xl w-full">
            <div className="bg-white rounded-2xl shadow-xl p-8">
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="bg-red-100 rounded-full p-4">
                  <AlertTriangle className="w-12 h-12 text-red-600" />
                </div>
              </div>

              {/* Title */}
              <h1 className="text-3xl font-bold text-gray-900 text-center mb-4">
                Beklenmeyen Bir Hata Oluştu
              </h1>

              {/* Description */}
              <p className="text-gray-600 text-center mb-6">
                Üzgünüz, bir şeyler ters gitti. Lütfen sayfayı yenilemeyi deneyin veya destek ekibiyle iletişime geçin.
              </p>

              {/* Error Details (only in development) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6 max-h-96 overflow-auto">
                  <p className="text-sm font-semibold text-red-600 mb-2">Hata:</p>
                  <p className="text-sm font-mono text-red-600 mb-4">
                    {this.state.error.toString()}
                  </p>
                  {this.state.errorInfo && (
                    <>
                      <p className="text-sm font-semibold text-gray-700 mb-2">Component Stack:</p>
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => window.location.reload()}
                  className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Sayfayı Yenile
                </Button>
                <Button
                  onClick={this.handleReset}
                  variant="secondary"
                  className="border-2 border-gray-300 hover:border-gray-400"
                >
                  Tekrar Dene
                </Button>
                <Button
                  onClick={() => window.location.href = '/'}
                  variant="secondary"
                  className="border-2 border-gray-300 hover:border-gray-400 flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Ana Sayfa
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
