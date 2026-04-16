import { Component, ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught an error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-sm border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-lg text-red-900">Something went wrong</CardTitle>
              <CardDescription className="text-red-800">An error occurred while rendering the application</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="bg-white p-3 rounded border border-red-200 overflow-auto max-h-48">
                  <p className="text-xs font-mono text-red-700 whitespace-pre-wrap">{this.state.error?.message}</p>
                </div>
                <p className="text-xs text-red-700">
                  Please refresh the page to try again. If the problem persists, check your browser console for more details.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
