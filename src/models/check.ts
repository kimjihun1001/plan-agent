export type Check = {
  id: string;
  planId: string;
  date: string; // YYYY-MM-DD
  checkIndex: number; // 체크 항목의 인덱스 (0부터 시작)
  checked: boolean;
  userId: string;
  checkedAt: string; // 실제 체크한 날짜 (YYYY-MM-DD)
};
