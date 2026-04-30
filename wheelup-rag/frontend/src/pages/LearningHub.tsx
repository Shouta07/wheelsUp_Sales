import { useState, useEffect, useMemo } from "react";
import {
  fetchTaxonomy,
  fetchQualifications,
  recordProgress,
  fetchProgress,
  type KnowledgeCategory,
  type QualificationItem,
} from "../api/client";

/* ---------- Quiz問題の自動生成 ---------- */

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  categorySlug?: string;
}

function generateQuizFromData(
  categories: KnowledgeCategory[],
  qualifications: QualificationItem[],
): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const subs = categories.filter((c) => c.level === 1);

  // カテゴリベースの問題
  for (const cat of subs) {
    if (cat.typical_roles.length >= 2) {
      questions.push({
        id: `role-${cat.slug}`,
        question: `「${cat.name}」領域の代表的な職種として正しいものは？`,
        options: [
          cat.typical_roles[0],
          "Webデザイナー",
          "経理事務",
          "マーケティングマネージャー",
        ],
        correctIndex: 0,
        explanation: `${cat.name}の代表的な職種には${cat.typical_roles.slice(0, 3).join("、")}などがあります。`,
        categorySlug: cat.slug,
      });
    }

    if (cat.salary_range) {
      questions.push({
        id: `salary-${cat.slug}`,
        question: `「${cat.name}」の一般的な年収帯は？`,
        options: [
          cat.salary_range,
          "200万〜300万円",
          "1500万〜2000万円",
          "100万〜200万円",
        ],
        correctIndex: 0,
        explanation: `${cat.name}の年収帯は${cat.salary_range}です。`,
        categorySlug: cat.slug,
      });
    }

    if (cat.pain_points.length > 0) {
      questions.push({
        id: `pain-${cat.slug}`,
        question: `「${cat.name}」で働く人の典型的な不満として挙げられるのは？`,
        options: [
          cat.pain_points[0],
          "給食がまずい",
          "通勤が楽すぎる",
          "仕事が暇すぎる",
        ],
        correctIndex: 0,
        explanation: `${cat.name}の典型的な不満: ${cat.pain_points.join("、")}`,
        categorySlug: cat.slug,
      });
    }
  }

  // 資格ベースの問題
  for (const q of qualifications) {
    if (q.field) {
      questions.push({
        id: `qual-field-${q.id}`,
        question: `「${q.name}」はどの分野の資格？`,
        options: ["建築", "土木", "設備", "共通"].sort(() => Math.random() - 0.5),
        correctIndex: ["建築", "土木", "設備", "共通"].sort(() => Math.random() - 0.5).indexOf(q.field),
        explanation: `${q.name}は${q.field}分野の${q.category || ""}資格です。${q.description || ""}`,
      });
      // Fix correctIndex after sort
      const opts = ["建築", "土木", "設備", "共通"];
      const shuffled = [...opts].sort(() => Math.random() - 0.5);
      questions[questions.length - 1].options = shuffled;
      questions[questions.length - 1].correctIndex = shuffled.indexOf(q.field);
    }

    if (q.salary_impact) {
      questions.push({
        id: `qual-impact-${q.id}`,
        question: `「${q.name}」取得による年収インパクトは？`,
        options: [
          q.salary_impact,
          "変化なし",
          "年収200〜300万円DOWN",
          "年収1000万円UP",
        ],
        correctIndex: 0,
        explanation: `${q.name}の取得により${q.salary_impact}が見込めます。`,
      });
    }
  }

  // シャッフル
  return questions.sort(() => Math.random() - 0.5);
}

export default function LearningHub() {
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [qualifications, setQualifications] = useState<QualificationItem[]>([]);
  const [userName, setUserName] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [progressData, setProgressData] = useState<{ total_studied: number; completed: number }>({
    total_studied: 0, completed: 0,
  });

  // Quiz state
  const [quizStarted, setQuizStarted] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);

  useEffect(() => {
    fetchTaxonomy().then((r) => setCategories(r.categories)).catch(console.error);
    fetchQualifications().then((r) => setQualifications(r.qualifications)).catch(console.error);
  }, []);

  const quiz = useMemo(
    () => generateQuizFromData(categories, qualifications).slice(0, 10),
    [categories, qualifications],
  );

  const handleLogin = async () => {
    if (!userName.trim()) return;
    setLoggedIn(true);
    try {
      const p = await fetchProgress(userName);
      setProgressData({ total_studied: p.total_studied, completed: p.completed });
    } catch {
      // ignore
    }
  };

  const handleAnswer = (idx: number) => {
    if (showResult) return;
    setSelectedAnswer(idx);
    setShowResult(true);
    if (idx === quiz[currentQ].correctIndex) {
      setScore((s) => s + 1);
    }
  };

  const handleNext = async () => {
    if (currentQ < quiz.length - 1) {
      setCurrentQ((q) => q + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      setQuizDone(true);
      // 進捗保存
      if (loggedIn) {
        try {
          await recordProgress({
            user_name: userName,
            completed: true,
            quiz_score: Math.round((score / quiz.length) * 100),
          });
        } catch {
          // ignore
        }
      }
    }
  };

  const resetQuiz = () => {
    setQuizStarted(false);
    setCurrentQ(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setQuizDone(false);
  };

  const studiedCategories = categories.filter((c) => c.level === 1);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">学習ハブ</h1>
      <p className="text-sm text-gray-500 mb-6">
        建設業界の知識を身につけて、面談の質を高める
      </p>

      {/* ユーザー名入力 */}
      {!loggedIn ? (
        <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-6 text-center">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">名前を入力してスタート</h2>
          <div className="flex justify-center gap-2">
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="あなたの名前"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm w-60"
            />
            <button
              onClick={handleLogin}
              disabled={!userName.trim()}
              className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              スタート
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 進捗サマリー */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-primary-700">{progressData.total_studied}</div>
              <div className="text-xs text-gray-500">学習回数</div>
            </div>
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-green-700">{progressData.completed}</div>
              <div className="text-xs text-gray-500">完了数</div>
            </div>
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 text-center">
              <div className="text-2xl font-bold text-yellow-700">{studiedCategories.length}</div>
              <div className="text-xs text-gray-500">カテゴリ数</div>
            </div>
          </div>

          {/* クイズモード */}
          {!quizStarted ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-6 text-center">
                <h2 className="text-xl font-bold text-gray-900 mb-2">業界知識クイズ</h2>
                <p className="text-sm text-gray-500 mb-4">
                  {quiz.length} 問のクイズで業界知識をチェック。職種・資格・年収・候補者の不満ポイントなど実務に直結する内容です。
                </p>
                <button
                  onClick={() => setQuizStarted(true)}
                  disabled={quiz.length === 0}
                  className="rounded-lg bg-primary-600 px-8 py-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {quiz.length > 0 ? "クイズ開始" : "先に業界マップでデータを投入してください"}
                </button>
              </div>

              {/* 学習カード一覧 */}
              <h2 className="text-lg font-semibold text-gray-800 mt-6">領域別フラッシュカード</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {studiedCategories.map((cat) => (
                  <FlashCard key={cat.id} category={cat} />
                ))}
              </div>

              {studiedCategories.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  業界マップでデータを投入すると学習カードが表示されます
                </p>
              )}
            </div>
          ) : quizDone ? (
            /* クイズ結果 */
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-8 text-center">
              <div className="text-5xl font-bold mb-4">
                {score >= quiz.length * 0.8 ? "🎉" : score >= quiz.length * 0.5 ? "👍" : "📚"}
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                結果: {score} / {quiz.length}
              </h2>
              <p className="text-sm text-gray-500 mb-1">
                正答率: {Math.round((score / quiz.length) * 100)}%
              </p>
              <p className="text-sm text-gray-500 mb-6">
                {score >= quiz.length * 0.8
                  ? "素晴らしい！業界知識が十分に身についています。"
                  : score >= quiz.length * 0.5
                  ? "良いスタートです。業界マップで知識を深めましょう。"
                  : "業界マップと資格ガイドを確認して再チャレンジしましょう。"}
              </p>
              <button
                onClick={resetQuiz}
                className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                もう一度
              </button>
            </div>
          ) : (
            /* クイズ進行中 */
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-500">
                  問題 {currentQ + 1} / {quiz.length}
                </span>
                <span className="text-sm font-medium text-primary-700">
                  正解: {score}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-6">
                <div
                  className="bg-primary-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${((currentQ + 1) / quiz.length) * 100}%` }}
                />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {quiz[currentQ].question}
              </h3>

              <div className="space-y-2 mb-4">
                {quiz[currentQ].options.map((opt, i) => {
                  let btnClass = "border-gray-200 bg-white hover:bg-gray-50";
                  if (showResult) {
                    if (i === quiz[currentQ].correctIndex) {
                      btnClass = "border-green-400 bg-green-50 text-green-800";
                    } else if (i === selectedAnswer && i !== quiz[currentQ].correctIndex) {
                      btnClass = "border-red-400 bg-red-50 text-red-800";
                    }
                  } else if (selectedAnswer === i) {
                    btnClass = "border-primary-400 bg-primary-50";
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswer(i)}
                      className={`w-full text-left rounded-lg border p-3 text-sm transition-colors ${btnClass}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {showResult && (
                <div className={`rounded-lg p-3 mb-4 ${
                  selectedAnswer === quiz[currentQ].correctIndex ? "bg-green-50" : "bg-red-50"
                }`}>
                  <p className="text-sm">
                    {selectedAnswer === quiz[currentQ].correctIndex ? "正解！ " : "不正解。 "}
                    {quiz[currentQ].explanation}
                  </p>
                </div>
              )}

              {showResult && (
                <button
                  onClick={handleNext}
                  className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
                  {currentQ < quiz.length - 1 ? "次の問題" : "結果を見る"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- FlashCard コンポーネント ---------- */

function FlashCard({ category }: { category: KnowledgeCategory }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      onClick={() => setFlipped(!flipped)}
      className="w-full text-left rounded-xl bg-white shadow-sm border border-gray-200 p-4 transition-all hover:shadow-md min-h-[120px]"
    >
      {!flipped ? (
        <>
          <div className="text-sm font-bold text-gray-900 mb-1">{category.name}</div>
          <p className="text-xs text-gray-400">タップして詳細を表示</p>
          {category.growth_trend && (
            <span className="mt-2 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
              {category.growth_trend}
            </span>
          )}
        </>
      ) : (
        <>
          <div className="text-xs font-bold text-primary-700 mb-2">{category.name}</div>
          {category.typical_roles.length > 0 && (
            <div className="text-xs text-gray-600 mb-1">
              <b>職種:</b> {category.typical_roles.slice(0, 3).join("、")}
            </div>
          )}
          {category.salary_range && (
            <div className="text-xs text-gray-600 mb-1">
              <b>年収:</b> {category.salary_range}
            </div>
          )}
          {category.required_qualifications.length > 0 && (
            <div className="text-xs text-gray-600 mb-1">
              <b>資格:</b> {category.required_qualifications.slice(0, 2).join("、")}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">タップで戻る</p>
        </>
      )}
    </button>
  );
}
