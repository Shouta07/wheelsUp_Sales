import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * データ読み込み失敗時のインライン表示。
 * 各画面が catch した Error を渡すと、日本語メッセージ + 再試行ボタンを出す。
 */
export function LoadError({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-center">
      <div className="text-2xl mb-1">📡</div>
      <p className="text-sm font-bold text-amber-900 mb-1">データを読み込めませんでした</p>
      <p className="text-xs text-amber-700 mb-3 leading-relaxed break-words">{error.message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-1.5 rounded-lg bg-[#58CC02] text-white text-xs font-black hover:bg-[#46a302]"
          style={{ borderBottom: "2px solid #46a302" }}
        >
          🔄 再試行
        </button>
      )}
    </div>
  );
}

/**
 * RA 画面全体を包むエラーバウンダリ。
 *
 * 現場ユーザー向け: 想定外の例外 (データ形式不一致・undefined 参照など) が起きても
 * 白画面でクラッシュさせず、「何が起きたか + どうすればいいか」を日本語で表示する。
 */
type Props = { children: ReactNode };
type State = { error: Error | null };

export default class RaErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 開発時の調査用にコンソールへ残す (本番でも害はない)
    console.error("[RA] 画面エラー:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto max-w-xl mt-16 px-4">
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-lg font-black text-[#4b4b4b] mb-2">
            画面の表示中に問題が発生しました
          </h2>
          <p className="text-sm text-[#777] mb-4 leading-relaxed">
            一時的な不具合の可能性があります。下のボタンで再読み込みしてください。<br />
            繰り返し出る場合は、時間をおいて再度お試しください。
          </p>
          <button
            onClick={this.handleReload}
            className="px-5 py-2.5 rounded-xl bg-[#58CC02] text-white text-sm font-black hover:bg-[#46a302]"
            style={{ borderBottom: "3px solid #46a302" }}
          >
            🔄 ページを再読み込み
          </button>
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-[10px] text-[#afafaf]">技術的な詳細</summary>
            <pre className="mt-1 text-[10px] text-[#999] whitespace-pre-wrap break-all">
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
