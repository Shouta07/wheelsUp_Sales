import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMeetings, type MeetingTranscript } from "../../api/client";
import { isLeader as isLeaderRole } from "../../lib/team";

/**
 * 「今日のミッション」ヒーロー領域。
 * ログイン直後にユーザーが「次に何すべきか」を一目で把握できるようにする。
 * 状態別に CTA を出し分ける:
 *  - 面談 0 件:        「最初の面談を追加する」
 *  - 未採点あり:        「N 件の面談を採点する」
 *  - アウトカム未記録:  「M 件の面談結果を記録する (CVR 計測のため)」
 *  - 全て完了:          「弱い軸を学ぶ」(プレイブック誘導)
 */
export default function TodayMission({ currentUser }: { currentUser: string }) {
  const isLeaderUser = isLeaderRole(currentUser);
  const { data: myMeetings } = useQuery({
    queryKey: ["meetings", "mine", currentUser],
    queryFn: () => fetchMeetings(undefined, undefined, currentUser),
    enabled: !!currentUser,
  });

  const mission = useMemo(() => {
    const meetings = myMeetings?.transcripts || [];
    if (meetings.length === 0) {
      return {
        emoji: "📝",
        title: "最初の面談を追加しよう",
        body: "議事録テキストを貼るだけで AI が 5 軸で採点します",
        cta: "面談ライブラリの「+ 面談を追加」を押す",
        color: "#1CB0F6",
      };
    }
    const unscored = meetings.filter((m: MeetingTranscript) => m.transcript_text && !m.score_data);
    if (unscored.length > 0) {
      return {
        emoji: "▶",
        title: `${unscored.length} 件の面談を採点しよう`,
        body: "リーダー (小林) の流派で 5 軸採点し、改善ポイントを見ます",
        cta: "「▶ AI 採点する」をクリック",
        color: "#FF9600",
      };
    }
    const noOutcome = meetings.filter((m: MeetingTranscript) => m.score_data && !m.outcome?.recorded_at);
    if (noOutcome.length > 0) {
      return {
        emoji: "📊",
        title: `${noOutcome.length} 件の面談結果を記録しよう`,
        body: "次回予約取れた? 応募進んだ? を記録すると CVR 分析が始まります",
        cta: "面談を展開して「この面談の結果」セクションをクリック",
        color: "#58CC02",
      };
    }
    // 弱い軸を計算
    const scored = meetings.filter((m: MeetingTranscript) => m.score_data?.scores);
    const avg = scored.reduce(
      (acc, m) => {
        const s = m.score_data!.scores;
        return {
          needs: acc.needs + s.needs,
          proposal: acc.proposal + s.proposal,
          trust: acc.trust + s.trust,
          closing: acc.closing + s.closing,
          intel: acc.intel + s.intel,
        };
      },
      { needs: 0, proposal: 0, trust: 0, closing: 0, intel: 0 },
    );
    const n = scored.length || 1;
    const axes = (Object.entries(avg) as [keyof typeof avg, number][])
      .map(([k, v]) => ({ k, v: v / n }))
      .sort((a, b) => a.v - b.v);
    const weakest = axes[0];
    const labels: Record<string, string> = {
      needs: "ニーズ深掘り", proposal: "提案力", trust: "信頼構築", closing: "前進", intel: "情報収集",
    };
    return {
      emoji: "📚",
      title: `「${labels[weakest.k]}」が弱いポイント`,
      body: `平均 ${weakest.v.toFixed(1)} / 10。リーダープレイブックで型を学びましょう`,
      cta: "下の「リーダープレイブック」を見る",
      color: "#CE82FF",
    };
  }, [myMeetings]);

  if (isLeaderUser) {
    return (
      <div className="card-duo p-4 mb-5" style={{ borderLeft: `4px solid #FFC800` }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">👑</span>
          <span className="text-sm font-extrabold text-[#4b4b4b]">リーダーモード</span>
        </div>
        <p className="text-[11px] font-bold text-[#777] leading-relaxed">
          リーダータブから 15 件の教師データを管理。メンバーの面談を採点した時、最新の小林スタイルで評価されます。
        </p>
      </div>
    );
  }

  return (
    <div className="card-duo p-4 mb-5" style={{ borderLeft: `4px solid ${mission.color}` }}>
      <div className="flex items-start gap-3">
        <span className="text-3xl shrink-0">{mission.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1" style={{ color: mission.color }}>
            今日のミッション
          </div>
          <p className="text-sm font-extrabold text-[#4b4b4b] leading-snug">{mission.title}</p>
          <p className="text-[11px] font-bold text-[#777] mt-1 leading-relaxed">{mission.body}</p>
          <p className="text-[10px] font-bold text-[#aaa] mt-1.5">→ {mission.cta}</p>
        </div>
      </div>
    </div>
  );
}
