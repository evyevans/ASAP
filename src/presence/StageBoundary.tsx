/* ═══════════════════════════════════════════════════════════════════════════
   StageBoundary — the app had no error boundary anywhere. Now the hero has one.

   WHAT IT CATCHES, AND WHAT IT DELIBERATELY CANNOT

   This catches throws during React's render/commit of the Canvas subtree. It
   CANNOT catch a throw inside requestAnimationFrame — that is exactly why the
   original blank canvas was silent, and why useSafeFrame and RenderPipeline's
   try/catch exist as separate layers. Four nets, each covering what the others
   structurally cannot:

     useSafeFrame        a throwing animation callback
     RenderPipeline      a throwing composer / an unsupported pass
     StageBoundary       a throwing React render          ← this file
     renderProbe         nothing threw and nothing drew

   It wraps only the <Canvas>, INSIDE the frame, so a 3D failure leaves the
   card's chrome, live badge and status line intact. Losing the whole hero card
   because one shader failed to compile would be a worse product than losing the
   3D and keeping the information.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface StageBoundaryProps {
  children: ReactNode;
  /** Rendered instead of `children` after a crash. */
  fallback: (reason: string, retry: () => void) => ReactNode;
  onError?: (error: Error) => void;
}

interface StageBoundaryState {
  error: Error | null;
  /** Bumped on retry to force a fresh subtree rather than reusing dead state. */
  attempt: number;
}

export class StageBoundary extends Component<StageBoundaryProps, StageBoundaryState> {
  state: StageBoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<StageBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Loud on purpose. Silence is what let the original bug ship, and the
    // verification harness fails the build on any console.error.
    console.error('[presence] 3D stage crashed:', error, info.componentStack);
    this.props.onError?.(error);
  }

  private retry = (): void => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render(): ReactNode {
    const { error, attempt } = this.state;
    if (error) {
      return this.props.fallback(error.message || 'The 3D stage failed to start.', this.retry);
    }
    // `key` guarantees the retry remounts the Canvas and every WebGL resource
    // under it, instead of resurrecting the state that just crashed.
    return <div key={attempt} className="contents">{this.props.children}</div>;
  }
}
