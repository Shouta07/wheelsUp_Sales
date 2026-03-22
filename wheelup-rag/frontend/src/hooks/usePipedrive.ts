import { useMutation } from "@tanstack/react-query";
import { generateBriefing, generateSummary, saveSummaryToPipedrive, type SummaryRequest } from "../api/client";

export function useBriefing(dealId: number | null) {
  return useMutation({
    mutationFn: () => {
      if (!dealId) throw new Error("Deal ID が必要です");
      return generateBriefing(dealId);
    },
  });
}

export function useSummary(dealId: number | null) {
  return useMutation({
    mutationFn: (data: SummaryRequest) => {
      if (!dealId) throw new Error("Deal ID が必要です");
      return generateSummary(dealId, data);
    },
  });
}

export function useSaveSummary(dealId: number | null) {
  return useMutation({
    mutationFn: (data: SummaryRequest) => {
      if (!dealId) throw new Error("Deal ID が必要です");
      return saveSummaryToPipedrive(dealId, data);
    },
  });
}
