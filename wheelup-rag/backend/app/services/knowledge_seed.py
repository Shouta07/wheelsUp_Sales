"""建設業界ナレッジ初期データ — 土木/建築の業界構造マスタ。

`seed_industry_knowledge()` を呼ぶとカテゴリ・資格データを一括投入する。
既にデータがある場合はスキップする。
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func

from app.core.database import async_session
from app.models.knowledge import IndustryCategory, Qualification

logger = logging.getLogger(__name__)

# ---------- 業界カテゴリ定義 ---------- #

CATEGORIES = [
    # ===== 大分類: 建築 =====
    {
        "name": "建築",
        "slug": "architecture",
        "level": 0,
        "sort_order": 1,
        "description": "建物の設計・施工・管理に関わる領域。住宅からオフィスビル、商業施設、公共建築物まで幅広い。",
        "market_overview": "国内建築市場は約35兆円規模。都市再開発・老朽化対策の需要が堅調。2025年以降は万博関連、大規模再開発が牽引。",
        "growth_trend": "安定〜拡大",
        "children": [
            {
                "name": "建築設計",
                "slug": "arch-design",
                "level": 1,
                "sort_order": 1,
                "description": "建物の意匠設計・構造設計・設備設計を行う領域。",
                "market_overview": "設計事務所・ゼネコン設計部・デベロッパー設計部門に需要。BIM導入が加速中。",
                "typical_roles": ["意匠設計", "構造設計", "設備設計", "BIMマネージャー", "確認申請担当"],
                "required_qualifications": ["一級建築士", "二級建築士", "構造設計一級建築士"],
                "salary_range": "450万〜900万円（一級建築士取得後は600万〜）",
                "growth_trend": "安定",
                "selling_points": ["設計の裁量が大きい案件", "BIM先進企業", "意匠にこだわれる環境"],
                "pain_points": ["長時間労働", "デザインと予算の板挟み", "確認申請の煩雑さ"],
                "talking_tips": "「現在のプロジェクト規模感」「BIM使用率」「残業実態」を最初に聞くと信頼を得やすい。設計者はこだわりが強いので、会社の設計哲学への共感がキー。",
            },
            {
                "name": "建築施工管理",
                "slug": "arch-construction",
                "level": 1,
                "sort_order": 2,
                "description": "建築工事の現場監督・工程管理・品質管理・安全管理を行う。ゼネコン・サブコンの中核職種。",
                "market_overview": "慢性的な人手不足。2024年問題（残業上限規制）により、転職市場が活況。未経験〜ベテランまで幅広い求人。",
                "typical_roles": ["建築施工管理", "現場所長", "工事主任", "品質管理", "安全管理"],
                "required_qualifications": ["1級建築施工管理技士", "2級建築施工管理技士"],
                "salary_range": "400万〜800万円（所長クラスは900万超も）",
                "growth_trend": "拡大",
                "selling_points": ["残業削減に取り組む企業", "転勤なし", "元請案件メイン", "現場の裁量"],
                "pain_points": ["長時間残業", "転勤の多さ", "休日出勤", "人間関係（職人対応）"],
                "talking_tips": "「今の現場の残業時間」「転勤頻度」「元請/下請の比率」が最重要関心事。2024年問題への会社の対応姿勢を聞くと本音が出やすい。",
            },
            {
                "name": "建築設備",
                "slug": "arch-mep",
                "level": 1,
                "sort_order": 3,
                "description": "空調・衛生・電気など建物内の設備工事の設計・施工管理。サブコン中心。",
                "market_overview": "省エネ・ZEB対応で需要増加。設備の高度化（IoT、BAS）により専門性が求められる。",
                "typical_roles": ["設備施工管理（空調）", "設備施工管理（衛生）", "電気施工管理", "設備設計"],
                "required_qualifications": ["1級管工事施工管理技士", "1級電気工事施工管理技士", "建築設備士"],
                "salary_range": "400万〜750万円",
                "growth_trend": "拡大",
                "selling_points": ["省エネ・ZEB案件の最前線", "IoT/スマートビル案件", "資格手当充実"],
                "pain_points": ["建築側との調整が大変", "夜間作業", "資格取得のプレッシャー"],
                "talking_tips": "設備系は「どの設備に強いか（空調/衛生/電気）」で求人マッチが大きく変わる。経験設備を最初に確認。",
            },
            {
                "name": "不動産・PM/FM",
                "slug": "arch-pm-fm",
                "level": 1,
                "sort_order": 4,
                "description": "竣工後の建物運用。プロパティマネジメント（PM）、ファシリティマネジメント（FM）、ビルメンテナンス。",
                "market_overview": "既存ストック活用の流れで市場拡大。デベロッパー・AM会社・独立系PM会社・ビルメン会社に需要。",
                "typical_roles": ["プロパティマネージャー", "ファシリティマネージャー", "ビルマネジメント", "テナントリーシング", "CRE担当"],
                "required_qualifications": ["宅地建物取引士", "ビル経営管理士", "ファシリティマネージャー", "管理業務主任者"],
                "salary_range": "400万〜800万円（AM寄りは1000万超も）",
                "growth_trend": "拡大",
                "selling_points": ["ワークライフバランス良好", "年収UP可能", "オフィスワーク中心", "不動産知識が活きる"],
                "pain_points": ["施工管理からの転身だと年収ダウンの可能性", "テナント対応のストレス", "地味に見られがち"],
                "talking_tips": "施工管理経験者は「現場を離れたい」動機が多い。PM/FMは残業少なめ＋オフィスワークが訴求ポイント。ただし年収は要確認。",
            },
        ],
    },

    # ===== 大分類: 土木 =====
    {
        "name": "土木",
        "slug": "civil-engineering",
        "level": 0,
        "sort_order": 2,
        "description": "道路・橋梁・トンネル・ダム・港湾・上下水道などのインフラ整備に関わる領域。",
        "market_overview": "国土強靱化計画、インフラ老朽化対策で安定需要。i-Construction（ICT施工）の推進が業界変革中。",
        "growth_trend": "安定",
        "children": [
            {
                "name": "土木施工管理",
                "slug": "civil-construction",
                "level": 1,
                "sort_order": 1,
                "description": "道路・橋梁・トンネル・河川・造成工事等の現場管理。公共工事が中心。",
                "market_overview": "慢性的な人手不足はこちらも深刻。i-Construction対応できる人材が高評価。地方でも求人多数。",
                "typical_roles": ["土木施工管理", "現場代理人", "主任技術者", "監理技術者"],
                "required_qualifications": ["1級土木施工管理技士", "2級土木施工管理技士", "技術士（建設部門）"],
                "salary_range": "400万〜800万円（監理技術者は700万〜）",
                "growth_trend": "安定",
                "selling_points": ["公共工事の安定性", "ICT施工の経験", "地元密着", "社会貢献度の高さ"],
                "pain_points": ["僻地の現場", "長期出張", "天候に左右される", "書類作業の多さ"],
                "talking_tips": "「直近の現場エリア」「出張頻度」「発注者との関係性」が関心事。土木は公共工事比率が高いので、発注者側（官公庁）への転身ニーズも探る。",
            },
            {
                "name": "土木設計・コンサル",
                "slug": "civil-design",
                "level": 1,
                "sort_order": 2,
                "description": "インフラの計画・設計を行う建設コンサルタント。道路・橋梁・河川・都市計画など。",
                "market_overview": "技術士が評価される世界。防災・減災、老朽化対策、PPP/PFI案件が増加中。",
                "typical_roles": ["技術士（建設部門）", "土木設計技術者", "計画コンサルタント", "測量技術者"],
                "required_qualifications": ["技術士（建設部門）", "RCCM", "測量士"],
                "salary_range": "450万〜900万円（技術士取得後は600万〜）",
                "growth_trend": "安定",
                "selling_points": ["デスクワーク中心", "専門性が高く市場価値維持", "発注者に近い立場"],
                "pain_points": ["年度末の繁忙期", "役所対応の煩雑さ", "プロポーザル競争"],
                "talking_tips": "「保有資格（技術士の部門・科目）」が最重要。技術士の専門分野でマッチング精度が決まる。",
            },
            {
                "name": "プラント・エネルギー",
                "slug": "civil-plant",
                "level": 1,
                "sort_order": 3,
                "description": "発電所・化学プラント・上下水処理施設などの設計・施工・メンテナンス。",
                "market_overview": "再生可能エネルギー（洋上風力、太陽光）案件が急増。老朽化プラントの更新需要も。",
                "typical_roles": ["プラントエンジニア", "プラント施工管理", "プロセスエンジニア", "メンテナンス管理"],
                "required_qualifications": ["1級土木施工管理技士", "1級管工事施工管理技士", "エネルギー管理士"],
                "salary_range": "500万〜1000万円（海外案件は1200万超も）",
                "growth_trend": "拡大",
                "selling_points": ["高年収", "海外案件", "再エネの成長領域", "専門性の希少価値"],
                "pain_points": ["僻地勤務", "海外長期出張", "プラント停止中の集中工事"],
                "talking_tips": "プラント経験者は希少。「対応プラント種別」「海外経験の有無」が年収に直結する。高年収を維持したい人が多い。",
            },
        ],
    },

    # ===== 大分類: 共通・横断領域 =====
    {
        "name": "共通・横断領域",
        "slug": "cross-functional",
        "level": 0,
        "sort_order": 3,
        "description": "土木・建築の両方にまたがる職種・領域。",
        "market_overview": "DX推進、安全管理強化、コンプライアンス対応など、業界横断で需要が拡大中。",
        "growth_trend": "拡大",
        "children": [
            {
                "name": "積算・コスト管理",
                "slug": "cost-management",
                "level": 1,
                "sort_order": 1,
                "description": "工事の数量算出・見積作成・コスト管理を行う。利益管理の要。",
                "typical_roles": ["積算", "コストマネージャー", "購買・調達"],
                "required_qualifications": ["建築積算士", "建築コスト管理士"],
                "salary_range": "400万〜700万円",
                "selling_points": ["オフィスワーク", "残業比較的少なめ", "専門性高い"],
                "pain_points": ["地味なイメージ", "入札時期の繁忙"],
                "talking_tips": "「現場を離れたいが建設知識は活かしたい」人に最適。施工管理からの転向が多い。",
            },
            {
                "name": "建設DX・ICT",
                "slug": "construction-dx",
                "level": 1,
                "sort_order": 2,
                "description": "BIM/CIM、ドローン測量、AI施工管理、IoTセンサーなど建設テックの推進。",
                "typical_roles": ["BIM/CIMマネージャー", "DX推進担当", "ICT施工担当", "建設テック開発"],
                "required_qualifications": [],
                "salary_range": "500万〜900万円",
                "growth_trend": "急拡大",
                "selling_points": ["最先端技術", "業界変革の当事者", "キャリアの希少性"],
                "pain_points": ["社内理解が得られない", "導入抵抗", "スキル習得の負荷"],
                "talking_tips": "IT × 建設のダブルスキルは超希少。「建設現場経験＋デジタルスキル」の人材は各社争奪戦。",
            },
            {
                "name": "安全・品質・環境",
                "slug": "safety-quality",
                "level": 1,
                "sort_order": 3,
                "description": "安全管理、品質管理、環境マネジメントの専門職。本社部門やコンサル会社に需要。",
                "typical_roles": ["安全管理者", "品質管理者", "ISO担当", "環境コンサルタント"],
                "required_qualifications": ["安全管理者", "品質管理検定"],
                "salary_range": "400万〜700万円",
                "selling_points": ["内勤中心", "ワークライフバランス", "経験の汎用性"],
                "pain_points": ["現場巡回の負荷", "是正指摘の人間関係"],
                "talking_tips": "現場疲れしたベテランの受け皿。「現場に出る頻度」が転職の決め手になる。",
            },
        ],
    },
]

# ---------- 資格マスタ定義 ---------- #

QUALIFICATIONS = [
    # 建築系
    {
        "name": "一級建築士",
        "category": "国家資格",
        "field": "建築",
        "difficulty": "高",
        "description": "建築物の設計・工事監理を行うために必要な資格。規模制限なし。",
        "market_value": "建築業界の最高峰資格。転職市場で圧倒的に有利。設計事務所・ゼネコン・デベロッパーすべてで評価される。",
        "salary_impact": "年収50〜150万円UP。取得により600万円以上が現実的。",
        "related_roles": ["意匠設計", "構造設計", "設備設計", "確認申請", "プロジェクトマネージャー"],
        "tips_for_consultant": "一級建築士保持者は引く手あまた。現職の不満を丁寧に聞き、条件改善の余地が大きいことを伝えると動きやすい。",
    },
    {
        "name": "1級建築施工管理技士",
        "category": "国家資格",
        "field": "建築",
        "difficulty": "中〜高",
        "description": "建築工事の施工管理を行うための資格。監理技術者になるために必須。",
        "market_value": "施工管理職では必須級。元請の監理技術者になれるため、ゼネコンでの評価が高い。",
        "salary_impact": "年収30〜100万円UP。資格手当月2〜5万円が一般的。",
        "related_roles": ["建築施工管理", "現場所長", "工事主任"],
        "tips_for_consultant": "「1施工（いちせこう）」と略す。持っていない人には取得支援制度のある企業を訴求ポイントに。",
    },
    {
        "name": "1級土木施工管理技士",
        "category": "国家資格",
        "field": "土木",
        "difficulty": "中〜高",
        "description": "土木工事の施工管理を行うための資格。公共工事の監理技術者に必須。",
        "market_value": "公共工事では配置義務あり。地方ゼネコンでは特に重宝される。",
        "salary_impact": "年収30〜100万円UP。",
        "related_roles": ["土木施工管理", "現場代理人", "監理技術者"],
        "tips_for_consultant": "公共工事経験＋この資格のセットは非常に強い。「経審点」に影響するため、会社の評価も高い。",
    },
    {
        "name": "技術士（建設部門）",
        "category": "国家資格",
        "field": "土木",
        "difficulty": "高",
        "description": "建設分野の最高峰技術資格。建設コンサルタント業務の管理技術者に必須。",
        "market_value": "建設コンサルでは必須。ゼネコン・官公庁でも高評価。部門・科目が細分化されている。",
        "salary_impact": "年収80〜200万円UP。取得により700万円以上が現実的。",
        "related_roles": ["建設コンサルタント", "計画技術者", "管理技術者"],
        "tips_for_consultant": "「どの科目か」が重要（道路/河川/構造/都市計画等）。科目で求人マッチが完全に変わる。必ず確認。",
    },
    {
        "name": "宅地建物取引士",
        "category": "国家資格",
        "field": "共通",
        "difficulty": "中",
        "description": "不動産取引の重要事項説明を行うための資格。不動産業界の基本資格。",
        "market_value": "PM/FM/不動産管理では必須級。建設から不動産へのキャリアチェンジの足がかり。",
        "salary_impact": "年収20〜50万円UP。資格手当月1〜3万円。",
        "related_roles": ["プロパティマネージャー", "テナントリーシング", "不動産営業", "CRE"],
        "tips_for_consultant": "施工管理→PM/FM転向組は「宅建持ってるか」が最初の分岐点。持っていれば選択肢が広がる。",
    },
    {
        "name": "1級管工事施工管理技士",
        "category": "国家資格",
        "field": "設備",
        "difficulty": "中",
        "description": "空調・給排水衛生設備の施工管理資格。サブコン必須。",
        "market_value": "設備サブコンの中核資格。空調/衛生の設備施工管理職では必須。",
        "salary_impact": "年収30〜80万円UP。",
        "related_roles": ["設備施工管理（空調）", "設備施工管理（衛生）", "設備設計"],
        "tips_for_consultant": "設備系は「空調か衛生か」の専門性が重要。両方できる人は市場価値が高い。",
    },
    {
        "name": "1級電気工事施工管理技士",
        "category": "国家資格",
        "field": "設備",
        "difficulty": "中",
        "description": "電気設備の施工管理資格。電気サブコン・ゼネコン電気部門で必須。",
        "market_value": "再エネ（太陽光・蓄電池）普及で需要急増。",
        "salary_impact": "年収30〜80万円UP。",
        "related_roles": ["電気施工管理", "電気設計", "再エネ施工管理"],
        "tips_for_consultant": "再エネ・EV充電インフラの経験があると市場価値がさらに上がる。",
    },
    {
        "name": "建築設備士",
        "category": "国家資格",
        "field": "設備",
        "difficulty": "中〜高",
        "description": "建築設備の設計・工事監理について助言を行う資格。一級建築士の受験資格にもなる。",
        "market_value": "設備設計の専門性を証明。設計事務所の設備部門で評価が高い。",
        "salary_impact": "年収30〜60万円UP。",
        "related_roles": ["設備設計", "設備コンサルタント"],
        "tips_for_consultant": "この資格→一級建築士のキャリアパスを知っておくと、候補者のキャリアプランを提案しやすい。",
    },
]


async def seed_industry_knowledge() -> dict:
    """業界知識の初期データを投入する。既にデータがある場合はスキップ。"""
    async with async_session() as session:
        count = await session.execute(
            select(func.count()).select_from(IndustryCategory)
        )
        existing = count.scalar() or 0
        if existing > 0:
            logger.info("業界カテゴリデータ %d 件存在。スキップ。", existing)
            return {"categories": existing, "qualifications": 0, "status": "skipped"}

        cat_count = 0
        for major in CATEGORIES:
            children = major.pop("children", [])
            parent = IndustryCategory(**major)
            session.add(parent)
            await session.flush()
            cat_count += 1

            for child in children:
                child["parent_id"] = parent.id
                sub = IndustryCategory(**child)
                session.add(sub)
                cat_count += 1

        qual_count = 0
        for q in QUALIFICATIONS:
            qual = Qualification(**q)
            session.add(qual)
            qual_count += 1

        await session.commit()
        logger.info("業界知識データ投入完了: カテゴリ %d, 資格 %d", cat_count, qual_count)
        return {"categories": cat_count, "qualifications": qual_count, "status": "seeded"}
