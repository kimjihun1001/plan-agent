import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  doc,
  query,
  where,
  deleteDoc,
} from "firebase/firestore";
import { Category } from "../models/category";
import { Plan } from "../models/plan";
import { Check } from "../models/check";
// 달력 라이브러리 import (설치 필요: yarn add react-calendar)
import dynamic from "next/dynamic";
const Calendar = dynamic(() => import("react-calendar"), { ssr: false });
import "react-calendar/dist/Calendar.css";

// 날짜 계산 유틸
function getToday() {
  const now = new Date();
  // 한국 시간(KST) 기준으로 날짜 계산
  const kstOffset = 9 * 60; // KST는 UTC+9
  const localOffset = now.getTimezoneOffset(); // 현재 로컬 시간대 오프셋
  const kstTime = new Date(now.getTime() + (kstOffset + localOffset) * 60000);
  return kstTime.toISOString().slice(0, 10); // YYYY-MM-DD
}

function toId(str: string) {
  // 한글 → 영문 변환은 없지만, 소문자/공백/특수문자 제거
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function getYearMonthDay(date: Date) {
  // 한국 시간(KST) 기준으로 날짜 계산
  const kstOffset = 9 * 60; // KST는 UTC+9
  const localOffset = date.getTimezoneOffset(); // 현재 로컬 시간대 오프셋
  const kstTime = new Date(date.getTime() + (kstOffset + localOffset) * 60000);
  return kstTime.toISOString().slice(0, 10);
}

// 로컬 타임존 기준 YYYY-MM-DD 문자열 반환
function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [checks, setChecks] = useState<Record<string, Record<number, boolean>>>(
    {}
  ); // planId -> {checkIndex -> checked}
  const [allChecks, setAllChecks] = useState<Check[]>([]); // 전체 체크 기록
  const [newPlan, setNewPlan] = useState({
    title: "",
    categoryId: "",
    repeatType: "daily",
    targetCount: 1,
    startDate: getToday(),
    endDate: "",
  });
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [tab, setTab] = useState<"today" | "calendar" | "all">("today");
  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  // 데이터 불러오기
  useEffect(() => {
    getDocs(collection(db, "categories")).then((snapshot) => {
      setCategories(snapshot.docs.map((doc) => doc.data() as Category));
    });
    getDocs(collection(db, "plans")).then((snapshot) => {
      setPlans(snapshot.docs.map((doc) => doc.data() as Plan));
    });
    // 오늘 체크 불러오기 (userId는 임시로 'testuser')
    getDocs(
      query(
        collection(db, "checks"),
        where("date", "==", getToday()),
        where("userId", "==", "testuser")
      )
    ).then((snapshot) => {
      const checkMap: Record<string, Record<number, boolean>> = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data() as Check;
        if (!checkMap[data.planId]) {
          checkMap[data.planId] = {};
        }
        checkMap[data.planId][data.checkIndex] = data.checked;
      });
      setChecks(checkMap);
    });
    // 전체 체크 기록 (달력용)
    getDocs(
      query(collection(db, "checks"), where("userId", "==", "testuser"))
    ).then((snapshot) => {
      setAllChecks(snapshot.docs.map((doc) => doc.data() as Check));
    });
  }, [adding, addingCategory]); // 카테고리 추가 시 새로고침

  // 체크 토글
  const handleCheck = async (
    planId: string,
    checkIndex: number,
    checked: boolean,
    date?: string
  ) => {
    const targetDate = date || getToday();
    const checkQuery = query(
      collection(db, "checks"),
      where("planId", "==", planId),
      where("date", "==", targetDate),
      where("checkIndex", "==", checkIndex),
      where("userId", "==", "testuser")
    );
    const snapshot = await getDocs(checkQuery);
    if (checked) {
      // 체크 추가
      if (snapshot.empty) {
        await addDoc(collection(db, "checks"), {
          planId,
          date: targetDate,
          checkIndex,
          checked: true,
          userId: "testuser",
          checkedAt: getToday(),
        });
      } else {
        // 이미 있으면 업데이트
        await setDoc(doc(db, "checks", snapshot.docs[0].id), {
          planId,
          date: targetDate,
          checkIndex,
          checked: true,
          userId: "testuser",
          checkedAt: getToday(),
        });
      }
    } else {
      // 체크 해제(삭제)
      if (!snapshot.empty) {
        await deleteDoc(doc(db, "checks", snapshot.docs[0].id));
      }
    }

    // 체크 상태 갱신 (오늘 탭인 경우에만)
    if (!date) {
      setChecks((prev) => ({
        ...prev,
        [planId]: {
          ...prev[planId],
          [checkIndex]: checked,
        },
      }));
    }

    // 전체 체크 기록 새로고침
    getDocs(
      query(collection(db, "checks"), where("userId", "==", "testuser"))
    ).then((snapshot) => {
      setAllChecks(snapshot.docs.map((doc) => doc.data() as Check));
    });
  };

  // 계획 추가
  const handleAddPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlan.title || !newPlan.categoryId) return;
    setAdding(true);
    await addDoc(collection(db, "plans"), {
      id: Math.random().toString(36).slice(2),
      userId: "testuser",
      categoryId: newPlan.categoryId,
      title: newPlan.title,
      repeatType: newPlan.repeatType,
      targetCount: newPlan.targetCount,
      startDate: newPlan.startDate,
      endDate: newPlan.endDate || null,
      createdAt: getToday(),
    });
    setNewPlan({
      title: "",
      categoryId: "",
      repeatType: "daily",
      targetCount: 1,
      startDate: getToday(),
      endDate: "",
    });
    setAdding(false);
    // plans 새로고침
    getDocs(collection(db, "plans")).then((snapshot) => {
      setPlans(snapshot.docs.map((doc) => doc.data() as Plan));
    });
  };

  // 카테고리 추가
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    setAddingCategory(true);
    const id = toId(newCategory);
    await setDoc(doc(db, "categories", id), {
      id,
      name: newCategory,
    });
    setNewCategory("");
    setAddingCategory(false);
  };

  // 진행률 계산 함수 (전체 기간)
  const getProgress = (planId: string, targetCount: number) => {
    const planChecks = checks[planId] || {};
    const completedCount = Object.values(planChecks).filter(Boolean).length;
    return { completed: completedCount, total: targetCount };
  };

  // 오늘 체크 상태 확인 함수
  const getTodayChecks = (planId: string, targetCount: number) => {
    const planChecks = checks[planId] || {};
    return Array.from(
      { length: targetCount },
      (_, index) => !!planChecks[index]
    );
  };

  // 완료 여부 확인 함수
  const isCompleted = (plan: Plan) => {
    const progress = getProgress(plan.id, plan.targetCount);
    return progress.completed >= progress.total;
  };

  // 날짜별 계획 필터링 함수
  const getPlansForDate = (date: string) => {
    return plans.filter((plan) => {
      // 시작일 체크
      if (plan.startDate > date) return false;
      // 종료일 체크 (종료일이 설정된 경우)
      if (plan.endDate && plan.endDate < date) return false;
      return true;
    });
  };

  // 날짜별 체크 상태 가져오기
  const getChecksForDate = (date: string) => {
    const checkMap: Record<string, Record<number, boolean>> = {};
    allChecks.forEach((check) => {
      if (check.date === date) {
        if (!checkMap[check.planId]) {
          checkMap[check.planId] = {};
        }
        checkMap[check.planId][check.checkIndex] = check.checked;
      }
    });
    return checkMap;
  };

  // 계획 분류
  const dailyPlans = plans.filter((plan) => plan.repeatType === "daily");
  const weeklyPlans = plans.filter((plan) => plan.repeatType === "weekly");
  const monthlyPlans = plans.filter((plan) => plan.repeatType === "monthly");

  // 달력에서 날짜별/주별/월별 성공/실패 색상 반환
  function getTileClassName({ date, view }: { date: Date; view: string }) {
    if (!selectedPlan) return "";
    if (selectedPlan.repeatType === "daily" && view === "month") {
      const d = getLocalDateString(date);
      const check = allChecks.find(
        (c) => c.planId === selectedPlan.id && c.date === d && c.checked
      );
      if (check) return "calendar-success";
      const fail = allChecks.find(
        (c) =>
          c.planId === selectedPlan.id && c.date === d && c.checked === false
      );
      if (fail) return "calendar-fail";
      return "calendar-none";
    }
    // 주별/월별은 view가 month일 때 주 첫째날/월 첫째날에만 색칠(간단 버전)
    if (selectedPlan.repeatType === "weekly" && view === "month") {
      // 주의 첫째날(일요일) 기준
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = getYearMonthDay(weekStart);
      const weekChecks = allChecks.filter(
        (c) =>
          c.planId === selectedPlan.id &&
          c.date.startsWith(weekKey.slice(0, 7)) &&
          c.checked
      );
      if (weekChecks.length > 0) return "calendar-success";
      return "calendar-fail";
    }
    if (selectedPlan.repeatType === "monthly" && view === "month") {
      const monthKey = date.toISOString().slice(0, 7);
      const monthChecks = allChecks.filter(
        (c) =>
          c.planId === selectedPlan.id &&
          c.date.startsWith(monthKey) &&
          c.checked
      );
      if (monthChecks.length > 0) return "calendar-success";
      return "calendar-fail";
    }
    return "";
  }

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 24,
        minHeight: "90vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 탭 바 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          position: "fixed",
          bottom: 0,
          left: 0,
          width: "100%",
          background: "#fafafa",
          borderTop: "1px solid #eee",
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setTab("today")}
          style={{
            flex: 1,
            padding: 16,
            fontWeight: tab === "today" ? "bold" : "normal",
            background: "none",
            border: "none",
            borderBottom: tab === "today" ? "2px solid #333" : "none",
          }}
        >
          오늘
        </button>
        <button
          onClick={() => setTab("calendar")}
          style={{
            flex: 1,
            padding: 16,
            fontWeight: tab === "calendar" ? "bold" : "normal",
            background: "none",
            border: "none",
            borderBottom: tab === "calendar" ? "2px solid #333" : "none",
          }}
        >
          달력
        </button>
        <button
          onClick={() => setTab("all")}
          style={{
            flex: 1,
            padding: 16,
            fontWeight: tab === "all" ? "bold" : "normal",
            background: "none",
            border: "none",
            borderBottom: tab === "all" ? "2px solid #333" : "none",
          }}
        >
          전체 계획
        </button>
      </div>

      {/* 본문 */}
      <div
        style={{
          flex: 1,
          paddingBottom: 64,
          display: tab === "all" ? "flex" : undefined,
        }}
      >
        {tab === "today" && (
          <div style={{ width: "100%" }}>
            {/* 카테고리 추가 폼 */}
            <form
              onSubmit={handleAddCategory}
              style={{
                marginBottom: 16,
                border: "1px solid #eee",
                padding: 12,
                borderRadius: 8,
              }}
            >
              <h2>카테고리 추가</h2>
              <input
                type="text"
                placeholder="카테고리 이름"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                style={{ marginRight: 8 }}
              />
              <button type="submit">추가</button>
            </form>

            {/* 계획 추가 폼 */}
            <form
              onSubmit={handleAddPlan}
              style={{
                marginBottom: 32,
                border: "1px solid #eee",
                padding: 16,
                borderRadius: 8,
              }}
            >
              <h2>계획 추가</h2>
              <input
                type="text"
                placeholder="계획 제목"
                value={newPlan.title}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, title: e.target.value })
                }
                style={{ marginRight: 8 }}
              />
              <select
                value={newPlan.categoryId}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, categoryId: e.target.value })
                }
                style={{ marginRight: 8 }}
              >
                <option value="">카테고리 선택</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <select
                value={newPlan.repeatType}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, repeatType: e.target.value })
                }
                style={{ marginRight: 8 }}
              >
                <option value="daily">매일</option>
                <option value="weekly">매주</option>
                <option value="monthly">매월</option>
              </select>
              <input
                type="number"
                min="1"
                placeholder="목표 횟수"
                value={newPlan.targetCount}
                onChange={(e) =>
                  setNewPlan({
                    ...newPlan,
                    targetCount: parseInt(e.target.value) || 1,
                  })
                }
                style={{ marginRight: 8, width: 80 }}
              />
              <input
                type="date"
                value={newPlan.startDate}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, startDate: e.target.value })
                }
                style={{ marginRight: 8 }}
              />
              <input
                type="date"
                placeholder="종료일 (선택)"
                value={newPlan.endDate}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, endDate: e.target.value })
                }
                style={{ marginRight: 8 }}
              />
              <button type="submit">추가</button>
            </form>

            <h1>오늘까지 완료해야 하는 계획</h1>
            {categories.map((cat) => (
              <div key={cat.id} style={{ marginBottom: 24 }}>
                <h2>{cat.name}</h2>
                <ul>
                  {dailyPlans
                    .filter((plan) => plan.categoryId === cat.id)
                    .map((plan) => {
                      const progress = getProgress(plan.id, plan.targetCount);
                      const todayChecks = getTodayChecks(
                        plan.id,
                        plan.targetCount
                      );
                      const completed = isCompleted(plan);

                      return (
                        <li
                          key={plan.id}
                          style={{
                            marginBottom: 12,
                            backgroundColor: completed
                              ? "#f5f5f5"
                              : "transparent",
                            padding: completed ? "12px" : "0",
                            borderRadius: completed ? "8px" : "0",
                            opacity: completed ? 0.7 : 1,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  marginBottom: 8,
                                  fontWeight: "bold",
                                  textDecoration: completed
                                    ? "line-through"
                                    : "none",
                                }}
                              >
                                {plan.title} {completed && "(완료!)"}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                {Array.from(
                                  { length: plan.targetCount },
                                  (_, index) => (
                                    <input
                                      key={index}
                                      type="checkbox"
                                      checked={todayChecks[index]}
                                      onChange={(e) =>
                                        handleCheck(
                                          plan.id,
                                          index,
                                          e.target.checked
                                        )
                                      }
                                      style={{
                                        margin: 0,
                                        opacity: completed ? 0.5 : 1,
                                      }}
                                      disabled={false} // 완료되어도 추가 체크 가능
                                    />
                                  )
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                marginLeft: 16,
                                padding: "4px 8px",
                                backgroundColor: completed
                                  ? "#d4edda"
                                  : "#f0f0f0",
                                borderRadius: 4,
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: completed ? "#155724" : "#000",
                              }}
                            >
                              {progress.completed} / {progress.total}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}

            <h1>이번 주까지 완료해야 하는 계획</h1>
            {categories.map((cat) => (
              <div key={cat.id} style={{ marginBottom: 24 }}>
                <h2>{cat.name}</h2>
                <ul>
                  {weeklyPlans
                    .filter((plan) => plan.categoryId === cat.id)
                    .map((plan) => {
                      const progress = getProgress(plan.id, plan.targetCount);
                      const todayChecks = getTodayChecks(
                        plan.id,
                        plan.targetCount
                      );
                      const completed = isCompleted(plan);

                      return (
                        <li
                          key={plan.id}
                          style={{
                            marginBottom: 12,
                            backgroundColor: completed
                              ? "#f5f5f5"
                              : "transparent",
                            padding: completed ? "12px" : "0",
                            borderRadius: completed ? "8px" : "0",
                            opacity: completed ? 0.7 : 1,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  marginBottom: 8,
                                  fontWeight: "bold",
                                  textDecoration: completed
                                    ? "line-through"
                                    : "none",
                                }}
                              >
                                {plan.title} {completed && "(완료!)"}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                {Array.from(
                                  { length: plan.targetCount },
                                  (_, index) => (
                                    <input
                                      key={index}
                                      type="checkbox"
                                      checked={todayChecks[index]}
                                      onChange={(e) =>
                                        handleCheck(
                                          plan.id,
                                          index,
                                          e.target.checked
                                        )
                                      }
                                      style={{
                                        margin: 0,
                                        opacity: completed ? 0.5 : 1,
                                      }}
                                      disabled={false} // 완료되어도 추가 체크 가능
                                    />
                                  )
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                marginLeft: 16,
                                padding: "4px 8px",
                                backgroundColor: completed
                                  ? "#d4edda"
                                  : "#f0f0f0",
                                borderRadius: 4,
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: completed ? "#155724" : "#000",
                              }}
                            >
                              {progress.completed} / {progress.total}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}

            <h1>이번 달까지 완료해야 하는 계획</h1>
            {categories.map((cat) => (
              <div key={cat.id} style={{ marginBottom: 24 }}>
                <h2>{cat.name}</h2>
                <ul>
                  {monthlyPlans
                    .filter((plan) => plan.categoryId === cat.id)
                    .map((plan) => {
                      const progress = getProgress(plan.id, plan.targetCount);
                      const todayChecks = getTodayChecks(
                        plan.id,
                        plan.targetCount
                      );
                      const completed = isCompleted(plan);

                      return (
                        <li
                          key={plan.id}
                          style={{
                            marginBottom: 12,
                            backgroundColor: completed
                              ? "#f5f5f5"
                              : "transparent",
                            padding: completed ? "12px" : "0",
                            borderRadius: completed ? "8px" : "0",
                            opacity: completed ? 0.7 : 1,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  marginBottom: 8,
                                  fontWeight: "bold",
                                  textDecoration: completed
                                    ? "line-through"
                                    : "none",
                                }}
                              >
                                {plan.title} {completed && "(완료!)"}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                {Array.from(
                                  { length: plan.targetCount },
                                  (_, index) => (
                                    <input
                                      key={index}
                                      type="checkbox"
                                      checked={todayChecks[index]}
                                      onChange={(e) =>
                                        handleCheck(
                                          plan.id,
                                          index,
                                          e.target.checked
                                        )
                                      }
                                      style={{
                                        margin: 0,
                                        opacity: completed ? 0.5 : 1,
                                      }}
                                      disabled={false} // 완료되어도 추가 체크 가능
                                    />
                                  )
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                marginLeft: 16,
                                padding: "4px 8px",
                                backgroundColor: completed
                                  ? "#d4edda"
                                  : "#f0f0f0",
                                borderRadius: 4,
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: completed ? "#155724" : "#000",
                              }}
                            >
                              {progress.completed} / {progress.total}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {tab === "calendar" && (
          <div style={{ width: "100%" }}>
            <h1>달력 - {selectedDate}</h1>
            <div style={{ marginBottom: 24 }}>
              <Calendar
                onChange={(date) => {
                  if (date instanceof Date) {
                    setSelectedDate(getLocalDateString(date));
                  }
                }}
                value={new Date(selectedDate + "T00:00:00")}
              />
            </div>

            {categories.map((cat) => {
              const datePlans = getPlansForDate(selectedDate).filter(
                (plan) => plan.categoryId === cat.id
              );
              const dateChecks = getChecksForDate(selectedDate);

              if (datePlans.length === 0) return null;

              return (
                <div key={cat.id} style={{ marginBottom: 24 }}>
                  <h2>{cat.name}</h2>
                  <ul>
                    {datePlans.map((plan) => {
                      const progress = getProgress(plan.id, plan.targetCount);
                      const completed = isCompleted(plan);

                      return (
                        <li
                          key={plan.id}
                          style={{
                            marginBottom: 12,
                            backgroundColor: completed
                              ? "#f5f5f5"
                              : "transparent",
                            padding: completed ? "12px" : "0",
                            borderRadius: completed ? "8px" : "0",
                            opacity: completed ? 0.7 : 1,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  marginBottom: 8,
                                  fontWeight: "bold",
                                  textDecoration: completed
                                    ? "line-through"
                                    : "none",
                                }}
                              >
                                {plan.title} {completed && "(완료!)"}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                {Array.from(
                                  { length: plan.targetCount },
                                  (_, index) => (
                                    <input
                                      key={index}
                                      type="checkbox"
                                      checked={!!dateChecks[plan.id]?.[index]}
                                      onChange={(e) =>
                                        handleCheck(
                                          plan.id,
                                          index,
                                          e.target.checked,
                                          selectedDate
                                        )
                                      }
                                      style={{
                                        margin: 0,
                                        opacity: completed ? 0.5 : 1,
                                      }}
                                      disabled={false}
                                    />
                                  )
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                marginLeft: 16,
                                padding: "4px 8px",
                                backgroundColor: completed
                                  ? "#d4edda"
                                  : "#f0f0f0",
                                borderRadius: 4,
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: completed ? "#155724" : "#000",
                              }}
                            >
                              {progress.completed} / {progress.total}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {tab === "all" && (
          <>
            <div style={{ width: "50%" }}>
              <h1>전체 계획 (주기별)</h1>
              <h2>매일</h2>
              <ul>
                {dailyPlans.map((plan) => (
                  <li
                    key={plan.id}
                    style={{
                      cursor: "pointer",
                      fontWeight:
                        selectedPlan?.id === plan.id ? "bold" : undefined,
                    }}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    {plan.title} (
                    {categories.find((c) => c.id === plan.categoryId)?.name})
                  </li>
                ))}
              </ul>
              <h2>매주</h2>
              <ul>
                {weeklyPlans.map((plan) => (
                  <li
                    key={plan.id}
                    style={{
                      cursor: "pointer",
                      fontWeight:
                        selectedPlan?.id === plan.id ? "bold" : undefined,
                    }}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    {plan.title} (
                    {categories.find((c) => c.id === plan.categoryId)?.name})
                  </li>
                ))}
              </ul>
              <h2>매월</h2>
              <ul>
                {monthlyPlans.map((plan) => (
                  <li
                    key={plan.id}
                    style={{
                      cursor: "pointer",
                      fontWeight:
                        selectedPlan?.id === plan.id ? "bold" : undefined,
                    }}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    {plan.title} (
                    {categories.find((c) => c.id === plan.categoryId)?.name})
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ width: "50%", paddingLeft: 24 }}>
              {selectedPlan ? (
                <>
                  <h2>달력: {selectedPlan.title}</h2>
                  <Calendar tileClassName={getTileClassName} />
                  <style>{`
                    .calendar-success { background: #b2f2bb !important; }
                    .calendar-fail { background: #ffa8a8 !important; }
                    .calendar-none { background: #f1f3f5 !important; }
                  `}</style>
                </>
              ) : (
                <div style={{ color: "#888", marginTop: 40 }}>
                  계획을 클릭하면 달력이 표시됩니다.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
