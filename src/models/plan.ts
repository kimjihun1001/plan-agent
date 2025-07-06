export type Plan = {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  repeatType: "daily" | "weekly" | "monthly" | "custom";
  repeatDetail?: { interval: number; unit: "day" | "week" | "month" };
  targetCount: number;
  startDate: string;
  endDate?: string;
  createdAt: string;
};
