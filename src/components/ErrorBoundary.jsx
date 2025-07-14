// ErrorBoundary.jsx
import React from 'react';
import { Alert } from 'antd';

class ErrorBoundary extends React.Component {
    state = { hasError: false, error: null };

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Alert
                    message="Error rendering component"
                    description={this.state.error?.message || 'Unknown error'}
                    type="error"
                    showIcon
                />
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;