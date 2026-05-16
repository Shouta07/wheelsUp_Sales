// チームメンバーと役割の唯一の真実。
// 追加・変更はここだけ。UI / 採点 / プレイブック生成のすべてが参照する。

export type TeamRole = "leader" | "member";

export interface TeamMember {
  name: string;
  role: TeamRole;
  color: string;
  icon: string;
}

export const TEAM_MEMBERS: readonly TeamMember[] = [
  { name: "小林", role: "leader", color: "#FF9600", icon: "👑" },
  { name: "西村", role: "member", color: "#1CB0F6", icon: "💼" },
  { name: "辻内", role: "member", color: "#58CC02", icon: "💼" },
  { name: "安藤", role: "member", color: "#CE82FF", icon: "💼" },
  { name: "村上", role: "member", color: "#FF4B4B", icon: "💼" },
] as const;

const LEADER_NAMES = new Set(TEAM_MEMBERS.filter((m) => m.role === "leader").map((m) => m.name));

export const isLeader = (name?: string | null): boolean => !!name && LEADER_NAMES.has(name);

export const getLeaderNames = (): string[] => Array.from(LEADER_NAMES);
