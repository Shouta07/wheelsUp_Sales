import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchRecommendations, type RecommendationItem } from "../api/client";
import { useRecommendationChecklist } from "../hooks/usePhaseProgress";

interface CheckItem {
  id: string;
  label: string;
  hint?: string;
  tag: string;
}

interface PhaseSection {
  section: string;
  items: CheckItem[];
}

interface PhaseConfig {
  phase: number;
  title: string;
  subtitle: string;
  candidateTitle: string;
  companyTitle: string;
  candidateSections: PhaseSection[];
  companySections: PhaseSection[];
  tagColors: Record<string, string>;
  tipText: string;
  prevRoute: string | null;
  nextRoute: string | null;
}

function RecommendationSelector({
  recommendations,
  selectedId,
  onSelect,
}: {
  recommendations: RecommendationItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (recommendations.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 border border-dashed border-gray-300 p-4 text-center">
        <p className="text-sm text-gray-500">推薦案件がありません</p>
        <a href="/recommendations" className="text-xs text-primary-600 hover:text-primary-700 mt-1 inline-block">
          候補者×企業ペアを作成する →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recommendations.map((rec) => (
        <button
          key={rec.id}
          onClick={() => onSelect(selectedId === rec.id ? null : rec.id)}
          className={`w-full text-left rounded-lg border p-3 transition-colors ${
            selectedId === rec.id
              ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900">{rec.candidates.name}</span>
              <span className="text-gray-400">→</span>
              <span className="font-medium text-sm text-gray-900">{rec.companies.name}</span>
            </div>
            <StatusBadge status={rec.status} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>{rec.candidates.current_position || "未設定"}</span>
            <span>|</span>
            <span>{rec.companies.industry || "未設定"}</span>
            {rec.deal_id && <span className="text-primary-600">Deal連携済</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    proposed: "bg-blue-100 text-blue-700",
    screening: "bg-yellow-100 text-yellow-700",
    interviewing: "bg-orange-100 text-orange-700",
    offered: "bg-purple-100 text-purple-700",
    placed: "bg-green-100 text-green-700",
    rejected: "bg-gray-100 text-gray-500",
    withdrawn: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    proposed: "提案中",
    screening: "書類選考",
    interviewing: "面接中",
    offered: "内定",
    placed: "成約",
    rejected: "見送り",
    withdrawn: "辞退",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || "bg-gray-100 text-gray-600"}`}>
      {labels[status] || status}
    </span>
  );
}

function ChecklistPanel({
  title,
  sections,
  tagColors,
  checked,
  toggle,
  checkedCount,
  totalItems,
  entityInfo,
  disabled,
}: {
  title: string;
  sections: PhaseSection[];
  tagColors: Record<string, string>;
  checked: Record<string, boolean>;
  toggle: (id: string) => void;
  checkedCount: number;
  totalItems: number;
  entityInfo: React.ReactNode;
  disabled: boolean;
}) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-5">
      <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">{title}</h2>
      {entityInfo}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-primary-600 h-1.5 rounded-full transition-all"
            style={{ width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` }}
          />
        </div>
        <span className="text-xs text-gray-400">
          {checkedCount}/{totalItems}
        </span>
      </div>
      {sections.map((section) => (
        <div key={section.section} className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {section.section}
          </h3>
          <div className="space-y-3">
            {section.items.map((item) => (
              <label
                key={item.id}
                className={`flex items-start gap-3 ${disabled ? "opacity-40" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={!!checked[item.id]}
                  onChange={() => !disabled && toggle(item.id)}
                  disabled={disabled}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm ${checked[item.id] ? "line-through text-gray-400" : "text-gray-900"}`}
                    >
                      {item.label}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${tagColors[item.tag] || "bg-gray-100 text-gray-600"}`}
                    >
                      {item.tag}
                    </span>
                  </div>
                  {item.hint && (
                    <p className="text-xs text-gray-400 mt-0.5">{item.hint}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PhaseLayout({ config }: { config: PhaseConfig }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["recommendations-active"],
    queryFn: () => fetchRecommendations(),
  });

  const recommendations = (data?.recommendations || []).filter(
    (r) => r.status !== "placed" && r.status !== "rejected" && r.status !== "withdrawn",
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = recommendations.find((r) => r.id === selectedId);

  const phaseKey = `phase${config.phase}` as const;
  const candidateInitial = selected ? (selected[`${phaseKey}_candidate` as keyof RecommendationItem] as string[] || []) : [];
  const companyInitial = selected ? (selected[`${phaseKey}_company` as keyof RecommendationItem] as string[] || []) : [];

  const candidateChecklist = useRecommendationChecklist(selectedId, config.phase, "candidate", candidateInitial);
  const companyChecklist = useRecommendationChecklist(selectedId, config.phase, "company", companyInitial);

  const totalCandidate = config.candidateSections.flatMap((s) => s.items).length;
  const totalCompany = config.companySections.flatMap((s) => s.items).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{config.title}</h1>
        <p className="text-sm text-gray-500 mt-1">{config.subtitle}</p>
      </div>

      {/* 推薦案件選択 */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          推薦案件を選択（候補者 → 企業）
        </h2>
        <RecommendationSelector
          recommendations={recommendations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {selected ? (
        <>
          {/* Deal情報 */}
          {selected.deal && (
            <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-200 p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium text-indigo-800">Pipedrive Deal:</span>
                <span className="text-indigo-700">{selected.deal.title}</span>
                <span className="text-xs text-indigo-500">ステージ: {selected.deal.stage_name}</span>
                {selected.deal.days_in_stage > 7 && (
                  <span className="text-xs text-red-600 font-medium">{selected.deal.days_in_stage}日停滞</span>
                )}
              </div>
              {selected.deal.value > 0 && (
                <span className="text-sm font-medium text-indigo-700">
                  {(selected.deal.value / 10000).toFixed(0)}万円
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChecklistPanel
              title={config.candidateTitle}
              sections={config.candidateSections}
              tagColors={config.tagColors}
              checked={candidateChecklist.checked}
              toggle={candidateChecklist.toggle}
              checkedCount={candidateChecklist.checkedCount}
              totalItems={totalCandidate}
              disabled={false}
              entityInfo={
                <div className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
                  <div className="font-medium text-gray-800">{selected.candidates.name}</div>
                  <div className="flex gap-3">
                    <span>{selected.candidates.current_position || "未設定"}</span>
                    <span>年収 {selected.candidates.current_salary ? `${selected.candidates.current_salary}万` : "未設定"}</span>
                    <span>希望地 {selected.candidates.desired_location || "未設定"}</span>
                  </div>
                </div>
              }
            />

            <ChecklistPanel
              title={config.companyTitle}
              sections={config.companySections}
              tagColors={config.tagColors}
              checked={companyChecklist.checked}
              toggle={companyChecklist.toggle}
              checkedCount={companyChecklist.checkedCount}
              totalItems={totalCompany}
              disabled={false}
              entityInfo={
                <div className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
                  <div className="font-medium text-gray-800">{selected.companies.name}</div>
                  <div className="flex gap-3">
                    <span>{selected.companies.industry || "未設定"}</span>
                    <span>{selected.companies.address || "未設定"}</span>
                  </div>
                  {selected.companies.keywords?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selected.companies.keywords.slice(0, 5).map((kw) => (
                        <span key={kw} className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-xs">{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
              }
            />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChecklistPanel
            title={config.candidateTitle}
            sections={config.candidateSections}
            tagColors={config.tagColors}
            checked={{}}
            toggle={() => {}}
            checkedCount={0}
            totalItems={totalCandidate}
            disabled={true}
            entityInfo={<div className="mb-4 text-xs text-gray-400 text-center py-2">上で推薦案件を選択してください</div>}
          />
          <ChecklistPanel
            title={config.companyTitle}
            sections={config.companySections}
            tagColors={config.tagColors}
            checked={{}}
            toggle={() => {}}
            checkedCount={0}
            totalItems={totalCompany}
            disabled={true}
            entityInfo={<div className="mb-4 text-xs text-gray-400 text-center py-2">上で推薦案件を選択してください</div>}
          />
        </div>
      )}

      <div className="mt-6 rounded-xl bg-amber-50 border border-amber-300 p-4 text-center">
        <p className="text-sm font-medium text-amber-800">{config.tipText}</p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        {config.prevRoute ? (
          <button onClick={() => navigate(config.prevRoute!)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">
            ← 前のフェーズ
          </button>
        ) : <div />}
        <span className="text-xs text-gray-400">{config.title} {config.phase}/4</span>
        {config.nextRoute ? (
          <button onClick={() => navigate(config.nextRoute!)} className="px-4 py-2 text-sm font-medium text-primary-700 hover:text-primary-800">
            次のフェーズ →
          </button>
        ) : <div />}
      </div>
    </div>
  );
}

